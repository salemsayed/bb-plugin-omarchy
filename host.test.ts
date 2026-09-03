import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";
import hostEntry from "./host.js";

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
