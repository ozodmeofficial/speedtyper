import { describe, expect, it } from "vitest";
import { LOCAL_TUNING, ProgressSmoother, REMOTE_TUNING, rankMargin, rankStable, type RankInput } from "@/lib/race/smooth";

/** small deterministic PRNG so failures are reproducible */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("ProgressSmoother", () => {
  it("rendered values never decrease across jittery, duplicated and out-of-order snapshots", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rand = rng(seed);
      const sm = new ProgressSmoother();
      sm.reset(0);
      const pids = [1, 2, 3, 4, 5, 6];
      sm.tune(1, LOCAL_TUNING);
      const truth = new Map(pids.map((p) => [p, 0]));
      const lastShown = new Map(pids.map((p) => [p, 0]));
      // produce snapshots, then deliver them shuffled / duplicated / with jitter
      const snaps: { seq: number; vals: [number, number][] }[] = [];
      for (let seq = 1; seq <= 150; seq++) {
        const vals: [number, number][] = [];
        for (const pid of pids) {
          const v = Math.min(1, (truth.get(pid) ?? 0) + rand() * 0.015);
          truth.set(pid, v);
          // clients may report less than before (typo / backspace / stale)
          vals.push([pid, Math.max(0, v - (rand() < 0.3 ? rand() * 0.2 : 0))]);
        }
        snaps.push({ seq, vals });
      }
      const delivered = snaps.slice();
      for (let i = 0; i < delivered.length; i++) {
        if (rand() < 0.25) {
          const j = Math.min(delivered.length - 1, i + 1 + Math.floor(rand() * 4));
          [delivered[i], delivered[j]] = [delivered[j], delivered[i]];
        }
        if (rand() < 0.1) delivered.splice(i, 0, delivered[Math.max(0, i - 3)]);
      }
      let applied = 0;
      for (const snap of delivered) {
        if (sm.accept(snap.seq)) {
          applied++;
          for (const [pid, v] of snap.vals) sm.set(pid, v);
        }
        // own lane also gets optimistic local values in between, with jitter
        sm.set(1, (truth.get(1) ?? 0) - rand() * 0.05);
        // render a few frames between snapshots (random frame times)
        for (let f = 0; f < 1 + Math.floor(rand() * 20); f++) {
          sm.step(rand() * 40);
          for (const pid of pids) {
            const v = sm.shown(pid);
            expect(v).toBeGreaterThanOrEqual(lastShown.get(pid)!);
            expect(v).toBeLessThanOrEqual(sm.target(pid) + 1e-12);
            lastShown.set(pid, v);
          }
        }
      }
      expect(applied).toBeGreaterThan(20);
      expect(applied).toBeLessThan(delivered.length);
    }
  });

  it("discards stale sequence numbers", () => {
    const sm = new ProgressSmoother();
    sm.reset(10);
    expect(sm.accept(10)).toBe(false);
    expect(sm.accept(9)).toBe(false);
    expect(sm.accept(11)).toBe(true);
    expect(sm.accept(11)).toBe(false);
    expect(sm.accept(Number.NaN)).toBe(false);
  });

  it("eases toward big jumps instead of teleporting, and converges", () => {
    const sm = new ProgressSmoother();
    sm.set(7, 0.1, true);
    expect(sm.shown(7)).toBeCloseTo(0.1);
    sm.set(7, 0.9);
    sm.step(16);
    const perFrame = sm.shown(7) - 0.1;
    expect(perFrame).toBeGreaterThan(0);
    expect(perFrame).toBeLessThanOrEqual((REMOTE_TUNING.maxSpeed * 16) / 1000 + 1e-9);
    for (let i = 0; i < 200; i++) sm.step(16);
    expect(sm.shown(7)).toBeCloseTo(0.9, 3);
  });

  it("only an explicit reset lowers values", () => {
    const sm = new ProgressSmoother();
    sm.set(1, 0.5, true);
    sm.set(1, 0.2);
    expect(sm.target(1)).toBe(0.5);
    sm.reset(0);
    sm.set(1, 0.2, true);
    expect(sm.shown(1)).toBeCloseTo(0.2);
  });
});

describe("rankStable (hysteresis)", () => {
  const margin = rankMargin(150); // 2 chars of 150 => 1.33 %

  it("jitter within the margin never reorders players", () => {
    const rand = rng(99);
    let order = rankStable([], [1, 2, 3, 4].map((pid) => ({ pid, progress: 0, place: 0 })), margin);
    let changes = 0;
    const base = [0.5, 0.5, 0.497, 0.503]; // spread + jitter always < margin
    for (let i = 0; i < 500; i++) {
      const inputs: RankInput[] = base.map((b, k) => ({ pid: k + 1, progress: b + (rand() - 0.5) * margin * 0.4, place: 0 }));
      const next = rankStable(order, inputs, margin);
      if (next.join() !== order.join()) changes++;
      order = next;
    }
    expect(changes).toBe(0);
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it("clear leads overtake; finishers rank by finishing place", () => {
    let order = rankStable([], [1, 2, 3].map((pid) => ({ pid, progress: 0, place: 0 })), margin);
    order = rankStable(order, [
      { pid: 1, progress: 0.3, place: 0 },
      { pid: 2, progress: 0.4, place: 0 },
      { pid: 3, progress: 0.8, place: 0 },
    ], margin);
    expect(order).toEqual([3, 2, 1]);
    order = rankStable(order, [
      { pid: 1, progress: 1, place: 1 },
      { pid: 2, progress: 0.45, place: 0 },
      { pid: 3, progress: 1, place: 2 },
    ], margin);
    expect(order).toEqual([1, 3, 2]);
  });

  it("appends new players in join order and handles 200 players", () => {
    const rand = rng(5);
    const players = Array.from({ length: 200 }, (_, i) => ({ pid: 200 - i, progress: rand(), place: 0 }));
    const order = rankStable([], players, margin);
    expect(new Set(order).size).toBe(200);
    // adjacent pairs are either correctly ordered or within the margin
    const byPid = new Map(players.map((p) => [p.pid, p.progress]));
    for (let i = 0; i + 1 < order.length; i++) expect(byPid.get(order[i + 1])! - byPid.get(order[i])!).toBeLessThanOrEqual(margin);
  });
});
