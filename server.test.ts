import { describe, expect, it, vi } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./server.js";

const hostTheme = {
  available: true,
  themeName: "tokyo-night",
  colors: {
    mode: "dark" as const,
    accent: "#7aa2f7", selection: "#33467c", muted: "#565f89",
    background: "#1a1b26", darkBackground: "#16161e", darkerBackground: "#13131a", lighterBackground: "#24283b",
    foreground: "#c0caf5", darkForeground: "#737aa2", lightForeground: "#a9b1d6", brightForeground: "#ffffff",
    red: "#f7768e", yellow: "#e0af68", orange: "#ff9e64", green: "#9ece6a", cyan: "#7dcfff", blue: "#7aa2f7", magenta: "#bb9af7", brown: "#b26a3d",
    brightRed: "#ff899d", brightYellow: "#f2c879", brightGreen: "#b9f27c", brightCyan: "#a4daff", brightBlue: "#8db6ff", brightMagenta: "#c7a9ff",
  },
  vscodeTheme: null,
  hookInstalled: true,
  error: null,
};

describe("server integration", () => {
  it("keeps the selected desktop across server migration and preserves its palette while disconnected", async () => {
    let primaryHostId = "host_pc";
    let connected = true;
    const calls: string[] = [];
    let { bb, harness } = createFakePluginHost({
      pluginId: "omarchy",
      sdk: {
        system: { config: () => ({ primaryHostId }) },
        theme: { get: () => ({ themeId: "nord", faviconColor: "blue", customCss: null }) },
      },
      experimental_callHostRpc: ({ method, hostId }) => {
        calls.push(hostId);
        if (!connected) throw new Error("Desktop is disconnected");
        if (method === "readTheme") return hostTheme;
        if (method === "watchTheme") return { watching: true, error: null };
        throw new Error(`Unexpected host method ${method}`);
      },
    });
    await bb.storage.kv.set("preferences", { autoSync: true, syncCodeTheme: true, syncFavicon: false, animation: "smooth" });
    try {
      await plugin(bb);
      await harness.behavior.callRpc("setPreferences", { themeHostId: "host_pc" });
      const overlay = await bb.storage.kv.get("client-theme");
      primaryHostId = "host_dedi";
      ({ bb, harness } = await harness.lifecycle.reload(plugin));
      expect(await harness.behavior.callRpc("sync", null)).toMatchObject({ phase: "synced", themeHostId: "host_pc" });
      connected = false;
      expect(await harness.behavior.callRpc("sync", null)).toMatchObject({ phase: "error", message: "Desktop is disconnected" });
      expect(await bb.storage.kv.get("client-theme")).toEqual(overlay);
      connected = true;
      expect(await harness.behavior.callRpc("sync", null)).toMatchObject({ phase: "synced" });
      expect(calls.every(id => id === "host_pc")).toBe(true);
      await harness.behavior.callRpc("setPreferences", { themeHostId: null });
      expect(calls.at(-1)).toBe("host_dedi");
    } finally { await harness.lifecycle.dispose(); }
  });
  it("preserves the overlay revision and sync timestamp until a palette or preference changes", async () => {
    vi.useFakeTimers();
    let theme = structuredClone(hostTheme);
    let { bb, harness } = createFakePluginHost({
      pluginId: "omarchy",
      sdk: {
        system: { config: () => ({ primaryHostId: "host-local" }) },
        theme: { get: () => ({ themeId: "nord", faviconColor: "blue", customCss: null }) },
      },
      experimental_callHostRpc: ({ method }) => {
        if (method === "readTheme") return theme;
        throw new Error(`Unexpected host method ${method}`);
      },
    });
    // Keep this test focused on palette writes rather than favicon selection.
    await bb.storage.kv.set("preferences", { autoSync: true, syncCodeTheme: true, syncFavicon: false, animation: "smooth" });
    try {
      await plugin(bb);
      const first = await harness.behavior.callRpc("sync", null);
      const overlay = await bb.storage.kv.get("client-theme");
      vi.setSystemTime(Date.now() + 30_000);
      const repeated = await harness.behavior.callRpc("sync", null);
      expect(await bb.storage.kv.get("client-theme")).toEqual(overlay);
      expect(repeated).toEqual(first);
      ({ bb, harness } = await harness.lifecycle.reload(plugin));
      await harness.behavior.callRpc("sync", null);
      expect(await bb.storage.kv.get("client-theme")).toEqual(overlay);

      theme = { ...theme, colors: { ...theme.colors, background: "#101010" } };
      vi.setSystemTime(Date.now() + 30_000);
      await harness.behavior.callRpc("sync", null);
      const changed = await bb.storage.kv.get<{ css: string; revision: string }>("client-theme");
      expect(changed).not.toEqual(overlay);
      expect(changed?.css).toContain("--canvas: #101010");

      vi.setSystemTime(Date.now() + 30_000);
      await harness.behavior.callRpc("setPreferences", { animation: "off" });
      expect(await bb.storage.kv.get("client-theme")).not.toEqual(changed);
    } finally {
      await harness.lifecycle.dispose();
      vi.useRealTimers();
    }
  });

  it("serves a desktop/web overlay without changing the server palette used by mobile", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "omarchy",
      sdk: {
        system: { config: () => ({ primaryHostId: "host-local" }) },
        theme: {
          get: () => ({ themeId: "nord", faviconColor: "blue", customCss: null }),
          set: () => ({ themeId: "nord", faviconColor: "blue", customCss: null }),
        },
      },
      experimental_callHostRpc: ({ method }) => {
        if (method === "readTheme") return hostTheme;
        if (method === "setHook") return { installed: true };
        if (method === "watchTheme") return { watching: true, error: null };
        throw new Error(`Unexpected host method ${method}`);
      },
    });
    await plugin(bb);

    const result = await harness.behavior.callRpc("sync", null) as { phase: string; mode: string; bbThemeId: string };
    expect(result).toMatchObject({ phase: "synced", mode: "dark", bbThemeId: "nord" });
    expect(harness.inspection.sdk.callsTo("theme.set")).toEqual([]);

    const response = await harness.behavior.fetchHttp("GET", "/client-theme");
    const overlay = await response.json() as { enabled: boolean; css: string };
    expect(overlay.enabled).toBe(true);
    expect(overlay.css).toContain("client-only overlay never reaches the native mobile app");
    expect(overlay.css).toContain(":root, .light, .dark");
    expect(overlay.css).toContain("color-scheme: dark");
    await harness.lifecycle.dispose();
  });
});
