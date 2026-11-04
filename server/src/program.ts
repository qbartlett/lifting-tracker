import { HttpError, str, optStr } from './http';

export interface ProgramExercise {
  exerciseId: string;
  name: string;
  category: string;
  equipment: string;
  sets: number;
  reps: number;
  restSeconds: number;
  notes: string | null;
}
export interface ProgramSession {
  id: string;
  /** 0 = Monday ... 6 = Sunday */
  day: number;
  name: string;
  exercises: ProgramExercise[];
}
export interface ProgramContent {
  notes: string | null;
  weeks: number;
  sessions: ProgramSession[];
}

const bad = (msg: string) => new HttpError(400, 'invalid_program', msg);
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

function int(v: unknown, field: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw bad(`${field} must be a whole number ${min}-${max}`);
  return v;
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Validates untrusted input and returns a normalized program. Never trusts shape, sizes or types. */
export function parseProgram(body: Record<string, unknown>): { name: string; content: ProgramContent } {
  const name = str(body.name, 'name', 1, 100);
  const notes = optStr(body.notes, 'notes', 2000);
  const weeks = int(body.weeks, 'weeks', 1, 52);
  if (!Array.isArray(body.sessions)) throw bad('sessions must be a list');
  if (body.sessions.length < 1 || body.sessions.length > 21) throw bad('a program needs 1-21 sessions per week');

  const seen = new Set<string>();
  const sessions = body.sessions.map((raw, i): ProgramSession => {
    if (!isObj(raw)) throw bad(`session ${i + 1} is invalid`);
    const id = typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : crypto.randomUUID();
    if (seen.has(id)) throw bad('duplicate session id');
    seen.add(id);
    if (!Array.isArray(raw.exercises) || raw.exercises.length < 1 || raw.exercises.length > 30) {
      throw bad(`session ${i + 1} needs 1-30 exercises`);
    }
    return {
      id,
      day: int(raw.day, `session ${i + 1} day`, 0, 6),
      name: str(raw.name, `session ${i + 1} name`, 1, 100),
      exercises: raw.exercises.map((e, j): ProgramExercise => {
        if (!isObj(e)) throw bad(`exercise ${j + 1} in session ${i + 1} is invalid`);
        const where = `session ${i + 1} exercise ${j + 1}`;
        return {
          exerciseId: str(e.exerciseId, `${where} exerciseId`, 1, 100),
          name: str(e.name, `${where} name`, 1, 100),
          category: str(e.category, `${where} category`, 1, 40),
          equipment: str(e.equipment, `${where} equipment`, 1, 40),
          sets: int(e.sets, `${where} sets`, 1, 20),
          reps: int(e.reps, `${where} reps`, 1, 100),
          restSeconds: int(e.restSeconds, `${where} restSeconds`, 0, 1800),
          notes: optStr(e.notes, `${where} notes`, 500),
        };
      }),
    };
  });
  return { name, content: { notes, weeks, sessions } };
}

/** A calendar date like 2026-11-09, checked to be a real date. */
export function parseDate(v: unknown, field: string): string {
  const s = str(v, field, 10, 10);
  const d = new Date(`${s}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    throw new HttpError(400, 'invalid_field', `${field} must be a date like 2026-11-09`);
  }
  return s;
}
