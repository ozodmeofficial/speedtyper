import { dayKey, dayKeyToUtcMidnight } from "./format";

/** Leaderboard periods, all in Asia/Tashkent calendar time. */
export const PERIODS = ["day", "month", "year", "all"] as const;
export type Period = (typeof PERIODS)[number];

/** Ranking metric: words per minute or correct characters per minute. */
export const METRICS = ["wpm", "cpm"] as const;
export type Metric = (typeof METRICS)[number];

export const isPeriod = (v: unknown): v is Period => typeof v === "string" && (PERIODS as readonly string[]).includes(v);
export const isMetric = (v: unknown): v is Metric => typeof v === "string" && (METRICS as readonly string[]).includes(v);

/**
 * Inclusive YYYYMMDD range of the current period (null = all time).
 * Month/year ranges use 00 and 99 bounds so they need no calendar math.
 */
export function periodDayRange(period: Period, now: Date | number = Date.now()): { from: number; to: number } | null {
  const key = dayKey(now);
  switch (period) {
    case "day":
      return { from: key, to: key };
    case "month": {
      const ym = Math.floor(key / 100) * 100;
      return { from: ym, to: ym + 99 };
    }
    case "year": {
      const y = Math.floor(key / 10000) * 10000;
      return { from: y, to: y + 9999 };
    }
    default:
      return null;
  }
}

/** UTC instant at which the current period started (null = all time). */
export function periodStart(period: Period, now: Date | number = Date.now()): Date | null {
  const key = dayKey(now);
  switch (period) {
    case "day":
      return new Date(dayKeyToUtcMidnight(key));
    case "month":
      return new Date(dayKeyToUtcMidnight(Math.floor(key / 100) * 100 + 1));
    case "year":
      return new Date(dayKeyToUtcMidnight(Math.floor(key / 10000) * 10000 + 101));
    default:
      return null;
  }
}

/** Cache-key fragment that changes when the period rolls over. */
export function periodKey(period: Period, now: Date | number = Date.now()): string {
  const r = periodDayRange(period, now);
  return r ? `${period}${r.from}` : "all";
}
