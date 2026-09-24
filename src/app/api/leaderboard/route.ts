import type { NextRequest } from "next/server";
import { json } from "@/server/auth/next";
import { allTime, daily, raceBoard } from "@/server/leaderboard";
import { BOARD_LANGS, BOARD_TIMES } from "@/lib/anticheat";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get("type") === "race") return json({ rows: await raceBoard() });
  const time = sp.get("time") ?? "60";
  const lang = sp.get("lang") ?? "english";
  if (!(BOARD_TIMES as readonly string[]).includes(time) || !(BOARD_LANGS as readonly string[]).includes(lang)) return json({ error: "invalid" }, 400);
  const board = `time_${time}_${lang}`;
  const rows = sp.get("type") === "daily" ? await daily(board) : await allTime(board);
  return json({ board, rows });
}
