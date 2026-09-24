/**
 * Achievements (pure). Unlocking is monotonic: once a condition was met the
 * achievement stays, so checks can use either lifetime aggregates (sync) or the
 * values of the result that was just saved (award) interchangeably.
 */
export interface AchStats {
  testsCompleted: number;
  /** best wpm of a valid test lasting ≥ 15 s */
  bestWpm: number;
  /** a valid 60 s time test with 100 % accuracy exists */
  perfect60: boolean;
  streakBest: number;
  racesFinished: number;
  raceWins: number;
  level: number;
  /** seconds */
  timeTyping: number;
}

export const ACHIEVEMENTS = [
  { id: "first_test", icon: "spark", check: (s: AchStats) => s.testsCompleted >= 1 },
  { id: "tests_100", icon: "stack", check: (s: AchStats) => s.testsCompleted >= 100 },
  { id: "tests_1000", icon: "mountain", check: (s: AchStats) => s.testsCompleted >= 1000 },
  { id: "wpm_60", icon: "bolt", check: (s: AchStats) => s.bestWpm >= 60 },
  { id: "wpm_100", icon: "rocket", check: (s: AchStats) => s.bestWpm >= 100 },
  { id: "wpm_150", icon: "comet", check: (s: AchStats) => s.bestWpm >= 150 },
  { id: "perfect_60", icon: "target", check: (s: AchStats) => s.perfect60 },
  { id: "streak_7", icon: "flame", check: (s: AchStats) => s.streakBest >= 7 },
  { id: "streak_30", icon: "calendar", check: (s: AchStats) => s.streakBest >= 30 },
  { id: "race_first", icon: "flag", check: (s: AchStats) => s.racesFinished >= 1 },
  { id: "race_wins_10", icon: "trophy", check: (s: AchStats) => s.raceWins >= 10 },
  { id: "level_10", icon: "star", check: (s: AchStats) => s.level >= 10 },
  { id: "level_50", icon: "crown", check: (s: AchStats) => s.level >= 50 },
  { id: "hours_10", icon: "clock", check: (s: AchStats) => s.timeTyping >= 10 * 3600 },
] as const;

export type AchievementId = (typeof ACHIEVEMENTS)[number]["id"];
export type AchievementIcon = (typeof ACHIEVEMENTS)[number]["icon"];
export const ACHIEVEMENT_IDS: readonly AchievementId[] = ACHIEVEMENTS.map((a) => a.id);

export function isAchievementId(v: unknown): v is AchievementId {
  return typeof v === "string" && (ACHIEVEMENT_IDS as readonly string[]).includes(v);
}

/** Achievements whose condition holds for `s` and that are not in `have`. */
export function newlyUnlocked(s: AchStats, have: Iterable<string>): AchievementId[] {
  const owned = new Set(have);
  return ACHIEVEMENTS.filter((a) => !owned.has(a.id) && a.check(s)).map((a) => a.id);
}
