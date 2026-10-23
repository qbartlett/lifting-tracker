import type { CompletedWorkout, ProgressionConfigs } from '../types/lifting';

/** Reps a set must reach to count towards a pass. */
export const PASS_REPS = 5;

export function requiredSetsFor(defaultSetsReps: string): number {
  return defaultSetsReps === '1x5' ? 1 : 5;
}

/**
 * Linear progression: every lift whose required sets were all completed at
 * target reps gets its working weight bumped by its increment.
 */
export function applyProgression(
  configs: ProgressionConfigs,
  workout: CompletedWorkout
): { configs: ProgressionConfigs; changed: boolean } {
  const next: ProgressionConfigs = { ...configs };
  let changed = false;

  for (const we of workout.exercises) {
    const cfg = next[we.exerciseId];
    if (!cfg) continue;
    const passed = we.sets.filter((s) => s.completed && s.reps >= PASS_REPS).length;
    if (passed >= requiredSetsFor(cfg.defaultSetsReps)) {
      next[we.exerciseId] = { ...cfg, currentWeight: cfg.currentWeight + cfg.weightIncrement };
      changed = true;
    }
  }
  return { configs: next, changed };
}
