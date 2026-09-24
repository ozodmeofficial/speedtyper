import { prisma } from "../db";
import type { RaceSummary } from "./room";

/** Persist a finished race (only when at least one signed-in player took part). */
export async function saveRace(s: RaceSummary): Promise<void> {
  const users = s.players.filter((p) => p.userId);
  if (users.length === 0) return;
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
}
