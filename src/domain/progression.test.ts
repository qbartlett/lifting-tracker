import { describe, expect, it } from 'bun:test';
import { applyProgression } from './progression';
import { set, workout } from './testUtils';
import type { ProgressionConfigs } from '../types/lifting';

const configs = (setsReps = '5x5'): ProgressionConfigs => ({
  'barbell-back-squat': {
    exerciseId: 'barbell-back-squat',
    name: 'Squat',
    startingWeight: 145,
    weightIncrement: 5,
    defaultSetsReps: setsReps,
    currentWeight: 200,
  },
});

const fiveBy5 = [set(200, 5), set(200, 5), set(200, 5), set(200, 5), set(200, 5)];

describe('progression', () => {
  it('adds the increment after a full 5x5', () => {
    const r = applyProgression(configs(), workout('a', 0, fiveBy5));
    expect(r.changed).toBe(true);
    expect(r.configs['barbell-back-squat'].currentWeight).toBe(205);
  });

  it('holds the weight after a failed set', () => {
    const sets = [...fiveBy5.slice(0, 4), set(200, 3)];
    const r = applyProgression(configs(), workout('a', 0, sets));
    expect(r.changed).toBe(false);
    expect(r.configs['barbell-back-squat'].currentWeight).toBe(200);
  });

  it('holds the weight if sets were not completed', () => {
    const sets = fiveBy5.map((s) => ({ ...s, completed: false }));
    expect(applyProgression(configs(), workout('a', 0, sets)).changed).toBe(false);
  });

  it('needs only one set for a 1x5 lift', () => {
    const r = applyProgression(configs('1x5'), workout('a', 0, [set(200, 5)]));
    expect(r.configs['barbell-back-squat'].currentWeight).toBe(205);
  });

  it('ignores lifts without a progression config and never mutates input', () => {
    const input = configs();
    const before = JSON.stringify(input);
    const other = { ...workout('a', 0, fiveBy5) };
    other.exercises = [{ ...other.exercises[0], exerciseId: 'leg-curl' }];
    expect(applyProgression(input, other).changed).toBe(false);
    applyProgression(input, workout('b', 0, fiveBy5));
    expect(JSON.stringify(input)).toBe(before);
  });
});
