import type { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { csrfError, csrfOk, json, reqIp, setSessionCookie } from "@/server/auth/next";
import { createSession } from "@/server/auth/session";
import { dummyHash, verifyPassword } from "@/server/auth/password";
import { limiter } from "@/server/ratelimit";
import { readJson } from "@/server/body";

const perAccount = () => limiter("login-account", 5, 15 * 60_000);
const perIp = () => limiter("login-ip", 30, 15 * 60_000);

export async function POST(req: NextRequest) {
  if (!csrfOk(req)) return csrfError();
  const ip = reqIp(req);
  const body = (await readJson(req, 4096)) as { username?: unknown; password?: unknown } | undefined;
  const username = typeof body?.username === "string" ? body.username.trim().toLowerCase().slice(0, 254) : "";
  const password = typeof body?.password === "string" ? body.password.slice(0, 128) : "";
  if (!username || !password) return json({ error: "invalid" }, 400);

  const accKey = `${ip}|${username}`;
  const blocked = perAccount().blocked(accKey) || perIp().blocked(ip);
  if (blocked) return json({ error: "rate", retryAfter: blocked }, 429, { "retry-after": String(blocked) });

  const user = await prisma.user.findFirst({
    where: username.includes("@") ? { email: username } : { usernameLower: username },
    select: { id: true, username: true, passwordHash: true, banned: true },
  });
  const ok = user ? await verifyPassword(user.passwordHash, password) : (await verifyPassword(await dummyHash(), password), false);
  if (!user || !ok || user.banned) {
    perAccount().hit(accKey);
    perIp().hit(ip);
    return json({ error: "invalid" }, 401);
  }
  perAccount().reset(accKey);
  // occasional cleanup of expired sessions
  if (Math.random() < 0.05) void prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => undefined);
  const token = await createSession(user.id, req.headers.get("user-agent"), ip);
  const res = json({ ok: true, user: { id: user.id, username: user.username } });
  setSessionCookie(res, token);
  return res;
}
