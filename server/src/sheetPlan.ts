import type { ProgramExercise, ProgramSession } from './program';

/** The columns of an athlete's tab. Order does not matter when reading; this is the order used for new tabs. */
export const TEMPLATE_HEADER = ['Week', 'Day', 'Session', 'Exercise', 'Sets', 'Reps', 'Rest (sec)', 'Notes'];

export interface SheetExercise extends ProgramExercise {
  /** Shown instead of `reps` when the coach wrote a range such as 8-10 or 5+. */
  repsLabel?: string;
}
export interface SheetSession extends Omit<ProgramSession, 'exercises'> {
  exercises: SheetExercise[];
}

export interface SheetProblem {
  /** Row number as shown in the sheet (1-based), or 0 for the tab as a whole. */
  row: number;
  column?: string;
  message: string;
}

export interface ParsedPlan {
  /** weeks[0] is week 1. A week the coach left out is an empty list (a rest week). */
  weeks: SheetSession[][];
  problems: SheetProblem[];
}

const MAX_PROBLEMS = 50;
const MAX_ROWS = 5000;

const HEADER_ALIASES: Record<string, string[]> = {
  week: ['week', 'wk'],
  day: ['day', 'weekday', 'day of week'],
  session: ['session', 'workout', 'session name', 'workout name'],
  exercise: ['exercise', 'movement', 'lift'],
  sets: ['sets', 'set'],
  reps: ['reps', 'rep', 'repetitions'],
  rest: ['rest', 'rest (sec)', 'rest (s)', 'rest sec', 'rest seconds', 'rest (seconds)'],
  notes: ['notes', 'note', 'comments', 'comment'],
};
const REQUIRED = ['week', 'day', 'exercise', 'sets', 'reps'] as const;
const LABEL: Record<string, string> = { week: 'Week', day: 'Day', session: 'Session', exercise: 'Exercise', sets: 'Sets', reps: 'Reps', rest: 'Rest', notes: 'Notes' };

const DAYS: Record<string, number> = {
  mon: 0, monday: 0, tue: 1, tues: 1, tuesday: 1, wed: 2, weds: 2, wednesday: 2,
  thu: 3, thur: 3, thurs: 3, thursday: 3, fri: 4, friday: 4, sat: 5, saturday: 5, sun: 6, sunday: 6,
};

const cell = (row: unknown[], i: number | undefined): string => {
  if (i === undefined) return '';
  const v = row[i];
  return v === undefined || v === null ? '' : String(v).trim();
};

/** Finds the header row within the first rows (coaches often put a title above it). */
function findHeader(rows: unknown[][]): { index: number; cols: Record<string, number> } | null {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const cols: Record<string, number> = {};
    rows[r].forEach((raw, c) => {
      const name = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
      for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
        if (aliases.includes(name) && cols[key] === undefined) cols[key] = c;
      }
    });
    if (REQUIRED.every((k) => cols[k] !== undefined)) return { index: r, cols };
  }
  return null;
}

function wholeNumber(text: string, min: number, max: number): number | null {
  if (!/^\d{1,5}$/.test(text)) return null;
  const n = Number(text);
  return n >= min && n <= max ? n : null;
}

function parseDay(text: string): number | null {
  const t = text.toLowerCase().replace(/\.$/, '');
  if (t in DAYS) return DAYS[t];
  const n = wholeNumber(t, 1, 7); // 1 = Monday
  return n === null ? null : n - 1;
}

function parseReps(text: string): { reps: number; label?: string } | null {
  const plain = wholeNumber(text, 1, 100);
  if (plain !== null) return { reps: plain };
  const range = /^(\d{1,3})\s*[-–—]\s*(\d{1,3})$/.exec(text);
  if (range) {
    const lo = Number(range[1]), hi = Number(range[2]);
    if (lo >= 1 && hi <= 100 && lo <= hi) return { reps: lo, label: `${lo}-${hi}` };
    return null;
  }
  const plus = /^(\d{1,3})\s*\+$/.exec(text);
  if (plus) {
    const n = Number(plus[1]);
    if (n >= 1 && n <= 100) return { reps: n, label: `${n}+` };
  }
  return null;
}

/** 90, 90s, 2m, 2 min, 1:30 -> seconds. Blank means the default. */
function parseRest(text: string): number | null {
  if (text === '') return 120;
  let m: RegExpExecArray | null;
  let secs: number | null = null;
  if ((m = /^(\d{1,4})\s*(s|sec|secs|seconds)?$/i.exec(text))) secs = Number(m[1]);
  else if ((m = /^(\d{1,3})\s*(m|min|mins|minutes)$/i.exec(text))) secs = Number(m[1]) * 60;
  else if ((m = /^(\d{1,2}):([0-5]\d)$/.exec(text))) secs = Number(m[1]) * 60 + Number(m[2]);
  return secs !== null && secs <= 1800 ? secs : null;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'session';

/**
 * Reads one athlete's tab. All or nothing: if anything is wrong the caller keeps the athlete's
 * previous plan, because silently dropping a bad row would quietly change what they train.
 */
export function parseSheetPlan(rows: unknown[][]): ParsedPlan {
  const problems: SheetProblem[] = [];
  const add = (p: SheetProblem) => { if (problems.length < MAX_PROBLEMS) problems.push(p); };

  const header = findHeader(rows);
  if (!header) {
    return { weeks: [], problems: [{ row: 0, message: `Could not find the header row. The first row needs these columns: ${TEMPLATE_HEADER.join(', ')}.` }] };
  }
  if (rows.length - header.index > MAX_ROWS) {
    return { weeks: [], problems: [{ row: 0, message: `Too many rows (limit ${MAX_ROWS}).` }] };
  }
  const { cols } = header;

  interface Group { day: number; name: string; exercises: SheetExercise[] }
  const byWeek = new Map<number, Map<string, Group>>();
  let sawData = false;

  for (let r = header.index + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const rowNo = r + 1;
    const texts = Object.keys(cols).map((k) => cell(row, cols[k]));
    if (texts.every((t) => t === '')) continue; // blank line
    sawData = true;

    const before = problems.length;
    const bad = (key: string, message: string) => add({ row: rowNo, column: LABEL[key], message });

    const weekText = cell(row, cols.week).replace(/^week\s*/i, '');
    const week = wholeNumber(weekText, 1, 52);
    if (week === null) bad('week', `Week must be a number from 1 to 52 (found "${cell(row, cols.week)}").`);

    const day = parseDay(cell(row, cols.day));
    if (day === null) bad('day', `Day must be Mon to Sun (found "${cell(row, cols.day)}").`);

    const exercise = cell(row, cols.exercise);
    if (exercise === '') bad('exercise', 'Exercise is empty.');
    else if (exercise.length > 100) bad('exercise', 'Exercise name is too long (100 characters max).');

    const sets = wholeNumber(cell(row, cols.sets), 1, 20);
    if (sets === null) bad('sets', `Sets must be a number from 1 to 20 (found "${cell(row, cols.sets)}").`);

    const reps = parseReps(cell(row, cols.reps));
    if (reps === null) bad('reps', `Reps must be a number, a range like 8-10, or like 5+ (found "${cell(row, cols.reps)}").`);

    const rest = parseRest(cell(row, cols.rest));
    if (rest === null) bad('rest', `Rest must be seconds like 90, or 2m, or 1:30, up to 30 minutes (found "${cell(row, cols.rest)}").`);

    const sessionName = cell(row, cols.session) || 'Training';
    if (sessionName.length > 100) bad('session', 'Session name is too long (100 characters max).');
    const notes = cell(row, cols.notes);
    if (notes.length > 500) bad('notes', 'Note is too long (500 characters max).');

    if (problems.length > before || week === null || day === null || sets === null || reps === null || rest === null) continue;

    const groups = byWeek.get(week) ?? new Map<string, Group>();
    byWeek.set(week, groups);
    const key = `${day}|${sessionName.toLowerCase()}`;
    const g = groups.get(key) ?? { day, name: sessionName, exercises: [] };
    groups.set(key, g);
    g.exercises.push({
      exerciseId: `sheet-${slug(exercise)}`,
      name: exercise,
      category: 'Other',
      equipment: 'Other',
      sets,
      reps: reps.reps,
      restSeconds: rest,
      notes: notes || null,
      ...(reps.label ? { repsLabel: reps.label } : {}),
    });
  }

  if (!sawData && problems.length === 0) {
    return { weeks: [], problems: [{ row: 0, message: 'No exercises yet. Add rows under the header.' }] };
  }

  const last = Math.max(0, ...byWeek.keys());
  const weeks: SheetSession[][] = [];
  for (let w = 1; w <= last; w++) {
    const groups = [...(byWeek.get(w)?.values() ?? [])].sort((a, b) => a.day - b.day);
    if (groups.length > 21) add({ row: 0, message: `Week ${w} has more than 21 sessions.` });
    weeks.push(groups.map((g) => {
      if (g.exercises.length > 30) add({ row: 0, message: `Week ${w}, ${DAY_LABEL[g.day]} "${g.name}" has more than 30 exercises.` });
      return { id: `${g.day}-${slug(g.name)}`, day: g.day, name: g.name, exercises: g.exercises };
    }));
  }
  if (problems.length > 0) return { weeks: [], problems };
  return { weeks, problems };
}

const DAY_LABEL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
