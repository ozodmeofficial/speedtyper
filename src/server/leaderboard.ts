import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { periodDayRange, periodKey, periodStart, type Metric, type Period } from "@/lib/periods";

export interface LbRow {
  rank: number;
  userId: string;
  username: string;
  level: number;
  wpm: number;
  /** correct characters per minute */
  cpm: number;
  acc: number;
  raw: number;
  consistency: number;
  /** qualifying tests in the period */
  tests: number;
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
/** a full ranking is cached per board; pages and "your rank" are slices of it */
const RANK_CAP = 5000;
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

/** Drop cached speed boards for a (mode2, language) after a qualifying result was saved. */
export function invalidateSpeed(mode2: string, language: string) {
  const tag = `:${mode2}:${language}:`;
  for (const k of cache.keys()) if (k.startsWith("spd:") && k.includes(tag)) cache.delete(k);
}

export interface Paged<T> {
  rows: T[];
  page: number;
  hasNext: boolean;
}

function paged<T>(rows: T[], page: number): Paged<T> {
  return { rows: rows.slice(0, PAGE_SIZE), page, hasNext: rows.length > PAGE_SIZE && page < MAX_PAGE };
}

function slice<T>(all: T[], pageIn: number): Paged<T> {
  const page = clampPage(pageIn);
  const offset = (page - 1) * PAGE_SIZE;
  return paged(all.slice(offset, offset + PAGE_SIZE + 1), page);
}

export interface SpeedBoard {
  /** test duration in seconds ("15" | "30" | "60" | "120") */
  time: string;
  language: string;
  period: Period;
  metric: Metric;
}

interface SpeedRaw {
  user_id: string;
  username: string;
  level: number;
  wpm: number;
  cpm: number;
  acc: number;
  raw: number;
  consistency: number;
  tests: bigint;
  at: Date;
}

/**
 * Best qualifying result per user (time mode, no punctuation/numbers, not flagged)
 * within the period, ranked by WPM or CPM. Ties go to whoever got there first.
 */
function speedAll(b: SpeedBoard): Promise<LbRow[]> {
  const range = periodDayRange(b.period) ?? { from: 0, to: 99999999 };
  // identifiers can't be bound parameters: the metric is whitelisted by its type
  const order = Prisma.raw(b.metric === "cpm" ? "cpm" : "wpm");
  return cached(`spd:${periodKey(b.period)}:${b.metric}:${b.time}:${b.language}:`, async () => {
    const rows = await prisma.$queryRaw<SpeedRaw[]>`
      WITH q AS (
        SELECT r.user_id, r.wpm, r.raw, r.acc, r.consistency, r.created_at AS at,
               CASE WHEN r.duration > 0 THEN r.char_correct * 60.0 / r.duration ELSE 0 END AS cpm
        FROM results r
        WHERE r.mode = 'time' AND r.mode2 = ${b.time} AND r.language = ${b.language}
          AND r.punctuation = false AND r.numbers = false AND r.flagged = false
          AND r.day_key BETWEEN ${range.from} AND ${range.to}
      ), best AS (
        SELECT DISTINCT ON (q.user_id) q.*, COUNT(*) OVER (PARTITION BY q.user_id) AS tests
        FROM q
        ORDER BY q.user_id, q.${order} DESC, q.at ASC
      )
      SELECT best.*, u.username, u.level
      FROM best JOIN users u ON u.id = best.user_id
      WHERE u.banned = false
      ORDER BY best.${order} DESC, best.at ASC
      LIMIT ${RANK_CAP}`;
    return rows.map((r, i) => ({
      rank: i + 1,
      userId: r.user_id,
      username: r.username,
      level: r.level,
      wpm: Number(r.wpm),
      cpm: Number(r.cpm),
      acc: Number(r.acc),
      raw: Number(r.raw),
      consistency: Number(r.consistency),
      tests: Number(r.tests),
      date: r.at.toISOString(),
    }));
  });
}

export async function speed(b: SpeedBoard, page = 1): Promise<Paged<LbRow>> {
  return slice(await speedAll(b), page);
}

export async function speedRank(b: SpeedBoard, userId: string): Promise<LbRow | null> {
  return (await speedAll(b)).find((r) => r.userId === userId) ?? null;
}

/** Race leaderboard: average wpm over finished races in the period (min 3). */
export function raceBoard(period: Period = "all"): Promise<RaceLbRow[]> {
  const since = periodStart(period) ?? new Date(0);
  return cached(`race:${periodKey(period)}`, async () => {
    const rows = await prisma.$queryRaw<{ user_id: string; username: string; level: number; races: bigint; wins: bigint; avg: number; best: number }[]>(Prisma.sql`
      SELECT rr.user_id, u.username, u.level, COUNT(*) AS races,
             COUNT(*) FILTER (WHERE rr.place = 1 AND ra.player_count >= 2) AS wins,
             AVG(rr.wpm) AS avg, MAX(rr.wpm) AS best
      FROM race_results rr
      JOIN users u ON u.id = rr.user_id
      JOIN races ra ON ra.id = rr.race_id
      WHERE rr.finished = true AND rr.user_id IS NOT NULL AND u.banned = false AND ra.finished_at >= ${since}
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
