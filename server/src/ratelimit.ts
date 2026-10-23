/** Fixed-window in-memory limiter. Fine for one server process; use Redis if you scale out. */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private max: number, private windowMs: number, private now: () => number = Date.now) {}

  /** Records an attempt. Returns seconds to wait if over the limit, else 0. */
  hit(key: string): number {
    const t = this.now();
    if (this.hits.size > 10_000) this.prune(t);
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= t) {
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      return 0;
    }
    entry.count++;
    return entry.count > this.max ? Math.ceil((entry.resetAt - t) / 1000) : 0;
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private prune(t: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
  }
}
