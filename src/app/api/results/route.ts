import type { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { csrfError, csrfOk, json, routeSession, withSession } from "@/server/auth/next";
import { boardFor, validateResult } from "@/lib/anticheat";
import { limiter } from "@/server/ratelimit";
import { readJson } from "@/server/body";
import { recordBest } from "@/server/leaderboard";
import { dayKey, dayKeyToUtcMidnight } from "@/lib/format";
import { awardTestXp } from "@/server/xp";

export async function POST(req: NextRequest) {
  if (!csrfOk(req)) return csrfError();
  const s = await routeSession(req);
  if (!s) return json({ error: "unauthorized" }, 401);
  const wait = limiter("results-user", 12, 60_000).hit(s.user.id);
  if (wait) return withSession(json({ error: "rate", retryAfter: wait }, 429, { "retry-after": String(wait) }), s);

  const check = validateResult(await readJson(req, 96 * 1024));
  if (!check.ok) return withSession(json({ error: check.reason }, 422), s);
  const r = check.value;
  const userId = s.user.id;

  const prevBest = await prisma.result.findFirst({
    where: { userId, mode: r.mode, mode2: r.mode2, language: r.language, punctuation: r.punctuation, numbers: r.numbers, flagged: false },
    orderBy: { wpm: "desc" },
    select: { wpm: true },
  });
  const isPb = !check.flagged && (!prevBest || r.wpm > prevBest.wpm);
  const now = new Date();

  const [saved] = await prisma.$transaction([
    prisma.result.create({
      data: {
        userId,
        mode: r.mode,
        mode2: r.mode2,
        language: r.language,
        punctuation: r.punctuation,
        numbers: r.numbers,
        wpm: r.wpm,
        raw: r.raw,
        acc: r.acc,
        consistency: r.consistency,
        charCorrect: r.chars.correct + r.chars.correctSpaces,
        charIncorrect: r.chars.incorrect,
        charExtra: r.chars.extra,
        charMissed: r.chars.missed,
        duration: r.duration,
        wpmHistory: r.wpmHistory,
        rawHistory: r.rawHistory,
        errorHistory: r.errorHistory,
        isPb,
        flagged: check.flagged,
        flagReason: check.flagReason,
        dayKey: dayKey(now),
        createdAt: now,
      },
      select: { id: true },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        testsStarted: { increment: 1 + r.restarts },
        testsCompleted: { increment: 1 },
        timeTyping: { increment: r.duration + r.incompleteTime },
      },
    }),
  ]);

  const board = boardFor(r);
  if (board && !check.flagged) await recordBest(board, userId, saved.id, r, now);
  let xp = null;
  if (!check.flagged) {
    try {
      xp = await awardTestXp(userId, { id: saved.id, duration: r.duration, wpm: r.wpm, acc: r.acc, mode: r.mode, mode2: r.mode2 }, now);
    } catch (err) {
      console.error("[xp] test award failed", err);
    }
  }
  const todayTests = await prisma.result.count({ where: { userId, createdAt: { gte: new Date(dayKeyToUtcMidnight(dayKey(now))) } } });
  return withSession(json({ ok: true, id: saved.id, isPb, flagged: check.flagged, xp, todayTests }), s);
}
