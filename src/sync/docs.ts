import type { RemoteChange, SyncKind } from '../api/client';
import type {
  CompletedWorkout, Exercise, ProgressionConfigs, RoutineTemplate, UserSettings,
} from '../types/lifting';

/** Everything that syncs. The in-progress workout deliberately stays on the device. */
export interface Snapshot {
  history: CompletedWorkout[];
  routines: RoutineTemplate[];
  exercises: Exercise[];
  settings: UserSettings;
  progression: ProgressionConfigs;
}

export interface LocalDoc {
  kind: SyncKind;
  id: string;
  data: unknown;
}

export const SINGLETON_ID = 'main';
export const isSingleton = (kind: SyncKind): boolean => kind === 'settings' || kind === 'progression';

export const docKey = (kind: SyncKind, id: string): string => `${kind}/${id}`;

export function parseDocKey(key: string): { kind: SyncKind; id: string } {
  const i = key.indexOf('/');
  return { kind: key.slice(0, i) as SyncKind, id: key.slice(i + 1) };
}

/** JSON with sorted keys and undefined dropped, so equal data always hashes equal. */
export function stableStringify(v: unknown): string {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => stableStringify(x)).join(',')}]`;
  const obj = v as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of Object.keys(obj).sort()) {
    if (obj[k] === undefined) continue;
    parts.push(`${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  }
  return `{${parts.join(',')}}`;
}

/** cyrb53: fast 53-bit string hash. Only used to notice local edits, not for security. */
export function hashDoc(data: unknown): string {
  const s = stableStringify(data);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function snapshotToDocs(s: Snapshot): Map<string, LocalDoc> {
  const docs = new Map<string, LocalDoc>();
  const add = (kind: SyncKind, id: string, data: unknown) => docs.set(docKey(kind, id), { kind, id, data });
  for (const w of s.history) add('workout', w.id, w);
  for (const r of s.routines) add('routine', r.id, r);
  for (const e of s.exercises) if (e.isCustom) add('exercise', e.id, e);
  add('settings', SINGLETON_ID, s.settings);
  add('progression', SINGLETON_ID, s.progression);
  return docs;
}

function upsert<T extends { id: string }>(list: T[], item: T, atFront: boolean): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) {
    const next = list.slice();
    next[i] = item;
    return next;
  }
  return atFront ? [item, ...list] : [...list, item];
}

/** Applies changes from the server to local state. Pure; safe to use inside a state updater. */
export function applyRemoteChanges(s: Snapshot, changes: RemoteChange[]): Snapshot {
  let { history, routines, exercises, settings, progression } = s;
  for (const c of changes) {
    switch (c.kind) {
      case 'workout':
        history = c.deleted ? history.filter((w) => w.id !== c.id) : upsert(history, c.data as CompletedWorkout, true);
        break;
      case 'routine':
        routines = c.deleted ? routines.filter((r) => r.id !== c.id) : upsert(routines, c.data as RoutineTemplate, true);
        break;
      case 'exercise':
        exercises = c.deleted
          ? exercises.filter((e) => e.id !== c.id)
          : upsert(exercises, { ...(c.data as Exercise), isCustom: true }, true);
        break;
      case 'settings':
        if (!c.deleted) settings = { ...settings, ...(c.data as Partial<UserSettings>) };
        break;
      case 'progression':
        if (!c.deleted) progression = c.data as ProgressionConfigs;
        break;
    }
  }
  if (history !== s.history) history = history.slice().sort((a, b) => b.startTime - a.startTime);
  return { history, routines, exercises, settings, progression };
}
