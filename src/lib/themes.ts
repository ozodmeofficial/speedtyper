export interface ThemeColors {
  bg: string;
  main: string;
  caret: string;
  sub: string;
  subAlt: string;
  text: string;
  error: string;
  errorExtra: string;
  colorfulError: string;
  colorfulErrorExtra: string;
}

export interface Theme extends ThemeColors {
  id: string;
  name: string;
  light: boolean;
}

type Palette = [bg: string, main: string, caret: string, sub: string, subAlt: string, text: string, error: string, errorExtra: string];

function t(id: string, name: string, light: boolean, p: Palette): Theme {
  const [bg, main, caret, sub, subAlt, text, error, errorExtra] = p;
  return { id, name, light, bg, main, caret, sub, subAlt, text, error, errorExtra, colorfulError: error, colorfulErrorExtra: errorExtra };
}

export const THEMES: readonly Theme[] = [
  t("graphite", "graphite", false, ["#323437", "#e2b714", "#e2b714", "#646669", "#2c2e31", "#d1d0c5", "#ca4754", "#7e2a33"]),
  t("midnight", "midnight ink", false, ["#0f1117", "#7aa2f7", "#7aa2f7", "#3b4261", "#161922", "#c0caf5", "#f7768e", "#a74155"]),
  t("fjord", "fjord", false, ["#2e3440", "#88c0d0", "#d8dee9", "#5d6779", "#272c36", "#eceff4", "#bf616a", "#8e434a"]),
  t("forest", "forest floor", false, ["#1e2721", "#8fbf6a", "#8fbf6a", "#566b5a", "#19211c", "#d6e2d0", "#e0685c", "#9c4238"]),
  t("ember", "ember", false, ["#1f1a17", "#f28c38", "#f28c38", "#6d5d52", "#2a231f", "#eadbc8", "#e5484d", "#9b2f33"]),
  t("lavender", "lavender haze", false, ["#221f2e", "#c4a7e7", "#c4a7e7", "#625b7c", "#1c1a26", "#e0def4", "#eb6f92", "#a44a66"]),
  t("ocean", "deep ocean", false, ["#0b1d2a", "#3fc1c9", "#3fc1c9", "#3e6076", "#0f2535", "#cfe8ef", "#ff6b6b", "#b04545"]),
  t("phosphor", "phosphor", false, ["#000000", "#15ff00", "#15ff00", "#0f6b0a", "#031203", "#d1ffcd", "#da3333", "#791717"]),
  t("neon", "neon city", false, ["#120b1f", "#ff2a6d", "#05d9e8", "#634685", "#1a1130", "#d6f7fa", "#ff5a5a", "#a83a3a"]),
  t("espresso", "espresso", false, ["#2b211c", "#c89f6d", "#c89f6d", "#766151", "#241b17", "#e8dccb", "#d45d5d", "#8f3c3c"]),
  t("slate", "slate", false, ["#1e293b", "#38bdf8", "#38bdf8", "#52627a", "#172033", "#e2e8f0", "#f87171", "#b04a4a"]),
  t("duskrose", "dusk rose", false, ["#232136", "#ea9a97", "#ea9a97", "#6e6a86", "#1d1b2d", "#e0def4", "#eb6f92", "#a44a66"]),
  t("amber", "amber crt", false, ["#1a1300", "#ffb000", "#ffb000", "#806010", "#231a02", "#ffcc66", "#ff5555", "#a33636"]),
  t("olive", "olive grove", false, ["#2f3326", "#c3c86b", "#c3c86b", "#6d7256", "#282c20", "#e3e5cf", "#d9674e", "#984633"]),
  t("vapor", "vapor", false, ["#2a1e3f", "#7df9ff", "#7df9ff", "#75649a", "#231935", "#f5d0fe", "#ff6b8b", "#b0475e"]),
  t("chalk", "chalkboard", false, ["#263238", "#f4f1de", "#f4f1de", "#66838f", "#1f292e", "#cfd8dc", "#ff8a80", "#b35f58"]),
  t("carbon", "carbon", false, ["#111111", "#eeeeee", "#eeeeee", "#5a5a5a", "#1a1a1a", "#bbbbbb", "#ff4d4d", "#a33232"]),
  t("sunset", "sunset strip", false, ["#2d1b2e", "#ff9e64", "#ff9e64", "#7f5f7d", "#261727", "#f6d6c9", "#ff5f7e", "#b03f56"]),
  t("royal", "royal night", false, ["#14163a", "#f2c14e", "#f2c14e", "#50558f", "#101231", "#dfe1ff", "#ff5d73", "#b33d4f"]),
  t("aurora", "aurora", false, ["#0d1b1e", "#7ee8a1", "#b48cff", "#3f6a66", "#0a1618", "#d7f5ec", "#ff6f7d", "#b24a55"]),
  t("paper", "paper", true, ["#f5f3ee", "#b3811d", "#b3811d", "#a39e94", "#ebe8e1", "#2d2a26", "#d14343", "#9a2f2f"]),
  t("arctic", "arctic", true, ["#eceff4", "#5e81ac", "#5e81ac", "#949fb2", "#e1e5ec", "#2e3440", "#bf616a", "#8e434a"]),
  t("sakura", "sakura", true, ["#fbeff1", "#d9657f", "#d9657f", "#c49aa3", "#f5e2e6", "#5a3d44", "#c0392b", "#8c2a1f"]),
  t("desert", "desert sand", true, ["#efe3cf", "#c0632f", "#c0632f", "#ab9677", "#e6d7bf", "#4a3b2a", "#b8322a", "#86241e"]),
  t("mint", "mint", true, ["#eaf6f0", "#2f9e75", "#2f9e75", "#8db3a3", "#dcefe6", "#1f3a30", "#d9534f", "#9e3a37"]),
  t("sunlit", "sunlit", true, ["#fdf6e3", "#b58900", "#b58900", "#93a1a1", "#eee8d5", "#586e75", "#dc322f", "#9e2422"]),
  t("bubblegum", "bubblegum", true, ["#ffe8f3", "#ff5fa2", "#ff5fa2", "#d596b4", "#fbd9ea", "#6b2d4f", "#e02f2f", "#a32121"]),
  t("snowfield", "snowfield", true, ["#ffffff", "#3b82f6", "#3b82f6", "#a3a3a3", "#f1f1f1", "#262626", "#e11d48", "#9f1239"]),
  t("matcha", "matcha", true, ["#e8ecd9", "#6c8f3a", "#6c8f3a", "#9ea685", "#dde3c9", "#3a4228", "#c0442e", "#8a2f1f"]),
  t("lilac", "lilac", true, ["#f3effa", "#7c5cc4", "#7c5cc4", "#aa9fc2", "#e9e2f5", "#352b4a", "#d0445c", "#962f41"]),
];

export const DEFAULT_THEME = "graphite";

export function getTheme(id: string | undefined | null): Theme {
  return THEMES.find((x) => x.id === id) ?? THEMES[0];
}

export const THEME_VARS: Record<keyof ThemeColors, string> = {
  bg: "--bg",
  main: "--main",
  caret: "--caret",
  sub: "--sub",
  subAlt: "--sub-alt",
  text: "--text",
  error: "--error",
  errorExtra: "--error-extra",
  colorfulError: "--colorful-error",
  colorfulErrorExtra: "--colorful-error-extra",
};

export const COLOR_KEYS = Object.keys(THEME_VARS) as (keyof ThemeColors)[];

const HEX = /^#[0-9a-f]{6}$/i;

export function sanitizeColors(input: unknown): ThemeColors | null {
  if (!input || typeof input !== "object") return null;
  const src = input as Record<string, unknown>;
  const out = {} as ThemeColors;
  for (const k of COLOR_KEYS) {
    const v = src[k];
    if (typeof v !== "string" || !HEX.test(v)) return null;
    out[k] = v.toLowerCase();
  }
  return out;
}

/** CSS custom properties for a palette (used for SSR style + live preview) */
export function themeStyle(c: ThemeColors): Record<string, string> {
  const s: Record<string, string> = {};
  for (const k of COLOR_KEYS) s[THEME_VARS[k]] = c[k];
  return s;
}

export function pickColors(theme: Theme): ThemeColors {
  const out = {} as ThemeColors;
  for (const k of COLOR_KEYS) out[k] = theme[k];
  return out;
}
