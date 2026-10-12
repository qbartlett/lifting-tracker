import type { CompletedWorkout, Exercise, WorkoutSet } from '../types/lifting';

export const squat: Exercise = {
  id: 'barbell-back-squat',
  name: 'Squat',
  category: 'Quads',
  equipment: 'Barbell',
};

export function set(weight: number, reps: number, completed = true): WorkoutSet {
  return { id: `s-${weight}-${reps}`, type: 'normal', weight, reps, completed };
}

export function workout(
  id: string,
  startTime: number,
  sets: WorkoutSet[],
  exercise: Exercise = squat
): CompletedWorkout {
  return {
    id,
    name: id,
    startTime,
    endTime: startTime + 3600_000,
    durationSeconds: 3600,
    totalVolume: 0,
    totalSets: sets.length,
    exercises: [{ id: `we-${id}`, exerciseId: exercise.id, exercise, restTimerSeconds: 120, sets }],
  };
}
