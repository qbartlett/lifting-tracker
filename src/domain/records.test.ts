import { describe, expect, it } from 'bun:test';
import { applyWorkoutToRecords, computePersonalRecords, estimate1RM } from './records';
import { set, workout } from './testUtils';

const DAY = 86_400_000;
const t0 = Date.UTC(2026, 7, 12);

describe('records', () => {
  it('estimates 1RM with the Epley formula', () => {
    expect(estimate1RM(200, 5)).toBe(233);
  });

  it('ignores incomplete and empty sets', () => {
    const r = computePersonalRecords([workout('a', t0, [set(300, 5, false), set(0, 5), set(100, 0)])]);
    expect(r).toEqual({});
  });

  it('tracks best weight, 1RM and volume across history (newest first)', () => {
    const history = [
      workout('new', t0 + 2 * DAY, [set(185, 5)]),
      workout('old', t0, [set(200, 3), set(150, 10)]),
    ];
    const r = computePersonalRecords(history)['barbell-back-squat'];
    expect(r.maxWeight).toBe(200);
    expect(r.maxRepsAtMaxWeight).toBe(3);
    expect(r.estimated1RM).toBe(Math.max(estimate1RM(200, 3), estimate1RM(150, 10)));
    expect(r.bestVolumeSet).toBe(1500);
    expect(r.achievedDate).toBe('2026-08-12');
  });

  it('counts a first-ever lift as a record', () => {
    const { records, newRecordCount } = applyWorkoutToRecords({}, workout('a', t0, [set(100, 5)]));
    expect(newRecordCount).toBe(1);
    expect(records['barbell-back-squat'].maxWeight).toBe(100);
  });

  it('counts an exercise once even if several sets beat the record', () => {
    const base = computePersonalRecords([workout('a', t0, [set(100, 5)])]);
    const { newRecordCount } = applyWorkoutToRecords(base, workout('b', t0 + DAY, [set(105, 5), set(110, 5)]));
    expect(newRecordCount).toBe(1);
  });

  it('reports no records when nothing is beaten', () => {
    const base = computePersonalRecords([workout('a', t0, [set(200, 5)])]);
    const { newRecordCount } = applyWorkoutToRecords(base, workout('b', t0 + DAY, [set(150, 5)]));
    expect(newRecordCount).toBe(0);
  });

  it('does not mutate the records it is given', () => {
    const base = computePersonalRecords([workout('a', t0, [set(100, 5)])]);
    const snapshot = JSON.parse(JSON.stringify(base));
    applyWorkoutToRecords(base, workout('b', t0 + DAY, [set(300, 5)]));
    expect(base).toEqual(snapshot);
  });
});
