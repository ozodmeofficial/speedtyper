import { randomBytes } from "node:crypto";
import { Room, type Conn, type RaceSummary } from "./room";
import {
  MAX_MESSAGE_BYTES,
  MAX_PLAYERS,
  RACE_LANGS,
  RACE_QUOTE_LENGTHS,
  RACE_WORD_LENGTHS,
  SNAPSHOT_INTERVAL_MS,
  sanitizeName,
  type ClientMsg,
  type LobbyRoom,
  type RaceLanguage,
  type ServerMsg,
  type TextType,
} from "../../lib/race/protocol";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_ROOMS = 2000;
const LOBBY_LIMIT = 60;

export interface ManagerOptions {
  now?: () => number;
  textFor: (lang: RaceLanguage, tt: TextType, len: number) => { text: string; src: string | null };
  onFinish?: (s: RaceSummary) => void;
}

interface Bucket {
  tokens: number;
  at: number;
  strikes: number;
}

export class RaceManager {
  readonly rooms = new Map<string, Room>();
  readonly conns = new Set<Conn>();
  private lobby = new Set<Conn>();
  private buckets = new WeakMap<Conn, Bucket>();
  private lastLobby = "";
  private lobbyTick = 0;
  private timer: NodeJS.Timeout | null = null;
  private now: () => number;
  private textFor: ManagerOptions["textFor"];
  private onFinish?: ManagerOptions["onFinish"];

  constructor(o: ManagerOptions) {
    this.now = o.now ?? Date.now;
    this.textFor = o.textFor;
    this.onFinish = o.onFinish;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), SNAPSHOT_INTERVAL_MS);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  tick(now = this.now()) {
    for (const [code, room] of this.rooms) {
      if (!room.tick(now)) {
        for (const s of room.spectators) s.room = null;
        for (const p of room.players.values()) if (p.conn) p.conn.room = null;
        this.rooms.delete(code);
      }
    }
    if (++this.lobbyTick % 5 === 0) this.broadcastLobby(false);
  }

  private send(conn: Conn, msg: ServerMsg) {
    conn.send(JSON.stringify(msg));
  }

  connect(conn: Conn) {
    this.conns.add(conn);
    this.send(conn, { t: "hi", name: conn.name, user: conn.userId !== null, now: this.now() });
  }

  disconnect(conn: Conn) {
    this.conns.delete(conn);
    this.lobby.delete(conn);
    conn.room?.disconnect(conn, this.now());
  }

  /** token bucket: 20 msg/s sustained, burst of 40 */
  private allow(conn: Conn, now: number): boolean {
    let b = this.buckets.get(conn);
    if (!b) {
      b = { tokens: 40, at: now, strikes: 0 };
      this.buckets.set(conn, b);
    }
    b.tokens = Math.min(40, b.tokens + ((now - b.at) / 1000) * 20);
    b.at = now;
    if (b.tokens < 1) {
      if (++b.strikes > 200) conn.close(1008, "rate limit");
      return false;
    }
    b.tokens -= 1;
    return true;
  }

  handle(conn: Conn, raw: string) {
    const now = this.now();
    if (raw.length > MAX_MESSAGE_BYTES) return conn.close(1009, "too big");
    if (!this.allow(conn, now)) return;
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw) as ClientMsg;
    } catch {
      return this.send(conn, { t: "err", code: "bad_json" });
    }
    if (!msg || typeof msg !== "object" || typeof msg.t !== "string") return;
    const room = conn.room;
    switch (msg.t) {
      case "ping":
        return this.send(conn, { t: "pong", c: Number(msg.c) || 0, s: now });
      case "hello": {
        if (!conn.userId) {
          const n = sanitizeName(msg.name);
          if (n) conn.name = n;
        }
        return this.send(conn, { t: "hi", name: conn.name, user: conn.userId !== null, now });
      }
      case "lobby":
        if (msg.on) {
          this.lobby.add(conn);
          this.send(conn, this.lobbyMsg());
        } else this.lobby.delete(conn);
        return;
      case "p":
        room?.progress(conn, msg.c, msg.w, msg.e, now);
        return;
      case "fin":
        room?.finish(conn, msg.c, msg.w, msg.e, Number(msg.acc), now);
        return;
      case "quick":
        return this.quick(conn, msg.lang, now);
      case "create":
        return this.create(conn, msg, now);
      case "join": {
        if (typeof msg.code !== "string") return;
        const target = this.rooms.get(msg.code.toUpperCase().trim());
        if (!target) return this.send(conn, { t: "err", code: "room_not_found" });
        if (room && room !== target) room.leave(conn, now);
        this.lobby.delete(conn);
        target.join(conn, now, typeof msg.rk === "string" ? msg.rk.slice(0, 64) : undefined);
        return;
      }
      case "leave":
        if (room) room.leave(conn, now);
        this.send(conn, { t: "left" });
        return;
      case "start": {
        const err = room?.requestStart(conn, now);
        if (err) this.send(conn, { t: "err", code: err });
        return;
      }
      case "again": {
        if (!room) return;
        if (room.pub) return this.quick(conn, room.lang, now);
        const { text, src } = this.textFor(room.lang, room.tt, room.len);
        const err = room.rematch(conn, now, text, src);
        if (err) this.send(conn, { t: "err", code: err });
        return;
      }
      default:
        return;
    }
  }

  private newCode(): string {
    for (;;) {
      const bytes = randomBytes(6);
      let s = "";
      for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
      if (!this.rooms.has(s)) return s;
    }
  }

  createRoom(opts: { pub: boolean; lang: RaceLanguage; tt: TextType; len: number; max: number }, now: number): Room | null {
    if (this.rooms.size >= MAX_ROOMS) return null;
    const { text, src } = this.textFor(opts.lang, opts.tt, opts.len);
    const room = new Room({
      code: this.newCode(),
      ...opts,
      text,
      src,
      now,
      randomKey: () => randomBytes(12).toString("hex"),
      onFinish: this.onFinish,
    });
    this.rooms.set(room.code, room);
    return room;
  }

  private create(conn: Conn, msg: Extract<ClientMsg, { t: "create" }>, now: number) {
    const lang = RACE_LANGS.includes(msg.lang) ? msg.lang : "english";
    const tt: TextType = msg.tt === "quote" ? "quote" : "words";
    const len =
      tt === "words"
        ? (RACE_WORD_LENGTHS as readonly number[]).includes(msg.len)
          ? msg.len
          : 25
        : msg.len >= 1 && msg.len <= RACE_QUOTE_LENGTHS.length
          ? Math.floor(msg.len)
          : 2;
    const max = Number.isFinite(msg.max) ? Math.max(2, Math.min(MAX_PLAYERS, Math.floor(msg.max))) : MAX_PLAYERS;
    const room = this.createRoom({ pub: msg.pub === true, lang, tt, len, max }, now);
    if (!room) return this.send(conn, { t: "err", code: "server_full" });
    conn.room?.leave(conn, now);
    this.lobby.delete(conn);
    room.join(conn, now);
  }

  private quick(conn: Conn, langIn: RaceLanguage | undefined, now: number) {
    const lang = langIn && RACE_LANGS.includes(langIn) ? langIn : "english";
    let best: Room | null = null;
    for (const r of this.rooms.values()) {
      if (!r.pub || r.lang !== lang || r.state !== "waiting" || r === conn.room) continue;
      if (r.players.size >= r.max) continue;
      if (!best || r.players.size > best.players.size) best = r;
    }
    conn.room?.leave(conn, now);
    this.lobby.delete(conn);
    if (!best) {
      best = this.createRoom({ pub: true, lang, tt: "words", len: 25, max: MAX_PLAYERS }, now);
      if (!best) return this.send(conn, { t: "err", code: "server_full" });
    }
    best.join(conn, now);
  }

  private lobbyMsg(): ServerMsg {
    const rooms: LobbyRoom[] = [];
    for (const r of this.rooms.values()) {
      if (!r.pub || r.state === "finished") continue;
      rooms.push([r.code, r.lang, r.tt, r.len, r.players.size, r.max, r.state]);
    }
    rooms.sort((a, b) => (a[6] === "waiting" ? 0 : 1) - (b[6] === "waiting" ? 0 : 1) || b[4] - a[4]);
    return { t: "lobby", rooms: rooms.slice(0, LOBBY_LIMIT), online: this.conns.size };
  }

  broadcastLobby(force: boolean) {
    if (this.lobby.size === 0) return;
    const s = JSON.stringify(this.lobbyMsg());
    if (!force && s === this.lastLobby) return;
    this.lastLobby = s;
    for (const c of this.lobby) c.send(s);
  }

  stats() {
    let players = 0;
    for (const r of this.rooms.values()) players += r.players.size;
    return { rooms: this.rooms.size, players, connections: this.conns.size };
  }
}
