import type { ProgramAssignment } from '../types/program';
import type { KeyValueStore } from './session';

const key = (userId: string) => `irontrack_program_v1:${userId}`;

const store = (): KeyValueStore | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function looksValid(a: any): a is ProgramAssignment {
  return (
    a && typeof a.id === 'string' && typeof a.startDate === 'string' && DATE_RE.test(a.startDate) &&
    a.program && typeof a.program.name === 'string' && Number.isInteger(a.program.weeks) &&
    Array.isArray(a.program.sessions) &&
    a.program.sessions.every((s: any) => s && typeof s.id === 'string' && Number.isInteger(s.day) && Array.isArray(s.exercises))
  );
}

/** The last plan we saw, so the gym (often no signal) still works. Per user, never shared between accounts. */
export function loadCachedAssignment(userId: string, kv: KeyValueStore | null = store()): ProgramAssignment | null {
  try {
    const raw = kv?.getItem(key(userId));
    if (!raw) return null;
    const a = JSON.parse(raw);
    return looksValid(a) ? a : null;
  } catch {
    return null;
  }
}

export function saveCachedAssignment(userId: string, a: ProgramAssignment | null, kv: KeyValueStore | null = store()): void {
  try {
    if (!kv) return;
    if (a) kv.setItem(key(userId), JSON.stringify(a));
    else kv.removeItem(key(userId));
  } catch {
    /* storage full or blocked: the plan just will not be available offline */
  }
}
