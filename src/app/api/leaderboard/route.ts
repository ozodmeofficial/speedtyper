import type { NextRequest } from "next/server";
import { json } from "@/server/auth/next";
import { overall, raceBoard, speed, weekly } from "@/server/leaderboard";
import { BOARD_LANGS, BOARD_TIMES } from "@/lib/anticheat";
import { isMetric, isPeriod } from "@/lib/periods";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") ?? "speed";
  const page = Number(sp.get("page")) || 1;
  const p = sp.get("period");
  // legacy values: type=daily / type=all
  const period = isPeriod(p) ? p : type === "daily" ? "day" : "all";
  if (type === "race") return json({ period, rows: await raceBoard(period) });
  if (type === "overall") return json(await overall(page));
  if (type === "weekly") return json(await weekly(page));
  const time = sp.get("time") ?? "60";
  const lang = sp.get("lang") ?? "english";
  const m = sp.get("metric");
  const metric = isMetric(m) ? m : "wpm";
  if (!(BOARD_TIMES as readonly string[]).includes(time) || !(BOARD_LANGS as readonly string[]).includes(lang)) return json({ error: "invalid" }, 400);
  return json({ time, lang, period, metric, ...(await speed({ time, language: lang, period, metric }, page)) });
}
