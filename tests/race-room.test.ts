import { describe, expect, it } from "vitest";
import { Room, type Conn, type RaceSummary } from "@/server/race/room";
import { RaceManager } from "@/server/race/manager";
import { COUNTDOWN_MS, PUBLIC_AUTOSTART_MS, type ServerMsg } from "@/lib/race/protocol";

let nextId = 1;
class FakeConn implements Conn {
  readonly id = nextId++;
  room: Room | null = null;
  msgs: ServerMsg[] = [];
  closed = false;
  buffered = 0;
  constructor(
    public name: string,
    public userId: string | null = null,
  ) {}
  send(d: string) {
    this.msgs.push(JSON.parse(d) as ServerMsg);
  }
  bufferedAmount() {
    return this.buffered;
  }
  close() {
    this.closed = true;
  }
  last<T extends ServerMsg["t"]>(t: T) {
    return [...this.msgs].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined;
  }
}

const TEXT = "alpha beta gamma delta";

function makeRoom(pub: boolean, onFinish?: (s: RaceSummary) => void, max = 200) {
  let k = 0;
  return new Room({ code: "ABC123", pub, lang: "english", tt: "words", len: 4, max, text: TEXT, src: null, now: 0, randomKey: () => `rk${k++}`, onFinish });
}

describe("Room state machine", () => {
  it("joins players, host starts, countdown -> racing -> finished", () => {
    let summary: RaceSummary | null = null;
    const room = makeRoom(false, (s) => (summary = s));
    const a = new FakeConn("alice", "u1");
    const b = new FakeConn("bob");
    room.join(a, 0);
    room.join(b, 10);
    expect(room.players.size).toBe(2);
    expect(room.hostPid).toBe(1);
    expect(room.requestStart(b, 20)).toBe("not_host");
    expect(room.requestStart(a, 20)).toBeNull();
    expect(room.state).toBe("countdown");
    room.tick(20 + COUNTDOWN_MS + 1);
    expect(room.state).toBe("racing");
    const start = room.startAt!;
    // progress must be server-validated
    expect(room.progress(a, 10, 2, 0, start + 2000)).toBe(true);
    expect(room.players.get(1)!.chars).toBe(10);
    // finish
    expect(room.finish(a, TEXT.length, 4, 0, 100, start + 5000)).toBe(true);
    expect(room.players.get(1)!.place).toBe(1);
    expect(room.state).toBe("racing");
    room.progress(b, 12, 2, 1, start + 5000);
    expect(room.finish(b, TEXT.length, 4, 1, 95, start + 8000)).toBe(true);
    expect(room.state).toBe("finished");
    expect(summary).not.toBeNull();
    expect(summary!.players.find((p) => p.name === "alice")!.place).toBe(1);
    // server-authoritative wpm: 22 chars in 5 s => 52.8 wpm
    expect(summary!.players.find((p) => p.name === "alice")!.wpm).toBeCloseTo(52.8, 1);
    const end = b.last("end");
    expect(end?.results.length).toBe(2);
  });

  it("clamps impossible progress jumps", () => {
    const room = makeRoom(false);
    const a = new FakeConn("a");
    room.join(a, 0);
    room.requestStart(a, 0);
    room.tick(COUNTDOWN_MS + 1);
    const start = room.startAt!;
    room.progress(a, TEXT.length, 4, 0, start + 100); // 22 chars in 0.1 s
    const p = room.players.get(1)!;
    expect(p.chars).toBeLessThan(TEXT.length);
    expect(p.suspicious).toBe(1);
    // finishing without typing through is refused
    expect(room.finish(a, 5, 1, 0, 100, start + 200)).toBe(false);
  });

  it("public rooms auto-start with 2+ players and immediately when full", () => {
    const room = makeRoom(true, undefined, 3);
    const a = new FakeConn("a");
    const b = new FakeConn("b");
    room.join(a, 0);
    expect(room.autoAt).toBeNull();
    room.join(b, 100);
    expect(room.autoAt).toBe(100 + PUBLIC_AUTOSTART_MS);
    room.tick(100 + PUBLIC_AUTOSTART_MS);
    expect(room.state).toBe("countdown");

    const full = makeRoom(true, undefined, 2);
    full.join(new FakeConn("x"), 0);
    full.join(new FakeConn("y"), 0);
    expect(full.state).toBe("countdown");
  });

  it("late joiners spectate", () => {
    const room = makeRoom(false);
    const a = new FakeConn("a");
    room.join(a, 0);
    room.requestStart(a, 0);
    room.tick(COUNTDOWN_MS + 1);
    const late = new FakeConn("late");
    const { player } = room.join(late, COUNTDOWN_MS + 5);
    expect(player).toBeNull();
    expect(room.spectators.has(late)).toBe(true);
    expect(late.last("room")?.you).toBeNull();
  });

  it("reconnect within grace keeps the same player; host passes on leave", () => {
    const room = makeRoom(false);
    const a = new FakeConn("a");
    const b = new FakeConn("b");
    room.join(a, 0);
    room.join(b, 0);
    const rk = a.last("room")!.rk!;
    room.disconnect(a, 1000);
    room.tick(1200);
    expect(room.hostPid).toBe(2); // host moved to b
    const a2 = new FakeConn("a");
    room.join(a2, 3000, rk);
    expect(room.players.size).toBe(2);
    expect(a2.last("room")!.you).toBe(1);
    // explicit leave in waiting removes the slot
    room.leave(b, 4000);
    expect(room.players.size).toBe(1);
    expect(room.hostPid).toBe(1);
  });

  it("drops disconnected waiting players after the grace period and expires empty rooms", () => {
    const room = makeRoom(false);
    const a = new FakeConn("a");
    room.join(a, 0);
    room.disconnect(a, 0);
    expect(room.tick(5000)).toBe(true);
    room.tick(11_000);
    expect(room.players.size).toBe(0);
    expect(room.tick(40_000)).toBe(false);
  });

  it("batches progress into one snapshot per tick and skips slow clients", () => {
    const room = makeRoom(false);
    const conns = Array.from({ length: 5 }, (_, i) => new FakeConn(`p${i}`));
    for (const c of conns) room.join(c, 0);
    room.requestStart(conns[0], 0);
    room.tick(COUNTDOWN_MS + 1);
    const start = room.startAt!;
    for (const c of conns) c.msgs = [];
    conns[4].buffered = 10 * 1024 * 1024 / 10; // 1 MB buffered => slow
    for (const c of conns) room.progress(c, 5, 1, 0, start + 1000);
    room.tick(start + 1100);
    const ticks = conns[0].msgs.filter((m) => m.t === "tick");
    expect(ticks.length).toBe(1);
    const tick = ticks[0] as Extract<ServerMsg, { t: "tick" }>;
    expect(tick.p!.length).toBe(5 * 4);
    expect(conns[4].msgs.filter((m) => m.t === "tick").length).toBe(0);
    expect(room.snapshotsDropped).toBeGreaterThan(0);
  });
});

describe("RaceManager", () => {
  it("quick race puts players into the same public room and rate-limits spam", () => {
    let now = 0;
    const m = new RaceManager({ now: () => now, textFor: () => ({ text: TEXT, src: null }) });
    const a = new FakeConn("a");
    const b = new FakeConn("b");
    m.connect(a);
    m.connect(b);
    m.handle(a, JSON.stringify({ t: "quick", lang: "english" }));
    m.handle(b, JSON.stringify({ t: "quick", lang: "english" }));
    expect(m.rooms.size).toBe(1);
    expect(a.room).toBe(b.room);
    // oversized message closes the connection
    m.handle(a, "x".repeat(10_000));
    expect(a.closed).toBe(true);
    // flood: most messages beyond the bucket are dropped
    const c = new FakeConn("c");
    m.connect(c);
    c.msgs = [];
    for (let i = 0; i < 100; i++) m.handle(c, JSON.stringify({ t: "ping", c: i }));
    expect(c.msgs.length).toBeLessThanOrEqual(41);
    now += 60_000;
  });

  it("join by code, unknown code errors", () => {
    const m = new RaceManager({ textFor: () => ({ text: TEXT, src: null }) });
    const a = new FakeConn("a");
    m.connect(a);
    m.handle(a, JSON.stringify({ t: "join", code: "NOPE" }));
    expect(a.last("err")?.code).toBe("room_not_found");
    m.handle(a, JSON.stringify({ t: "create", pub: false, lang: "uzbek", tt: "words", len: 10, max: 200 }));
    const code = a.last("room")!.room.code;
    const b = new FakeConn("b");
    m.connect(b);
    m.handle(b, JSON.stringify({ t: "join", code: code.toLowerCase() }));
    expect(b.last("room")?.room.code).toBe(code);
  });
});
