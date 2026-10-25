import { describe, expect, it } from 'bun:test';
import { decideAdoption, hasLocalData } from './adopt';
import { emptyMeta } from './engine';
import { aWorkout, emptySnapshot } from './testUtils';

describe('decideAdoption', () => {
  it('continues for the same account', () => {
    expect(decideAdoption(emptyMeta('u1'), 'u1', true)).toBe('continue');
  });
  it('wipes data that belonged to another account', () => {
    expect(decideAdoption(emptyMeta('u1'), 'u2', true)).toBe('wipe-and-continue');
    expect(decideAdoption(emptyMeta('u1'), 'u2', false)).toBe('wipe-and-continue');
  });
  it('asks before uploading data from a device that never synced', () => {
    expect(decideAdoption(emptyMeta(null), 'u1', true)).toBe('ask-upload');
  });
  it('just continues on a clean, never-synced device', () => {
    expect(decideAdoption(emptyMeta(null), 'u1', false)).toBe('continue');
  });
});

describe('hasLocalData', () => {
  it('is false for a fresh install and true once there is anything user-made', () => {
    const s = emptySnapshot();
    expect(hasLocalData(s)).toBe(false);
    s.history = [aWorkout('w')];
    expect(hasLocalData(s)).toBe(true);
    const t = emptySnapshot();
    t.exercises = [{ id: 'x', name: 'X', category: 'Chest', equipment: 'Cable', isCustom: true }];
    expect(hasLocalData(t)).toBe(true);
    const u = emptySnapshot();
    u.exercises = [{ id: 'x', name: 'X', category: 'Chest', equipment: 'Cable' }]; // built-in
    expect(hasLocalData(u)).toBe(false);
  });
});
