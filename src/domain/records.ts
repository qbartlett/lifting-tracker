import type { CompletedWorkout, PersonalRecord, PersonalRecords } from '../types/lifting';

/** Epley estimate, rounded. Kept identical to the original app's PR maths. */
export const estimate1RM = (weight: number, reps: number): number =>
  Math.round(weight * (1 + reps / 30));

const isoDay = (ms: number): string => new Date(ms).toISOString().split('T')[0];

/** Mutates `records`; returns the ids of exercises that set a new weight / 1RM record. */
function applyInPlace(records: PersonalRecords, workout: CompletedWorkout): Set<string> {
  const broken = new Set<string>();
  const date = isoDay(workout.startTime);

  for (const we of workout.exercises) {
    for (const s of we.sets) {
      if (!s.completed || s.weight <= 0 || s.reps <= 0) continue;
      const est = estimate1RM(s.weight, s.reps);
      const volume = s.weight * s.reps;
      const existing = records[we.exerciseId];

      if (!existing) {
        records[we.exerciseId] = {
          exerciseId: we.exerciseId,
          exerciseName: we.exercise.name,
          maxWeight: s.weight,
          maxRepsAtMaxWeight: s.reps,
          estimated1RM: est,
          bestVolumeSet: volume,
          achievedDate: date,
        };
        broken.add(we.exerciseId);
        continue;
      }
      if (s.weight > existing.maxWeight) {
        existing.maxWeight = s.weight;
        existing.maxRepsAtMaxWeight = s.reps;
        existing.achievedDate = date;
        broken.add(we.exerciseId);
      }
      if (est > existing.estimated1RM) {
        existing.estimated1RM = est;
        broken.add(we.exerciseId);
      }
      if (volume > existing.bestVolumeSet) existing.bestVolumeSet = volume;
    }
  }
  return broken;
}

/** Records implied by a full history (newest-first, as stored). */
export function computePersonalRecords(history: CompletedWorkout[]): PersonalRecords {
  const records: PersonalRecords = {};
  for (let i = history.length - 1; i >= 0; i--) applyInPlace(records, history[i]);
  return records;
}

/**
 * Applies one workout on top of existing records without mutating them.
 * `newRecordCount` = number of exercises in the workout that set a record.
 */
export function applyWorkoutToRecords(
  records: PersonalRecords,
  workout: CompletedWorkout
): { records: PersonalRecords; newRecordCount: number } {
  const next: PersonalRecords = {};
  for (const [id, r] of Object.entries(records)) next[id] = { ...r } as PersonalRecord;
  const broken = applyInPlace(next, workout);
  return { records: next, newRecordCount: broken.size };
}
