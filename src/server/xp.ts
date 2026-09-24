/**
 * XP / level / streak / achievement bookkeeping.
 *
 * Imported by Next route handlers AND by the custom race server bundle, so it
 * uses relative imports only and no "server-only".
 */
import { prisma } from "./db";
import { dayKey, dayKeyToUtcMidnight } from "../lib/format";
import { effectiveStreak, levelForXp, nextStreak, raceXp, testXp, type RaceXpInput, type UserProgress, type XpAward } from "../lib/xp";
import { newlyUnlocked, type AchStats } from "../lib/achievements";

export type { XpAward };

interface LockedUser {
  xp: number;
  level: number;
  streak_current: number;
  streak_best: number;
  last_active_day: number | null;
  tests_completed: number;
  time_typing: number;
  races_completed: number;
  race_wins: number;
}

/** Drop cached XP leaderboards (shared process-wide cache, see server/leaderboard.ts). */
export function invalidateXpBoards() {
  const g = globalThis as unknown as { __stLbCache?: Map<string, unknown> };
  const cache = g.__stLbCache;
  if (!cache) return;
  for (const k of cache.keys()) if (k.startsWith("xp:")) cache.delete(k);
}

async function grant(
  userId: string,
  amount: number,
  source: "test" | "race",
  refId: string | null,
  achExtra: (u: LockedUser) => Partial<AchStats>,
  now = new Date(),
): Promise<XpAward | null> {
  const today = dayKey(now);
  const award = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<LockedUser[]>`
      SELECT xp, level, streak_current, streak_best, last_active_day, tests_completed, time_typing, races_completed, race_wins
      FROM users WHERE id = ${userId} FOR UPDATE`;
    const u = rows[0];
    if (!u) return null;
    const streak = nextStreak({ current: u.streak_current, best: u.streak_best, lastDay: u.last_active_day }, today);
    const xp = u.xp + amount;
    const level = Math.max(u.level, levelForXp(xp));
    await tx.user.update({
      where: { id: userId },
      data: { xp, level, streakCurrent: streak.current, streakBest: streak.best, lastActiveDay: streak.lastDay },
    });
    if (amount > 0) {
      await tx.xpEvent.create({ data: { userId, amount, source, refId: refId?.slice(0, 40) ?? null, createdAt: now } });
    }
    const have = await tx.userAchievement.findMany({ where: { userId }, select: { key: true } });
    const stats: AchStats = {
      testsCompleted: u.tests_completed,
      bestWpm: 0,
      perfect60: false,
      streakBest: streak.best,
      racesFinished: u.races_completed,
      raceWins: u.race_wins,
      level,
      timeTyping: u.time_typing,
      ...achExtra(u),
    };
    const unlocked = newlyUnlocked(
      stats,
      have.map((h) => h.key),
    );
    if (unlocked.length) {
      await tx.userAchievement.createMany({ data: unlocked.map((key) => ({ userId, key, unlockedAt: now })), skipDuplicates: true });
    }
    return {
      gained: amount,
      xp,
      prevXp: u.xp,
      level,
      prevLevel: u.level,
      streak: streak.current,
      streakBest: streak.best,
      achievements: unlocked,
    } satisfies XpAward;
  });
  if (award && award.gained > 0) invalidateXpBoards();
  return award;
}

/** XP for a saved, non-flagged typing test (call after the result row and counters are written). */
export function awardTestXp(
  userId: string,
  r: { id: string; duration: number; wpm: number; acc: number; mode: string; mode2: string },
  now = new Date(),
): Promise<XpAward | null> {
  const amount = testXp(r);
  return grant(
    userId,
    amount,
    "test",
    r.id,
    () => ({
      bestWpm: r.duration >= 15 ? r.wpm : 0,
      perfect60: r.mode === "time" && r.mode2 === "60" && r.acc >= 100,
    }),
    now,
  );
}

/**
 * XP for a finished race (for the race server's finish handler). Call it once
 * per signed-in player after the race and the user's race counters are saved,
 * so race achievements see the updated win count. Never throws.
 */
export async function awardRaceXp(
  userId: string,
  r: RaceXpInput,
  refId: string | null = null,
): Promise<XpAward | null> {
  try {
    const amount = raceXp(r);
    if (amount <= 0) return null;
    return await grant(userId, amount, "race", refId, () => ({}));
  } catch (err) {
    console.error("[xp] race award failed", err);
    return null;
  }
}

export async function getProgress(userId: string, now = Date.now()): Promise<UserProgress | null> {
  const today = dayKey(now);
  const since = new Date(dayKeyToUtcMidnight(today));
  const [u, todayTests] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { xp: true, level: true, streakCurrent: true, streakBest: true, lastActiveDay: true } }),
    prisma.result.count({ where: { userId, createdAt: { gte: since } } }),
  ]);
  if (!u) return null;
  const st = { current: u.streakCurrent, best: u.streakBest, lastDay: u.lastActiveDay };
  return {
    xp: u.xp,
    level: u.level,
    streak: effectiveStreak(st, today),
    streakToday: u.lastActiveDay === today,
    streakBest: u.streakBest,
    today,
    todayTests,
  };
}

/** Recompute achievements from lifetime data (older results, race history). Returns all unlocked keys with dates. */
export async function syncAchievements(userId: string): Promise<{ key: string; unlockedAt: Date }[]> {
  const rows = await prisma.$queryRaw<
    {
      tests_completed: number;
      time_typing: number;
      races_completed: number;
      race_wins: number;
      level: number;
      streak_best: number;
      best: number | null;
      p60: boolean;
      rf: bigint;
      rw: bigint;
    }[]
  >`
    SELECT u.tests_completed, u.time_typing, u.races_completed, u.race_wins, u.level, u.streak_best,
      (SELECT MAX(r.wpm) FROM results r WHERE r.user_id = u.id AND r.flagged = false AND r.duration >= 15) AS best,
      EXISTS (SELECT 1 FROM results r WHERE r.user_id = u.id AND r.flagged = false AND r.mode = 'time' AND r.mode2 = '60' AND r.acc >= 100) AS p60,
      (SELECT COUNT(*) FROM race_results rr WHERE rr.user_id = u.id AND rr.finished = true) AS rf,
      (SELECT COUNT(*) FROM race_results rr JOIN races ra ON ra.id = rr.race_id
        WHERE rr.user_id = u.id AND rr.place = 1 AND ra.player_count >= 2) AS rw
    FROM users u WHERE u.id = ${userId}`;
  const u = rows[0];
  const have = await prisma.userAchievement.findMany({ where: { userId }, select: { key: true, unlockedAt: true }, orderBy: { unlockedAt: "asc" } });
  if (!u) return have;
  const unlocked = newlyUnlocked(
    {
      testsCompleted: u.tests_completed,
      bestWpm: u.best ?? 0,
      perfect60: u.p60,
      streakBest: u.streak_best,
      racesFinished: Math.max(u.races_completed, Number(u.rf)),
      raceWins: Math.max(u.race_wins, Number(u.rw)),
      level: u.level,
      timeTyping: u.time_typing,
    },
    have.map((h) => h.key),
  );
  if (!unlocked.length) return have;
  const now = new Date();
  await prisma.userAchievement.createMany({ data: unlocked.map((key) => ({ userId, key, unlockedAt: now })), skipDuplicates: true });
  return [...have, ...unlocked.map((key) => ({ key, unlockedAt: now }))];
}
