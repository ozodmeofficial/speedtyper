import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { dayKey } from "@/lib/format";

export interface LbRow {
  rank: number;
  userId: string;
  username: string;
  wpm: number;
  acc: number;
  raw: number;
  consistency: number;
  date: string;
}

export interface RaceLbRow {
  rank: number;
  userId: string;
  username: string;
  races: number;
  wins: number;
  avgWpm: number;
  bestWpm: number;
}

const TTL_MS = 30_000;
const LIMIT = 100;

interface CacheEntry<T> {
  at: number;
  value: T;
}
const g = globalThis as unknown as { __stLbCache?: Map<string, CacheEntry<unknown>> };
const cache = (g.__stLbCache ??= new Map());

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function invalidateBoard(board: string) {
  for (const k of cache.keys()) if (k.includes(board)) cache.delete(k);
}

interface RawRow {
  user_id: string;
  username: string;
  wpm: number;
  acc: number;
  raw: number;
  consistency: number;
  at: Date;
}

const toRows = (rows: RawRow[]): LbRow[] =>
  rows.map((r, i) => ({
    rank: i + 1,
    userId: r.user_id,
    username: r.username,
    wpm: r.wpm,
    acc: r.acc,
    raw: r.raw,
    consistency: r.consistency,
    date: r.at.toISOString(),
  }));

/** All-time: best result per user, maintained in leaderboard_bests on insert. */
export function allTime(board: string): Promise<LbRow[]> {
  return cached(`all:${board}`, async () => {
    const rows = await prisma.$queryRaw<RawRow[]>`
      SELECT b.user_id, u.username, b.wpm, b.acc, b.raw, b.consistency, b.achieved_at AS at
      FROM leaderboard_bests b JOIN users u ON u.id = b.user_id
      WHERE b.board = ${board} AND u.banned = false
      ORDER BY b.wpm DESC, b.achieved_at ASC
      LIMIT ${LIMIT}`;
    return toRows(rows);
  });
}

function boardParts(board: string) {
  const [, mode2, language] = board.split("_");
  return { mode2, language };
}

/** Daily (Asia/Tashkent day): best result per user today. */
export function daily(board: string, key = dayKey()): Promise<LbRow[]> {
  return cached(`day:${key}:${board}`, async () => {
    const { mode2, language } = boardParts(board);
    const rows = await prisma.$queryRaw<RawRow[]>`
      SELECT * FROM (
        SELECT DISTINCT ON (r.user_id) r.user_id, u.username, r.wpm, r.acc, r.raw, r.consistency, r.created_at AS at
        FROM results r JOIN users u ON u.id = r.user_id
        WHERE r.day_key = ${key} AND r.mode = 'time' AND r.mode2 = ${mode2} AND r.language = ${language}
          AND r.punctuation = false AND r.numbers = false AND r.flagged = false AND u.banned = false
        ORDER BY r.user_id, r.wpm DESC, r.created_at ASC
      ) best
      ORDER BY best.wpm DESC, best.at ASC
      LIMIT ${LIMIT}`;
    return toRows(rows);
  });
}

/** Rank of a user on a board (null when not ranked). */
export async function userRank(board: string, userId: string, type: "all" | "daily"): Promise<LbRow | null> {
  if (type === "all") {
    const me = await prisma.leaderboardBest.findUnique({ where: { board_userId: { board, userId } }, include: { user: { select: { username: true } } } });
    if (!me) return null;
    const ahead = await prisma.leaderboardBest.count({
      where: { board, user: { banned: false }, OR: [{ wpm: { gt: me.wpm } }, { wpm: me.wpm, achievedAt: { lt: me.achievedAt } }] },
    });
    return { rank: ahead + 1, userId, username: me.user.username, wpm: me.wpm, acc: me.acc, raw: me.raw, consistency: me.consistency, date: me.achievedAt.toISOString() };
  }
  const { mode2, language } = boardParts(board);
  const key = dayKey();
  const rows = await prisma.$queryRaw<(RawRow & { rank: bigint })[]>`
    WITH best AS (
      SELECT DISTINCT ON (r.user_id) r.user_id, u.username, r.wpm, r.acc, r.raw, r.consistency, r.created_at AS at
      FROM results r JOIN users u ON u.id = r.user_id
      WHERE r.day_key = ${key} AND r.mode = 'time' AND r.mode2 = ${mode2} AND r.language = ${language}
        AND r.punctuation = false AND r.numbers = false AND r.flagged = false AND u.banned = false
      ORDER BY r.user_id, r.wpm DESC, r.created_at ASC
    ), ranked AS (
      SELECT best.*, ROW_NUMBER() OVER (ORDER BY wpm DESC, at ASC) AS rank FROM best
    )
    SELECT * FROM ranked WHERE user_id = ${userId}`;
  const r = rows[0];
  if (!r) return null;
  return { rank: Number(r.rank), userId, username: r.username, wpm: r.wpm, acc: r.acc, raw: r.raw, consistency: r.consistency, date: r.at.toISOString() };
}

/** Keep the per-user best for a board (only improves). */
export async function recordBest(board: string, userId: string, resultId: string, r: { wpm: number; acc: number; raw: number; consistency: number }, at: Date) {
  const id = `lb_${resultId}`;
  const changed = await prisma.$executeRaw`
    INSERT INTO leaderboard_bests (id, board, user_id, result_id, wpm, raw, acc, consistency, achieved_at)
    VALUES (${id}, ${board}, ${userId}, ${resultId}, ${r.wpm}, ${r.raw}, ${r.acc}, ${r.consistency}, ${at})
    ON CONFLICT (board, user_id) DO UPDATE SET
      result_id = EXCLUDED.result_id, wpm = EXCLUDED.wpm, raw = EXCLUDED.raw, acc = EXCLUDED.acc,
      consistency = EXCLUDED.consistency, achieved_at = EXCLUDED.achieved_at
    WHERE leaderboard_bests.wpm < EXCLUDED.wpm`;
  if (changed > 0) invalidateBoard(board);
  invalidateBoard(`day:`);
}

/** Race leaderboard: average wpm over finished races (min 3). */
export function raceBoard(): Promise<RaceLbRow[]> {
  return cached("race:all", async () => {
    const rows = await prisma.$queryRaw<{ user_id: string; username: string; races: bigint; wins: bigint; avg: number; best: number }[]>(Prisma.sql`
      SELECT rr.user_id, u.username, COUNT(*) AS races,
             COUNT(*) FILTER (WHERE rr.place = 1 AND ra.player_count >= 2) AS wins,
             AVG(rr.wpm) AS avg, MAX(rr.wpm) AS best
      FROM race_results rr
      JOIN users u ON u.id = rr.user_id
      JOIN races ra ON ra.id = rr.race_id
      WHERE rr.finished = true AND rr.user_id IS NOT NULL AND u.banned = false
      GROUP BY rr.user_id, u.username
      HAVING COUNT(*) >= 3
      ORDER BY avg DESC
      LIMIT ${LIMIT}`);
    return rows.map((r, i) => ({
      rank: i + 1,
      userId: r.user_id,
      username: r.username,
      races: Number(r.races),
      wins: Number(r.wins),
      avgWpm: Number(r.avg),
      bestWpm: Number(r.best),
    }));
  });
}
