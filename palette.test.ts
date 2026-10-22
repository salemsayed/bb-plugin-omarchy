import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildThemeCss, contrastText, faviconColor, parseOmarchyColors } from "./palette.js";

import { omarchyColorsSchema } from "./contract.js";

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

  it("preserves all 16 numbered Oxocarbon colors through schema and CSS", () => {
    const source = readFileSync(new URL("./fixtures/oxocarbon.toml", import.meta.url), "utf8");
    const colors = omarchyColorsSchema.parse(parseOmarchyColors(source));
    expect(colors.red).toBe("#3ddbd9");
    expect(colors.green).toBe("#33b1ff");
    expect(colors.selection).toBe("#41414d");
    const css = buildThemeCss(colors, "off");
    for (let index = 0; index < 16; index++) {
      const expected = new RegExp(`^color${index} = "(#[a-fA-F0-9]{6})"`, "m").exec(source)![1]!.toLowerCase();
      expect(colors.ansi![index]).toBe(expected);
      expect(css).toContain(`--ansi-${index}: ${expected};`);
      expect(css).toContain(`--ansi-bg-fg-${index}: ${contrastText(expected)};`);
    }
  });

  it("keeps named semantic colors separate from explicit terminal slots", () => {
    const colors = parseOmarchyColors(`${LIGHT}\ncolor1 = "#123456"\ncolor7 = "#abcdef"`);
    expect(colors.red).toBe("#c900c4");
    expect(colors.foreground).toBe("#212121");
    expect(colors.ansi![1]).toBe("#123456");
    expect(colors.ansi![7]).toBe("#abcdef");
    expect(colors.ansi![2]).toBe(colors.green);
  });

  it("rejects invalid numbered colors and ignores values inside sections", () => {
    const colors = parseOmarchyColors('color1 = "red; } body { display:none"\ncolor2 = "#112233"\n[other]\ncolor2 = "#ffffff"');
    expect(colors.ansi![1]).toMatch(/^#[0-9a-f]{6}$/);
    expect(colors.ansi![2]).toBe("#112233");
    expect(buildThemeCss(colors, "off")).not.toContain("display:none");
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
