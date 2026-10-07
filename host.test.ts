import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";
import hostEntry from "./host.js";
import type { ExperimentalHostWatchListener } from "@get-bb/plugin-sdk";

const originalStateHome = process.env.XDG_STATE_HOME;
const originalConfigHome = process.env.XDG_CONFIG_HOME;
const roots: string[] = [];

afterEach(async () => {
  if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
  else process.env.XDG_STATE_HOME = originalStateHome;
  if (originalConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = originalConfigHome;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("host entry", () => {
  it("ignores unrelated state changes and temporary hook files while keeping palette and recovery events", async () => {
    const root = await mkdtemp(join(tmpdir(), "bb-omarchy-watch-"));
    roots.push(root);
    process.env.XDG_STATE_HOME = root;
    await mkdir(join(root, "omarchy"), { recursive: true });
    const listeners: ExperimentalHostWatchListener[] = [];
    const harness = experimental_createHostEntryHarness(hostEntry, {
      experimental_watch: (_options, listener) => {
        listeners.push(listener);
        return { dispose: async () => {} };
      },
    });
    try {
      await harness.experimental_call("watchTheme", null);
      expect(listeners).toHaveLength(2);
      await listeners[0]!({ kind: "changed", changes: [{ path: join(root, "omarchy", "notifications", "event.json"), type: "create" }] });
      await listeners[0]!({ kind: "changed", changes: [{ path: "io.github.salemsayed.omaonedrive/status-cache.json", type: "update" }] });
      await listeners[1]!({ kind: "changed", changes: [{ path: "theme.name.123", type: "create" }] });
      expect(harness.experimental_getSignals()).toHaveLength(0);

      await listeners[0]!({ kind: "changed", changes: [{ path: join(root, "omarchy", "current", "theme", "colors.toml"), type: "update" }] });
      await listeners[0]!({ kind: "changed", changes: [{ path: "current", type: "update" }] });
      await listeners[1]!({ kind: "changed", changes: [{ path: "theme.name", type: "update" }] });
      await listeners[0]!({ kind: "rescan-required" });
      expect(harness.experimental_getSignals()).toHaveLength(4);
    } finally {
      await harness.experimental_dispose();
    }
  });

  it("reads the active Omarchy palette and owns only its exact hook", async () => {
    const root = await mkdtemp(join(tmpdir(), "bb-omarchy-host-"));
    roots.push(root);
    const state = join(root, "state");
    const config = join(root, "config");
    process.env.XDG_STATE_HOME = state;
    process.env.XDG_CONFIG_HOME = config;
    const current = join(state, "omarchy", "current");
    await mkdir(join(current, "theme"), { recursive: true });
    await writeFile(join(current, "theme.name"), "tokyo-night\n");
    await writeFile(
      join(current, "theme", "colors.toml"),
      'mode = "dark"\nbackground = "#1a1b26"\nforeground = "#c0caf5"\naccent = "#7aa2f7"\n',
    );

    const harness = experimental_createHostEntryHarness(hostEntry);
    const theme = await harness.experimental_call("readTheme", null);
    expect(theme).toMatchObject({
      available: true,
      themeName: "tokyo-night",
      colors: { mode: "dark", background: "#1a1b26", accent: "#7aa2f7" },
      hookInstalled: false,
    });

    await expect(harness.experimental_call("setHook", { enabled: true })).resolves.toEqual({ installed: true });
    const hookPath = join(config, "omarchy", "hooks", "theme-set.d", "90-bb-omarchy");
    expect(await readFile(hookPath, "utf8")).toContain("bb-omarchy");
    await expect(harness.experimental_call("setHook", { enabled: false })).resolves.toEqual({ installed: false });
    await expect(readFile(hookPath, "utf8")).rejects.toThrow();
    await harness.experimental_dispose();
  });
});
