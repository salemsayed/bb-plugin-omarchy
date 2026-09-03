import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { hostContract, hostSignals } from "./contract.js";
import { parseOmarchyColors } from "./palette.js";

const HOOK_NAME = "90-bb-omarchy";
const HOOK = `#!/bin/bash
set -eu
state_root="\${XDG_STATE_HOME:-$HOME/.local/state}/bb-omarchy"
mkdir -p "$state_root"
temporary="$state_root/theme.name.$$"
printf '%s\\n' "\${1:-unknown}" > "$temporary"
mv "$temporary" "$state_root/theme.name"
`;

interface Paths {
  omarchyRoot: string;
  current: string;
  integrationState: string;
  hook: string;
}

function paths(): Paths {
  const userHome = homedir();
  const stateHome = process.env.XDG_STATE_HOME || join(userHome, ".local", "state");
  const configHome = process.env.XDG_CONFIG_HOME || join(userHome, ".config");
  const omarchyRoot = join(stateHome, "omarchy");
  return {
    omarchyRoot,
    current: join(omarchyRoot, "current"),
    integrationState: join(stateHome, "bb-omarchy"),
    hook: join(configHome, "omarchy", "hooks", "theme-set.d", HOOK_NAME),
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function atomicWrite(path: string, contents: string, mode?: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, contents, { encoding: "utf8", mode });
  await rename(temporary, path);
}

let watchedRoot: string | null = null;
let subscriptions: Array<{ dispose(): Promise<void> }> = [];

async function disposeWatches(): Promise<void> {
  const current = subscriptions;
  subscriptions = [];
  watchedRoot = null;
  await Promise.allSettled(current.map((subscription) => subscription.dispose()));
}

export default experimental_defineHostEntry({
  contract: hostContract,
  experimental_signals: hostSignals,
  handlers: {
    async readTheme() {
      const location = paths();
      try {
        const [name, colorSource, vscodeTheme, hookInstalled] = await Promise.all([
          readFile(join(location.current, "theme.name"), "utf8"),
          readFile(join(location.current, "theme", "colors.toml"), "utf8"),
          readFile(join(location.current, "theme", "vscode-theme.json"), "utf8").catch(() => null),
          exists(location.hook),
        ]);
        return {
          available: true,
          themeName: name.trim() || "unknown",
          colors: parseOmarchyColors(colorSource),
          vscodeTheme,
          hookInstalled,
          error: null,
        };
      } catch (cause) {
        return {
          available: false,
          themeName: null,
          colors: null,
          vscodeTheme: null,
          hookInstalled: await exists(location.hook),
          error: cause instanceof Error ? cause.message : String(cause),
        };
      }
    },

    async watchTheme(_input, context) {
      const location = paths();
      if (!(await exists(location.omarchyRoot))) {
        return { watching: false, error: "Omarchy state directory was not found" };
      }
      if (watchedRoot === location.omarchyRoot && subscriptions.length > 0) {
        return { watching: true, error: null };
      }
      await disposeWatches();
      await mkdir(location.integrationState, { recursive: true });
      const notify = async (reason: string) => {
        await context.experimental_emitSignal("themeChanged", { at: Date.now(), reason });
      };
      try {
        subscriptions = await Promise.all([
          context.experimental_watch(
            { rootPath: location.omarchyRoot, debounceMs: 120, maxWaitMs: 600 },
            (event) => notify(`omarchy:${event.kind}`),
          ),
          context.experimental_watch(
            { rootPath: location.integrationState, debounceMs: 80, maxWaitMs: 240 },
            (event) => notify(`hook:${event.kind}`),
          ),
        ]);
        watchedRoot = location.omarchyRoot;
        context.lifecycle.signal.addEventListener("abort", () => void disposeWatches(), {
          once: true,
        });
        return { watching: true, error: null };
      } catch (cause) {
        await disposeWatches();
        return {
          watching: false,
          error: cause instanceof Error ? cause.message : String(cause),
        };
      }
    },

    async setHook({ enabled }) {
      const location = paths();
      if (enabled) {
        await atomicWrite(location.hook, HOOK, 0o755);
      } else {
        await rm(location.hook, { force: true });
      }
      return { installed: enabled };
    },
  },
  dispose: disposeWatches,
});
