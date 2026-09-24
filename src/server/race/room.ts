import {
  COUNTDOWN_MS,
  MAX_PLAYERS,
  PUBLIC_AUTOSTART_MS,
  type PlayerTuple,
  type RaceLanguage,
  type ResultTuple,
  type RoomInfo,
  type RoomState,
  type ServerMsg,
  type TextType,
} from "../../lib/race/protocol";

/** Minimal connection surface so the room logic can be unit-tested. */
export interface Conn {
  readonly id: number;
  send(data: string): void;
  bufferedAmount(): number;
  close(code?: number, reason?: string): void;
  userId: string | null;
  name: string;
  room: Room | null;
}

export interface Player {
  pid: number;
  name: string;
  userId: string | null;
  rk: string;
  conn: Conn | null;
  connected: boolean;
  disconnectedAt: number;
  joinedAt: number;
  chars: number;
  words: number;
  errors: number;
  lastProgressAt: number;
  lastProgressChange: number;
  wpm: number;
  acc: number;
  place: number;
  finishMs: number;
  suspicious: number;
  left: boolean;
}

export interface RaceSummary {
  code: string;
  pub: boolean;
  lang: RaceLanguage;
  tt: TextType;
  textLength: number;
  startedAt: number;
  finishedAt: number;
  players: { userId: string | null; name: string; place: number; wpm: number; acc: number; finished: boolean; duration: number | null }[];
}

export interface RoomOptions {
  code: string;
  pub: boolean;
  lang: RaceLanguage;
  tt: TextType;
  len: number;
  max: number;
  text: string;
  src: string | null;
  now: number;
  randomKey: () => string;
  onFinish?: (s: RaceSummary) => void;
}

export const WAITING_GRACE_MS = 10_000;
export const RACING_GRACE_MS = 30_000;
export const STALL_END_MS = 20_000;
export const FINISHED_TTL_PUBLIC_MS = 60_000;
export const FINISHED_TTL_PRIVATE_MS = 10 * 60_000;
export const EMPTY_TTL_MS = 30_000;
/** 350 wpm => ~29 chars/s; allow some burst on top */
const MAX_CPS = (350 * 5) / 60;
const BURST_CHARS = 15;
const KEYFRAME_EVERY = 10;
const SLOW_CLIENT_BYTES = 512 * 1024;
const DEAD_CLIENT_BYTES = 4 * 1024 * 1024;

const finishDs = (p: Player) => (p.place > 0 ? Math.max(1, Math.round(p.finishMs / 100)) : 0);

export class Room {
  readonly code: string;
  readonly pub: boolean;
  readonly lang: RaceLanguage;
  readonly tt: TextType;
  readonly len: number;
  readonly max: number;
  text: string;
  src: string | null;
  textLength: number;
  wordCount: number;

  state: RoomState = "waiting";
  hostPid = 0;
  startAt: number | null = null;
  autoAt: number | null = null;
  endedAt = 0;
  emptySince: number | null = null;
  maxRaceMs = 0;
  readonly players = new Map<number, Player>();
  readonly spectators = new Set<Conn>();
  private nextPid = 1;
  private nextPlace = 1;
  private randomKey: () => string;
  private onFinish?: (s: RaceSummary) => void;

  // batched outgoing changes
  private pendingJoins: Player[] = [];
  private pendingLeaves: number[] = [];
  private pendingConn = new Map<number, 0 | 1>();
  private dirty = new Set<number>();
  private stateChanged = false;
  private hostChanged = false;
  private tickCount = 0;
  /** per-room snapshot sequence number */
  seq = 0;
  /** round counter (increments on rematch) */
  round = 1;
  /** stats for the load test / monitoring */
  bytesSent = 0;
  snapshotsDropped = 0;

  constructor(o: RoomOptions) {
    this.code = o.code;
    this.pub = o.pub;
    this.lang = o.lang;
    this.tt = o.tt;
    this.len = o.len;
    this.max = Math.max(2, Math.min(MAX_PLAYERS, Math.floor(o.max)));
    this.text = o.text;
    this.src = o.src;
    this.textLength = o.text.length;
    this.wordCount = o.text.split(" ").length;
    this.randomKey = o.randomKey;
    this.onFinish = o.onFinish;
    this.emptySince = o.now;
    this.computeMaxRace();
  }

  private computeMaxRace() {
    // enough time for a 12 wpm typist, clamped to 60 s .. 10 min
    const ms = ((this.textLength / 5) / 12) * 60_000;
    this.maxRaceMs = Math.max(60_000, Math.min(600_000, ms));
  }

  get racers(): Player[] {
    return [...this.players.values()];
  }

  get connectedCount(): number {
    let n = 0;
    for (const p of this.players.values()) if (p.connected) n++;
    return n;
  }

  get joinable(): boolean {
    return (this.state === "waiting" || this.state === "countdown") && this.players.size < this.max;
  }

  private tuple(p: Player): PlayerTuple {
    return [p.pid, p.name, p.userId ? 1 : 0, p.connected ? 1 : 0, p.chars, Math.round(p.wpm), p.place, Math.round(p.acc), p.words, finishDs(p)];
  }

  info(): RoomInfo {
    return {
      code: this.code,
      pub: this.pub,
      lang: this.lang,
      tt: this.tt,
      len: this.len,
      max: this.max,
      state: this.state,
      host: this.hostPid,
      text: this.text,
      src: this.src,
      startAt: this.startAt,
      autoAt: this.autoAt,
      players: this.racers.map((p) => this.tuple(p)),
      wc: this.wordCount,
      rnd: this.round,
      seq: this.seq,
    };
  }

  private sendTo(conn: Conn, msg: ServerMsg) {
    const s = JSON.stringify(msg);
    this.bytesSent += s.length;
    conn.send(s);
  }

  private sendFull(conn: Conn, player: Player | null, now: number) {
    this.sendTo(conn, { t: "room", room: this.info(), you: player?.pid ?? null, rk: player?.rk ?? null, now });
  }

  findRejoin(rk: string | undefined, userId: string | null): Player | undefined {
    for (const p of this.players.values()) {
      if (rk && p.rk === rk) return p;
      if (userId && p.userId === userId) return p;
    }
    return undefined;
  }

  /**
   * Add a connection to the room: rejoin an existing slot, join as a racer
   * (waiting/countdown) or watch as a spectator.
   */
  join(conn: Conn, now: number, rk?: string): { player: Player | null } {
    this.emptySince = null;
    const existing = this.findRejoin(rk, conn.userId);
    if (existing && !existing.left) {
      if (existing.conn && existing.conn !== conn) {
        const old = existing.conn;
        old.room = null;
        this.sendTo(old, { t: "err", code: "replaced" });
      }
      existing.conn = conn;
      existing.name = conn.name;
      if (!existing.connected) {
        existing.connected = true;
        this.pendingConn.set(existing.pid, 1);
      }
      conn.room = this;
      this.sendFull(conn, existing, now);
      return { player: existing };
    }

    if (this.joinable) {
      const p: Player = {
        pid: this.nextPid++,
        name: conn.name,
        userId: conn.userId,
        rk: this.randomKey(),
        conn,
        connected: true,
        disconnectedAt: 0,
        joinedAt: now,
        chars: 0,
        words: 0,
        errors: 0,
        lastProgressAt: 0,
        lastProgressChange: 0,
        wpm: 0,
        acc: 100,
        place: 0,
        finishMs: 0,
        suspicious: 0,
        left: false,
      };
      this.players.set(p.pid, p);
      if (!this.hostPid || !this.players.get(this.hostPid)?.connected) {
        this.hostPid = p.pid;
        this.hostChanged = true;
      }
      conn.room = this;
      this.pendingJoins.push(p);
      this.sendFull(conn, p, now);
      this.updateAutoStart(now);
      if (this.pub && this.state === "waiting" && this.players.size >= this.max) this.beginCountdown(now);
      return { player: p };
    }

    conn.room = this;
    this.spectators.add(conn);
    this.sendFull(conn, null, now);
    return { player: null };
  }

  private playerOf(conn: Conn): Player | undefined {
    for (const p of this.players.values()) if (p.conn === conn) return p;
    return undefined;
  }

  /** Explicit leave (button) — slot is removed or marked DNF. */
  leave(conn: Conn, now: number) {
    conn.room = null;
    if (this.spectators.delete(conn)) return this.checkEmpty(now);
    const p = this.playerOf(conn);
    if (!p) return;
    p.conn = null;
    p.connected = false;
    p.disconnectedAt = now;
    this.removeOrRetire(p);
    this.afterPlayerGone(now);
  }

  /** Socket closed — keep the slot for a grace period. */
  disconnect(conn: Conn, now: number) {
    conn.room = null;
    if (this.spectators.delete(conn)) return this.checkEmpty(now);
    const p = this.playerOf(conn);
    if (!p) return;
    p.conn = null;
    p.connected = false;
    p.disconnectedAt = now;
    this.pendingConn.set(p.pid, 0);
    this.afterPlayerGone(now);
  }

  private removeOrRetire(p: Player) {
    if (this.state === "waiting" || this.state === "countdown") {
      this.players.delete(p.pid);
      this.pendingLeaves.push(p.pid);
      this.pendingConn.delete(p.pid);
      this.dirty.delete(p.pid);
    } else {
      p.left = true;
      this.pendingConn.set(p.pid, 0);
    }
  }

  private afterPlayerGone(now: number) {
    if (this.hostPid && !this.players.get(this.hostPid)?.connected) this.reassignHost();
    this.updateAutoStart(now);
    this.checkEmpty(now);
    if (this.state === "racing") this.checkAllFinished(now);
  }

  private reassignHost() {
    let next = 0;
    for (const p of this.players.values()) {
      if (p.connected && !p.left) {
        next = p.pid;
        break;
      }
    }
    if (next !== this.hostPid) {
      this.hostPid = next;
      this.hostChanged = true;
    }
  }

  private checkEmpty(now: number) {
    if (this.connectedCount === 0 && this.spectators.size === 0) {
      if (this.emptySince === null) this.emptySince = now;
    } else this.emptySince = null;
  }

  private updateAutoStart(now: number) {
    if (!this.pub || this.state !== "waiting") return;
    const n = this.connectedCount;
    if (n >= 2 && this.autoAt === null) {
      this.autoAt = now + PUBLIC_AUTOSTART_MS;
      this.stateChanged = true;
    } else if (n < 2 && this.autoAt !== null) {
      this.autoAt = null;
      this.stateChanged = true;
    }
  }

  /** Host-triggered start. */
  requestStart(conn: Conn, now: number): string | null {
    const p = this.playerOf(conn);
    if (!p || p.pid !== this.hostPid) return "not_host";
    if (this.state !== "waiting") return "bad_state";
    this.beginCountdown(now);
    return null;
  }

  beginCountdown(now: number) {
    if (this.state !== "waiting") return;
    this.state = "countdown";
    this.startAt = now + COUNTDOWN_MS;
    this.autoAt = null;
    this.stateChanged = true;
  }

  /** Host restarts a finished private room with a new text. */
  rematch(conn: Conn, now: number, text: string, src: string | null): string | null {
    const p = this.playerOf(conn);
    if (!p || p.pid !== this.hostPid) return "not_host";
    if (this.state !== "finished") return "bad_state";
    this.state = "waiting";
    this.text = text;
    this.src = src;
    this.textLength = text.length;
    this.wordCount = text.split(" ").length;
    this.computeMaxRace();
    this.startAt = null;
    this.autoAt = null;
    this.nextPlace = 1;
    this.endedAt = 0;
    this.round++;
    for (const pl of [...this.players.values()]) {
      if (!pl.connected || pl.left) {
        this.players.delete(pl.pid);
        continue;
      }
      Object.assign(pl, { chars: 0, words: 0, errors: 0, wpm: 0, acc: 100, place: 0, finishMs: 0, suspicious: 0, lastProgressAt: 0, lastProgressChange: 0 });
    }
    // spectators become racers
    for (const s of [...this.spectators]) {
      this.spectators.delete(s);
      s.room = null;
      this.join(s, now);
    }
    this.pendingJoins = [];
    this.pendingLeaves = [];
    this.pendingConn.clear();
    this.dirty.clear();
    this.reassignHostIfNeeded();
    this.updateAutoStart(now);
    for (const pl of this.players.values()) if (pl.conn) this.sendFull(pl.conn, pl, now);
    return null;
  }

  private reassignHostIfNeeded() {
    if (!this.players.get(this.hostPid)?.connected) this.reassignHost();
  }

  /** Validate and apply a progress report. Returns false when rejected. */
  progress(conn: Conn, chars: number, words: number, errors: number, now: number): boolean {
    if (this.state !== "racing" || this.startAt === null || now < this.startAt) return false;
    const p = this.playerOf(conn);
    if (!p || p.place > 0 || p.left) return false;
    if (!Number.isInteger(chars) || !Number.isInteger(words) || !Number.isInteger(errors)) return false;
    let c = Math.max(0, Math.min(chars, this.textLength));
    const since = p.lastProgressAt || this.startAt;
    const dt = Math.max(0, now - since) / 1000;
    const allowed = p.chars + Math.ceil(MAX_CPS * dt) + BURST_CHARS;
    if (c > allowed) {
      c = allowed;
      p.suspicious++;
    }
    // Progress is monotonic within a round: a typo or backspace on the client
    // (or a stale/reordered report) must never move a player backwards.
    c = Math.max(c, p.chars);
    const w = Math.max(p.words, Math.max(0, Math.min(words, this.wordCount)));
    if (c !== p.chars) p.lastProgressChange = now;
    p.chars = c;
    p.words = w;
    p.errors = Math.max(0, Math.min(errors, 100000));
    p.lastProgressAt = now;
    p.wpm = this.wpmFor(c, now - this.startAt);
    this.dirty.add(p.pid);
    return true;
  }

  private wpmFor(chars: number, ms: number): number {
    if (ms < 1000) return 0;
    return Math.round((chars / 5 / (ms / 60000)) * 10) / 10;
  }

  finish(conn: Conn, chars: number, words: number, errors: number, acc: number, now: number): boolean {
    if (this.state !== "racing" || this.startAt === null) return false;
    const p = this.playerOf(conn);
    if (!p || p.place > 0 || p.left) return false;
    this.progress(conn, chars, words, errors, now);
    // must have typed through all words (with at most a few mistakes)
    if (words < this.wordCount - 1 || p.chars < this.textLength * 0.5) return false;
    p.place = this.nextPlace++;
    p.finishMs = now - this.startAt;
    p.wpm = this.wpmFor(p.chars, p.finishMs);
    // a finisher is at the line: show a full lane (wpm is already computed from correct chars)
    p.chars = this.textLength;
    p.words = this.wordCount;
    p.acc = Number.isFinite(acc) ? Math.max(0, Math.min(100, acc)) : 0;
    p.lastProgressChange = now;
    this.dirty.add(p.pid);
    this.checkAllFinished(now);
    return true;
  }

  private checkAllFinished(now: number) {
    if (this.state !== "racing") return;
    let anyActive = false;
    for (const p of this.players.values()) {
      if (p.place > 0 || p.left) continue;
      if (!p.connected && now - p.disconnectedAt > RACING_GRACE_MS) continue;
      anyActive = true;
      break;
    }
    if (!anyActive) this.end(now);
  }

  private end(now: number) {
    if (this.state === "finished") return;
    this.state = "finished";
    this.endedAt = now;
    this.stateChanged = true;
    const results: ResultTuple[] = this.racers
      .slice()
      .sort((a, b) => (a.place || 1e9) - (b.place || 1e9) || b.chars - a.chars)
      .map((p) => [p.pid, p.place, Math.round(p.wpm * 10) / 10, Math.round(p.acc * 10) / 10, p.place ? Math.round(p.finishMs / 100) / 10 : 0]);
    this.flush(now);
    this.broadcast(JSON.stringify({ t: "end", results } satisfies ServerMsg), true);
    if (this.onFinish && this.startAt !== null) {
      this.onFinish({
        code: this.code,
        pub: this.pub,
        lang: this.lang,
        tt: this.tt,
        textLength: this.textLength,
        startedAt: this.startAt,
        finishedAt: now,
        players: this.racers.map((p) => ({
          userId: p.userId,
          name: p.name,
          place: p.place,
          wpm: p.wpm,
          acc: p.acc,
          finished: p.place > 0,
          duration: p.place ? p.finishMs / 1000 : null,
        })),
      });
    }
  }

  /** Periodic housekeeping + batched broadcast. Returns false when the room should be destroyed. */
  tick(now: number): boolean {
    this.tickCount++;
    // expire disconnected players
    for (const p of [...this.players.values()]) {
      if (p.connected || p.left) continue;
      const grace = this.state === "waiting" || this.state === "countdown" ? WAITING_GRACE_MS : RACING_GRACE_MS;
      if (now - p.disconnectedAt > grace) {
        this.removeOrRetire(p);
        this.afterPlayerGone(now);
      }
    }
    if (this.state === "waiting" && this.autoAt !== null && now >= this.autoAt) this.beginCountdown(now);
    if (this.state === "countdown" && this.startAt !== null && now >= this.startAt) {
      if (this.players.size === 0) {
        this.state = "waiting";
        this.startAt = null;
      } else this.state = "racing";
      this.stateChanged = true;
    }
    if (this.state === "racing" && this.startAt !== null) {
      const elapsed = now - this.startAt;
      if (elapsed > this.maxRaceMs) this.end(now);
      else {
        const anyFinished = this.nextPlace > 1;
        if (anyFinished) {
          let lastChange = 0;
          for (const p of this.players.values()) if (p.place === 0 && !p.left) lastChange = Math.max(lastChange, p.lastProgressChange || this.startAt);
          if (now - lastChange > STALL_END_MS) this.end(now);
        }
        this.checkAllFinished(now);
      }
    }
    this.flush(now);

    if (this.emptySince !== null && now - this.emptySince > EMPTY_TTL_MS) return false;
    if (this.state === "finished") {
      const ttl = this.pub ? FINISHED_TTL_PUBLIC_MS : FINISHED_TTL_PRIVATE_MS;
      if (now - this.endedAt > ttl) return false;
    }
    return true;
  }

  /** Build one message with all pending changes and send the same string to everybody. */
  flush(now: number) {
    const keyframe = this.state === "racing" && this.tickCount % KEYFRAME_EVERY === 0;
    const hasReliable =
      this.pendingJoins.length > 0 || this.pendingLeaves.length > 0 || this.pendingConn.size > 0 || this.stateChanged || this.hostChanged;
    if (!hasReliable && this.dirty.size === 0 && !keyframe) return;

    const msg: Extract<ServerMsg, { t: "tick" }> = { t: "tick", now, s: ++this.seq };
    if (this.stateChanged) {
      msg.st = this.state;
      msg.at = this.startAt;
      msg.auto = this.autoAt;
    }
    if (this.hostChanged) msg.h = this.hostPid;
    if (this.pendingJoins.length) msg.j = this.pendingJoins.filter((p) => this.players.has(p.pid)).map((p) => this.tuple(p));
    if (this.pendingLeaves.length) msg.l = this.pendingLeaves;
    if (this.pendingConn.size) msg.cn = [...this.pendingConn.entries()];
    const ids = keyframe ? [...this.players.keys()] : [...this.dirty];
    if (ids.length) {
      const flat: number[] = [];
      for (const id of ids) {
        const p = this.players.get(id);
        if (!p) continue;
        flat.push(p.pid, p.chars, p.words, Math.round(p.wpm), p.place, finishDs(p));
      }
      if (flat.length) msg.p = flat;
    }
    this.pendingJoins = [];
    this.pendingLeaves = [];
    this.pendingConn.clear();
    this.dirty.clear();
    this.stateChanged = false;
    this.hostChanged = false;
    this.broadcast(JSON.stringify(msg), hasReliable);
  }

  private broadcast(data: string, reliable: boolean) {
    const send = (c: Conn) => {
      const buffered = c.bufferedAmount();
      if (buffered > DEAD_CLIENT_BYTES) {
        c.close(1013, "too slow");
        return;
      }
      if (!reliable && buffered > SLOW_CLIENT_BYTES) {
        this.snapshotsDropped++;
        return;
      }
      this.bytesSent += data.length;
      c.send(data);
    };
    for (const p of this.players.values()) if (p.conn) send(p.conn);
    for (const s of this.spectators) send(s);
  }
}
