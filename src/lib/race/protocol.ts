/**
 * Race websocket protocol (compact JSON). Shared by server and client.
 *
 * Progress snapshots are flat arrays to keep 200-player rooms small:
 *   p = [pid, correctChars, wpm, place, pid, correctChars, wpm, place, ...]
 */

export type RoomState = "waiting" | "countdown" | "racing" | "finished";
export type TextType = "words" | "quote";
export type RaceLanguage = "english" | "english_1k" | "uzbek" | "russian";

export const RACE_LANGS: readonly RaceLanguage[] = ["english", "english_1k", "uzbek", "russian"];
export const RACE_WORD_LENGTHS = [10, 25, 50, 100] as const;
export const RACE_QUOTE_LENGTHS = ["short", "medium", "long"] as const;
export const MAX_PLAYERS = 200;
export const PROGRESS_INTERVAL_MS = 250;
export const SNAPSHOT_INTERVAL_MS = 200;
export const COUNTDOWN_MS = 3000;
export const PUBLIC_AUTOSTART_MS = 12000;
export const MAX_MESSAGE_BYTES = 4096;

/** [pid, name, isUser(0/1), connected(0/1), correctChars, wpm, place, acc] */
export type PlayerTuple = [number, string, 0 | 1, 0 | 1, number, number, number, number];

export interface RoomInfo {
  code: string;
  pub: boolean;
  lang: RaceLanguage;
  tt: TextType;
  /** words: word count; quote: 1 short / 2 medium / 3 long */
  len: number;
  max: number;
  state: RoomState;
  host: number;
  text: string;
  src: string | null;
  startAt: number | null;
  autoAt: number | null;
  players: PlayerTuple[];
}

/** [code, lang, textType, len, players, max, state] */
export type LobbyRoom = [string, RaceLanguage, TextType, number, number, number, RoomState];

/** [pid, place (0 = dnf), wpm, acc, durationSeconds] */
export type ResultTuple = [number, number, number, number, number];

export type ClientMsg =
  | { t: "hello"; name?: string }
  | { t: "lobby"; on: boolean }
  | { t: "quick"; lang?: RaceLanguage }
  | { t: "create"; pub: boolean; lang: RaceLanguage; tt: TextType; len: number; max: number }
  | { t: "join"; code: string; rk?: string }
  | { t: "leave" }
  | { t: "start" }
  | { t: "again" }
  | { t: "p"; c: number; w: number; e: number }
  | { t: "fin"; c: number; w: number; e: number; acc: number }
  | { t: "ping"; c: number };

export type ServerMsg =
  | { t: "hi"; name: string; user: boolean; now: number }
  | { t: "lobby"; rooms: LobbyRoom[]; online: number }
  | { t: "room"; room: RoomInfo; you: number | null; rk: string | null; now: number }
  | {
      t: "tick";
      now: number;
      st?: RoomState;
      at?: number | null;
      auto?: number | null;
      h?: number;
      j?: PlayerTuple[];
      l?: number[];
      cn?: [number, 0 | 1][];
      p?: number[];
    }
  | { t: "end"; results: ResultTuple[] }
  | { t: "left" }
  | { t: "err"; code: string }
  | { t: "pong"; c: number; s: number };

export function sanitizeName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.normalize("NFC").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 20);
  return s.length >= 2 ? s : null;
}

export function quoteLenCode(len: number): "short" | "medium" | "long" {
  return len === 1 ? "short" : len === 3 ? "long" : "medium";
}
