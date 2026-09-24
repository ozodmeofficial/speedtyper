import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  cookieSecure,
  resolveSession,
  safeEqual,
  type ResolvedSession,
} from "./session";
import { CLIENT_IP_HEADER } from "../ip";

/** Current user for server components (no rotation: RSC cannot set cookies). */
export const getCurrentUser = cache(async () => {
  const jar = await cookies();
  const s = await resolveSession(jar.get(SESSION_COOKIE)?.value, false).catch(() => null);
  return s?.user ?? null;
});

export function reqIp(req: NextRequest): string {
  return req.headers.get(CLIENT_IP_HEADER) ?? "unknown";
}

export async function routeSession(req: NextRequest, rotate = true): Promise<ResolvedSession | null> {
  return resolveSession(req.cookies.get(SESSION_COOKIE)?.value, rotate).catch(() => null);
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: cookieSecure(), sameSite: "lax", path: "/", maxAge: 0 });
}

/** Apply a rotated session token, if any. */
export function withSession<T extends NextResponse>(res: T, s: ResolvedSession | null): T {
  if (s?.newToken) setSessionCookie(res, s.newToken);
  return res;
}

function expectedHost(req: NextRequest): string | null {
  const app = process.env.APP_URL;
  if (app) {
    try {
      return new URL(app).host;
    } catch {
      /* fall through */
    }
  }
  return req.headers.get("host");
}

/**
 * CSRF protection for mutations: double-submit token (cookie + header) and,
 * when the browser sends one, an Origin that matches our host.
 */
export function csrfOk(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (origin) {
    let host: string;
    try {
      host = new URL(origin).host;
    } catch {
      return false;
    }
    const allowed = new Set([expectedHost(req), req.headers.get("host")].filter(Boolean) as string[]);
    if (!allowed.has(host)) return false;
  }
  const cookie = req.cookies.get(CSRF_COOKIE)?.value;
  const header = req.headers.get(CSRF_HEADER);
  return !!cookie && !!header && cookie.length >= 16 && safeEqual(cookie, header);
}

export function json(data: unknown, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store", ...headers } });
}

export const csrfError = () => json({ error: "csrf" }, 403);
