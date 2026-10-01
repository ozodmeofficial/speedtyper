import { isLanguage, type LanguageId } from "./typing/words";
import { round2 } from "./typing/stats";
import type { TestMode } from "./typing/engine";

export const MAX_WPM = 350;
export const MAX_RAW = 420;
export const FLAG_WPM = 250;

export interface ResultPayload {
  mode: TestMode;
  mode2: string;
  language: LanguageId;
  punctuation: boolean;
  numbers: boolean;
  wpm: number;
  raw: number;
  acc: number;
  consistency: number;
  chars: {
    correctWord: number;
    correct: number;
    incorrect: number;
    extra: number;
    missed: number;
    spaces: number;
    correctSpaces: number;
  };
  duration: number;
  wpmHistory: number[];
  rawHistory: number[];
  errorHistory: number[];
  keySpacing: { count: number; mean: number; std: number };
  afkSeconds: number;
  restarts: number;
  incompleteTime: number;
}

export type ValidationResult =
  | { ok: false; reason: string }
  | { ok: true; value: ResultPayload; flagged: boolean; flagReason: string | null };

const MODES: readonly TestMode[] = ["time", "words", "quote", "zen", "custom"];

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isInt = (v: unknown, min: number, max: number): v is number =>
  isNum(v) && Number.isInteger(v) && v >= min && v <= max;
const inRange = (v: unknown, min: number, max: number): v is number => isNum(v) && v >= min && v <= max;

function numArray(v: unknown, maxLen: number, max: number): number[] | null {
  if (!Array.isArray(v) || v.length > maxLen) return null;
  for (const x of v) if (!inRange(x, 0, max)) return null;
  return v as number[];
}

function fail(reason: string): ValidationResult {
  return { ok: false, reason };
}

/**
 * Validate a submitted test result. Speeds are recomputed from the character
 * counts and duration; impossible or inconsistent results are rejected,
 * borderline ones are accepted but flagged (kept off leaderboards).
 */
export function validateResult(input: unknown): ValidationResult {
  if (!input || typeof input !== "object") return fail("invalid_body");
  const p = input as Record<string, unknown>;

  const mode = p.mode as TestMode;
  if (!MODES.includes(mode)) return fail("invalid_mode");
  if (typeof p.mode2 !== "string" || p.mode2.length > 16) return fail("invalid_mode2");
  const mode2 = p.mode2;
  if (!isLanguage(p.language)) return fail("invalid_language");
  if (typeof p.punctuation !== "boolean" || typeof p.numbers !== "boolean") return fail("invalid_flags");

  const c = p.chars as Record<string, unknown> | undefined;
  if (!c || typeof c !== "object") return fail("invalid_chars");
  const keys = ["correctWord", "correct", "incorrect", "extra", "missed", "spaces", "correctSpaces"] as const;
  for (const k of keys) if (!isInt(c[k], 0, 100000)) return fail("invalid_chars");
  const chars = Object.fromEntries(keys.map((k) => [k, c[k] as number])) as ResultPayload["chars"];
  if (chars.correctWord > chars.correct) return fail("chars_inconsistent");
  if (chars.correctSpaces > chars.spaces) return fail("chars_inconsistent");

  if (!inRange(p.duration, 0, 7200)) return fail("invalid_duration");
  const duration = p.duration;
  if (duration < 3) return fail("too_short");

  if (mode === "time") {
    const limit = Number(mode2);
    if (!Number.isInteger(limit) || limit < 1 || limit > 3600) return fail("invalid_mode2");
    if (Math.abs(duration - limit) > 0.5) return fail("duration_mismatch");
  } else if (mode === "words") {
    const n = Number(mode2);
    if (!Number.isInteger(n) || n < 1 || n > 1000) return fail("invalid_mode2");
    if (chars.spaces + 1 > n + 1) return fail("word_count_mismatch");
  } else if (mode === "quote") {
    if (!["all", "short", "medium", "long"].includes(mode2)) return fail("invalid_mode2");
  } else if (mode2 !== mode) {
    return fail("invalid_mode2");
  }

  if (!inRange(p.acc, 0, 100)) return fail("invalid_acc");
  if (!inRange(p.consistency, 0, 100)) return fail("invalid_consistency");
  if (!inRange(p.wpm, 0, 10000) || !inRange(p.raw, 0, 10000)) return fail("invalid_wpm");

  const wpm = round2(((chars.correctWord + chars.correctSpaces) * (60 / duration)) / 5);
  const raw = round2(((chars.correct + chars.spaces + chars.incorrect + chars.extra) * (60 / duration)) / 5);
  const tol = (v: number) => Math.max(1, v * 0.02);
  if (Math.abs(wpm - p.wpm) > tol(wpm)) return fail("wpm_mismatch");
  if (Math.abs(raw - p.raw) > tol(raw)) return fail("raw_mismatch");
  if (wpm > MAX_WPM || raw > MAX_RAW) return fail("impossible_speed");
  if (wpm > raw + 1) return fail("wpm_exceeds_raw");
  if (p.acc < 20) return fail("accuracy_too_low");

  const seconds = Math.ceil(duration - 0.001);
  const maxLen = seconds + 2;
  const wpmHistory = numArray(p.wpmHistory, maxLen, 2000);
  const rawHistory = numArray(p.rawHistory, maxLen, 5000);
  const errorHistory = numArray(p.errorHistory, maxLen, 1000);
  if (!wpmHistory || !rawHistory || !errorHistory) return fail("invalid_history");
  if (Math.abs(wpmHistory.length - duration) > 2) return fail("history_mismatch");
  if (rawHistory.length !== wpmHistory.length || errorHistory.length !== wpmHistory.length) return fail("history_mismatch");

  const ks = p.keySpacing as Record<string, unknown> | undefined;
  if (!ks || !isInt(ks.count, 0, 1_000_000) || !inRange(ks.mean, 0, 1e7) || !inRange(ks.std, 0, 1e7))
    return fail("invalid_keyspacing");
  const keySpacing = { count: ks.count as number, mean: ks.mean as number, std: ks.std as number };
  const typed = chars.correct + chars.incorrect + chars.extra + chars.spaces;
  if (mode !== "zen" && keySpacing.count < typed * 0.8 - 2) return fail("keystrokes_missing");
  if (keySpacing.count >= 20 && keySpacing.std < 4) return fail("uniform_keystrokes");

  if (!inRange(p.afkSeconds, 0, 7200)) return fail("invalid_afk");
  const restarts = isInt(p.restarts, 0, 100000) ? p.restarts : 0;
  const incompleteTime = inRange(p.incompleteTime, 0, 86400) ? p.incompleteTime : 0;
  if (p.afkSeconds > duration * 0.5 && duration > 10) return fail("afk");

  let flagReason: string | null = null;
  if (wpm > FLAG_WPM) flagReason = "high_wpm";
  else if (keySpacing.count >= 20 && keySpacing.std < 12) flagReason = "low_keystroke_variance";
  else if (wpm > 120 && p.consistency > 97) flagReason = "unnatural_consistency";

  return {
    ok: true,
    flagged: flagReason !== null,
    flagReason,
    value: {
      mode,
      mode2,
      language: p.language,
      punctuation: p.punctuation,
      numbers: p.numbers,
      wpm,
      raw,
      acc: round2(p.acc),
      consistency: round2(p.consistency),
      chars,
      duration: round2(duration),
      wpmHistory,
      rawHistory,
      errorHistory,
      keySpacing,
      afkSeconds: p.afkSeconds,
      restarts,
      incompleteTime,
    },
  };
}

/** Leaderboard key for a result, or null when the result does not qualify. */
export function boardFor(r: Pick<ResultPayload, "mode" | "mode2" | "language" | "punctuation" | "numbers">): string | null {
  if (r.mode !== "time" || r.punctuation || r.numbers) return null;
  if (!(BOARD_TIMES as readonly string[]).includes(r.mode2)) return null;
  const lang = r.language === "english_1k" ? null : r.language;
  if (!lang) return null;
  return `time_${r.mode2}_${lang}`;
}

export const BOARD_LANGS = ["english", "uzbek", "russian"] as const;
export const BOARD_TIMES = ["15", "30", "60", "120"] as const;
