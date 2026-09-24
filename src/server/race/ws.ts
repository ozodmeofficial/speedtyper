import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { RaceManager } from "./manager";
import type { Conn, Room } from "./room";
import { raceText } from "./text";
import { saveRace } from "./persist";
import { MAX_MESSAGE_BYTES } from "../../lib/race/protocol";
import { parseCookies, resolveSession, SESSION_COOKIE } from "../auth/session";
import { limiter } from "../ratelimit";

const HEARTBEAT_MS = 15_000;
const MAX_CONN_PER_IP = Number(process.env.WS_MAX_CONN_PER_IP ?? 20);

let nextConnId = 1;

class WsConn implements Conn {
  readonly id = nextConnId++;
  room: Room | null = null;
  alive = true;
  constructor(
    readonly ws: WebSocket,
    public userId: string | null,
    public name: string,
    readonly ip: string,
  ) {}
  send(data: string) {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(data);
  }
  bufferedAmount() {
    return this.ws.bufferedAmount;
  }
  close(code?: number, reason?: string) {
    try {
      this.ws.close(code, reason);
    } catch {
      this.ws.terminate();
    }
  }
}

function guestName(): string {
  return `guest${Math.floor(1000 + Math.random() * 9000)}`;
}

export interface RaceServer {
  manager: RaceManager;
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, ip: string): void;
  close(): void;
}

function allowedOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return process.env.NODE_ENV !== "production";
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    return false;
  }
  const allowed = new Set<string>();
  if (host) allowed.add(host);
  for (const u of [process.env.APP_URL, ...(process.env.WS_ALLOWED_ORIGINS ?? "").split(",")]) {
    if (!u) continue;
    try {
      allowed.add(new URL(u.trim()).host);
      const h = new URL(u.trim()).host;
      if (!h.startsWith("www.")) allowed.add(`www.${h}`);
    } catch {
      /* ignore */
    }
  }
  return allowed.has(o.host);
}

export function createRaceServer(): RaceServer {
  const manager = new RaceManager({
    textFor: raceText,
    onFinish: (s) => {
      saveRace(s).catch((e) => console.error("[race] save failed", e));
    },
  });
  manager.start();
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: false });
  const perIp = new Map<string, number>();
  const upgradeLimiter = limiter("ws-upgrade", 60, 60_000);

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      const c = (ws as WebSocket & { conn?: WsConn }).conn;
      if (!c) continue;
      if (!c.alive) {
        ws.terminate();
        continue;
      }
      c.alive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  async function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, ip: string) {
    const reject = (code: number, msg: string) => {
      socket.write(`HTTP/1.1 ${code} ${msg}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      socket.destroy();
    };
    if (!allowedOrigin(req.headers.origin, req.headers.host)) return reject(403, "Forbidden");
    const loadTest = process.env.RACE_LOADTEST === "1" && (ip === "127.0.0.1" || ip === "::1");
    if (!loadTest) {
      if (upgradeLimiter.hit(ip) > 0) return reject(429, "Too Many Requests");
      if ((perIp.get(ip) ?? 0) >= MAX_CONN_PER_IP) return reject(429, "Too Many Requests");
    }
    let userId: string | null = null;
    let name = guestName();
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) {
      const s = await resolveSession(token, false).catch(() => null);
      if (s) {
        userId = s.user.id;
        name = s.user.username;
      }
    }
    if (socket.destroyed) return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      const conn = new WsConn(ws, userId, name, ip);
      (ws as WebSocket & { conn?: WsConn }).conn = conn;
      perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
      ws.on("pong", () => (conn.alive = true));
      ws.on("message", (data, isBinary) => {
        conn.alive = true;
        if (isBinary) return conn.close(1003, "text only");
        manager.handle(conn, data.toString());
      });
      ws.on("close", () => {
        const n = (perIp.get(ip) ?? 1) - 1;
        if (n <= 0) perIp.delete(ip);
        else perIp.set(ip, n);
        manager.disconnect(conn);
      });
      ws.on("error", () => ws.terminate());
      manager.connect(conn);
    });
  }

  return {
    manager,
    handleUpgrade: (req, socket, head, ip) => void handleUpgrade(req, socket, head, ip),
    close() {
      clearInterval(heartbeat);
      manager.stop();
      for (const ws of wss.clients) ws.close(1001, "server shutdown");
      wss.close();
    },
  };
}
