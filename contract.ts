import { defineRpcContract, type ExperimentalHostSignals } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const animationSchema = z.enum(["off", "subtle", "smooth", "cinematic"]);
export type AnimationStyle = z.infer<typeof animationSchema>;

export const omarchyColorsSchema = z.object({
  mode: z.enum(["light", "dark"]),
  accent: z.string(),
  selection: z.string(),
  muted: z.string(),
  background: z.string(),
  darkBackground: z.string(),
  darkerBackground: z.string(),
  lighterBackground: z.string(),
  foreground: z.string(),
  darkForeground: z.string(),
  lightForeground: z.string(),
  brightForeground: z.string(),
  red: z.string(),
  yellow: z.string(),
  orange: z.string(),
  green: z.string(),
  cyan: z.string(),
  blue: z.string(),
  magenta: z.string(),
  brown: z.string(),
  brightRed: z.string(),
  brightYellow: z.string(),
  brightGreen: z.string(),
  brightCyan: z.string(),
  brightBlue: z.string(),
  brightMagenta: z.string(),
});
export type OmarchyColors = z.infer<typeof omarchyColorsSchema>;

export const hostThemeSchema = z.object({
  available: z.boolean(),
  themeName: z.string().nullable(),
  colors: omarchyColorsSchema.nullable(),
  vscodeTheme: z.string().nullable(),
  hookInstalled: z.boolean(),
  error: z.string().nullable(),
});
export type HostTheme = z.infer<typeof hostThemeSchema>;

export const hostContract = defineRpcContract({
  readTheme: { input: z.null(), output: hostThemeSchema },
  watchTheme: {
    input: z.null(),
    output: z.object({ watching: z.boolean(), error: z.string().nullable() }),
  },
  setHook: {
    input: z.object({ enabled: z.boolean() }).strict(),
    output: z.object({ installed: z.boolean() }),
  },
});

export const hostSignals = {
  themeChanged: {
    payload: z.object({ at: z.number(), reason: z.string() }).strict(),
  },
} satisfies ExperimentalHostSignals;

const syncStatusSchema = z.object({
  phase: z.enum(["checking", "synced", "paused", "unavailable", "error"]),
  message: z.string(),
  themeName: z.string().nullable(),
  mode: z.enum(["light", "dark"]).nullable(),
  colors: omarchyColorsSchema.nullable(),
  bbThemeId: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
  hookInstalled: z.boolean(),
  autoSync: z.boolean(),
  syncCodeTheme: z.boolean(),
  syncFavicon: z.boolean(),
  animation: animationSchema,
});
export type SyncStatus = z.infer<typeof syncStatusSchema>;

export const rpcContract = defineRpcContract({
  status: { input: z.null(), output: syncStatusSchema },
  sync: { input: z.null(), output: syncStatusSchema },
  setPreferences: {
    input: z
      .object({
        autoSync: z.boolean().optional(),
        syncCodeTheme: z.boolean().optional(),
        syncFavicon: z.boolean().optional(),
        animation: animationSchema.optional(),
      })
      .strict(),
    output: syncStatusSchema,
  },
  setHook: {
    input: z.object({ enabled: z.boolean() }).strict(),
    output: syncStatusSchema,
  },
});
