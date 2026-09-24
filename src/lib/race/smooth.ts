/**
 * Client-side race progress smoothing and stable ranking (pure, framework-free).
 *
 * Invariants:
 *  - a player's target progress only ever grows within a round (max of every
 *    value seen); the shown value eases toward the target and never overshoots,
 *    so the rendered progress is monotonic;
 *  - snapshots carry a sequence number and stale / reordered ones are ignored;
 *  - only `reset()` (a new round from the server) may lower values.
 */

export interface LaneTuning {
  /** easing time constant (ms) — roughly the time to cover 63% of the gap */
  tau: number;
  /** max speed in progress units (0..1) per second — no teleporting */
  maxSpeed: number;
}

/** remote players: snapshots arrive at ~5 Hz, ease over about one interval */
export const REMOTE_TUNING: LaneTuning = { tau: 220, maxSpeed: 1.2 };
/** your own lane follows local typing almost immediately */
export const LOCAL_TUNING: LaneTuning = { tau: 60, maxSpeed: 4 };

interface Entry {
  target: number;
  shown: number;
  tune: LaneTuning;
}

const clamp01 = (v: number) => (Number.isFinite(v) ? (v < 0 ? 0 : v > 1 ? 1 : v) : 0);

export class ProgressSmoother {
  private entries = new Map<number, Entry>();
  private seq = -Infinity;

  /** Authoritative reset (new round / new room). Forgets everything. */
  reset(seq = -Infinity) {
    this.entries.clear();
    this.seq = seq;
  }

  get lastSeq(): number {
    return this.seq;
  }

  /** Returns true when a snapshot with this sequence number should be applied. */
  accept(seq: number): boolean {
    if (!Number.isFinite(seq) || seq <= this.seq) return false;
    this.seq = seq;
    return true;
  }

  /**
   * Raise a player's target. Lower values are ignored (monotonic).
   * `snap` shows the value immediately when the player is new (initial state),
   * so a page load mid-race doesn't animate everybody from zero.
   */
  set(pid: number, value: number, snap = false) {
    const v = clamp01(value);
    const e = this.entries.get(pid);
    if (!e) {
      this.entries.set(pid, { target: v, shown: snap ? v : 0, tune: REMOTE_TUNING });
      return;
    }
    if (v > e.target) e.target = v;
    if (snap && e.shown < e.target && e.shown === 0) e.shown = e.target;
  }

  tune(pid: number, tune: LaneTuning) {
    const e = this.entries.get(pid);
    if (e) e.tune = tune;
    else this.entries.set(pid, { target: 0, shown: 0, tune });
  }

  remove(pid: number) {
    this.entries.delete(pid);
  }

  has(pid: number) {
    return this.entries.has(pid);
  }

  /** latest (target) progress, 0..1 */
  target(pid: number): number {
    return this.entries.get(pid)?.target ?? 0;
  }

  /** rendered progress, 0..1 */
  shown(pid: number): number {
    return this.entries.get(pid)?.shown ?? 0;
  }

  /** Advance the animation by dt milliseconds. Returns true while anything is still moving. */
  step(dtMs: number): boolean {
    const dt = Math.max(0, Math.min(dtMs, 250));
    let moving = false;
    for (const e of this.entries.values()) {
      const gap = e.target - e.shown;
      if (gap <= 0) continue;
      if (gap < 1e-4) {
        e.shown = e.target;
        continue;
      }
      const ease = gap * (1 - Math.exp(-dt / e.tune.tau));
      const cap = (e.tune.maxSpeed * dt) / 1000;
      e.shown = Math.min(e.target, e.shown + Math.min(ease, cap));
      moving = true;
    }
    return moving;
  }
}

export interface RankInput {
  pid: number;
  /** 0..1 (latest target, not the animated value) */
  progress: number;
  /** finishing place, 0 while racing */
  place: number;
}

/** a beats b outright (b must not stay in front of a) */
function beats(a: RankInput, b: RankInput, margin: number): boolean {
  if (a.place > 0) return b.place === 0 || a.place < b.place;
  if (b.place > 0) return false;
  return a.progress > b.progress + margin;
}

/**
 * Stable ranking with hysteresis: starts from the previous order (new players
 * are appended in join order) and only swaps neighbours when the one behind is
 * ahead by more than `margin` (or has finished earlier). Jitter smaller than
 * the margin never changes the order.
 */
export function rankStable(prev: readonly number[], players: readonly RankInput[], margin: number): number[] {
  const byPid = new Map(players.map((p) => [p.pid, p]));
  const seen = new Set<number>();
  const order: RankInput[] = [];
  for (const pid of prev) {
    const p = byPid.get(pid);
    if (p && !seen.has(pid)) {
      order.push(p);
      seen.add(pid);
    }
  }
  const fresh = players.filter((p) => !seen.has(p.pid)).sort((a, b) => a.pid - b.pid);
  for (const p of fresh) {
    // new players go after everyone they don't beat
    order.push(p);
  }
  // adjacent-swap passes; each swap removes one inversion, so this terminates
  for (let pass = 0; pass < order.length; pass++) {
    let swapped = false;
    for (let i = 0; i + 1 < order.length; i++) {
      if (beats(order[i + 1], order[i], margin)) {
        const t = order[i];
        order[i] = order[i + 1];
        order[i + 1] = t;
        swapped = true;
      }
    }
    if (!swapped) break;
  }
  return order.map((p) => p.pid);
}

/** Hysteresis margin as a fraction of the text: 2 chars or 1 %, whichever is larger. */
export function rankMargin(textLength: number): number {
  if (textLength <= 0) return 0.01;
  return Math.max(2 / textLength, 0.01);
}
