import type { NextRequest } from "next/server";
import { clearSessionCookie, csrfError, csrfOk, json } from "@/server/auth/next";
import { destroySession, SESSION_COOKIE } from "@/server/auth/session";

export async function POST(req: NextRequest) {
  if (!csrfOk(req)) return csrfError();
  await destroySession(req.cookies.get(SESSION_COOKIE)?.value).catch(() => undefined);
  const res = json({ ok: true });
  clearSessionCookie(res);
  return res;
}
