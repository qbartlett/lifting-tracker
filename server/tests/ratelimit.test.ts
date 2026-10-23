import { describe, expect, it } from 'bun:test';
import { RateLimiter } from '../src/ratelimit';

describe('RateLimiter', () => {
  it('allows up to max hits per window, then blocks until it resets', () => {
    let now = 0;
    const rl = new RateLimiter(3, 1000, () => now);
    expect([rl.hit('k'), rl.hit('k'), rl.hit('k')]).toEqual([0, 0, 0]);
    expect(rl.hit('k')).toBeGreaterThan(0);
    expect(rl.hit('other')).toBe(0);
    now = 1001;
    expect(rl.hit('k')).toBe(0);
  });

  it('reset clears a key', () => {
    const rl = new RateLimiter(1, 1000, () => 0);
    rl.hit('k'); expect(rl.hit('k')).toBeGreaterThan(0);
    rl.reset('k'); expect(rl.hit('k')).toBe(0);
  });
});
