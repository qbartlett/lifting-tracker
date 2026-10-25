import { emptyMeta, type SyncMeta } from './engine';
import type { KeyValueStore } from '../auth/session';

const KEY = 'irontrack_sync_meta_v1';

const defaultStore = (): KeyValueStore | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

export function loadMeta(store: KeyValueStore | null = defaultStore()): SyncMeta {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return emptyMeta();
    const m = JSON.parse(raw);
    if (typeof m?.cursor !== 'number' || typeof m?.known !== 'object' || m.known === null) return emptyMeta();
    return { userId: typeof m.userId === 'string' ? m.userId : null, cursor: m.cursor, known: m.known };
  } catch {
    return emptyMeta();
  }
}

export function saveMeta(meta: SyncMeta | null, store: KeyValueStore | null = defaultStore()): void {
  try {
    if (!store) return;
    if (meta) store.setItem(KEY, JSON.stringify(meta));
    else store.removeItem(KEY);
  } catch {
    /* worst case we re-pull and re-compare next time */
  }
}
