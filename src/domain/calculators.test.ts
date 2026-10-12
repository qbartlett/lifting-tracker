import { describe, expect, it } from 'bun:test';
import { oneRepMax } from './oneRepMax';
import { calculatePlates } from './plateCalculator';

describe('oneRepMax', () => {
  it('returns the weight for a single and 0 for invalid input', () => {
    expect(oneRepMax.estimate1RM(300, 1)).toBe(300);
    expect(oneRepMax.estimate1RM(0, 5)).toBe(0);
    expect(oneRepMax.estimate1RM(100, 0)).toBe(0);
  });
  it('averages Epley and Brzycki', () => {
    expect(oneRepMax.epley(200, 5)).toBe(233);
    expect(oneRepMax.brzycki(200, 5)).toBe(225);
    expect(oneRepMax.estimate1RM(200, 5)).toBe(229);
  });
  it('builds a rep table that starts at 100%', () => {
    const t = oneRepMax.generateRepTable(300);
    expect(t[0]).toEqual({ reps: 1, percentage: 100, estimatedWeight: 300 });
  });
});

describe('calculatePlates', () => {
  it('loads 225 lbs as two 45s per side', () => {
    const r = calculatePlates(225, 45, 'lbs');
    expect(r.platesPerSide).toEqual([{ weight: 45, countPerSide: 2, color: '#2563eb' }]);
    expect(r.remainder).toBe(0);
  });
  it('returns just the bar at or below bar weight', () => {
    expect(calculatePlates(40, 45, 'lbs').platesPerSide).toEqual([]);
  });
  it('reports the remainder it cannot load', () => {
    const r = calculatePlates(227, 45, 'lbs');
    expect(r.actualTotalWeight).toBe(225);
    expect(r.remainder).toBe(2);
  });
  it('uses metric plates for kg', () => {
    const r = calculatePlates(100, 20, 'kg');
    expect(r.platesPerSide.map((p) => p.weight)).toEqual([25, 15]);
  });
});
