import { describe, expect, it } from 'bun:test';
import { ApiError, createApiClient } from './client';

function fakeFetch(handler: (url: string, init: RequestInit) => { status: number; body?: unknown } | 'throw') {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = handler(url, init);
    if (r === 'throw') throw new TypeError('fetch failed');
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('api client', () => {
  it('sends the bearer token and JSON bodies', async () => {
    const { fn, calls } = fakeFetch(() => ({ status: 200, body: { changes: [], cursor: 0, hasMore: false } }));
    const api = createApiClient({ baseUrl: 'http://x', getToken: () => 'tok', fetchFn: fn });
    await api.pull(7, 50);
    expect(calls[0].url).toBe('http://x/sync/pull?since=7&limit=50');
    expect((calls[0].init.headers as any).authorization).toBe('Bearer tok');
    await api.push([{ kind: 'workout', id: 'w', data: {}, updatedAt: 1 }]);
    expect((calls[1].init.headers as any)['content-type']).toBe('application/json');
    expect(JSON.parse(calls[1].init.body as string).changes).toHaveLength(1);
  });

  it('does not send a token on login/register', async () => {
    const { fn, calls } = fakeFetch(() => ({ status: 200, body: {} }));
    const api = createApiClient({ baseUrl: '', getToken: () => 'tok', fetchFn: fn });
    await api.login({ email: 'a@b.co', password: 'x' });
    expect((calls[0].init.headers as any).authorization).toBeUndefined();
  });

  it('turns error responses into ApiError with the server code', async () => {
    const { fn } = fakeFetch(() => ({ status: 400, body: { error: { code: 'invalid_invite', message: 'bad code' } } }));
    const api = createApiClient({ baseUrl: '', getToken: () => null, fetchFn: fn });
    const err = await api.register({ email: 'a@b.co', name: 'A', password: 'x'.repeat(12) }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'invalid_invite', message: 'bad code' });
  });

  it('reports network failures as status 0', async () => {
    const { fn } = fakeFetch(() => 'throw');
    const api = createApiClient({ baseUrl: '', getToken: () => null, fetchFn: fn });
    const err = await api.me().catch((e) => e);
    expect(err.isNetwork).toBe(true);
  });

  it('calls onUnauthorized for an expired session but not for a wrong password', async () => {
    let n = 0;
    const expired = fakeFetch(() => ({ status: 401, body: { error: { code: 'unauthorized', message: '' } } }));
    await createApiClient({ baseUrl: '', getToken: () => 't', fetchFn: expired.fn, onUnauthorized: () => n++ }).me().catch(() => {});
    expect(n).toBe(1);
    const wrong = fakeFetch(() => ({ status: 401, body: { error: { code: 'invalid_credentials', message: '' } } }));
    await createApiClient({ baseUrl: '', getToken: () => null, fetchFn: wrong.fn, onUnauthorized: () => n++ }).login({ email: 'a@b.co', password: 'x' }).catch(() => {});
    expect(n).toBe(1);
  });

  it('url-encodes ids', async () => {
    const { fn, calls } = fakeFetch(() => ({ status: 200, body: { changes: [], cursor: 0, hasMore: false } }));
    const api = createApiClient({ baseUrl: '', getToken: () => 't', fetchFn: fn });
    await api.pullClient('a/b c', 0);
    expect(calls[0].url).toContain('/coach/clients/a%2Fb%20c/pull');
  });

  it('forgot/reset password never send a session token', async () => {
    const { fn, calls } = fakeFetch(() => ({ status: 200, body: { ok: true } }));
    const api = createApiClient({ baseUrl: 'http://x', getToken: () => 'tok', fetchFn: fn });
    await api.forgotPassword('a@b.co');
    await api.resetPassword('t'.repeat(30), 'a brand new password');
    expect(calls.map((c) => c.url)).toEqual(['http://x/auth/forgot', 'http://x/auth/reset']);
    for (const c of calls) expect((c.init.headers as any).authorization).toBeUndefined();
    expect(JSON.parse(calls[1].init.body as string)).toEqual({ token: 't'.repeat(30), password: 'a brand new password' });
  });

  it('talks to the program endpoints', async () => {
    const { fn, calls } = fakeFetch(() => ({ status: 200, body: { assignment: null, completions: [] } }));
    const api = createApiClient({ baseUrl: '/api', getToken: () => 't', fetchFn: fn });
    await api.myProgram();
    await api.clientProgram('c/1');
    await api.assignProgram('p1', 'c1', '2026-11-09');
    await api.updateProgram('p1', { id: 'p1', name: 'N', notes: null, weeks: 4, sessions: [] });
    await api.endClientProgram('c1');
    expect(calls.map((c) => `${c.init.method} ${c.url}`)).toEqual([
      'GET /api/me/program',
      'GET /api/coach/clients/c%2F1/program',
      'POST /api/coach/programs/p1/assign',
      'PUT /api/coach/programs/p1',
      'DELETE /api/coach/clients/c1/program',
    ]);
    expect(JSON.parse(calls[2].init.body as string)).toEqual({ clientId: 'c1', startDate: '2026-11-09' });
    // The id is never sent in the body; the server takes it from the URL.
    expect(Object.keys(JSON.parse(calls[3].init.body as string)).sort()).toEqual(['name', 'notes', 'sessions', 'weeks']);
  });

  it('talks to the sheet endpoints', async () => {
    const { fn, calls } = fakeFetch(() => ({ status: 200, body: {} }));
    const api = createApiClient({ baseUrl: '/api', getToken: () => 't', fetchFn: fn });
    await api.sheets();
    await api.connectSheet('https://docs.google.com/spreadsheets/d/abc');
    await api.syncSheet('l/1');
    await api.mapSheetTab('l1', 'Sam', 'c1', '2026-11-09');
    await api.mapSheetTab('l1', 'Sam', null, '2026-11-09');
    await api.addSheetTab('l1', 'c1', '2026-11-09');
    await api.disconnectSheet('l1');
    expect(calls.map((c) => `${c.init.method} ${c.url}`)).toEqual([
      'GET /api/coach/sheets',
      'POST /api/coach/sheets',
      'POST /api/coach/sheets/l%2F1/sync',
      'PUT /api/coach/sheets/l1/mappings',
      'PUT /api/coach/sheets/l1/mappings',
      'POST /api/coach/sheets/l1/tabs',
      'DELETE /api/coach/sheets/l1',
    ]);
    expect(JSON.parse(calls[3].init.body as string)).toEqual({ tab: 'Sam', clientId: 'c1', startDate: '2026-11-09' });
    expect(JSON.parse(calls[4].init.body as string).clientId).toBeNull();
  });
});
