import { describe, expect, it } from "vitest";
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
