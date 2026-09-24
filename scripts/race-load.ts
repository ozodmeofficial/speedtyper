/**
 * Race load test: spawns N simulated websocket clients per room (default 200),
 * runs a full race to completion and reports latency / throughput / CPU.
 *
 *   RACE_LOADTEST=1 npm start            # server (loopback clients bypass per-IP limits)
 *   npm run load:race                    # 1 room x 200 players
 *   ROOMS=5 PLAYERS=200 npm run load:race
 *
 * Env: URL (default ws://localhost:3000/ws), ORIGIN, ROOMS, PLAYERS, LEN (words),
 *      SERVER_PID (sampled with `ps` for CPU/RSS; auto-detected via lsof when omitted).
 */
import { execSync } from "node:child_process";
import WebSocket from "ws";
import type { ClientMsg, ServerMsg } from "../src/lib/race/protocol";

const URL_WS = process.env.URL ?? "ws://localhost:3000/ws";
const ORIGIN = process.env.ORIGIN ?? URL_WS.replace(/^ws/, "http").replace(/\/ws$/, "");
const ROOMS = Number(process.env.ROOMS ?? 1);
const PLAYERS = Number(process.env.PLAYERS ?? 200);
const LEN = Number(process.env.LEN ?? 25);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 180_000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Stats {
  latencies: number[];
  msgs: number;
  bytes: number;
  errors: string[];
}
const stats: Stats = { latencies: [], msgs: 0, bytes: 0, errors: [] };

class Bot {
  ws!: WebSocket;
  pid: number | null = null;
  code: string | null = null;
  text = "";
  words = 0;
  startAt = 0;
  racing = false;
  finished = false;
  ended = false;
  place = 0;
  chars = 0;
  private timer: NodeJS.Timeout | null = null;
  private waiters: ((m: ServerMsg) => boolean)[] = [];
  readonly cps: number;

  constructor(readonly name: string) {
    const wpm = 55 + Math.random() * 90; // 55..145 wpm
    this.cps = (wpm * 5) / 60;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(URL_WS, { origin: ORIGIN, perMessageDeflate: false });
      this.ws.once("open", () => {
        this.send({ t: "hello", name: this.name });
        resolve();
      });
      this.ws.once("error", reject);
      this.ws.on("message", (data) => this.onMessage(data.toString()));
      this.ws.on("close", (code) => {
        if (!this.ended && code !== 1000) stats.errors.push(`${this.name}: closed ${code}`);
      });
    });
  }

  send(m: ClientMsg) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  waitFor(pred: (m: ServerMsg) => boolean, ms = 20_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${this.name}: timeout waiting`)), ms);
      this.waiters.push((m) => {
        if (!pred(m)) return false;
        clearTimeout(t);
        resolve();
        return true;
      });
    });
  }

  private onMessage(raw: string) {
    stats.msgs++;
    stats.bytes += raw.length;
    const m = JSON.parse(raw) as ServerMsg;
    this.waiters = this.waiters.filter((w) => !w(m));
    switch (m.t) {
      case "room":
        this.pid = m.you;
        this.code = m.room.code;
        this.text = m.room.text;
        this.words = m.room.text.split(" ").length;
        break;
      case "tick":
        // server and bots share the machine clock: one-way delivery latency
        stats.latencies.push(Date.now() - m.now);
        if (m.at) this.startAt = m.at;
        if (m.st === "racing" && !this.racing) this.beginTyping();
        break;
      case "end":
        this.ended = true;
        this.place = m.results.find((r) => r[0] === this.pid)?.[1] ?? 0;
        this.stop();
        break;
      case "err":
        stats.errors.push(`${this.name}: err ${m.code}`);
        break;
    }
  }

  private beginTyping() {
    this.racing = true;
    const t0 = Date.now();
    this.timer = setInterval(() => {
      const elapsed = (Date.now() - t0) / 1000;
      this.chars = Math.min(this.text.length, Math.floor(elapsed * this.cps));
      const w = Math.min(this.words, this.text.slice(0, this.chars).split(" ").length - 1);
      if (this.chars >= this.text.length && !this.finished) {
        this.finished = true;
        this.send({ t: "fin", c: this.text.length, w: this.words, e: 0, acc: 97 + Math.random() * 3 });
        if (this.timer) clearInterval(this.timer);
        return;
      }
      this.send({ t: "p", c: this.chars, w, e: 0 });
    }, 250);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }
}

function pct(arr: number[], p: number): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

function findServerPid(): number | null {
  if (process.env.SERVER_PID) return Number(process.env.SERVER_PID);
  try {
    const port = new URL(URL_WS.replace(/^ws/, "http")).port || "80";
    const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, { encoding: "utf8" }).trim().split("\n")[0];
    return out ? Number(out) : null;
  } catch {
    return null;
  }
}

async function runRoom(roomIdx: number): Promise<{ joinMs: number; raceMs: number; finished: number; places: Set<number> }> {
  const bots = Array.from({ length: PLAYERS }, (_, i) => new Bot(`bot${roomIdx}_${i}`));
  const host = bots[0];
  await host.connect();
  const created = host.waitFor((m) => m.t === "room");
  host.send({ t: "create", pub: false, lang: "english", tt: "words", len: LEN, max: PLAYERS });
  await created;
  const code = host.code!;
  const tJoin = Date.now();
  // connect the rest in waves of 50
  for (let i = 1; i < bots.length; i += 50) {
    await Promise.all(
      bots.slice(i, i + 50).map(async (b) => {
        await b.connect();
        const joined = b.waitFor((m) => m.t === "room");
        b.send({ t: "join", code });
        await joined;
      }),
    );
  }
  const joinMs = Date.now() - tJoin;
  const ended = Promise.all(bots.map((b) => b.waitFor((m) => m.t === "end", TIMEOUT_MS)));
  const tRace = Date.now();
  host.send({ t: "start" });
  await ended;
  const raceMs = Date.now() - tRace;
  const places = new Set(bots.map((b) => b.place));
  const finished = bots.filter((b) => b.place > 0).length;
  for (const b of bots) b.ws.close(1000);
  return { joinMs, raceMs, finished, places };
}

async function main() {
  const pid = findServerPid();
  const cpu: number[] = [];
  const rss: number[] = [];
  const sampler = pid
    ? setInterval(() => {
        try {
          const [c, r] = execSync(`ps -p ${pid} -o %cpu=,rss=`, { encoding: "utf8" }).trim().split(/\s+/).map(Number);
          cpu.push(c);
          rss.push(r / 1024);
        } catch {
          /* ignore */
        }
      }, 500)
    : null;

  console.log(`race load test: ${ROOMS} room(s) x ${PLAYERS} players, ${LEN} words, ${URL_WS}${pid ? ` (server pid ${pid})` : ""}`);
  const t0 = Date.now();
  const results = await Promise.all(Array.from({ length: ROOMS }, (_, i) => runRoom(i)));
  const total = Date.now() - t0;
  if (sampler) clearInterval(sampler);
  await sleep(200);

  const lat = stats.latencies;
  const report = {
    rooms: ROOMS,
    playersPerRoom: PLAYERS,
    totalClients: ROOMS * PLAYERS,
    joinAllMs: results.map((r) => r.joinMs),
    raceDurationMs: results.map((r) => r.raceMs),
    finishedPerRoom: results.map((r) => r.finished),
    snapshotLatencyMs: { p50: pct(lat, 50), p95: pct(lat, 95), p99: pct(lat, 99), max: lat.length ? Math.max(...lat) : 0, samples: lat.length },
    messagesReceived: stats.msgs,
    bytesReceivedMB: +(stats.bytes / 1024 / 1024).toFixed(2),
    serverCpuPercent: cpu.length ? { avg: +(cpu.reduce((a, b) => a + b, 0) / cpu.length).toFixed(1), max: Math.max(...cpu) } : null,
    serverRssMB: rss.length ? { max: +Math.max(...rss).toFixed(1) } : null,
    wallMs: total,
    errors: stats.errors.slice(0, 20),
  };
  console.log(JSON.stringify(report, null, 2));

  const ok =
    stats.errors.length === 0 &&
    results.every((r) => r.finished === PLAYERS && r.places.size === PLAYERS) &&
    pct(lat, 99) < 250;
  console.log(ok ? "PASS" : "FAIL");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
