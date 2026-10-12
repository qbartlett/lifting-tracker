import { describe, expect, it } from 'bun:test';
import { parseSpreadsheetCSV } from './csvImport';

const csv = `Tracker Log,,,
Date,Workout,Exercise,Target Weight (lbs),Set 1,Set 2,Set 3,Set 4,Set 5,Status,Notes
8/12/2026,Workout A,Squat,145,5,5,5,5,5,Pass,First session
8/12/2026,Workout A,Bench Press,145,5,5,5,5,5,Pass,
8/14/2026,Workout B,Deadlift,175,5,,,,,Pass,
8/14/2026,Workout B,Overhead Press,-,-,-,-,-,-,,
8/16/2026,Workout A,Squat,150,,,,,,,
`;

describe('parseSpreadsheetCSV', () => {
  it('groups rows into sessions, newest first', () => {
    const { workouts } = parseSpreadsheetCSV(csv, {});
    expect(workouts.map((w) => w.name)).toEqual(['5x5 Workout B', '5x5 Workout A']);
  });

  it('skips rows with no weight or no reps (skipped / future targets)', () => {
    const { workouts } = parseSpreadsheetCSV(csv, {});
    const names = workouts.flatMap((w) => w.exercises.map((e) => e.exercise.name));
    expect(names).not.toContain('Overhead Press');
    expect(workouts.some((w) => w.startTime > new Date(2026, 7, 15).getTime())).toBe(false);
  });

  it('computes volume and sets', () => {
    const a = parseSpreadsheetCSV(csv, {}).workouts.find((w) => w.name === '5x5 Workout A')!;
    expect(a.totalSets).toBe(10);
    expect(a.totalVolume).toBe(145 * 5 * 5 * 2);
    expect(a.notes).toContain('First session');
  });

  it('returns the configs it was given', () => {
    const cfg = {};
    expect(parseSpreadsheetCSV(csv, cfg).configs).toBe(cfg);
  });

  it('parses the bundled starter CSV', async () => {
    const { INITIAL_SPREADSHEET_CSV } = await import('../data/seed');
    const { workouts } = parseSpreadsheetCSV(INITIAL_SPREADSHEET_CSV);
    expect(workouts.length).toBeGreaterThan(10);
    expect(workouts[0].startTime).toBeGreaterThan(workouts[workouts.length - 1].startTime);
  });
});
