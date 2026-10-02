import { isLanguage, type LanguageId, type QuoteLength } from "./typing/words";
import type { TestMode, Confidence } from "./typing/engine";
import { getTheme, sanitizeColors, THEMES, DEFAULT_THEME, type ThemeColors } from "./themes";

export const FONTS = [
  { id: "roboto_mono", label: "Roboto Mono" },
  { id: "inter", label: "Inter" },
  { id: "jetbrains_mono", label: "JetBrains Mono" },
  { id: "fira_code", label: "Fira Code" },
  { id: "source_code_pro", label: "Source Code Pro" },
  { id: "ibm_plex_mono", label: "IBM Plex Mono" },
  { id: "ubuntu_mono", label: "Ubuntu Mono" },
  { id: "lexend_deca", label: "Lexend Deca" },
  { id: "nunito", label: "Nunito" },
  { id: "montserrat", label: "Montserrat" },
  { id: "source_serif", label: "Source Serif" },
] as const;
export type FontId = (typeof FONTS)[number]["id"];
export const fontVar = (id: FontId) => `var(--font-${id.replace(/_/g, "-")})`;

export const TIME_OPTIONS = [15, 30, 60, 120] as const;
export const WORD_OPTIONS = [10, 25, 50, 100] as const;
export const FONT_SIZES = [1, 1.25, 1.5, 2, 2.5, 3] as const;
export const MODES: readonly TestMode[] = ["time", "words", "quote", "zen", "custom"];
export const CARET_STYLES = ["line", "block", "underline", "outline", "off"] as const;
export const SOUNDS = ["off", "click", "soft", "typewriter", "pop"] as const;
export const QUICK_RESTART = ["tab", "esc", "enter", "off"] as const;
export const TIMER_STYLES = ["text", "bar", "off"] as const;
export const QUOTE_LENGTHS: readonly QuoteLength[] = ["all", "short", "medium", "long"];
export const CONFIDENCE: readonly Confidence[] = ["off", "on", "max"];

export type CaretStyle = (typeof CARET_STYLES)[number];
export type SoundId = (typeof SOUNDS)[number];
export type QuickRestart = (typeof QUICK_RESTART)[number];
export type TimerStyle = (typeof TIMER_STYLES)[number];

export interface Settings {
  mode: TestMode;
  time: number;
  words: number;
  quoteLength: QuoteLength;
  punctuation: boolean;
  numbers: boolean;
  language: LanguageId;
  theme: string;
  customTheme: ThemeColors | null;
  useCustomTheme: boolean;
  fontFamily: FontId;
  fontSize: number;
  caretStyle: CaretStyle;
  smoothCaret: boolean;
  liveWpm: boolean;
  liveAcc: boolean;
  timerStyle: TimerStyle;
  tapeMode: boolean;
  sound: SoundId;
  soundVolume: number;
  blindMode: boolean;
  freedomMode: boolean;
  confidenceMode: Confidence;
  quickRestart: QuickRestart;
  minWpm: number;
  minAcc: number;
  showKeyTips: boolean;
  /** caret glow, word flash, combo counter, result animations, confetti */
  effects: boolean;
  /** home dashboard: level bar, live stat cards and daily widgets */
  dashboard: boolean;
  /** settings schema version (see sanitizeSettings) */
  v: number;
}

/** v2: the default theme changed from "graphite" to "claude"; v3: from "claude" to "speedtyper" */
export const SETTINGS_VERSION = 3;

export const DEFAULT_SETTINGS: Settings = {
  mode: "time",
  time: 30,
  words: 25,
  quoteLength: "all",
  punctuation: false,
  numbers: false,
  language: "english",
  theme: DEFAULT_THEME,
  customTheme: null,
  useCustomTheme: false,
  fontFamily: "roboto_mono",
  fontSize: 1.5,
  caretStyle: "line",
  smoothCaret: true,
  liveWpm: false,
  liveAcc: false,
  timerStyle: "text",
  tapeMode: false,
  sound: "off",
  soundVolume: 0.5,
  blindMode: false,
  freedomMode: false,
  confidenceMode: "off",
  quickRestart: "tab",
  minWpm: 0,
  minAcc: 0,
  showKeyTips: true,
  effects: true,
  dashboard: true,
  v: SETTINGS_VERSION,
};

const oneOf = <T,>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const num = (v: unknown, min: number, max: number, d: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : d;

/** Validate untrusted settings (localStorage, cookie, DB, request body). */
export function sanitizeSettings(input: unknown): Settings {
  const s = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  // settings saved by an older version still carry that version's default theme: move them to the new one once
  const legacyDefault = s.v !== SETTINGS_VERSION && (s.theme === undefined || s.theme === "graphite" || (s.v === 2 && s.theme === "claude"));
  return {
    mode: oneOf(s.mode, MODES, d.mode),
    time: num(s.time, 1, 3600, d.time),
    words: num(s.words, 1, 1000, d.words),
    quoteLength: oneOf(s.quoteLength, QUOTE_LENGTHS, d.quoteLength),
    punctuation: bool(s.punctuation, d.punctuation),
    numbers: bool(s.numbers, d.numbers),
    language: isLanguage(s.language) ? s.language : d.language,
    theme: !legacyDefault && THEMES.some((x) => x.id === s.theme) ? (s.theme as string) : d.theme,
    customTheme: sanitizeColors(s.customTheme),
    useCustomTheme: bool(s.useCustomTheme, d.useCustomTheme),
    fontFamily: oneOf(s.fontFamily, FONTS.map((f) => f.id), d.fontFamily),
    fontSize: oneOf(s.fontSize, FONT_SIZES as readonly number[], d.fontSize),
    caretStyle: oneOf(s.caretStyle, CARET_STYLES, d.caretStyle),
    smoothCaret: bool(s.smoothCaret, d.smoothCaret),
    liveWpm: bool(s.liveWpm, d.liveWpm),
    liveAcc: bool(s.liveAcc, d.liveAcc),
    timerStyle: oneOf(s.timerStyle, TIMER_STYLES, d.timerStyle),
    tapeMode: bool(s.tapeMode, d.tapeMode),
    sound: oneOf(s.sound, SOUNDS, d.sound),
    soundVolume: num(s.soundVolume, 0, 1, d.soundVolume),
    blindMode: bool(s.blindMode, d.blindMode),
    freedomMode: bool(s.freedomMode, d.freedomMode),
    confidenceMode: oneOf(s.confidenceMode, CONFIDENCE, d.confidenceMode),
    quickRestart: oneOf(s.quickRestart, QUICK_RESTART, d.quickRestart),
    minWpm: num(s.minWpm, 0, 300, d.minWpm),
    minAcc: num(s.minAcc, 0, 100, d.minAcc),
    showKeyTips: bool(s.showKeyTips, d.showKeyTips),
    effects: bool(s.effects, d.effects),
    dashboard: bool(s.dashboard, d.dashboard),
    v: SETTINGS_VERSION,
  };
}

export const SETTINGS_COOKIE = "st_s";
export const SETTINGS_STORAGE = "st_settings";
export const CUSTOM_TEXT_STORAGE = "st_custom_text";

/** Only non-default values are stored in the cookie to keep it small. */
export function encodeSettingsCookie(s: Settings): string {
  // the version is always kept so an explicit old default theme is not migrated again
  const diff: Record<string, unknown> = { v: s.v };
  for (const k of Object.keys(s) as (keyof Settings)[]) {
    if (JSON.stringify(s[k]) !== JSON.stringify(DEFAULT_SETTINGS[k])) diff[k] = s[k];
  }
  return encodeURIComponent(JSON.stringify(diff));
}

export function decodeSettingsCookie(v: string | undefined | null): Settings {
  if (!v) return DEFAULT_SETTINGS;
  try {
    return sanitizeSettings(JSON.parse(decodeURIComponent(v)));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** "light" | "dark" for native controls and scrollbars (custom themes: by background luminance) */
export function colorSchemeOf(s: Settings): "light" | "dark" {
  if (s.useCustomTheme && s.customTheme) {
    const n = parseInt(s.customTheme.bg.slice(1), 16);
    const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    return lum > 140 ? "light" : "dark";
  }
  return getTheme(s.theme).light ? "light" : "dark";
}

export function activeColors(s: Settings): ThemeColors {
  if (s.useCustomTheme && s.customTheme) return s.customTheme;
  return getTheme(s.theme);
}

/** "time 30", "words 25", "quote", ... */
export function mode2Of(s: Pick<Settings, "mode" | "time" | "words" | "quoteLength">): string {
  switch (s.mode) {
    case "time":
      return String(s.time);
    case "words":
      return String(s.words);
    case "quote":
      return s.quoteLength;
    default:
      return s.mode;
  }
}
