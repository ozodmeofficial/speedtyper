import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "../db";

export const SESSION_COOKIE = "st_sid";
export const CSRF_COOKIE = "st_csrf";
export const CSRF_HEADER = "x-csrf-token";
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const TOUCH_MS = 60 * 60 * 1000;
export const ROTATE_MS = 24 * 3600 * 1000;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set (>= 32 chars)");
    return "dev-only-insecure-session-secret-000000000";
  }
  return s;
}

/** Session ids stored in the DB are HMACs of the cookie token. */
export function sessionId(token: string): string {
  return createHmac("sha256", secret()).update(token).digest("hex");
}

export const newToken = () => randomBytes(32).toString("base64url");

export function cookieSecure(): boolean {
  return (process.env.APP_URL ?? "").startsWith("https://");
}

export interface SessionUser {
  id: string;
  username: string;
  email: string | null;
  createdAt: Date;
}

export async function createSession(userId: string, userAgent: string | null, ip: string | null): Promise<string> {
  const token = newToken();
  const now = new Date();
  await prisma.session.create({
    data: {
      id: sessionId(token),
      userId,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      userAgent: userAgent?.slice(0, 300) ?? null,
      ip: ip?.slice(0, 64) ?? null,
    },
  });
  return token;
}

export interface ResolvedSession {
  user: SessionUser;
  sessionId: string;
  /** set when the token was rotated; the caller must write the new cookie */
  newToken?: string;
}

/**
 * Resolve a session token. Extends the sliding expiry at most once an hour and,
 * when `rotate` is set, re-keys sessions older than a day.
 */
export async function resolveSession(token: string | undefined | null, rotate = false): Promise<ResolvedSession | null> {
  if (!token || token.length > 100) return null;
  const id = sessionId(token);
  const s = await prisma.session.findUnique({
    where: { id },
    include: { user: { select: { id: true, username: true, email: true, createdAt: true, banned: true } } },
  });
  if (!s || s.user.banned) return null;
  const now = Date.now();
  if (s.expiresAt.getTime() <= now) {
    await prisma.session.delete({ where: { id } }).catch(() => undefined);
    return null;
  }
  const user: SessionUser = { id: s.user.id, username: s.user.username, email: s.user.email, createdAt: s.user.createdAt };
  if (rotate && now - s.rotatedAt.getTime() > ROTATE_MS) {
    const fresh = newToken();
    const freshId = sessionId(fresh);
    await prisma.session.update({
      where: { id },
      data: { id: freshId, rotatedAt: new Date(now), lastSeenAt: new Date(now), expiresAt: new Date(now + SESSION_TTL_MS) },
    });
    return { user, sessionId: freshId, newToken: fresh };
  }
  if (now - s.lastSeenAt.getTime() > TOUCH_MS) {
    await prisma.session
      .update({ where: { id }, data: { lastSeenAt: new Date(now), expiresAt: new Date(now + SESSION_TTL_MS) } })
      .catch(() => undefined);
  }
  return { user, sessionId: id };
}

export async function destroySession(token: string | undefined | null) {
  if (!token) return;
  await prisma.session.deleteMany({ where: { id: sessionId(token) } });
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Parse a Cookie header (used by the websocket upgrade). */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k || k in out) continue;
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[k] = part.slice(i + 1).trim();
    }
  }
  return out;
}
