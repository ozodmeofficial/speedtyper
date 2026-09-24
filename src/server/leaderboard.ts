import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { dayKey } from "@/lib/format";

export interface LbRow {
  rank: number;
  userId: string;
  username: string;
  level: number;
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
  level: number;
  races: number;
  wins: number;
  avgWpm: number;
  bestWpm: number;
}

const TTL_MS = 30_000;
const LIMIT = 100;
export const PAGE_SIZE = 50;
export const MAX_PAGE = 20;
const clampPage = (p: number) => Math.max(1, Math.min(MAX_PAGE, Math.floor(p) || 1));

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
  level: number;
  wpm: number;
  acc: number;
  raw: number;
  consistency: number;
  at: Date;
}

const toRows = (rows: RawRow[], offset = 0): LbRow[] =>
  rows.map((r, i) => ({
    rank: offset + i + 1,
    userId: r.user_id,
    username: r.username,
    level: r.level,
    wpm: r.wpm,
    acc: r.acc,
    raw: r.raw,
    consistency: r.consistency,
    date: r.at.toISOString(),
  }));

export interface Paged<T> {
  rows: T[];
  page: number;
  hasNext: boolean;
}

function paged<T>(rows: T[], page: number): Paged<T> {
  return { rows: rows.slice(0, PAGE_SIZE), page, hasNext: rows.length > PAGE_SIZE && page < MAX_PAGE };
}

/** All-time: best result per user, maintained in leaderboard_bests on insert. */
export function allTime(board: string, pageIn = 1): Promise<Paged<LbRow>> {
  const page = clampPage(pageIn);
  const offset = (page - 1) * PAGE_SIZE;
  return cached(`all:${board}:${page}`, async () => {
    const rows = await prisma.$queryRaw<RawRow[]>`
      SELECT b.user_id, u.username, u.level, b.wpm, b.acc, b.raw, b.consistency, b.achieved_at AS at
      FROM leaderboard_bests b JOIN users u ON u.id = b.user_id
      WHERE b.board = ${board} AND u.banned = false
      ORDER BY b.wpm DESC, b.achieved_at ASC
      LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}`;
    return paged(toRows(rows, offset), page);
  });
}

function boardParts(board: string) {
  const [, mode2, language] = board.split("_");
  return { mode2, language };
}

/** Daily (Asia/Tashkent day): best result per user today. */
export function daily(board: string, pageIn = 1, key = dayKey()): Promise<Paged<LbRow>> {
  const page = clampPage(pageIn);
  const offset = (page - 1) * PAGE_SIZE;
  return cached(`day:${key}:${board}:${page}`, async () => {
    const { mode2, language } = boardParts(board);
    const rows = await prisma.$queryRaw<RawRow[]>`
      SELECT * FROM (
        SELECT DISTINCT ON (r.user_id) r.user_id, u.username, u.level, r.wpm, r.acc, r.raw, r.consistency, r.created_at AS at
        FROM results r JOIN users u ON u.id = r.user_id
        WHERE r.day_key = ${key} AND r.mode = 'time' AND r.mode2 = ${mode2} AND r.language = ${language}
          AND r.punctuation = false AND r.numbers = false AND r.flagged = false AND u.banned = false
        ORDER BY r.user_id, r.wpm DESC, r.created_at ASC
      ) best
      ORDER BY best.wpm DESC, best.at ASC
      LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}`;
    return paged(toRows(rows, offset), page);
  });
}

/** Rank of a user on a board (null when not ranked). */
export async function userRank(board: string, userId: string, type: "all" | "daily"): Promise<LbRow | null> {
  if (type === "all") {
    const me = await prisma.leaderboardBest.findUnique({ where: { board_userId: { board, userId } }, include: { user: { select: { username: true, level: true } } } });
    if (!me) return null;
    const ahead = await prisma.leaderboardBest.count({
      where: { board, user: { banned: false }, OR: [{ wpm: { gt: me.wpm } }, { wpm: me.wpm, achievedAt: { lt: me.achievedAt } }] },
    });
    return { rank: ahead + 1, userId, username: me.user.username, level: me.user.level, wpm: me.wpm, acc: me.acc, raw: me.raw, consistency: me.consistency, date: me.achievedAt.toISOString() };
  }
  const { mode2, language } = boardParts(board);
  const key = dayKey();
  const rows = await prisma.$queryRaw<(RawRow & { rank: bigint })[]>`
    WITH best AS (
      SELECT DISTINCT ON (r.user_id) r.user_id, u.username, u.level, r.wpm, r.acc, r.raw, r.consistency, r.created_at AS at
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
  return { rank: Number(r.rank), userId, username: r.username, level: r.level, wpm: r.wpm, acc: r.acc, raw: r.raw, consistency: r.consistency, date: r.at.toISOString() };
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
    const rows = await prisma.$queryRaw<{ user_id: string; username: string; level: number; races: bigint; wins: bigint; avg: number; best: number }[]>(Prisma.sql`
      SELECT rr.user_id, u.username, u.level, COUNT(*) AS races,
             COUNT(*) FILTER (WHERE rr.place = 1 AND ra.player_count >= 2) AS wins,
             AVG(rr.wpm) AS avg, MAX(rr.wpm) AS best
      FROM race_results rr
      JOIN users u ON u.id = rr.user_id
      JOIN races ra ON ra.id = rr.race_id
      WHERE rr.finished = true AND rr.user_id IS NOT NULL AND u.banned = false
      GROUP BY rr.user_id, u.username, u.level
      HAVING COUNT(*) >= 3
      ORDER BY avg DESC
      LIMIT ${LIMIT}`);
    return rows.map((r, i) => ({
      rank: i + 1,
      userId: r.user_id,
      username: r.username,
      level: r.level,
      races: Number(r.races),
      wins: Number(r.wins),
      avgWpm: Number(r.avg),
      bestWpm: Number(r.best),
    }));
  });
}

// ── XP boards ────────────────────────────────────────────────────────────
// Cache keys start with "xp:" so server/xp.ts can invalidate them after grants.

export interface XpLbRow {
  rank: number;
  userId: string;
  username: string;
  level: number;
  xp: number;
  tests: number;
}

/** Overall: all-time XP (users.xp, indexed). */
export function overall(pageIn = 1): Promise<Paged<XpLbRow>> {
  const page = clampPage(pageIn);
  const offset = (page - 1) * PAGE_SIZE;
  return cached(`xp:all:${page}`, async () => {
    const rows = await prisma.$queryRaw<{ id: string; username: string; level: number; xp: number; tests_completed: number }[]>`
      SELECT id, username, level, xp, tests_completed FROM users
      WHERE banned = false AND xp > 0
      ORDER BY xp DESC, created_at ASC, id ASC
      LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}`;
    return paged(
      rows.map((r, i) => ({ rank: offset + i + 1, userId: r.id, username: r.username, level: r.level, xp: r.xp, tests: r.tests_completed })),
      page,
    );
  });
}

export async function overallRank(userId: string): Promise<XpLbRow | null> {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { username: true, level: true, xp: true, testsCompleted: true, createdAt: true, banned: true } });
  if (!me || me.banned || me.xp <= 0) return null;
  const ahead = await prisma.user.count({
    where: { banned: false, OR: [{ xp: { gt: me.xp } }, { xp: me.xp, createdAt: { lt: me.createdAt } }] },
  });
  return { rank: ahead + 1, userId, username: me.username, level: me.level, xp: me.xp, tests: me.testsCompleted };
}

const WEEK_CAP = 5000;

/** XP earned in the last 7 days, whole ranking cached briefly (one aggregate per TTL). */
function weeklyAll(): Promise<XpLbRow[]> {
  return cached("xp:week", async () => {
    const since = new Date(Date.now() - 7 * 86400_000);
    const rows = await prisma.$queryRaw<{ user_id: string; username: string; level: number; xp: bigint; tests: bigint }[]>`
      SELECT e.user_id, u.username, u.level, SUM(e.amount) AS xp, COUNT(*) FILTER (WHERE e.source = 'test') AS tests
      FROM xp_events e JOIN users u ON u.id = e.user_id
      WHERE e.created_at >= ${since} AND u.banned = false
      GROUP BY e.user_id, u.username, u.level
      ORDER BY xp DESC, MIN(e.created_at) ASC
      LIMIT ${WEEK_CAP}`;
    return rows.map((r, i) => ({ rank: i + 1, userId: r.user_id, username: r.username, level: r.level, xp: Number(r.xp), tests: Number(r.tests) }));
  });
}

export async function weekly(pageIn = 1): Promise<Paged<XpLbRow>> {
  const page = clampPage(pageIn);
  const all = await weeklyAll();
  const offset = (page - 1) * PAGE_SIZE;
  return paged(all.slice(offset, offset + PAGE_SIZE + 1), page);
}

export async function weeklyRank(userId: string): Promise<XpLbRow | null> {
  return (await weeklyAll()).find((r) => r.userId === userId) ?? null;
}
