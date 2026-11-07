import { describe, expect, it } from 'bun:test';
import { loadCachedAssignment, saveCachedAssignment } from './programCache';
import type { ProgramAssignment } from '../types/program';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

const a: ProgramAssignment = {
  id: 'a1', startDate: '2026-11-09', coach: { id: 'c', name: 'Coach' },
  program: { id: 'p', name: 'P', notes: null, weeks: 4, sessions: [{ id: 's', day: 0, name: 'Push', exercises: [] }] },
};

describe('program cache', () => {
  it('round-trips, per user', () => {
    const kv = memory();
    saveCachedAssignment('u1', a, kv);
    expect(loadCachedAssignment('u1', kv)).toEqual(a);
    expect(loadCachedAssignment('u2', kv)).toBeNull();
  });

  it('clears when the plan is gone', () => {
    const kv = memory();
    saveCachedAssignment('u1', a, kv);
    saveCachedAssignment('u1', null, kv);
    expect(loadCachedAssignment('u1', kv)).toBeNull();
  });

  it('ignores corrupt or malformed data instead of crashing', () => {
    const kv = memory();
    kv.setItem('irontrack_program_v1:u1', '{not json');
    expect(loadCachedAssignment('u1', kv)).toBeNull();
    kv.setItem('irontrack_program_v1:u1', JSON.stringify({ id: 'x', startDate: 'nope', program: {} }));
    expect(loadCachedAssignment('u1', kv)).toBeNull();
    kv.setItem('irontrack_program_v1:u1', JSON.stringify({ ...a, program: { ...a.program, sessions: [null] } }));
    expect(loadCachedAssignment('u1', kv)).toBeNull();
  });

  it('survives storage that throws', () => {
    const bad = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('x'); } };
    expect(loadCachedAssignment('u1', bad)).toBeNull();
    expect(() => saveCachedAssignment('u1', a, bad)).not.toThrow();
  });

  it('accepts week-by-week plans and rejects a malformed one', () => {
    const kv = memory();
    const sheetPlan = { ...a, program: { ...a.program, sessions: [], perWeek: [[a.program.sessions[0]], []] } };
    saveCachedAssignment('u1', sheetPlan as ProgramAssignment, kv);
    expect(loadCachedAssignment('u1', kv)).toEqual(sheetPlan as ProgramAssignment);
    kv.setItem('irontrack_program_v1:u1', JSON.stringify({ ...a, program: { ...a.program, perWeek: [null] } }));
    expect(loadCachedAssignment('u1', kv)).toBeNull();
    kv.setItem('irontrack_program_v1:u1', JSON.stringify({ ...a, program: { ...a.program, perWeek: 'x' } }));
    expect(loadCachedAssignment('u1', kv)).toBeNull();
  });
});
