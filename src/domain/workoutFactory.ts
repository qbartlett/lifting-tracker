import type {
  ActiveWorkout,
  Exercise,
  ProgressionConfigs,
  RoutineTemplate,
  WorkoutExercise,
} from '../types/lifting';

const FALLBACK_ROUTINE_WEIGHT = 135;
const FALLBACK_ADHOC_WEIGHT = 95;

export function createEmptyWorkout(now: number, name = 'Freestyle Workout'): ActiveWorkout {
  return { id: `workout-${now}`, name, startTime: now, exercises: [] };
}

export function createRoutineWorkout(
  routine: RoutineTemplate,
  exercises: Exercise[],
  configs: ProgressionConfigs,
  now: number
): ActiveWorkout {
  return {
    id: `workout-${now}`,
    name: routine.name,
    routineId: routine.id,
    startTime: now,
    exercises: routine.exercises.map((item, idx) => {
      const ex: Exercise = exercises.find((e) => e.id === item.exerciseId) ?? {
        id: item.exerciseId,
        name: 'Exercise',
        category: 'Chest',
        equipment: 'Barbell',
      };
      const weight = configs[item.exerciseId]?.currentWeight || FALLBACK_ROUTINE_WEIGHT;

      return {
        id: `we-${now}-${idx}`,
        exerciseId: item.exerciseId,
        exercise: ex,
        restTimerSeconds: item.restSeconds || 120,
        sets: Array.from({ length: item.targetSets }, (_, sIdx) => ({
          id: `set-${now}-${idx}-${sIdx}`,
          type: 'normal' as const,
          weight,
          reps: item.targetReps,
          completed: false,
        })),
      };
    }),
  };
}

export function createWorkoutExercise(
  exercise: Exercise,
  configs: ProgressionConfigs,
  defaultRestSeconds: number,
  now: number
): WorkoutExercise {
  return {
    id: `we-${now}-${Math.random().toString(36).slice(2, 6)}`,
    exerciseId: exercise.id,
    exercise,
    restTimerSeconds: defaultRestSeconds || 120,
    sets: [
      {
        id: `s-${now}-1`,
        type: 'normal',
        weight: configs[exercise.id]?.currentWeight || FALLBACK_ADHOC_WEIGHT,
        reps: 5,
        completed: false,
      },
    ],
  };
}

/** Adds an exercise, starting a "Quick Workout" if none is active. */
export function addExerciseToWorkout(
  current: ActiveWorkout | null,
  exercise: Exercise,
  configs: ProgressionConfigs,
  defaultRestSeconds: number,
  now: number
): ActiveWorkout {
  const base = current ?? createEmptyWorkout(now, 'Quick Workout');
  return {
    ...base,
    exercises: [
      ...base.exercises,
      createWorkoutExercise(exercise, configs, defaultRestSeconds, now),
    ],
  };
}
