import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import type { Auth } from './useAuth';
import type { useAppData } from './useAppData';
import { decideAdoption, hasLocalData } from '../sync/adopt';
import { emptyMeta, runSync, type SyncMeta } from '../sync/engine';
import { loadMeta, saveMeta } from '../sync/meta';

export type SyncStatus = 'signed-out' | 'idle' | 'syncing' | 'offline' | 'error';
type AppData = ReturnType<typeof useAppData>;

const POLL_MS = 60_000;
const DEBOUNCE_MS = 4_000;
const MAX_ROUNDS = 3;

/** Keeps this device's data in step with the signed-in account. Does nothing when signed out. */
export function useSync(data: AppData, auth: Pick<Auth, 'api' | 'user'>) {
  const [status, setStatus] = useState<SyncStatus>('signed-out');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const metaRef = useRef<SyncMeta>(loadMeta());
  const dataRef = useRef(data);
  dataRef.current = data;
  const busy = useRef(false);
  const queued = useRef(false);
  const ready = useRef(false);
  const syncRef = useRef<() => Promise<void>>(async () => {});

  const userId = auth.user?.id ?? null;
  const api = auth.api;

  const syncNow = useCallback(async () => {
    if (!userId || !ready.current) return;
    if (busy.current) {
      queued.current = true;
      return;
    }
    busy.current = true;
    setStatus('syncing');
    setError(null);
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const out = await runSync(metaRef.current, {
          getSnapshot: () => dataRef.current.getSnapshot(),
          applyRemote: (changes) => dataRef.current.applyRemote(changes),
          transport: api,
        });
        metaRef.current = out.meta;
        saveMeta(out.meta);
        if (!out.needsResync) break;
      }
      setLastSyncedAt(Date.now());
      setStatus('idle');
    } catch (e) {
      if (e instanceof ApiError && e.isNetwork) setStatus('offline');
      else if (e instanceof ApiError && e.status === 401) setStatus('signed-out');
      else {
        setStatus('error');
        setError(e instanceof Error ? e.message : 'Sync failed');
      }
    } finally {
      busy.current = false;
      if (queued.current) {
        queued.current = false;
        void syncRef.current();
      }
    }
  }, [userId, api]);
  syncRef.current = syncNow;

  // When someone signs in (or out), decide what happens to the data already on this device.
  useEffect(() => {
    ready.current = false;
    if (!userId) {
      setStatus('signed-out');
      return;
    }
    const d = dataRef.current;
    let decision = decideAdoption(metaRef.current, userId, hasLocalData(d.getSnapshot()));
    if (
      decision === 'ask-upload' &&
      !window.confirm('Upload the workouts and routines on this device to your account?\n\nChoose Cancel to start with an empty account and remove them from this device.')
    ) {
      decision = 'wipe-and-continue';
    }
    if (decision === 'wipe-and-continue') {
      d.resetAll();
      metaRef.current = emptyMeta(userId);
    } else {
      metaRef.current = { ...metaRef.current, userId };
    }
    saveMeta(metaRef.current);
    ready.current = true;
    void syncRef.current();
  }, [userId]);

  // Background triggers: timer, coming back online, tab becoming visible.
  useEffect(() => {
    if (!userId) return;
    const run = () => void syncRef.current();
    const onVisible = () => document.visibilityState === 'visible' && run();
    const timer = setInterval(run, POLL_MS);
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', run);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId]);

  // Upload soon after the person changes something.
  useEffect(() => {
    if (!userId || !ready.current) return;
    const t = setTimeout(() => void syncRef.current(), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [userId, data.history, data.routines, data.exercises, data.settings, data.progression]);

  /**
   * Forget what we think the server has. Used after "reset this device" so the next sync
   * restores from the cloud instead of deleting cloud data.
   */
  const forgetSyncState = useCallback(() => {
    metaRef.current = emptyMeta(userId);
    saveMeta(metaRef.current);
  }, [userId]);

  /**
   * Detach this device from any account (used after the account is deleted) so the data
   * here is treated as unsynced the next time someone signs in.
   */
  const releaseDevice = useCallback(() => {
    metaRef.current = emptyMeta(null);
    saveMeta(metaRef.current);
  }, []);

  return { status, lastSyncedAt, error, syncNow: () => syncRef.current(), forgetSyncState, releaseDevice };
}

export type SyncApi = ReturnType<typeof useSync>;
