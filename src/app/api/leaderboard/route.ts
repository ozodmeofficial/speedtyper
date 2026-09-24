import type { NextRequest } from "next/server";
import { json } from "@/server/auth/next";
import { allTime, daily, overall, raceBoard, weekly } from "@/server/leaderboard";
import { BOARD_LANGS, BOARD_TIMES } from "@/lib/anticheat";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type");
  const page = Number(sp.get("page")) || 1;
  if (type === "race") return json({ rows: await raceBoard() });
  if (type === "overall") return json(await overall(page));
  if (type === "weekly") return json(await weekly(page));
  const time = sp.get("time") ?? "60";
  const lang = sp.get("lang") ?? "english";
  if (!(BOARD_TIMES as readonly string[]).includes(time) || !(BOARD_LANGS as readonly string[]).includes(lang)) return json({ error: "invalid" }, 400);
  const board = `time_${time}_${lang}`;
  const data = type === "daily" ? await daily(board, page) : await allTime(board, page);
  return json({ board, ...data });
}
