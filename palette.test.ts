import { describe, expect, it } from "vitest";
import { buildThemeCss, contrastText, faviconColor, parseOmarchyColors } from "./palette.js";

const LIGHT = `
mode = "light"
accent = "#3264eb"
selection = "#d0d0d0"
muted = "#9e9e9e"
background = "#fafafa"
dark_background = "#ececec"
darker_background = "#dedede"
lighter_background = "#f5f5f5"
foreground = "#212121"
dark_foreground = "#757575"
light_foreground = "#424242"
bright_foreground = "#000000"
red = "#c900c4"
yellow = "#026fde"
orange = "#026fde"
green = "#4a2fd0"
cyan = "#0c67de"
blue = "#3264eb"
magenta = "#8a4ad7"
brown = "#013a6f"
bright_red = "#f930fb"
bright_yellow = "#358fff"
bright_green = "#9f85e0"
bright_cyan = "#3986ff"
bright_blue = "#5482ff"
bright_magenta = "#b363ff"
`;

describe("parseOmarchyColors", () => {
  it("reads Omarchy's stable root vocabulary and explicit mode", () => {
    const colors = parseOmarchyColors(LIGHT);
    expect(colors).toMatchObject({
      mode: "light",
      accent: "#3264eb",
      background: "#fafafa",
      foreground: "#212121",
      brightMagenta: "#b363ff",
    });
  });

  it("infers dark mode and supplies safe fallbacks for old themes", () => {
    const colors = parseOmarchyColors('background = "#101216"\nforeground = "#e9edf2"');
    expect(colors.mode).toBe("dark");
    expect(colors.accent).toMatch(/^#[0-9a-f]{6}$/);
    expect(colors.darkBackground).not.toBe(colors.background);
  });
});

describe("buildThemeCss", () => {
  it("forces both BB client modes onto Omarchy's declared light mode", () => {
    const css = buildThemeCss(parseOmarchyColors(LIGHT), "smooth");
    expect(css).toContain(":root, .light, .dark");
    expect(css).toContain("color-scheme: light");
    expect(css).toContain("--canvas: #fafafa");
    expect(css).toContain("--ink: #212121");
    expect(css).toContain("transition-duration: 420ms");
  });

  it("can leave syntax tokens alone while retaining ANSI and diff colors", () => {
    const css = buildThemeCss(parseOmarchyColors(LIGHT), "off", false);
    expect(css).not.toContain("--sh-keyword");
    expect(css).toContain("--ansi-15");
    expect(css).toContain("--diff-added");
  });
});

describe("color policy", () => {
  it("chooses the higher-contrast black or white foreground", () => {
    expect(contrastText("#fafafa")).toBe("#000000");
    expect(contrastText("#121212")).toBe("#ffffff");
  });

  it("maps accent hue to BB's favicon vocabulary", () => {
    expect(faviconColor("#3264eb")).toBe("blue");
    expect(faviconColor("#cba6f7")).toBe("purple");
  });
});
