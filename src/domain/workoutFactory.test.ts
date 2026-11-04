import { describe, expect, it } from 'bun:test';
import { addExerciseToWorkout, createEmptyWorkout, createProgramWorkout, createRoutineWorkout } from './workoutFactory';
import { squat } from './testUtils';
import type { ProgressionConfigs, RoutineTemplate } from '../types/lifting';

const configs = {
  'barbell-back-squat': {
    exerciseId: 'barbell-back-squat', name: 'Squat', startingWeight: 145,
    weightIncrement: 5, defaultSetsReps: '5x5', currentWeight: 200,
  },
} as ProgressionConfigs;

const routine: RoutineTemplate = {
  id: 'r1', name: 'Day A', description: '', targetSplit: 'x',
  exercises: [
    { exerciseId: 'barbell-back-squat', targetSets: 5, targetReps: 5, restSeconds: 180 },
    { exerciseId: 'unknown-lift', targetSets: 3, targetReps: 8, restSeconds: 0 },
  ],
};

describe('workoutFactory', () => {
  it('creates an empty workout', () => {
    expect(createEmptyWorkout(1000)).toEqual({
      id: 'workout-1000', name: 'Freestyle Workout', startTime: 1000, exercises: [],
    });
  });

  it('builds a routine workout using progression weights and fallbacks', () => {
    const w = createRoutineWorkout(routine, [squat], configs, 1000);
    expect(w.routineId).toBe('r1');
    expect(w.exercises[0].sets).toHaveLength(5);
    expect(w.exercises[0].sets[0].weight).toBe(200);
    expect(w.exercises[0].restTimerSeconds).toBe(180);
    expect(w.exercises[1].exercise.name).toBe('Exercise'); // not in library
    expect(w.exercises[1].sets[0].weight).toBe(135); // no progression config
    expect(w.exercises[1].restTimerSeconds).toBe(120); // 0 -> default
  });

  it('starts a Quick Workout when adding with nothing active', () => {
    const w = addExerciseToWorkout(null, squat, configs, 90, 2000);
    expect(w.name).toBe('Quick Workout');
    expect(w.exercises).toHaveLength(1);
    expect(w.exercises[0].restTimerSeconds).toBe(90);
    expect(w.exercises[0].sets[0].weight).toBe(200);
  });

  it('appends to an active workout without mutating it', () => {
    const active = createEmptyWorkout(1);
    const w = addExerciseToWorkout(active, squat, {}, 120, 2);
    expect(w.exercises).toHaveLength(1);
    expect(active.exercises).toHaveLength(0);
    expect(w.exercises[0].sets[0].weight).toBe(95);
  });

  it('starts a program session with the coach\'s exercise details and the client\'s own weights', () => {
    const session = {
      id: 's1', day: 0, name: 'Push',
      exercises: [
        { exerciseId: 'barbell-back-squat', name: 'Squat', category: 'Quads', equipment: 'Barbell', sets: 4, reps: 6, restSeconds: 150, notes: 'Pause at the bottom' },
        { exerciseId: 'coach-custom', name: 'Landmine Press', category: 'Shoulders', equipment: 'Other', sets: 3, reps: 10, restSeconds: 0, notes: null },
      ],
    };
    const ref = { assignmentId: 'a1', sessionId: 's1', week: 2 };
    const w = createProgramWorkout(session, ref, [squat], configs, 1000);
    expect(w.programRef).toEqual(ref);
    expect(w.name).toBe('Push');
    expect(w.exercises[0].sets).toHaveLength(4);
    expect(w.exercises[0].sets[0]).toMatchObject({ weight: 200, reps: 6, completed: false });
    expect(w.exercises[0].notes).toBe('Pause at the bottom');
    expect(w.exercises[0].restTimerSeconds).toBe(150);
    // An exercise this device has never seen is built from the coach's snapshot.
    expect(w.exercises[1].exercise).toMatchObject({ id: 'coach-custom', name: 'Landmine Press', category: 'Shoulders' });
    expect(w.exercises[1].restTimerSeconds).toBe(120);
    expect(w.exercises[1].notes).toBeUndefined();
  });
});
