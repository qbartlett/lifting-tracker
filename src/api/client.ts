export type Role = 'coach' | 'client';

export interface ApiUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export type SyncKind = 'workout' | 'routine' | 'exercise' | 'settings' | 'progression';

export interface PushChange {
  kind: SyncKind;
  id: string;
  data?: unknown;
  deleted?: boolean;
  updatedAt: number;
}

export interface RemoteChange {
  kind: SyncKind;
  id: string;
  data: unknown;
  deleted: boolean;
  updatedAt: number;
  seq: number;
}

export interface PullResult {
  changes: RemoteChange[];
  cursor: number;
  hasMore: boolean;
}

export interface PushResult {
  accepted: { kind: SyncKind; id: string }[];
  rejected: { kind: SyncKind; id: string; reason: string; serverUpdatedAt: number }[];
  cursor: number;
}

export interface ClientSummary {
  id: string;
  name: string;
  email: string;
  linkedAt: string;
  lastWorkoutAt: number | null;
}

export interface InviteSummary {
  id: string;
  label: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  status: 'pending' | 'used' | 'expired';
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  /** Called when the server says the session is no longer valid. */
  onUnauthorized?: () => void;
  fetchFn?: typeof fetch;
}

export function createApiClient(opts: ApiClientOptions) {
  const doFetch = opts.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a));

  async function request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    const token = opts.getToken();
    if (auth && token) headers.authorization = `Bearer ${token}`;

    let res: Response;
    try {
      res = await doFetch(`${opts.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'network', 'Cannot reach the server. Check your connection.');
    }

    let payload: any = null;
    try {
      payload = await res.json();
    } catch {
      /* empty or non-JSON body */
    }
    if (!res.ok) {
      const code = payload?.error?.code ?? 'error';
      // A rejected login is a 401 too, but it is not an expired session.
      if (res.status === 401 && auth && code === 'unauthorized') opts.onUnauthorized?.();
      throw new ApiError(res.status, code, payload?.error?.message ?? `Request failed (${res.status})`);
    }
    return payload as T;
  }

  const q = (params: Record<string, string | number>) =>
    '?' + Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');

  return {
    register: (b: { email: string; name: string; password: string; inviteCode?: string }) =>
      request<{ token: string; user: ApiUser }>('POST', '/auth/register', b, false),
    login: (b: { email: string; password: string }) =>
      request<{ token: string; user: ApiUser }>('POST', '/auth/login', b, false),
    logout: () => request<{ ok: true }>('POST', '/auth/logout'),
    me: () => request<{ user: ApiUser; coach: { id: string; name: string } | null }>('GET', '/me'),
    leaveCoach: () => request<{ ok: true }>('DELETE', '/me/coach'),
    deleteAccount: (password: string) => request<{ ok: true }>('DELETE', '/me', { password }),

    createInvite: (label?: string) =>
      request<{ id: string; code: string; label: string | null; expiresAt: string }>('POST', '/coach/invites', label ? { label } : {}),
    listInvites: () => request<{ invites: InviteSummary[] }>('GET', '/coach/invites'),
    revokeInvite: (id: string) => request<{ ok: true }>('DELETE', `/coach/invites/${encodeURIComponent(id)}`),
    listClients: () => request<{ clients: ClientSummary[] }>('GET', '/coach/clients'),
    removeClient: (id: string) => request<{ ok: true }>('DELETE', `/coach/clients/${encodeURIComponent(id)}`),
    pullClient: (id: string, since: number, limit = 500) =>
      request<PullResult>('GET', `/coach/clients/${encodeURIComponent(id)}/pull${q({ since, limit })}`),

    push: (changes: PushChange[]) => request<PushResult>('POST', '/sync/push', { changes }),
    pull: (since: number, limit = 500) => request<PullResult>('GET', `/sync/pull${q({ since, limit })}`),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

export function defaultApiBaseUrl(): string {
  const env = (import.meta as any).env ?? {};
  return env.VITE_API_URL ?? (env.DEV ? 'http://localhost:8787' : '');
}
