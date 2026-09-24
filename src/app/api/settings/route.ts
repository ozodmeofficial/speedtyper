import type { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { csrfError, csrfOk, json, routeSession, withSession } from "@/server/auth/next";
import { sanitizeSettings } from "@/lib/settings";
import { readJson } from "@/server/body";

export async function PUT(req: NextRequest) {
  if (!csrfOk(req)) return csrfError();
  const s = await routeSession(req);
  if (!s) return json({ error: "unauthorized" }, 401);
  const body = (await readJson(req, 16 * 1024)) as { settings?: unknown; at?: unknown } | undefined;
  if (!body || typeof body.settings !== "object") return json({ error: "invalid" }, 400);
  const at = typeof body.at === "number" && Number.isFinite(body.at) ? Math.min(body.at, Date.now()) : Date.now();
  const settings = sanitizeSettings(body.settings);
  await prisma.user.update({ where: { id: s.user.id }, data: { settings: settings as object, settingsAt: new Date(at) } });
  return withSession(json({ ok: true }), s);
}
