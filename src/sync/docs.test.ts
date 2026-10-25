import { describe, expect, it } from 'bun:test';
import { applyRemoteChanges, hashDoc, snapshotToDocs, stableStringify } from './docs';
import { aRoutine, aWorkout, emptySnapshot } from './testUtils';
import type { RemoteChange } from '../api/client';

const remote = (kind: RemoteChange['kind'], id: string, data: unknown, deleted = false): RemoteChange => ({
  kind, id, data, deleted, updatedAt: 1, seq: 1,
});

describe('hashDoc', () => {
  it('ignores key order and undefined properties', () => {
    expect(hashDoc({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(hashDoc({ b: { d: [1, 2], c: 2 }, a: 1, z: undefined }));
  });
  it('changes when data changes', () => {
    expect(hashDoc({ a: 1 })).not.toBe(hashDoc({ a: 2 }));
    expect(hashDoc([1, 2])).not.toBe(hashDoc([2, 1]));
    expect(stableStringify({ a: undefined })).toBe('{}');
  });
});

describe('snapshotToDocs', () => {
  it('includes workouts, routines, custom exercises, settings and progression only', () => {
    const s = emptySnapshot();
    s.history = [aWorkout('w1')];
    s.routines = [aRoutine('r1')];
    s.exercises = [
      { id: 'bench', name: 'Bench', category: 'Chest', equipment: 'Barbell' },
      { id: 'mine', name: 'Mine', category: 'Chest', equipment: 'Barbell', isCustom: true },
    ];
    expect([...snapshotToDocs(s).keys()].sort()).toEqual([
      'exercise/mine', 'progression/main', 'routine/r1', 'settings/main', 'workout/w1',
    ]);
  });
});

describe('applyRemoteChanges', () => {
  it('adds, updates, sorts and deletes workouts without mutating the input', () => {
    const s = emptySnapshot();
    s.history = [aWorkout('old', 100)];
    const frozen = JSON.stringify(s);
    const next = applyRemoteChanges(s, [remote('workout', 'new', aWorkout('new', 500)), remote('workout', 'old', aWorkout('old', 100, 'Renamed'))]);
    expect(next.history.map((w) => w.id)).toEqual(['new', 'old']);
    expect(next.history[1].name).toBe('Renamed');
    expect(JSON.stringify(s)).toBe(frozen);
    expect(applyRemoteChanges(next, [remote('workout', 'new', null, true)]).history.map((w) => w.id)).toEqual(['old']);
  });

  it('applies routines, custom exercises, settings and progression', () => {
    const s = applyRemoteChanges(emptySnapshot(), [
      remote('routine', 'r1', aRoutine('r1')),
      remote('exercise', 'e1', { id: 'e1', name: 'E', category: 'Back', equipment: 'Cable' }),
      remote('settings', 'main', { weightUnit: 'kg' }),
      remote('progression', 'main', { squat: { currentWeight: 100 } }),
    ]);
    expect(s.routines).toHaveLength(1);
    expect(s.exercises[0].isCustom).toBe(true);
    expect(s.settings.weightUnit).toBe('kg');
    expect(s.settings.soundEnabled).toBe(true); // merged over local
    expect(Object.keys(s.progression)).toEqual(['squat']);
  });

  it('ignores unknown kinds', () => {
    const s = emptySnapshot();
    expect(applyRemoteChanges(s, [remote('mystery' as any, 'x', {})])).toEqual(s);
  });
});
