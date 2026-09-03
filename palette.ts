import type { AnimationStyle, OmarchyColors } from "./contract.js";

const HEX = /^#[0-9a-f]{6}$/i;

const FALLBACKS = {
  accent: "#7c8cff",
  background: "#17191d",
  foreground: "#e7eaf0",
  red: "#ef6a6a",
  yellow: "#e7c66b",
  orange: "#e99a61",
  green: "#79c88b",
  cyan: "#6bc7d6",
  blue: "#75a7f0",
  magenta: "#c58ee8",
} as const;

function color(value: string | undefined, fallback: string): string {
  return value !== undefined && HEX.test(value) ? value.toLowerCase() : fallback;
}

/** Parse the stable, top-level color vocabulary from Omarchy colors.toml. */
export function parseOmarchyColors(source: string): OmarchyColors {
  const values: Record<string, string> = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("[")) break;
    if (line === "" || line.startsWith("#")) continue;
    const match = /^([a-z_]+)\s*=\s*"([^"\r\n]+)"(?:\s*#.*)?$/i.exec(line);
    if (match) values[match[1]!] = match[2]!;
  }

  const background = color(values.background, FALLBACKS.background);
  const foreground = color(values.foreground, FALLBACKS.foreground);
  const accent = color(values.accent, color(values.blue, FALLBACKS.accent));
  const mode =
    values.mode === "light" || values.mode === "dark"
      ? values.mode
      : relativeLuminance(background) > relativeLuminance(foreground)
        ? "light"
        : "dark";

  return {
    mode,
    accent,
    selection: color(values.selection, accent),
    muted: color(values.muted, mixHex(foreground, background, 0.52)),
    background,
    darkBackground: color(values.dark_background, mixHex(background, foreground, 0.06)),
    darkerBackground: color(values.darker_background, mixHex(background, foreground, 0.11)),
    lighterBackground: color(values.lighter_background, mixHex(background, foreground, 0.035)),
    foreground,
    darkForeground: color(values.dark_foreground, mixHex(foreground, background, 0.34)),
    lightForeground: color(values.light_foreground, mixHex(foreground, background, 0.18)),
    brightForeground: color(values.bright_foreground, foreground),
    red: color(values.red, FALLBACKS.red),
    yellow: color(values.yellow, FALLBACKS.yellow),
    orange: color(values.orange, FALLBACKS.orange),
    green: color(values.green, FALLBACKS.green),
    cyan: color(values.cyan, FALLBACKS.cyan),
    blue: color(values.blue, accent),
    magenta: color(values.magenta, FALLBACKS.magenta),
    brown: color(values.brown, FALLBACKS.orange),
    brightRed: color(values.bright_red, color(values.red, FALLBACKS.red)),
    brightYellow: color(values.bright_yellow, color(values.yellow, FALLBACKS.yellow)),
    brightGreen: color(values.bright_green, color(values.green, FALLBACKS.green)),
    brightCyan: color(values.bright_cyan, color(values.cyan, FALLBACKS.cyan)),
    brightBlue: color(values.bright_blue, color(values.blue, accent)),
    brightMagenta: color(values.bright_magenta, color(values.magenta, FALLBACKS.magenta)),
  };
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function mixHex(a: string, b: string, amountOfB: number): string {
  const aa = rgb(a);
  const bb = rgb(b);
  const channel = (index: number) =>
    Math.round(aa[index]! * (1 - amountOfB) + bb[index]! * amountOfB)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

export function relativeLuminance(hex: string): number {
  const linear = rgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
}

export function contrastText(background: string): "#000000" | "#ffffff" {
  const luminance = relativeLuminance(background);
  const black = (luminance + 0.05) / 0.05;
  const white = 1.05 / (luminance + 0.05);
  return black >= white ? "#000000" : "#ffffff";
}

export function faviconColor(accent: string):
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "teal"
  | "blue"
  | "purple"
  | "pink" {
  const [r, g, b] = rgb(accent).map((value) => value / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  if (hue < 0) hue += 360;
  if (hue < 18 || hue >= 345) return "red";
  if (hue < 48) return "orange";
  if (hue < 75) return "yellow";
  if (hue < 165) return "green";
  if (hue < 195) return "teal";
  if (hue < 255) return "blue";
  if (hue < 305) return "purple";
  return "pink";
}

const ANIMATION: Record<AnimationStyle, { duration: string; easing: string }> = {
  off: { duration: "0ms", easing: "linear" },
  subtle: { duration: "180ms", easing: "ease-out" },
  smooth: { duration: "420ms", easing: "cubic-bezier(.22,1,.36,1)" },
  cinematic: { duration: "760ms", easing: "cubic-bezier(.16,1,.3,1)" },
};

const ANIMATED_PROPERTIES = [
  "--canvas",
  "--ink",
  "--primary",
  "--muted-foreground",
  "--subtle-foreground",
  "--readback-foreground",
  "--timeline-accent",
  "--destructive",
  "--warning",
  "--attention",
  "--success",
  "--diff-added",
  "--diff-removed",
  "--pr-merged",
];

/** Build a complete BB palette while preserving BB's own derived surface model. */
export function buildThemeCss(
  colors: OmarchyColors,
  animation: AnimationStyle,
  syncCodeTheme = true,
): string {
  const ansi = [
    colors.darkerBackground,
    colors.red,
    colors.green,
    colors.yellow,
    colors.blue,
    colors.magenta,
    colors.cyan,
    colors.foreground,
    colors.muted,
    colors.brightRed,
    colors.brightGreen,
    colors.brightYellow,
    colors.brightBlue,
    colors.brightMagenta,
    colors.brightCyan,
    colors.brightForeground,
  ];
  const { duration, easing } = ANIMATION[animation];
  const registrations = ANIMATED_PROPERTIES.map((property) => {
    const value = property === "--canvas" ? colors.background : property === "--ink" ? colors.foreground : colors.accent;
    return `@property ${property} { syntax: "<color>"; inherits: true; initial-value: ${value}; }`;
  }).join("\n");
  const ansiLines = ansi
    .flatMap((value, index) => [
      `  --ansi-${index}: ${value};`,
      `  --ansi-bg-fg-${index}: ${contrastText(value)};`,
    ])
    .join("\n");

  const codeTheme = syncCodeTheme
    ? `
.bb-code-highlight,
.dark .bb-code-highlight {
  --sh-identifier: ${colors.foreground};
  --sh-sign: ${colors.darkForeground};
  --sh-comment: ${colors.muted};
  --sh-keyword: ${colors.magenta};
  --sh-string: ${colors.green};
  --sh-class: ${colors.blue};
  --sh-property: ${colors.cyan};
  --sh-entity: ${colors.orange};
  --sh-jsxliterals: ${colors.magenta};
}
`
    : "";

  return `/* Generated by bb-plugin-omarchy. This client-only overlay never reaches the native mobile app. */
${registrations}

:root, .light, .dark {
  color-scheme: ${colors.mode};
  --canvas: ${colors.background};
  --ink: ${colors.foreground};
  --primary: ${colors.accent};
  --primary-foreground: ${contrastText(colors.accent)};
  --muted-foreground: ${colors.darkForeground};
  --subtle-foreground: ${colors.muted};
  --readback-foreground: ${colors.lightForeground};
  --timeline-accent: ${colors.blue};
  --file-accent: var(--timeline-accent);
  --destructive: ${colors.red};
  --destructive-foreground: ${contrastText(colors.red)};
  --destructive-text: ${colors.brightRed};
  --warning: ${colors.orange};
  --warning-text: ${colors.orange};
  --attention: ${colors.yellow};
  --success: ${colors.green};
  --diff-added: ${colors.green};
  --diff-removed: ${colors.red};
  --pr-merged: ${colors.magenta};
  --ring: ${colors.accent};
  --sidebar-ring: ${colors.accent};
${ansiLines}
}

@media (prefers-reduced-motion: no-preference) {
  :root {
    transition-property: ${ANIMATED_PROPERTIES.join(", ")};
    transition-duration: ${duration};
    transition-timing-function: ${easing};
  }
}
${codeTheme}
`;
}

export function buildCodeTheme(colors: OmarchyColors, source: string | null): string {
  let existing: Record<string, unknown> = {};
  if (source !== null) {
    try {
      const parsed: unknown = JSON.parse(source);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        existing = parsed as Record<string, unknown>;
      }
    } catch {
      // Fall through to the generated token theme.
    }
  }
  const existingColors =
    existing.colors !== null && typeof existing.colors === "object" && !Array.isArray(existing.colors)
      ? (existing.colors as Record<string, unknown>)
      : {};
  const tokenColors = Array.isArray(existing.tokenColors)
    ? existing.tokenColors
    : [
        { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: colors.muted, fontStyle: "italic" } },
        { scope: ["keyword", "storage", "constant.language"], settings: { foreground: colors.magenta } },
        { scope: ["string", "constant.other.symbol"], settings: { foreground: colors.green } },
        { scope: ["entity.name.function", "support.function"], settings: { foreground: colors.blue } },
        { scope: ["variable", "meta.definition.variable.name"], settings: { foreground: colors.foreground } },
        { scope: ["constant.numeric", "constant.character"], settings: { foreground: colors.orange } },
        { scope: ["entity.name.type", "support.type"], settings: { foreground: colors.cyan } },
      ];
  return `${JSON.stringify(
    {
      ...existing,
      name: `Omarchy Sync (${colors.mode})`,
      type: colors.mode,
      colors: {
        ...existingColors,
        "editor.background": colors.background,
        "editor.foreground": colors.foreground,
        "editor.selectionBackground": colors.selection,
        "editor.lineHighlightBackground": colors.darkBackground,
        "editorCursor.foreground": colors.accent,
        "editorLineNumber.foreground": colors.muted,
        "editorLineNumber.activeForeground": colors.lightForeground,
      },
      tokenColors,
    },
    null,
    2,
  )}\n`;
}
