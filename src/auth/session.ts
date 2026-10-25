import type { ApiUser } from '../api/client';

const KEY = 'irontrack_session_v1';

export interface Session {
  token: string;
  user: ApiUser;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const defaultStore = (): KeyValueStore | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

export function loadSession(store: KeyValueStore | null = defaultStore()): Session | null {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return typeof s?.token === 'string' && s?.user?.id ? (s as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null, store: KeyValueStore | null = defaultStore()): void {
  try {
    if (!store) return;
    if (session) store.setItem(KEY, JSON.stringify(session));
    else store.removeItem(KEY);
  } catch {
    /* storage unavailable: user will simply have to sign in again */
  }
}
