import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, createApiClient, defaultApiBaseUrl, type ApiUser } from '../api/client';
import { loadSession, saveSession, type Session } from '../auth/session';

export interface CoachInfo {
  id: string;
  name: string;
}

/** Login state. Everything works signed out; signing in only adds sync and the coach features. */
export function useAuth() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [coach, setCoach] = useState<CoachInfo | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(session?.token ?? null);

  const clearSession = useCallback(() => {
    tokenRef.current = null;
    saveSession(null);
    setSession(null);
    setCoach(null);
  }, []);

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: defaultApiBaseUrl(),
        getToken: () => tokenRef.current,
        onUnauthorized: () => {
          clearSession();
          setNotice('Your session expired. Please sign in again.');
        },
      }),
    [clearSession]
  );

  const adopt = useCallback((s: Session) => {
    tokenRef.current = s.token;
    saveSession(s);
    setSession(s);
    setNotice(null);
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const me = await api.me();
      setCoach(me.coach);
      setSession((prev) => {
        if (!prev) return prev;
        const next = { ...prev, user: me.user };
        saveSession(next);
        return next;
      });
    } catch {
      /* offline: keep what we have */
    }
  }, [api]);

  // Learn who our coach is (and pick up role changes) whenever we are signed in.
  const userId = session?.user.id;
  useEffect(() => {
    if (userId) void refreshMe();
  }, [userId, refreshMe]);

  const login = useCallback(
    async (email: string, password: string) => adopt(await api.login({ email, password })),
    [api, adopt]
  );

  const register = useCallback(
    async (b: { email: string; name: string; password: string; inviteCode?: string }) =>
      adopt(await api.register(b)),
    [api, adopt]
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* the token may already be invalid or we are offline; either way sign out here */
    }
    clearSession();
  }, [api, clearSession]);

  const leaveCoach = useCallback(async () => {
    await api.leaveCoach();
    setCoach(null);
  }, [api]);

  const deleteAccount = useCallback(
    async (password: string) => {
      await api.deleteAccount(password);
      clearSession();
    },
    [api, clearSession]
  );

  return {
    api,
    user: (session?.user ?? null) as ApiUser | null,
    coach,
    notice,
    dismissNotice: () => setNotice(null),
    login, register, logout, leaveCoach, deleteAccount, refreshMe,
  };
}

export type Auth = ReturnType<typeof useAuth>;

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'rate_limited') return 'Too many attempts. Wait a few minutes and try again.';
    return e.message;
  }
  return 'Something went wrong. Please try again.';
}
