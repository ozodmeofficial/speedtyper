/**
 * In-memory sliding-window rate limiter. The app runs as a single process, so
 * memory is the right place; limiters are registered on globalThis so every
 * Next.js route bundle shares the same counters.
 */
interface Entry {
  hits: number[];
}

export class RateLimiter {
  private map = new Map<string, Entry>();
  constructor(
    readonly limit: number,
    readonly windowMs: number,
  ) {}

  /** Record a hit. Returns seconds to wait when over the limit, else 0. */
  hit(key: string, now = Date.now()): number {
    const e = this.map.get(key) ?? { hits: [] };
    const from = now - this.windowMs;
    while (e.hits.length && e.hits[0] <= from) e.hits.shift();
    if (e.hits.length >= this.limit) {
      this.map.set(key, e);
      return Math.max(1, Math.ceil((e.hits[0] + this.windowMs - now) / 1000));
    }
    e.hits.push(now);
    this.map.set(key, e);
    if (this.map.size > 50_000) this.sweep(now);
    return 0;
  }

  /** Check without recording. */
  blocked(key: string, now = Date.now()): number {
    const e = this.map.get(key);
    if (!e) return 0;
    const from = now - this.windowMs;
    const recent = e.hits.filter((h) => h > from);
    if (recent.length >= this.limit) return Math.max(1, Math.ceil((recent[0] + this.windowMs - now) / 1000));
    return 0;
  }

  reset(key: string) {
    this.map.delete(key);
  }

  sweep(now = Date.now()) {
    const from = now - this.windowMs;
    for (const [k, e] of this.map) if (!e.hits.length || e.hits[e.hits.length - 1] <= from) this.map.delete(k);
  }
}

const g = globalThis as unknown as { __stLimiters?: Map<string, RateLimiter> };

export function limiter(name: string, limit: number, windowMs: number): RateLimiter {
  const reg = (g.__stLimiters ??= new Map());
  let l = reg.get(name);
  if (!l) {
    l = new RateLimiter(limit, windowMs);
    reg.set(name, l);
  }
  return l;
}
