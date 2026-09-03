import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  animationSchema,
  hostContract,
  hostSignals,
  rpcContract,
  type HostTheme,
  type SyncStatus,
} from "./contract.js";
import { buildThemeCss, faviconColor } from "./palette.js";

const STATUS_CHANGED = "status-changed";

const storedStatusSchema = z.object({
  themeName: z.string(),
  mode: z.enum(["light", "dark"]),
  colors: z.object({
    mode: z.enum(["light", "dark"]),
    accent: z.string(), selection: z.string(), muted: z.string(),
    background: z.string(), darkBackground: z.string(), darkerBackground: z.string(), lighterBackground: z.string(),
    foreground: z.string(), darkForeground: z.string(), lightForeground: z.string(), brightForeground: z.string(),
    red: z.string(), yellow: z.string(), orange: z.string(), green: z.string(), cyan: z.string(), blue: z.string(), magenta: z.string(), brown: z.string(),
    brightRed: z.string(), brightYellow: z.string(), brightGreen: z.string(), brightCyan: z.string(), brightBlue: z.string(), brightMagenta: z.string(),
  }),
  lastSyncedAt: z.string(),
  hookInstalled: z.boolean(),
});

type Preferences = {
  autoSync: boolean;
  syncCodeTheme: boolean;
  syncFavicon: boolean;
  animation: "off" | "subtle" | "smooth" | "cinematic";
};

const preferencesSchema = z.object({
  autoSync: z.boolean(),
  syncCodeTheme: z.boolean(),
  syncFavicon: z.boolean(),
  animation: animationSchema,
});

const DEFAULT_PREFERENCES: Preferences = {
  autoSync: true,
  syncCodeTheme: true,
  syncFavicon: true,
  animation: "smooth",
};

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export { rpcContract } from "./contract.js";
export type { SyncStatus } from "./contract.js";

export default async function plugin(bb: BbPluginApi) {
  const host = bb.hosts.experimental_client({
    contract: hostContract,
    experimental_signals: hostSignals,
  });

  let transient: Pick<SyncStatus, "phase" | "message" | "bbThemeId"> = {
    phase: "checking",
    message: "Looking for Omarchy…",
    bbThemeId: null,
  };
  let currentHostId: string | null = null;
  let syncPromise: Promise<SyncStatus> | null = null;
  let queuedSync = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  async function preferences(): Promise<Preferences> {
    const parsed = preferencesSchema.safeParse(await bb.storage.kv.get("preferences"));
    return parsed.success ? parsed.data : DEFAULT_PREFERENCES;
  }

  async function stored() {
    const parsed = storedStatusSchema.safeParse(await bb.storage.kv.get("last-sync"));
    return parsed.success ? parsed.data : null;
  }

  async function status(): Promise<SyncStatus> {
    const [saved, prefs] = await Promise.all([stored(), preferences()]);
    return {
      ...transient,
      themeName: saved?.themeName ?? null,
      mode: saved?.mode ?? null,
      colors: saved?.colors ?? null,
      lastSyncedAt: saved?.lastSyncedAt ?? null,
      hookInstalled: saved?.hookInstalled ?? false,
      ...prefs,
    };
  }

  function publish(): void {
    bb.realtime.publish(STATUS_CHANGED, { at: Date.now() });
  }

  async function primaryHostId(): Promise<string> {
    const config = await bb.sdk.system.config();
    if (config.primaryHostId === null) throw new Error("BB has no primary host configured");
    currentHostId = config.primaryHostId;
    return config.primaryHostId;
  }

  async function prepareClientTheme(theme: HostTheme, prefs: Preferences): Promise<void> {
    if (!theme.available || theme.colors === null || theme.themeName === null) {
      throw new Error(theme.error ?? "Omarchy is not available on the primary host");
    }
    // Deliberately keep the server's selected palette unchanged. BB mobile
    // follows that server selection, while the frontend content script below
    // applies this overlay only in BB's web/Electron clients.
    const active = await bb.sdk.theme.get();
    const nextFavicon = prefs.syncFavicon ? faviconColor(theme.colors.accent) : active.faviconColor;
    if (nextFavicon !== active.faviconColor) {
      await bb.sdk.theme.set({ themeId: active.themeId, faviconColor: nextFavicon });
    }
    const now = new Date().toISOString();
    await bb.storage.kv.set("client-theme", {
      css: buildThemeCss(theme.colors, prefs.animation, prefs.syncCodeTheme),
      revision: now,
    });
    await bb.storage.kv.set("last-sync", {
      themeName: theme.themeName,
      mode: theme.colors.mode,
      colors: theme.colors,
      lastSyncedAt: now,
      hookInstalled: theme.hookInstalled,
    });
    transient = {
      phase: "synced",
      message: `${theme.themeName} is live in BB`,
      bbThemeId: active.themeId,
    };
    bb.log.info(`synced Omarchy theme ${theme.themeName} (${theme.colors.mode})`);
  }

  async function runSync(force = false): Promise<SyncStatus> {
    if (syncPromise !== null) {
      queuedSync = true;
      return syncPromise;
    }
    syncPromise = (async () => {
      const prefs = await preferences();
      if (!force && !prefs.autoSync) {
        transient = { phase: "paused", message: "Automatic sync is paused", bbThemeId: null };
        publish();
        return status();
      }
      transient = { phase: "checking", message: "Reading the Omarchy palette…", bbThemeId: null };
      publish();
      try {
        const hostId = await primaryHostId();
        const theme = await host.call("readTheme", null, { hostId });
        if (!theme.available) {
          transient = {
            phase: "unavailable",
            message: theme.error ?? "Omarchy was not found on the primary host",
            bbThemeId: null,
          };
        } else {
          await prepareClientTheme(theme, prefs);
        }
      } catch (cause) {
        transient = {
          phase: "error",
          message: cause instanceof Error ? cause.message : String(cause),
          bbThemeId: null,
        };
        bb.log.error(`theme sync failed: ${transient.message}`);
      }
      publish();
      return status();
    })();
    try {
      return await syncPromise;
    } finally {
      syncPromise = null;
      if (queuedSync) {
        queuedSync = false;
        queueMicrotask(() => void runSync());
      }
    }
  }

  function scheduleSync(): void {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void runSync();
    }, 180);
  }

  const unsubscribeSignal = host.experimental_onSignal("themeChanged", ({ hostId }) => {
    if (currentHostId === null || hostId === currentHostId) scheduleSync();
  });
  const unsubscribeWorkerExit = host.experimental_onWorkerExit(({ hostId }) => {
    if (hostId === currentHostId) scheduleSync();
  });

  bb.rpc.register(rpcContract, {
    status: () => status(),
    sync: () => runSync(true),
    async setPreferences(patch) {
      const next = { ...(await preferences()), ...patch };
      await bb.storage.kv.set("preferences", next);
      return runSync(patch.autoSync === false ? false : true);
    },
    async setHook({ enabled }) {
      const hostId = await primaryHostId();
      await host.call("setHook", { enabled }, { hostId });
      return runSync(true);
    },
  });

  bb.http.route("GET", "/client-theme", async (context) => {
    const value = await bb.storage.kv.get<unknown>("client-theme");
    if (
      value !== null &&
      typeof value === "object" &&
      typeof (value as { css?: unknown }).css === "string" &&
      typeof (value as { revision?: unknown }).revision === "string"
    ) {
      return context.json({
        enabled: true,
        css: (value as { css: string }).css,
        revision: (value as { revision: string }).revision,
      });
    }
    return context.json({ enabled: false, css: "", revision: "" });
  });

  const usage = `Usage:
  bb omarchy status [--json]
  bb omarchy sync [--json]
  bb omarchy hook install|remove [--json]`;
  bb.cli.register({
    name: "omarchy",
    summary: "Sync BB with the active Omarchy theme",
    commands: [
      { name: "status", summary: "Show sync state", usage: "bb omarchy status [--json]" },
      { name: "sync", summary: "Sync immediately", usage: "bb omarchy sync [--json]" },
      { name: "hook", summary: "Install or remove the Omarchy hook", usage: "bb omarchy hook install|remove [--json]" },
    ],
    async run(argv) {
      const json = argv.includes("--json");
      const args = argv.filter((arg) => arg !== "--json");
      let result: SyncStatus;
      if (args[0] === undefined || args[0] === "status") result = await status();
      else if (args[0] === "sync") result = await runSync(true);
      else if (args[0] === "hook" && (args[1] === "install" || args[1] === "remove")) {
        const hostId = await primaryHostId();
        await host.call("setHook", { enabled: args[1] === "install" }, { hostId });
        result = await runSync(true);
      } else return { exitCode: 1, stderr: usage };
      return {
        exitCode: result.phase === "error" || result.phase === "unavailable" ? 1 : 0,
        stdout: json
          ? JSON.stringify(result)
          : `${result.phase}: ${result.message}${result.lastSyncedAt ? `\nLast sync: ${result.lastSyncedAt}` : ""}`,
      };
    },
  });

  bb.background.service("omarchy-theme-watch", {
    async start(signal) {
      while (!signal.aborted) {
        try {
          const hostId = await primaryHostId();
          const prefs = await preferences();
          if (prefs.autoSync) await runSync();
          await host.call("watchTheme", null, { hostId, signal });
        } catch (cause) {
          bb.log.warn(`watch setup will retry: ${cause instanceof Error ? cause.message : String(cause)}`);
        }
        await sleep(30_000, signal);
      }
    },
  });

  bb.onDispose(() => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    unsubscribeSignal();
    unsubscribeWorkerExit();
  });
}
