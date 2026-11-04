import type { Program, ProgramAssignment, ProgramCompletion, ProgramSession } from '../types/program';

const DAY_MS = 86_400_000;
export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Dates are plain YYYY-MM-DD strings so time zones can never shift a training day. */
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toStr = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Today in the device's own time zone, as YYYY-MM-DD. */
export function localDateString(now: number): string {
  const d = new Date(now);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** The Monday of the week containing the date. */
export function mondayOf(date: string): string {
  const ms = toMs(date);
  const weekday = (new Date(ms).getUTCDay() + 6) % 7; // Monday = 0
  return toStr(ms - weekday * DAY_MS);
}

/** Calendar date of a session: week 0 is the week containing the start date. */
export function sessionDate(startDate: string, week: number, day: number): string {
  return toStr(toMs(mondayOf(startDate)) + (week * 7 + day) * DAY_MS);
}

export type SessionStatus = 'done' | 'today' | 'upcoming' | 'missed';

export interface ScheduledSession {
  session: ProgramSession;
  week: number;
  date: string;
  status: SessionStatus;
  /** When the client finished it, if they did. */
  completedAt?: number;
  workoutId?: string;
}

export interface ScheduleWeek {
  week: number;
  /** Monday of that week */
  starts: string;
  sessions: ScheduledSession[];
}

export interface Schedule {
  weeks: ScheduleWeek[];
  /** Index of the week containing today, clamped into the program. */
  currentWeek: number;
  /** Today is before the first scheduled day. */
  notStarted: boolean;
  /** Today is after the last week. */
  finished: boolean;
  done: number;
  /** Sessions whose day has passed (done or missed). */
  due: number;
  missed: number;
}

/**
 * Lays a program out on the calendar and marks each session done / today / upcoming / missed.
 * Sessions that fall before the start date in the first week do not exist.
 */
export function buildSchedule(
  startDate: string,
  program: Pick<Program, 'weeks' | 'sessions'>,
  completions: ProgramCompletion[],
  today: string
): Schedule {
  const doneBy = new Map<string, ProgramCompletion>();
  for (const c of completions) {
    const key = `${c.week}:${c.sessionId}`;
    const prev = doneBy.get(key);
    if (!prev || c.completedAt < prev.completedAt) doneBy.set(key, c); // keep the first time it was done
  }

  let done = 0, due = 0, missed = 0;
  const weeks: ScheduleWeek[] = [];
  for (let w = 0; w < program.weeks; w++) {
    const sessions: ScheduledSession[] = [];
    for (const session of [...program.sessions].sort((a, b) => a.day - b.day)) {
      const date = sessionDate(startDate, w, session.day);
      if (date < startDate) continue;
      const c = doneBy.get(`${w}:${session.id}`);
      const status: SessionStatus = c ? 'done' : date < today ? 'missed' : date === today ? 'today' : 'upcoming';
      if (c) { done++; due++; }
      else if (status === 'missed') { due++; missed++; }
      sessions.push({ session, week: w, date, status, completedAt: c?.completedAt, workoutId: c?.workoutId });
    }
    weeks.push({ week: w, starts: sessionDate(startDate, w, 0), sessions });
  }

  const first = weeks[0]?.starts ?? startDate;
  const lastStarts = weeks[weeks.length - 1]?.starts ?? startDate;
  const lastEnd = toStr(toMs(lastStarts) + 6 * DAY_MS);
  const finished = today > lastEnd;
  let currentWeek = Math.floor((toMs(mondayOf(today)) - toMs(first)) / (7 * DAY_MS));
  currentWeek = Math.max(0, Math.min(program.weeks - 1, currentWeek));
  return { weeks, currentWeek, notStarted: today < startDate, finished, done, due, missed };
}

/** "3 of 4 sessions done" style summary for the coach list. */
export function describeAdherence(s: Pick<Schedule, 'done' | 'due' | 'missed'>): string {
  if (s.due === 0) return 'No sessions due yet';
  return `${s.done} of ${s.due} sessions done` + (s.missed > 0 ? `, ${s.missed} missed` : '');
}

/** Today's date plus the weekday index (Mon = 0) for a YYYY-MM-DD string. */
export const weekdayIndex = (date: string) => (new Date(toMs(date)).getUTCDay() + 6) % 7;
