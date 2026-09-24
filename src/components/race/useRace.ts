"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { P_STRIDE, type ClientMsg, type LobbyRoom, type PlayerTuple, type RaceLanguage, type ResultTuple, type RoomState, type ServerMsg, type TextType } from "@/lib/race/protocol";
import { ProgressSmoother } from "@/lib/race/smooth";

export interface RacePlayer {
  pid: number;
  name: string;
  isUser: boolean;
  connected: boolean;
  chars: number;
  wpm: number;
  place: number;
  acc: number;
  words: number;
  /** finish time in 1/10 s (0 while racing) */
  finishDs: number;
}

export interface RoomView {
  code: string;
  pub: boolean;
  lang: RaceLanguage;
  tt: TextType;
  len: number;
  max: number;
  state: RoomState;
  host: number;
  text: string;
  /** number of words in text */
  wc: number;
  src: string | null;
  /** local clock */
  startAt: number | null;
  autoAt: number | null;
  players: Record<number, RacePlayer>;
  you: number | null;
  results: ResultTuple[] | null;
  /** increments on every room reset (new room or new text) — not on reconnects */
  round: number;
  /** race XP earned in this round (signed-in finishers) */
  xp: { gained: number; level: number; prevLevel: number } | null;
}

export type ConnStatus = "connecting" | "open" | "reconnecting";

const toPlayer = (t: PlayerTuple): RacePlayer => ({
  pid: t[0],
  name: t[1],
  isUser: t[2] === 1,
  connected: t[3] === 1,
  chars: t[4],
  wpm: t[5],
  place: t[6],
  acc: t[7],
  words: t[8] ?? 0,
  finishDs: t[9] ?? 0,
});

/** Merge a fresh server value into an existing player without ever moving progress backwards. */
const mergeProgress = (prev: RacePlayer | undefined, next: RacePlayer): RacePlayer =>
  prev
    ? {
        ...next,
        chars: Math.max(prev.chars, next.chars),
        words: Math.max(prev.words, next.words),
        place: next.place || prev.place,
        finishDs: next.finishDs || prev.finishDs,
      }
    : next;

const RK_KEY = (code: string) => `st_rk_${code}`;
export const NICK_KEY = "st_nick";

/** WebSocket connection + race state (lobby and current room). */
export function useRace(initialCode: string | null) {
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [lobby, setLobby] = useState<{ rooms: LobbyRoom[]; online: number }>({ rooms: [], online: 0 });
  const [room, setRoom] = useState<RoomView | null>(null);
  const [me, setMe] = useState<{ name: string; user: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const offset = useRef(0); // server - local
  const bestRtt = useRef(Infinity);
  const roomCode = useRef<string | null>(initialCode);
  const lobbyOn = useRef(false);
  const retry = useRef(0);
  const closedByUs = useRef(false);
  const round = useRef(0);
  /** identity of the current round: code + server round; progress only resets when it changes */
  const roundKey = useRef("");
  const textLen = useRef(1);
  const [smoother] = useState(() => new ProgressSmoother());

  const send = useCallback((msg: ClientMsg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  const toLocal = (serverTs: number | null | undefined) => (serverTs == null ? null : serverTs - offset.current);

  const handle = useCallback((msg: ServerMsg) => {
    switch (msg.t) {
      case "hi":
        setMe({ name: msg.name, user: msg.user });
        if (bestRtt.current === Infinity) offset.current = msg.now - Date.now();
        return;
      case "pong": {
        const now = Date.now();
        const rtt = now - msg.c;
        if (rtt <= bestRtt.current) {
          bestRtt.current = rtt;
          offset.current = msg.s - (msg.c + rtt / 2);
        }
        return;
      }
      case "lobby":
        setLobby({ rooms: msg.rooms, online: msg.online });
        return;
      case "room": {
        const r = msg.room;
        roomCode.current = r.code;
        if (msg.rk) {
          try {
            sessionStorage.setItem(RK_KEY(r.code), msg.rk);
          } catch {
            /* ignore */
          }
        }
        const sm = smoother;
        const key = `${r.code}:${r.rnd}`;
        const sameRound = key === roundKey.current;
        textLen.current = Math.max(1, r.text.length);
        if (!sameRound) {
          // new room or new text: the only authoritative reset
          roundKey.current = key;
          round.current++;
          sm.reset(r.seq);
        } else if (r.seq > sm.lastSeq) sm.accept(r.seq);
        const players: Record<number, RacePlayer> = {};
        for (const p of r.players) {
          const pl = toPlayer(p);
          players[pl.pid] = pl;
          sm.set(pl.pid, pl.place > 0 ? 1 : pl.chars / textLen.current, true);
        }
        setRoom((prev) => {
          if (sameRound && prev) for (const pid in players) players[pid] = mergeProgress(prev.players[Number(pid)], players[pid]);
          return {
          code: r.code,
          pub: r.pub,
          lang: r.lang,
          tt: r.tt,
          len: r.len,
          max: r.max,
          state: r.state,
          host: r.host,
          text: r.text,
          wc: r.wc,
          src: r.src,
          startAt: toLocal(r.startAt),
          autoAt: toLocal(r.autoAt),
          players,
          you: msg.you,
          results: sameRound && prev ? prev.results : null,
          round: round.current,
          xp: sameRound && prev ? prev.xp : null,
        };
        });
        setError(null);
        if (typeof window !== "undefined") window.history.replaceState(null, "", `/race?room=${r.code}`);
        return;
      }
      case "tick": {
        const sm = smoother;
        // stale or reordered snapshot: never apply
        if (!sm.accept(msg.s)) return;
        if (msg.l) for (const id of msg.l) sm.remove(id);
        if (msg.j) for (const p of msg.j) sm.set(p[0], p[6] > 0 ? 1 : p[4] / textLen.current, true);
        if (msg.p) {
          const p = msg.p;
          for (let i = 0; i + P_STRIDE - 1 < p.length; i += P_STRIDE) sm.set(p[i], p[i + 4] > 0 ? 1 : p[i + 1] / textLen.current);
        }
        setRoom((prev) => {
          if (!prev) return prev;
          const next: RoomView = { ...prev, players: { ...prev.players } };
          if (msg.st) {
            next.state = msg.st;
            next.startAt = toLocal(msg.at);
            next.autoAt = toLocal(msg.auto);
          }
          if (msg.h !== undefined) next.host = msg.h;
          if (msg.j) for (const p of msg.j) next.players[p[0]] = mergeProgress(next.players[p[0]], toPlayer(p));
          if (msg.l) for (const id of msg.l) delete next.players[id];
          if (msg.cn) for (const [id, c] of msg.cn) if (next.players[id]) next.players[id] = { ...next.players[id], connected: c === 1 };
          if (msg.p) {
            const p = msg.p;
            for (let i = 0; i + P_STRIDE - 1 < p.length; i += P_STRIDE) {
              const cur = next.players[p[i]];
              if (cur)
                next.players[p[i]] = {
                  ...cur,
                  chars: Math.max(cur.chars, p[i + 1]),
                  words: Math.max(cur.words, p[i + 2]),
                  wpm: p[i + 3],
                  place: p[i + 4] || cur.place,
                  finishDs: p[i + 5] || cur.finishDs,
                };
            }
          }
          return next;
        });
        return;
      }
      case "end":
        setRoom((prev) => {
          if (!prev) return prev;
          const players = { ...prev.players };
          for (const [pid, place, wpm, acc, dur] of msg.results) {
            if (!players[pid]) continue;
            players[pid] = { ...players[pid], place, wpm, acc, finishDs: place ? Math.round(dur * 10) : 0 };
            if (place > 0) smoother.set(pid, 1);
          }
          return { ...prev, state: "finished", results: msg.results, players };
        });
        return;
      case "xp":
        setRoom((prev) => (prev && prev.code === msg.code ? { ...prev, xp: { gained: msg.gained, level: msg.level, prevLevel: msg.prevLevel } } : prev));
        return;
      case "left":
        roomCode.current = null;
        roundKey.current = "";
        setRoom(null);
        if (typeof window !== "undefined") window.history.replaceState(null, "", "/race");
        return;
      case "err":
        if (msg.code === "room_not_found" || msg.code === "replaced") {
          roomCode.current = null;
          roundKey.current = "";
          setRoom(null);
          if (typeof window !== "undefined") window.history.replaceState(null, "", "/race");
        }
        setError(msg.code);
        return;
    }
  }, [smoother]);

  useEffect(() => {
    closedByUs.current = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      wsRef.current = ws;
      ws.onopen = () => {
        retry.current = 0;
        setStatus("open");
        let nick = "";
        try {
          nick = localStorage.getItem(NICK_KEY) ?? "";
        } catch {
          /* ignore */
        }
        const sendRaw = (m: ClientMsg) => ws.send(JSON.stringify(m));
        sendRaw({ t: "hello", name: nick || undefined });
        for (let i = 0; i < 3; i++) setTimeout(() => ws.readyState === 1 && sendRaw({ t: "ping", c: Date.now() }), i * 150);
        if (roomCode.current) {
          let rk: string | undefined;
          try {
            rk = sessionStorage.getItem(RK_KEY(roomCode.current)) ?? undefined;
          } catch {
            /* ignore */
          }
          sendRaw({ t: "join", code: roomCode.current, rk });
        } else if (lobbyOn.current) sendRaw({ t: "lobby", on: true });
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data !== "string") return;
        try {
          handle(JSON.parse(ev.data) as ServerMsg);
        } catch {
          /* ignore malformed */
        }
      };
      ws.onclose = () => {
        wsRef.current = null;
        if (closedByUs.current) return;
        setStatus("reconnecting");
        const delay = Math.min(8000, 400 * Math.pow(1.8, retry.current++)) + Math.random() * 300;
        timer = setTimeout(connect, delay);
      };
      ws.onerror = () => ws.close();
    };
    connect();
    pingTimer = setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: "ping", c: Date.now() } satisfies ClientMsg));
    }, 20_000);
    return () => {
      closedByUs.current = true;
      if (timer) clearTimeout(timer);
      if (pingTimer) clearInterval(pingTimer);
      wsRef.current?.close(1000);
    };
  }, [handle]);

  const setLobbyOn = useCallback(
    (on: boolean) => {
      lobbyOn.current = on;
      send({ t: "lobby", on });
    },
    [send],
  );

  const now = useCallback(() => Date.now(), []);

  return { status, lobby, room, me, error, setError, send, setLobbyOn, now, serverOffset: offset, smoother: smoother };
}
