import { describe, expect, it } from 'bun:test';
import { buildSchedule, describeAdherence, localDateString, mondayOf, sessionDate, weekdayIndex } from './program';
import type { ProgramCompletion, ProgramSession } from '../types/program';

const ex = { exerciseId: 'e', name: 'E', category: 'Chest', equipment: 'Barbell', sets: 3, reps: 5, restSeconds: 90, notes: null };
const sess = (id: string, day: number): ProgramSession => ({ id, day, name: id, exercises: [ex] });
const program = { weeks: 3, sessions: [sess('push', 0), sess('pull', 2), sess('legs', 4)] };
const done = (sessionId: string, week: number, at = 1): ProgramCompletion => ({ workoutId: `w-${sessionId}-${week}`, sessionId, week, completedAt: at });

describe('dates', () => {
  it('finds the Monday of a week, including Sundays and month/year boundaries', () => {
    expect(mondayOf('2026-11-09')).toBe('2026-11-09'); // Monday
    expect(mondayOf('2026-11-11')).toBe('2026-11-09'); // Wednesday
    expect(mondayOf('2026-11-15')).toBe('2026-11-09'); // Sunday belongs to the week before
    expect(mondayOf('2026-01-01')).toBe('2025-12-29');
  });

  it('places sessions on the right calendar day', () => {
    expect(sessionDate('2026-11-11', 0, 0)).toBe('2026-11-09'); // before start, but still computable
    expect(sessionDate('2026-11-11', 1, 2)).toBe('2026-11-18');
    expect(sessionDate('2026-12-28', 1, 0)).toBe('2027-01-04'); // crosses the year
  });

  it('is unaffected by daylight saving changes', () => {
    expect(sessionDate('2026-11-02', 1, 0)).toBe('2026-11-09'); // DST ends in the US on Nov 1 2026
    expect(sessionDate('2026-03-02', 2, 0)).toBe('2026-03-16');
  });

  it('formats the local date and weekday', () => {
    expect(localDateString(new Date(2026, 10, 9, 23, 59).getTime())).toBe('2026-11-09');
    expect(localDateString(new Date(2026, 0, 5, 0, 1).getTime())).toBe('2026-01-05');
    expect(weekdayIndex('2026-11-09')).toBe(0);
    expect(weekdayIndex('2026-11-15')).toBe(6);
  });
});

describe('buildSchedule', () => {
  it('marks done, today, upcoming and missed', () => {
    const s = buildSchedule('2026-11-09', program, [done('push', 0)], '2026-11-11');
    const w0 = s.weeks[0].sessions;
    expect(w0.map((x) => [x.session.id, x.date, x.status])).toEqual([
      ['push', '2026-11-09', 'done'],
      ['pull', '2026-11-11', 'today'],
      ['legs', '2026-11-13', 'upcoming'],
    ]);
    expect(s.weeks[1].sessions.every((x) => x.status === 'upcoming')).toBe(true);
    expect(s.currentWeek).toBe(0);
    expect(s.done).toBe(1);
    expect(s.due).toBe(1);
    expect(s.missed).toBe(0);
  });

  it('counts missed sessions once their day has passed', () => {
    const s = buildSchedule('2026-11-09', program, [done('push', 0)], '2026-11-16');
    expect(s.weeks[0].sessions.map((x) => x.status)).toEqual(['done', 'missed', 'missed']);
    expect(s.weeks[1].sessions[0].status).toBe('today');
    expect([s.done, s.due, s.missed]).toEqual([1, 3, 2]);
    expect(s.currentWeek).toBe(1);
    expect(describeAdherence(s)).toBe('1 of 3 sessions done, 2 missed');
  });

  it('a session done late still counts as done', () => {
    const s = buildSchedule('2026-11-09', program, [done('pull', 0)], '2026-11-20');
    expect(s.weeks[0].sessions.find((x) => x.session.id === 'pull')!.status).toBe('done');
  });

  it('skips sessions before the start date in the first week', () => {
    // Starting on Wednesday: Monday's push never existed.
    const s = buildSchedule('2026-11-11', program, [], '2026-11-11');
    expect(s.weeks[0].sessions.map((x) => x.session.id)).toEqual(['pull', 'legs']);
    expect(s.weeks[1].sessions.map((x) => x.session.id)).toEqual(['push', 'pull', 'legs']);
  });

  it('handles before the start and after the end', () => {
    const before = buildSchedule('2026-11-09', program, [], '2026-11-02');
    expect(before.notStarted).toBe(true);
    expect(before.currentWeek).toBe(0);
    expect(before.due).toBe(0);
    expect(describeAdherence(before)).toBe('No sessions due yet');
    const after = buildSchedule('2026-11-09', program, [done('push', 0)], '2027-02-01');
    expect(after.finished).toBe(true);
    expect(after.currentWeek).toBe(2);
    expect(after.missed).toBe(8);
  });

  it('ignores completions for sessions or weeks that are not in the plan', () => {
    const s = buildSchedule('2026-11-09', program, [done('gone', 0), done('push', 9), done('push', -1)], '2026-11-17');
    expect(s.done).toBe(0);
  });

  it('treats a duplicate completion as one session', () => {
    const s = buildSchedule('2026-11-09', program, [done('push', 0, 50), done('push', 0, 10)], '2026-11-17');
    expect(s.done).toBe(1);
    expect(s.weeks[0].sessions[0].completedAt).toBe(10);
  });

  it('sorts sessions by weekday regardless of how the coach ordered them', () => {
    const s = buildSchedule('2026-11-09', { weeks: 1, sessions: [sess('b', 4), sess('a', 0)] }, [], '2026-11-09');
    expect(s.weeks[0].sessions.map((x) => x.session.id)).toEqual(['a', 'b']);
  });
});
