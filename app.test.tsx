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

function clearMobileMarkers() {
  const client = window as ShellWindow;
  delete client.ReactNativeWebView;
  delete client.bb;
}

describe("Omarchy client overlay surfaces", () => {
  afterEach(() => {
    clearMobileMarkers();
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

  it("themes an ordinary web client, including an installed PWA", async () => {
    clearMobileMarkers();
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
