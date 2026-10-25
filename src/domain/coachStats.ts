import type { CompletedWorkout } from '../types/lifting';

const DAY = 86_400_000;

export interface ClientSummary {
  workoutsLast7Days: number;
  workoutsLast30Days: number;
  volumeLast30Days: number;
  lastWorkoutAt: number | null;
  /** Whole days since the last workout, or null if none. */
  daysSinceLast: number | null;
}

export function summarizeTraining(history: CompletedWorkout[], now: number): ClientSummary {
  let w7 = 0, w30 = 0, volume = 0, last: number | null = null;
  for (const w of history) {
    const age = now - w.startTime;
    if (age <= 7 * DAY) w7++;
    if (age <= 30 * DAY) {
      w30++;
      volume += w.totalVolume;
    }
    if (last === null || w.startTime > last) last = w.startTime;
  }
  return {
    workoutsLast7Days: w7,
    workoutsLast30Days: w30,
    volumeLast30Days: volume,
    lastWorkoutAt: last,
    daysSinceLast: last === null ? null : Math.max(0, Math.floor((now - last) / DAY)),
  };
}

export function describeLastWorkout(lastWorkoutAt: number | null, now: number): string {
  if (lastWorkoutAt === null) return 'No workouts yet';
  const days = Math.max(0, Math.floor((now - lastWorkoutAt) / DAY));
  if (days === 0) return 'Trained today';
  if (days === 1) return 'Trained yesterday';
  return `Last trained ${days} days ago`;
}
