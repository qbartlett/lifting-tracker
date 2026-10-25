import { describe, expect, it } from 'bun:test';
import { describeLastWorkout, summarizeTraining } from './coachStats';
import { aWorkout } from '../sync/testUtils';

const DAY = 86_400_000;
const now = 100 * DAY;
const w = (id: string, daysAgo: number, volume: number) => ({ ...aWorkout(id, now - daysAgo * DAY), totalVolume: volume });

describe('summarizeTraining', () => {
  it('counts recent workouts and volume', () => {
    const s = summarizeTraining([w('a', 1, 1000), w('b', 6, 2000), w('c', 20, 3000), w('d', 45, 9999)], now);
    expect(s).toMatchObject({ workoutsLast7Days: 2, workoutsLast30Days: 3, volumeLast30Days: 6000, daysSinceLast: 1 });
  });
  it('handles no history', () => {
    expect(summarizeTraining([], now)).toEqual({
      workoutsLast7Days: 0, workoutsLast30Days: 0, volumeLast30Days: 0, lastWorkoutAt: null, daysSinceLast: null,
    });
  });
});

describe('describeLastWorkout', () => {
  it('words it plainly', () => {
    expect(describeLastWorkout(null, now)).toBe('No workouts yet');
    expect(describeLastWorkout(now - 1000, now)).toBe('Trained today');
    expect(describeLastWorkout(now - DAY, now)).toBe('Trained yesterday');
    expect(describeLastWorkout(now - 5 * DAY, now)).toBe('Last trained 5 days ago');
  });
});
