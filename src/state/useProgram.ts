import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiClient, ApiUser } from '../api/client';
import { loadCachedAssignment, saveCachedAssignment } from '../auth/programCache';
import type { ProgramAssignment } from '../types/program';
import { errorMessage } from './useAuth';

/**
 * The plan a coach assigned to this client. Shown from the last saved copy right away
 * (the gym often has no signal) and refreshed from the server whenever possible.
 */
export function useProgram(api: ApiClient, user: ApiUser | null, coachId: string | null) {
  const userId = user?.id ?? null;
  const isClient = user?.role === 'client';
  const [assignment, setAssignment] = useState<ProgramAssignment | null>(() =>
    userId && isClient ? loadCachedAssignment(userId) : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  // Switching accounts must never show the previous person's plan.
  useEffect(() => {
    setAssignment(userId && isClient ? loadCachedAssignment(userId) : null);
    setError(null);
  }, [userId, isClient]);

  const refresh = useCallback(async () => {
    if (!userId || !isClient) return;
    const mine = ++seq.current;
    setLoading(true);
    try {
      const r = await api.myProgram();
      if (mine !== seq.current) return; // a newer refresh (or sign-out) superseded this one
      setAssignment(r.assignment);
      saveCachedAssignment(userId, r.assignment);
      setError(null);
    } catch (e) {
      if (mine !== seq.current) return;
      setError(errorMessage(e)); // keep showing the saved copy
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [api, userId, isClient]);

  // Refresh on sign-in, when the coach changes (joined or left), and when the app comes back online or into view.
  useEffect(() => {
    void refresh();
    const onWake = () => { if (document.visibilityState !== 'hidden') void refresh(); };
    window.addEventListener('online', onWake);
    document.addEventListener('visibilitychange', onWake);
    return () => {
      seq.current++;
      window.removeEventListener('online', onWake);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, [refresh, coachId]);

  return { assignment, loading, error, refresh };
}
