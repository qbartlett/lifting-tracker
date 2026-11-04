import type { Exercise, RoutineTemplate } from '../types/lifting';
import type { ProgramDraft, ProgramExercise, ProgramSession } from '../types/program';

export const newId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const emptyDraft = (): ProgramDraft => ({
  name: '',
  notes: null,
  weeks: 4,
  sessions: [{ id: newId(), day: 0, name: 'Day 1', exercises: [] }],
});

export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.floor(n)));

export function exerciseToProgram(ex: Exercise, defaults: { sets?: number; reps?: number; restSeconds?: number } = {}): ProgramExercise {
  return {
    exerciseId: ex.id,
    name: ex.name,
    category: ex.category,
    equipment: ex.equipment,
    sets: defaults.sets ?? 3,
    reps: defaults.reps ?? 8,
    restSeconds: defaults.restSeconds ?? 120,
    notes: null,
  };
}

/** A routine's exercises become program exercises (names come from the library; unknown ids are skipped). */
export function routineToProgramExercises(routine: RoutineTemplate, library: Exercise[]): ProgramExercise[] {
  const out: ProgramExercise[] = [];
  for (const item of routine.exercises) {
    const ex = library.find((e) => e.id === item.exerciseId);
    if (!ex) continue;
    out.push(exerciseToProgram(ex, {
      sets: clamp(item.targetSets, 1, 20),
      reps: clamp(item.targetReps, 1, 100),
      restSeconds: clamp(item.restSeconds || 120, 0, 1800),
    }));
  }
  return out;
}

/** The first problem that would make the server refuse this program, in plain words. */
export function validateDraft(d: ProgramDraft): string | null {
  if (d.name.trim().length < 1) return 'Give the program a name.';
  if (d.name.trim().length > 100) return 'The name is too long (100 characters max).';
  if (!Number.isInteger(d.weeks) || d.weeks < 1 || d.weeks > 52) return 'Weeks must be between 1 and 52.';
  if (d.sessions.length < 1) return 'Add at least one session.';
  if (d.sessions.length > 21) return 'A week can have at most 21 sessions.';
  for (const [i, s] of d.sessions.entries()) {
    if (s.name.trim().length < 1) return `Name session ${i + 1}.`;
    if (s.exercises.length < 1) return `"${s.name.trim()}" needs at least one exercise.`;
    if (s.exercises.length > 30) return `"${s.name.trim()}" has too many exercises (30 max).`;
  }
  return null;
}

/** Trims text so what is sent matches what was checked. */
export function cleanDraft(d: ProgramDraft): ProgramDraft {
  return {
    ...d,
    name: d.name.trim(),
    notes: d.notes?.trim() || null,
    sessions: d.sessions.map((s): ProgramSession => ({
      ...s,
      name: s.name.trim(),
      exercises: s.exercises.map((e) => ({ ...e, notes: e.notes?.trim() || null })),
    })),
  };
}
