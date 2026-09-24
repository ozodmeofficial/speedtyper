import "server-only";
import { prisma } from "./db";

export const RESULTS_PER_PAGE = 10;

export async function getProfile(username: string) {
  const user = await prisma.user.findUnique({
    where: { usernameLower: username.toLowerCase() },
    select: {
      id: true,
      username: true,
      createdAt: true,
      testsStarted: true,
      testsCompleted: true,
      timeTyping: true,
      racesCompleted: true,
      raceWins: true,
      banned: true,
    },
  });
  if (!user || user.banned) return null;
  return user;
}

export interface PbRow {
  mode: string;
  mode2: string;
  language: string;
  wpm: number;
  acc: number;
  raw: number;
  consistency: number;
  created_at: Date;
}

export function personalBests(userId: string) {
  return prisma.$queryRaw<PbRow[]>`
    SELECT DISTINCT ON (mode, mode2, language) mode, mode2, language, wpm, acc, raw, consistency, created_at
    FROM results
    WHERE user_id = ${userId} AND flagged = false AND punctuation = false AND numbers = false AND mode IN ('time', 'words')
    ORDER BY mode, mode2, language, wpm DESC, created_at ASC`;
}

export function recentResults(userId: string, page: number) {
  return prisma.result.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * RESULTS_PER_PAGE,
    take: RESULTS_PER_PAGE + 1,
    select: {
      id: true,
      mode: true,
      mode2: true,
      language: true,
      punctuation: true,
      numbers: true,
      wpm: true,
      raw: true,
      acc: true,
      consistency: true,
      charCorrect: true,
      charIncorrect: true,
      charExtra: true,
      charMissed: true,
      isPb: true,
      createdAt: true,
    },
  });
}

export async function activity(userId: string): Promise<Map<number, number>> {
  const since = new Date(Date.now() - 372 * 86400_000);
  const rows = await prisma.$queryRaw<{ day_key: number; n: bigint }[]>`
    SELECT day_key, COUNT(*) AS n FROM results WHERE user_id = ${userId} AND created_at >= ${since} GROUP BY day_key`;
  return new Map(rows.map((r) => [r.day_key, Number(r.n)]));
}

export async function wpmHistory(userId: string) {
  const rows = await prisma.result.findMany({
    where: { userId, flagged: false },
    orderBy: { createdAt: "desc" },
    take: 150,
    select: { wpm: true, acc: true, createdAt: true },
  });
  return rows.reverse();
}

export function recentRaces(userId: string) {
  return prisma.raceResult.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, place: true, wpm: true, acc: true, finished: true, createdAt: true, race: { select: { playerCount: true, language: true, textType: true } } },
  });
}
