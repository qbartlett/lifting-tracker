import { describe, expect, it } from 'bun:test';
import { cleanDraft, clamp, emptyDraft, exerciseToProgram, routineToProgramExercises, validateDraft } from './programDraft';
import { squat } from './testUtils';
import type { RoutineTemplate } from '../types/lifting';

const routine: RoutineTemplate = {
  id: 'r', name: 'A', description: '', targetSplit: '',
  exercises: [
    { exerciseId: 'barbell-back-squat', targetSets: 5, targetReps: 5, restSeconds: 180 },
    { exerciseId: 'gone', targetSets: 3, targetReps: 8, restSeconds: 90 },
    { exerciseId: 'barbell-back-squat', targetSets: 99, targetReps: 0, restSeconds: 0 },
  ],
};

describe('program drafts', () => {
  it('starts as a valid-looking empty plan that still needs exercises', () => {
    const d = emptyDraft();
    expect(d.sessions).toHaveLength(1);
    expect(validateDraft(d)).toBe('Give the program a name.');
    d.name = 'Block';
    expect(validateDraft(d)).toContain('needs at least one exercise');
    d.sessions[0].exercises.push(exerciseToProgram(squat));
    expect(validateDraft(d)).toBeNull();
  });

  it('converts a routine, skipping exercises the library does not know and clamping numbers', () => {
    const list = routineToProgramExercises(routine, [squat]);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ name: 'Squat', category: 'Quads', equipment: 'Barbell', sets: 5, reps: 5, restSeconds: 180 });
    expect(list[1]).toMatchObject({ sets: 20, reps: 1, restSeconds: 120 });
  });

  it('flags out-of-range weeks and session counts', () => {
    const d = emptyDraft();
    d.name = 'x';
    d.sessions[0].exercises.push(exerciseToProgram(squat));
    expect(validateDraft({ ...d, weeks: 0 })).toContain('Weeks');
    expect(validateDraft({ ...d, weeks: 53 })).toContain('Weeks');
    expect(validateDraft({ ...d, sessions: [] })).toContain('at least one session');
    expect(validateDraft({ ...d, sessions: Array.from({ length: 22 }, () => d.sessions[0]) })).toContain('at most 21');
    expect(validateDraft({ ...d, name: '   ' })).toBe('Give the program a name.');
  });

  it('trims text and drops blank notes before sending', () => {
    const d = emptyDraft();
    d.name = '  Block  ';
    d.notes = '   ';
    d.sessions[0].name = ' Push ';
    d.sessions[0].exercises.push({ ...exerciseToProgram(squat), notes: '  ' });
    const c = cleanDraft(d);
    expect(c.name).toBe('Block');
    expect(c.notes).toBeNull();
    expect(c.sessions[0].name).toBe('Push');
    expect(c.sessions[0].exercises[0].notes).toBeNull();
  });

  it('clamps numbers', () => {
    expect(clamp(0, 1, 20)).toBe(1);
    expect(clamp(99, 1, 20)).toBe(20);
    expect(clamp(7.9, 1, 20)).toBe(7);
  });
});
