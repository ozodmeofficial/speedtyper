/**
 * Pure typing-test math. Shared by the client (live + result stats),
 * the server (anti-cheat recomputation) and unit tests.
 */

export interface CharCounts {
  /** chars of words typed completely correctly */
  correctWordChars: number;
  /** all correct chars (also inside wrong words) */
  correctChars: number;
  incorrectChars: number;
  extraChars: number;
  missedChars: number;
  /** spaces typed (one per committed word) */
  spaces: number;
  /** spaces after correctly typed words */
  correctSpaces: number;
}

export const emptyCounts = (): CharCounts => ({
  correctWordChars: 0,
  correctChars: 0,
  incorrectChars: 0,
  extraChars: 0,
  missedChars: 0,
  spaces: 0,
  correctSpaces: 0,
});

/**
 * Count characters the same way the popular typing sites do.
 * `inputs[i]` is what the user typed for `targets[i]`. The last input is the
 * word in progress; when `partialLast` is true (time mode, live stats) its
 * untyped remainder is not counted as missed, and a correct prefix counts
 * towards correct word chars.
 */
export function countChars(targets: readonly string[], inputs: readonly string[], partialLast: boolean): CharCounts {
  const c = emptyCounts();
  const last = inputs.length - 1;
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const target = targets[i] ?? "";
    const isLast = i === last;
    if (input === target) {
      c.correctWordChars += target.length;
      c.correctChars += target.length;
      if (!isLast) c.correctSpaces++;
    } else if (input.length >= target.length) {
      for (let j = 0; j < input.length; j++) {
        if (j < target.length) {
          if (input[j] === target[j]) c.correctChars++;
          else c.incorrectChars++;
        } else c.extraChars++;
      }
    } else {
      let correct = 0;
      let incorrect = 0;
      let missed = 0;
      for (let j = 0; j < target.length; j++) {
        if (j < input.length) {
          if (input[j] === target[j]) correct++;
          else incorrect++;
        } else missed++;
      }
      c.correctChars += correct;
      c.incorrectChars += incorrect;
      if (isLast && partialLast) {
        if (incorrect === 0) c.correctWordChars += correct;
      } else {
        c.missedChars += missed;
      }
    }
    if (!isLast) c.spaces++;
  }
  return c;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** net words per minute */
export function calcWpm(c: Pick<CharCounts, "correctWordChars" | "correctSpaces">, seconds: number): number {
  if (seconds <= 0) return 0;
  return round2(((c.correctWordChars + c.correctSpaces) * (60 / seconds)) / 5);
}

/** raw words per minute (every typed char, right or wrong) */
export function calcRaw(
  c: Pick<CharCounts, "correctChars" | "spaces" | "incorrectChars" | "extraChars">,
  seconds: number,
): number {
  if (seconds <= 0) return 0;
  return round2(((c.correctChars + c.spaces + c.incorrectChars + c.extraChars) * (60 / seconds)) / 5);
}

/** keypress accuracy in percent */
export function calcAccuracy(correctKeys: number, incorrectKeys: number): number {
  const total = correctKeys + incorrectKeys;
  if (total === 0) return 100;
  return round2((correctKeys / total) * 100);
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

export function stdDev(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  let s = 0;
  for (const v of values) s += (v - m) * (v - m);
  return Math.sqrt(s / values.length);
}

/** Maps a coefficient of variation to 0..100 (higher = steadier). */
export function kogasa(cov: number): number {
  return 100 * (1 - Math.tanh(cov + Math.pow(cov, 3) / 3 + Math.pow(cov, 5) / 5));
}

/** consistency from per-second raw speeds */
export function calcConsistency(rawPerSecond: readonly number[]): number {
  if (rawPerSecond.length === 0) return 0;
  const m = mean(rawPerSecond);
  if (m === 0) return 0;
  const v = round2(kogasa(stdDev(rawPerSecond) / m));
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

/**
 * Raw wpm per second from the number of keypresses in each one-second bucket.
 * The final bucket may be partial: it is scaled by its real length.
 */
export function rawPerSecond(keypressBuckets: readonly number[], totalSeconds: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < keypressBuckets.length; i++) {
    const isLast = i === keypressBuckets.length - 1;
    const len = isLast ? Math.min(1, Math.max(totalSeconds - i, 0.5)) : 1;
    out.push(round2(((keypressBuckets[i] / 5) * 60) / len));
  }
  return out;
}

export interface KeySpacingStats {
  count: number;
  mean: number;
  std: number;
}

export function spacingStats(intervals: readonly number[]): KeySpacingStats {
  return { count: intervals.length, mean: round2(mean(intervals)), std: round2(stdDev(intervals)) };
}
