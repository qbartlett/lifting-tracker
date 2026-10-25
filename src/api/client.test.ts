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
});
