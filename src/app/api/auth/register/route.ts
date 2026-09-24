import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { csrfError, csrfOk, json, reqIp, setSessionCookie } from "@/server/auth/next";
import { createSession } from "@/server/auth/session";
import { EMAIL_RE, hashPassword, USERNAME_RE, validatePassword } from "@/server/auth/password";
import { limiter } from "@/server/ratelimit";
import { readJson } from "@/server/body";

export async function POST(req: NextRequest) {
  if (!csrfOk(req)) return csrfError();
  const ip = reqIp(req);
  const wait = limiter("register-ip", 10, 60 * 60_000).hit(ip);
  if (wait) return json({ error: "rate", retryAfter: wait }, 429, { "retry-after": String(wait) });

  const body = (await readJson(req)) as { username?: unknown; email?: unknown; password?: unknown } | undefined;
  if (!body) return json({ error: "invalid" }, 400);
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const emailRaw = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!USERNAME_RE.test(username)) return json({ error: "username" }, 400);
  if (emailRaw && (!EMAIL_RE.test(emailRaw) || emailRaw.length > 254)) return json({ error: "email" }, 400);
  if (!validatePassword(body.password)) return json({ error: "password" }, 400);

  const usernameLower = username.toLowerCase();
  const exists = await prisma.user.findUnique({ where: { usernameLower }, select: { id: true } });
  if (exists) return json({ error: "taken" }, 409);
  if (emailRaw) {
    const e = await prisma.user.findUnique({ where: { email: emailRaw }, select: { id: true } });
    if (e) return json({ error: "emailTaken" }, 409);
  }
  try {
    const user = await prisma.user.create({
      data: { username, usernameLower, email: emailRaw || null, passwordHash: await hashPassword(body.password) },
      select: { id: true, username: true },
    });
    const token = await createSession(user.id, req.headers.get("user-agent"), ip);
    const res = json({ ok: true, user });
    setSessionCookie(res, token);
    return res;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return json({ error: "taken" }, 409);
    console.error("[register]", e);
    return json({ error: "generic" }, 500);
  }
}
