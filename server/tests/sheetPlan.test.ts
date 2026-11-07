import { describe, expect, it } from 'bun:test';
import { parseSheetPlan, TEMPLATE_HEADER } from '../src/sheetPlan';

const H = TEMPLATE_HEADER;

describe('parseSheetPlan', () => {
  it('reads a plan into weeks, sessions and exercises', () => {
    const r = parseSheetPlan([
      H,
      ['1', 'Mon', 'Push', 'Bench Press', '4', '6', '120', 'Pause'],
      ['1', 'Mon', 'Push', 'Overhead Press', '3', '8-10', '90', ''],
      ['1', 'Wed', 'Pull', 'Barbell Row', '3', '8', '', ''],
      ['3', 'Mon', 'Push', 'Bench Press', '5', '5+', '2m', ''],
    ]);
    expect(r.problems).toEqual([]);
    expect(r.weeks).toHaveLength(3);
    expect(r.weeks[0].map((s) => [s.day, s.name, s.exercises.length])).toEqual([[0, 'Push', 2], [2, 'Pull', 1]]);
    expect(r.weeks[1]).toEqual([]); // week 2 left out = rest week
    const bench = r.weeks[0][0].exercises[0];
    expect(bench).toMatchObject({ name: 'Bench Press', sets: 4, reps: 6, restSeconds: 120, notes: 'Pause', category: 'Other' });
    expect(r.weeks[0][0].exercises[1]).toMatchObject({ reps: 8, repsLabel: '8-10', restSeconds: 90 });
    expect(r.weeks[0][1].exercises[0].restSeconds).toBe(120); // blank rest = default
    expect(r.weeks[2][0].exercises[0]).toMatchObject({ reps: 5, repsLabel: '5+', restSeconds: 120 });
  });

  it('gives sessions stable ids so logged workouts keep matching after edits to other rows', () => {
    const a = parseSheetPlan([H, ['1', 'Mon', 'Push', 'Bench', '3', '5', '', '']]);
    const b = parseSheetPlan([H, ['1', 'Mon', 'Push', 'Bench', '4', '8', '', ''], ['1', 'Mon', 'Push', 'Fly', '3', '12', '', '']]);
    expect(a.weeks[0][0].id).toBe(b.weeks[0][0].id);
  });

  it('accepts friendly column names in any order, with a title above the header', () => {
    const r = parseSheetPlan([
      ['Sam - strength block'],
      [],
      ['Movement', 'Reps', 'Sets', 'Weekday', 'Wk', 'Workout', 'Rest seconds'],
      ['Squat', '5', '5', 'Thursday', 'Week 2', 'Legs', '180'],
    ]);
    expect(r.problems).toEqual([]);
    expect(r.weeks[1][0]).toMatchObject({ day: 3, name: 'Legs' });
    expect(r.weeks[1][0].exercises[0]).toMatchObject({ name: 'Squat', sets: 5, reps: 5, restSeconds: 180 });
  });

  it('understands days as numbers, abbreviations and any case', () => {
    const days = ['mon', 'TUE', 'Wed.', 'thurs', '5', 'Saturday', '7'];
    const r = parseSheetPlan([H, ...days.map((d) => ['1', d, 'S', 'X', '3', '5', '', ''])]);
    expect(r.problems).toEqual([]);
    expect(r.weeks[0].map((s) => s.day)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('understands rest written several ways', () => {
    const rest = ['90', '90s', '2m', '2 min', '1:30', ''];
    const r = parseSheetPlan([H, ...rest.map((x, i) => ['1', String((i % 7) + 1), 'S', 'X', '3', '5', x, ''])]);
    expect(r.weeks[0].map((s) => s.exercises[0].restSeconds)).toEqual([90, 90, 120, 120, 90, 120]);
  });

  it('reports every bad cell with its row and column, and returns no plan', () => {
    const r = parseSheetPlan([
      H,
      ['1', 'Mon', 'Push', 'Bench', '4', '6', '120', ''],
      ['x', 'Funday', 'Push', '', '0', 'lots', 'soon', ''],
      ['2', 'Mon', 'Push', 'Fly', '3', '12', '', ''],
    ]);
    expect(r.weeks).toEqual([]);
    const cols = r.problems.map((p) => `${p.row}:${p.column}`);
    expect(cols).toEqual(['3:Week', '3:Day', '3:Exercise', '3:Sets', '3:Reps', '3:Rest']);
    expect(r.problems[1].message).toContain('Funday');
  });

  it('rejects out-of-range numbers', () => {
    const bad = (week: string, sets: string, reps: string, rest: string) =>
      parseSheetPlan([H, [week, 'Mon', 'S', 'X', sets, reps, rest, '']]).problems.length;
    expect(bad('0', '3', '5', '')).toBe(1);
    expect(bad('53', '3', '5', '')).toBe(1);
    expect(bad('1', '21', '5', '')).toBe(1);
    expect(bad('1', '3', '101', '')).toBe(1);
    expect(bad('1', '3', '10-8', '')).toBe(1);
    expect(bad('1', '3', '5', '9999')).toBe(1);
    expect(bad('1', '3', '5', '31m')).toBe(1);
    expect(bad('1', '-3', '5', '')).toBe(1);
    expect(bad('1', '3.5', '5', '')).toBe(1);
    expect(bad('1', '3', '5', '')).toBe(0);
  });

  it('explains a missing header and an empty tab', () => {
    expect(parseSheetPlan([['foo', 'bar'], ['1', '2']]).problems[0].message).toContain('header');
    expect(parseSheetPlan([]).problems[0].message).toContain('header');
    expect(parseSheetPlan([H]).problems[0].message).toContain('No exercises');
    expect(parseSheetPlan([H, [], ['', '', '']]).problems[0].message).toContain('No exercises');
  });

  it('copes with short rows and non-string cells from the API', () => {
    const r = parseSheetPlan([H, [1, 'Mon', 'S', 'X', 3, 5] as unknown[]]);
    expect(r.problems).toEqual([]);
    expect(r.weeks[0][0].exercises[0]).toMatchObject({ sets: 3, reps: 5, notes: null });
  });

  it('enforces the same size limits as hand-built programs', () => {
    const rows = Array.from({ length: 31 }, (_, i) => ['1', 'Mon', 'S', `Ex${i}`, '3', '5', '', '']);
    expect(parseSheetPlan([H, ...rows]).problems[0].message).toContain('more than 30');
    const longName = parseSheetPlan([H, ['1', 'Mon', 'S', 'x'.repeat(101), '3', '5', '', '']]);
    expect(longName.problems[0].column).toBe('Exercise');
  });

  it('caps how many problems it reports', () => {
    const rows = Array.from({ length: 200 }, () => ['x', 'Mon', 'S', 'X', '3', '5', '', '']);
    expect(parseSheetPlan([H, ...rows]).problems).toHaveLength(50);
  });

  it('keeps two same-day sessions with different names apart', () => {
    const r = parseSheetPlan([H, ['1', 'Mon', 'AM', 'A', '3', '5', '', ''], ['1', 'Mon', 'PM', 'B', '3', '5', '', '']]);
    expect(r.weeks[0].map((s) => s.name)).toEqual(['AM', 'PM']);
    expect(new Set(r.weeks[0].map((s) => s.id)).size).toBe(2);
  });
});
