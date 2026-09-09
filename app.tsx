import { useCallback, useEffect, useState } from "react";
import { definePluginApp, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { AnimationStyle, SyncStatus } from "./contract";
import type { rpcContract } from "./server";

const ANIMATIONS: AnimationStyle[] = ["off", "subtle", "smooth", "cinematic"];

type MobileShellWindow = Window & {
  ReactNativeWebView?: unknown;
  bb?: { native?: { __installed?: unknown } };
};

function isMobileClient(): boolean {
  const client = window as MobileShellWindow;
  if (client.ReactNativeWebView !== undefined || client.bb?.native?.__installed === true) return true;

  // Installed PWAs have no native bridge. Android tablets also commonly omit
  // "Mobile" from their user agent, and iPadOS can identify itself as macOS.
  const browser = navigator as Navigator & { userAgentData?: { platform?: string; mobile?: boolean } };
  return browser.userAgentData?.mobile === true
    || /Android|iOS/i.test(browser.userAgentData?.platform ?? "")
    || /Android|iPhone|iPad|iPod/i.test(browser.userAgent)
    || (/Mac/i.test(browser.platform) && browser.maxTouchPoints > 1);
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 py-2 text-left text-sm"
    >
      <span>{label}</span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted"}`}>
        <span className={`absolute top-0.5 size-4 rounded-full bg-background shadow-sm transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </span>
    </button>
  );
}

function OmarchyPage() {
  const rpc = useRpc<typeof rpcContract>();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    rpc.call("status").then(setStatus, (cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [rpc]);
  useEffect(refresh, [refresh]);
  useRealtime("status-changed", refresh);

  const act = useCallback(async (action: () => Promise<SyncStatus>) => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await action());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, []);

  if (status === null) {
    return <div className="grid h-full place-items-center text-sm text-muted-foreground">Reading Omarchy…</div>;
  }

  const swatches = status.colors
    ? [
        ["Canvas", status.colors.background], ["Ink", status.colors.foreground], ["Accent", status.colors.accent],
        ["Blue", status.colors.blue], ["Green", status.colors.green], ["Yellow", status.colors.yellow],
        ["Orange", status.colors.orange], ["Red", status.colors.red], ["Magenta", status.colors.magenta],
      ] as const
    : [];

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 pb-12 pt-5 md:px-7 md:pt-7">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="relative border-b border-border px-5 py-6 md:px-7">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-timeline-accent to-pr-merged" />
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  <span className={`size-2 rounded-full ${status.phase === "synced" ? "bg-success animate-pulse" : status.phase === "error" ? "bg-destructive" : "bg-attention"}`} />
                  {status.phase}
                </div>
                <h1 className="text-2xl font-semibold tracking-tight">{status.themeName ?? "Omarchy Sync"}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{status.message}</p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(() => rpc.call("sync"))}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Syncing…" : "Sync now"}
              </button>
            </div>
          </div>

          <div className="grid gap-0 md:grid-cols-[1.25fr_1fr]">
            <section className="border-b border-border p-5 md:border-b-0 md:border-r md:p-7">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-medium">Live palette</h2>
                {status.mode ? <span className="rounded-full border border-border px-2 py-0.5 text-xs capitalize text-muted-foreground">{status.mode}</span> : null}
              </div>
              {swatches.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No Omarchy palette detected.</div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {swatches.map(([name, value], index) => (
                    <div key={name} className="group overflow-hidden rounded-lg border border-border bg-background">
                      <div className="h-14 transition-transform duration-500 group-hover:scale-105" style={{ backgroundColor: value, transitionDelay: `${index * 18}ms` }} />
                      <div className="px-2 py-1.5">
                        <div className="text-xs font-medium">{name}</div>
                        <div className="font-mono text-2xs text-muted-foreground">{value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {status.lastSyncedAt ? <p className="mt-4 text-xs text-muted-foreground">Updated {new Date(status.lastSyncedAt).toLocaleString()}</p> : null}
            </section>

            <section className="p-5 md:p-7">
              <h2 className="mb-2 text-sm font-medium">Automation</h2>
              <div className="divide-y divide-border">
                <Toggle checked={status.autoSync} label="Follow Omarchy automatically" onChange={(autoSync) => void act(() => rpc.call("setPreferences", { autoSync }))} />
                <Toggle checked={status.syncCodeTheme} label="Code and diff colors" onChange={(syncCodeTheme) => void act(() => rpc.call("setPreferences", { syncCodeTheme }))} />
                <Toggle checked={status.syncFavicon} label="Accent favicon" onChange={(syncFavicon) => void act(() => rpc.call("setPreferences", { syncFavicon }))} />
              </div>

              <h2 className="mb-2 mt-6 text-sm font-medium">Transition</h2>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                {ANIMATIONS.map((animation) => (
                  <button
                    key={animation}
                    type="button"
                    aria-pressed={status.animation === animation}
                    onClick={() => void act(() => rpc.call("setPreferences", { animation }))}
                    className={`rounded-md px-2 py-1.5 text-xs capitalize transition ${status.animation === animation ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {animation}
                  </button>
                ))}
              </div>

              <div className="mt-6 rounded-xl border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Omarchy hook</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Instant theme-set signal plus watcher fallback.</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void act(() => rpc.call("setHook", { enabled: !status.hookInstalled }))}
                    className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
                  >
                    {status.hookInstalled ? "Remove" : "Install"}
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
        {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
        <p className="mt-4 text-center text-xs text-muted-foreground">BB palette · code theme · ANSI · favicon · reduced-motion aware</p>
      </div>
    </div>
  );
}

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "omarchy-theme-overlay",
    async mount(context) {
      // Phones and tablets keep BB's own appearance settings in both the
      // native shell and browsers/PWAs; only desktop clients follow Omarchy.
      if (isMobileClient()) return;

      const style = document.createElement("style");
      style.id = `bb-omarchy-theme-${context.generation}`;
      style.dataset.bbOmarchyTheme = "client-only";
      document.head.appendChild(style);
      let revision = "";
      let disposed = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const refresh = async () => {
        if (disposed || context.signal.aborted) return;
        try {
          const response = await fetch(
            `/api/v1/plugins/${encodeURIComponent(context.pluginId)}/http/client-theme`,
            { credentials: "same-origin", signal: context.signal },
          );
          if (response.ok) {
            const value = (await response.json()) as {
              enabled?: unknown;
              css?: unknown;
              revision?: unknown;
            };
            const nextRevision = typeof value.revision === "string" ? value.revision : "";
            if (value.enabled === true && typeof value.css === "string") {
              if (nextRevision !== revision || style.textContent !== value.css) {
                style.textContent = value.css;
                revision = nextRevision;
              }
              // Keep the client overlay after BB's own palette element so an
              // ordinary Appearance change cannot silently outrank Omarchy.
              if (style !== document.head.lastElementChild) document.head.appendChild(style);
            } else {
              style.textContent = "";
              revision = "";
            }
          }
        } catch (cause) {
          if (!context.signal.aborted) console.warn("[bb-plugin-omarchy] overlay refresh failed", cause);
        } finally {
          if (!disposed && !context.signal.aborted) {
            timer = setTimeout(refresh, document.visibilityState === "visible" ? 750 : 5000);
          }
        }
      };
      await refresh();
      return () => {
        disposed = true;
        if (timer !== null) clearTimeout(timer);
        style.remove();
      };
    },
  });

  app.slots.navPanel({
    id: "omarchy-sync",
    title: "Omarchy Sync",
    icon: "Palette",
    path: "omarchy-sync",
    component: OmarchyPage,
  });
});
