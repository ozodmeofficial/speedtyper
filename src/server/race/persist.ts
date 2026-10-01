import { prisma } from "../db";
import { awardRaceXp, type XpAward } from "../xp";
import type { RaceSummary } from "./room";

/**
 * Persist a finished race (only when at least one signed-in player took part),
 * then award race XP to every signed-in finisher. Returns the awards by user id.
 */
export async function saveRace(s: RaceSummary): Promise<Map<string, XpAward>> {
  const awards = new Map<string, XpAward>();
  const users = s.players.filter((p) => p.userId);
  if (users.length === 0) return awards;
  const race = await prisma.race.create({
    data: {
      code: s.code,
      language: s.lang,
      textType: s.tt,
      textLength: s.textLength,
      isPublic: s.pub,
      playerCount: s.players.length,
      startedAt: new Date(s.startedAt),
      finishedAt: new Date(s.finishedAt),
    },
  });
  await prisma.raceResult.createMany({
    data: s.players.map((p) => ({
      raceId: race.id,
      userId: p.userId,
      nickname: p.name.slice(0, 24),
      place: p.finished ? p.place : null,
      wpm: p.wpm,
      acc: p.acc,
      finished: p.finished,
      duration: p.duration,
    })),
  });
  const multi = s.players.length >= 2;
  await prisma.$transaction(
    users.map((p) =>
      prisma.user.update({
        where: { id: p.userId! },
        data: {
          racesCompleted: { increment: p.finished ? 1 : 0 },
          raceWins: { increment: multi && p.place === 1 ? 1 : 0 },
        },
      }),
    ),
  );
  // XP after the race counters are written (the "race wins" achievement reads them).
  // Sequential on purpose: up to 200 players, don't flood the connection pool.
  for (const p of users) {
    if (!p.finished || p.duration === null) continue;
    const award = await awardRaceXp(
      p.userId!,
      { place: p.place, players: s.players.length, wpm: p.wpm, acc: p.acc, durationMs: p.duration * 1000 },
      race.id,
    );
    if (award) awards.set(p.userId!, award);
  }
  // drop cached race leaderboards (process-wide cache, see server/leaderboard.ts)
  const cache = (globalThis as unknown as { __stLbCache?: Map<string, unknown> }).__stLbCache;
  if (cache) for (const k of cache.keys()) if (k.startsWith("race:")) cache.delete(k);
  return awards;
}
