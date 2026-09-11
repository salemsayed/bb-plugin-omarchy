// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadPluginApp,
  mountPluginContentScripts,
} from "@get-bb/plugin-sdk/testing/app";

type ShellWindow = Window & {
  ReactNativeWebView?: unknown;
  bb?: { native?: { __installed?: boolean } };
};

type StandaloneNavigator = Navigator & { standalone?: boolean };

function clearMobileMarkers() {
  const client = window as ShellWindow;
  delete client.ReactNativeWebView;
  delete client.bb;
  delete (navigator as StandaloneNavigator).standalone;
}

describe("Omarchy client overlay surfaces", () => {
  afterEach(() => {
    clearMobileMarkers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.head.querySelectorAll("[data-bb-omarchy-theme]").forEach((node) => node.remove());
  });

  it("does not theme BB's Expo react-native WebView", async () => {
    (window as ShellWindow).ReactNativeWebView = { postMessage() {} };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const plugin = await loadPluginApp(() => import("./app"));

    const mounted = await mountPluginContentScripts(plugin, {
      pluginId: "omarchy",
      generation: 1,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.head.querySelector("[data-bb-omarchy-theme]")).toBeNull();
    await mounted.lifecycle.dispose();
  });

  it.each([
    { name: "Android tablet PWA without a Mobile UA token", userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36" },
    { name: "Android phone browser", userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/128.0.0.0 Mobile Safari/537.36" },
    { name: "iPhone PWA", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15" },
    { name: "iPad browser", userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15" },
    { name: "iPad in desktop mode", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15", platform: "MacIntel", maxTouchPoints: 5 },
    { name: "Android tablet with desktop UA and Android client hints", userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36", userAgentData: { platform: "Android", mobile: false } },
  ])("leaves $name appearance independent", async ({ name: _name, ...browser }) => {
    vi.stubGlobal("navigator", browser);
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const plugin = await loadPluginApp(() => import("./app"));
    const mounted = await mountPluginContentScripts(plugin, { pluginId: "omarchy", generation: 3 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.head.querySelector("[data-bb-omarchy-theme]")).toBeNull();
    await mounted.lifecycle.dispose();
  });

  it.each([
    { name: "Chromium standalone PWA", mode: "standalone" },
    { name: "fullscreen PWA", mode: "fullscreen" },
    { name: "minimal UI PWA", mode: "minimal-ui" },
    { name: "window controls overlay PWA", mode: "window-controls-overlay" },
    { name: "tabbed PWA", mode: "tabbed" },
  ])("leaves a desktop-like $name independent", async ({ mode }) => {
    clearMobileMarkers();
    vi.stubGlobal("navigator", {
      platform: "Linux x86_64",
      maxTouchPoints: 0,
      userAgent: "Mozilla/5.0",
    });
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: query === `(display-mode: ${mode})` })));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const stale = document.createElement("style");
    stale.dataset.bbOmarchyTheme = "client-only";
    stale.textContent = ":root, .light, .dark { color-scheme: dark; }";
    document.head.appendChild(stale);

    const plugin = await loadPluginApp(() => import("./app"));
    const mounted = await mountPluginContentScripts(plugin, { pluginId: "omarchy", generation: 4 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.head.querySelector("[data-bb-omarchy-theme]")).toBeNull();
    await mounted.lifecycle.dispose();
  });

  it("leaves an iOS standalone PWA independent", async () => {
    clearMobileMarkers();
    vi.stubGlobal("navigator", {
      standalone: true,
      platform: "MacIntel",
      maxTouchPoints: 0,
      userAgent: "Mozilla/5.0",
    });
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const plugin = await loadPluginApp(() => import("./app"));
    const mounted = await mountPluginContentScripts(plugin, { pluginId: "omarchy", generation: 5 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.head.querySelector("[data-bb-omarchy-theme]")).toBeNull();
    await mounted.lifecycle.dispose();
  });

  it.each([
    { platform: "Linux x86_64", maxTouchPoints: 0 },
    { platform: "MacIntel", maxTouchPoints: 0 },
    { platform: "Win32", maxTouchPoints: 10 },
  ])("themes ordinary desktop browser tabs on $platform", async (browser) => {
    clearMobileMarkers();
    vi.stubGlobal("navigator", { ...browser, userAgent: "Mozilla/5.0" });
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ enabled: true, css: ":root { --background: #010203; }", revision: "pwa-1" }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const plugin = await loadPluginApp(() => import("./app"));

    const mounted = await mountPluginContentScripts(plugin, {
      pluginId: "omarchy",
      generation: 2,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(document.head.querySelector<HTMLStyleElement>("[data-bb-omarchy-theme]")?.textContent)
      .toContain("--background: #010203");
    await mounted.lifecycle.dispose();
    expect(document.head.querySelector("[data-bb-omarchy-theme]")).toBeNull();
  });
});
