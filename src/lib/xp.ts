/**
 * XP, levels, tiers, speed ranks and daily streaks (pure, shared by client and server).
 *
 * ── XP for a typing test ────────────────────────────────────────────────
 *   d        = min(duration_s, 300)                  (tests shorter than 3 s give 0)
 *   speed    = 1 + min(wpm, 250) / 60                (60 wpm → ×2, 120 wpm → ×3)
 *   a        = clamp((acc − 50) / 50, 0, 1)          (accuracy below 50 % gives 0 XP)
 *   accMult  = 0.25 + 0.75 · a²                      (100 % → ×1, 90 % → ×0.73, 75 % → ×0.44)
 *   perfect  = 1.1 when acc = 100 %, else 1
 *   XP       = max(1, round((5 + 0.5 · d · speed · accMult) · perfect))
 *   e.g. 30 s @ 60 wpm 95 % → 31 XP, 60 s @ 80 wpm 97 % → 69 XP.
 *   The SQL backfill in prisma/migrations/*_xp_levels mirrors this formula exactly.
 *
 * ── XP for a race ───────────────────────────────────────────────────────
 *   Unfinished races give 0. Otherwise testXp(duration, wpm, acc) plus, with ≥ 2 players,
 *   round(15 · (players − place) / (players − 1)) + min(players − 1, 9) + (10 for the winner).
 *
 * ── Levels 1…100 ────────────────────────────────────────────────────────
 *   Total XP needed to reach level L:  T(L) = round(10 · (L − 1)^2.3 + 40 · (L − 1))
 *   T(2) = 50, T(5) = 403, T(10) = 1 926, T(25) = 15 905, T(50) = 79 130, T(100) = 392 970.
 *   (≈ 1 test for level 2, ~30 tests for level 10, a few thousand tests for level 100.)
 */
import { dayKey, dayKeyToUtcMidnight } from "./format";
import type { AchievementId } from "./achievements";

export const MAX_LEVEL = 100;

const r2 = (n: number) => Math.round(n);

export interface TestXpInput {
  /** seconds */
  duration: number;
  wpm: number;
  acc: number;
}

export function testXp({ duration, wpm, acc }: TestXpInput): number {
  if (!Number.isFinite(duration) || !Number.isFinite(wpm) || !Number.isFinite(acc)) return 0;
  if (duration < 3 || acc < 50 || wpm <= 0) return 0;
  const d = Math.min(duration, 300);
  const speed = 1 + Math.min(wpm, 250) / 60;
  const a = Math.min(1, Math.max(0, (acc - 50) / 50));
  const accMult = 0.25 + 0.75 * a * a;
  const perfect = acc >= 100 ? 1.1 : 1;
  return Math.max(1, r2((5 + 0.5 * d * speed * accMult) * perfect));
}

export interface RaceXpInput {
  /** finishing place (1-based); null when the player did not finish */
  place: number | null;
  players: number;
  wpm: number;
  acc: number;
  durationMs: number;
}

export function raceXp({ place, players, wpm, acc, durationMs }: RaceXpInput): number {
  if (!place || place < 1) return 0;
  const base = testXp({ duration: durationMs / 1000, wpm, acc });
  if (base === 0) return 0;
  let bonus = 0;
  if (players >= 2) {
    const p = Math.min(place, players);
    bonus = r2((15 * (players - p)) / (players - 1)) + Math.min(players - 1, 9) + (p === 1 ? 10 : 0);
  }
  return base + bonus;
}

/** Total XP needed to reach `level` (level 1 = 0 XP). */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  const n = l - 1;
  return r2(10 * Math.pow(n, 2.3) + 40 * n);
}

const TABLE: number[] = Array.from({ length: MAX_LEVEL + 1 }, (_, i) => (i === 0 ? 0 : xpForLevel(i)));

export function levelForXp(xp: number): number {
  const x = Math.max(0, Math.floor(xp || 0));
  let lo = 1;
  let hi = MAX_LEVEL;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (TABLE[mid] <= x) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export interface LevelProgress {
  level: number;
  xp: number;
  /** XP earned inside the current level */
  into: number;
  /** XP the current level spans (0 at max level) */
  span: number;
  /** 0…1 */
  frac: number;
  /** XP still missing for the next level */
  toNext: number;
  max: boolean;
}

export function levelProgress(xp: number): LevelProgress {
  const x = Math.max(0, Math.floor(xp || 0));
  const level = levelForXp(x);
  if (level >= MAX_LEVEL) return { level, xp: x, into: x - TABLE[MAX_LEVEL], span: 0, frac: 1, toNext: 0, max: true };
  const start = TABLE[level];
  const end = TABLE[level + 1];
  const span = end - start;
  return { level, xp: x, into: x - start, span, frac: span ? (x - start) / span : 0, toNext: end - x, max: false };
}

// ── tiers ────────────────────────────────────────────────────────────────

export const TIERS = [
  { id: "novice", from: 1, color: "#a3b1c6" },
  { id: "amateur", from: 5, color: "#5fbf77" },
  { id: "swift", from: 15, color: "#38b2c9" },
  { id: "master", from: 30, color: "#6f8cff" },
  { id: "expert", from: 50, color: "#b07cff" },
  { id: "champion", from: 70, color: "#ff8f4d" },
  { id: "legend", from: 90, color: "#ffc53d" },
] as const;
export type TierId = (typeof TIERS)[number]["id"];
export type Tier = (typeof TIERS)[number];

export function tierForLevel(level: number): Tier {
  let t: Tier = TIERS[0];
  for (const x of TIERS) if (level >= x.from) t = x;
  return t;
}

// ── speed ranks (best 60 s wpm) ───────────────────────────────────────────

export const SPEED_RANKS = [
  { id: "bronze", from: 0, color: "#c47f47" },
  { id: "silver", from: 40, color: "#aeb8c4" },
  { id: "gold", from: 60, color: "#e2b714" },
  { id: "platinum", from: 80, color: "#57c7c0" },
  { id: "diamond", from: 100, color: "#7cc4ff" },
] as const;
export type SpeedRankId = (typeof SPEED_RANKS)[number]["id"];
export type SpeedRank = (typeof SPEED_RANKS)[number];

export function speedRankFor(best60Wpm: number | null | undefined): SpeedRank | null {
  if (best60Wpm === null || best60Wpm === undefined || !Number.isFinite(best60Wpm) || best60Wpm <= 0) return null;
  let r: SpeedRank = SPEED_RANKS[0];
  for (const x of SPEED_RANKS) if (best60Wpm >= x.from) r = x;
  return r;
}

/** Next speed rank and the wpm still needed for it (null at the top). */
export function nextSpeedRank(best60Wpm: number): { rank: SpeedRank; need: number } | null {
  const next = SPEED_RANKS.find((x) => x.from > best60Wpm);
  return next ? { rank: next, need: Math.ceil(next.from - best60Wpm) } : null;
}

// ── daily streak (Asia/Tashkent calendar days, YYYYMMDD keys) ─────────────

export interface StreakState {
  current: number;
  best: number;
  /** last day with a saved test */
  lastDay: number | null;
}

export function prevDayKey(key: number): number {
  return dayKey(dayKeyToUtcMidnight(key) - 12 * 3600 * 1000);
}

/** State after a valid test on `today`. */
export function nextStreak(s: StreakState, today: number): StreakState {
  if (s.lastDay === today) return { ...s, current: Math.max(1, s.current), best: Math.max(s.best, s.current, 1) };
  const current = s.lastDay !== null && s.lastDay === prevDayKey(today) ? s.current + 1 : 1;
  return { current, best: Math.max(s.best, current), lastDay: today };
}

/** Streak as shown today: a streak survives until the end of the next day. */
export function effectiveStreak(s: StreakState, today: number): number {
  if (s.lastDay === null) return 0;
  if (s.lastDay === today || s.lastDay === prevDayKey(today)) return s.current;
  return 0;
}

/** Shape sent to the client (header badge, result screen). */
export interface UserProgress {
  xp: number;
  level: number;
  /** effective streak today (0 when broken) */
  streak: number;
  streakBest: number;
  /** a test was already saved today (streak is safe) */
  streakToday: boolean;
  /** YYYYMMDD (Tashkent) the counters refer to */
  today: number;
  todayTests: number;
}

/** Result of an XP grant (returned by POST /api/results and awardRaceXp). */
export interface XpAward {
  gained: number;
  xp: number;
  prevXp: number;
  level: number;
  prevLevel: number;
  streak: number;
  streakBest: number;
  achievements: AchievementId[];
}
