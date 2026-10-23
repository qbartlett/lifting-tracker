import { beforeEach, describe, expect, it } from 'bun:test';
import { setup, workout, type Api } from './helpers';

let api: Api;
let t: string; let other: string;
beforeEach(async () => {
  ({ api } = await setup());
  t = (await api.register('a@x.com', 'A')).token;
  other = (await api.register('b@x.com', 'B')).token;
});

const push = (token: string, changes: unknown[]) => api.call('POST', '/sync/push', { token, body: { changes } });
const pull = (token: string, qs = '') => api.call('GET', `/sync/pull${qs}`, { token });

describe('sync', () => {
  it('round-trips documents', async () => {
    const r = await push(t, [workout('w1', 1000, { totalVolume: 123 })]);
    expect(r.status).toBe(200);
    expect(r.body.accepted).toEqual([{ kind: 'workout', id: 'w1' }]);
    const p = await pull(t);
    expect(p.body.changes).toHaveLength(1);
    expect(p.body.changes[0]).toMatchObject({ kind: 'workout', id: 'w1', deleted: false, updatedAt: 1000 });
    expect(p.body.changes[0].data).toEqual({ id: 'w1', name: 'Workout w1', totalVolume: 123 });
    expect(p.body.cursor).toBe(p.body.changes[0].seq);
  });

  it('last write wins by updatedAt and reports stale writes', async () => {
    await push(t, [workout('w1', 2000, { v: 'new' })]);
    const stale = await push(t, [workout('w1', 1000, { v: 'old' })]);
    expect(stale.body.accepted).toEqual([]);
    expect(stale.body.rejected).toEqual([{ kind: 'workout', id: 'w1', reason: 'stale', serverUpdatedAt: 2000 }]);
    expect((await pull(t)).body.changes[0].data.v).toBe('new');
    const newer = await push(t, [workout('w1', 3000, { v: 'newest' })]);
    expect(newer.body.accepted).toHaveLength(1);
    expect((await pull(t)).body.changes[0].data.v).toBe('newest');
  });

  it('treats a retry with the same timestamp as success without a new seq', async () => {
    await push(t, [workout('w1', 1000)]);
    const before = (await pull(t)).body.cursor;
    const retry = await push(t, [workout('w1', 1000)]);
    expect(retry.body.accepted).toHaveLength(1);
    expect(retry.body.rejected).toEqual([]);
    expect((await pull(t)).body.cursor).toBe(before);
  });

  it('syncs deletions as tombstones', async () => {
    await push(t, [workout('w1', 1000)]);
    await push(t, [{ kind: 'workout', id: 'w1', updatedAt: 2000, deleted: true }]);
    const p = await pull(t);
    expect(p.body.changes[0]).toMatchObject({ id: 'w1', deleted: true, data: null });
  });

  it('pulls incrementally using the cursor', async () => {
    await push(t, [workout('w1', 1000), workout('w2', 1000)]);
    const first = await pull(t);
    expect(first.body.changes).toHaveLength(2);
    await push(t, [workout('w3', 1000)]);
    const next = await pull(t, `?since=${first.body.cursor}`);
    expect(next.body.changes.map((c: any) => c.id)).toEqual(['w3']);
    const none = await pull(t, `?since=${next.body.cursor}`);
    expect(none.body.changes).toEqual([]);
    expect(none.body.cursor).toBe(next.body.cursor);
  });

  it('pages large pulls', async () => {
    await push(t, Array.from({ length: 5 }, (_, i) => workout(`w${i}`, 1000)));
    const p1 = await pull(t, '?limit=2');
    expect(p1.body.changes).toHaveLength(2);
    expect(p1.body.hasMore).toBe(true);
    const p2 = await pull(t, `?limit=2&since=${p1.body.cursor}`);
    const p3 = await pull(t, `?limit=2&since=${p2.body.cursor}`);
    expect([...p1.body.changes, ...p2.body.changes, ...p3.body.changes].map((c: any) => c.id)).toEqual(['w0', 'w1', 'w2', 'w3', 'w4']);
    expect(p3.body.hasMore).toBe(false);
  });

  it("keeps users' data completely separate, even with the same document ids", async () => {
    await push(t, [workout('shared-id', 1000, { owner: 'A' })]);
    await push(other, [workout('shared-id', 500, { owner: 'B' })]);
    expect((await pull(t)).body.changes[0].data.owner).toBe('A');
    expect((await pull(other)).body.changes[0].data.owner).toBe('B');
  });

  it('requires auth', async () => {
    expect((await api.call('GET', '/sync/pull')).status).toBe(401);
    expect((await api.call('POST', '/sync/push', { body: { changes: [] } })).status).toBe(401);
  });

  it('validates changes', async () => {
    const bad = async (c: unknown, expectCode = 400) => expect((await push(t, [c])).status).toBe(expectCode);
    await bad({ kind: 'secrets', id: 'x', updatedAt: 1, data: {} });
    await bad({ kind: 'workout', id: '', updatedAt: 1, data: {} });
    await bad({ kind: 'workout', id: 'x'.repeat(121), updatedAt: 1, data: {} });
    await bad({ kind: 'workout', id: 'x', updatedAt: 0, data: {} });
    await bad({ kind: 'workout', id: 'x', updatedAt: 1.5, data: {} });
    await bad({ kind: 'workout', id: 'x', updatedAt: Date.now() + 10 * 86_400_000, data: {} });
    await bad({ kind: 'workout', id: 'x', updatedAt: 1, data: 'string' });
    await bad({ kind: 'workout', id: 'x', updatedAt: 1 });
    await bad('nope');
    expect((await api.call('POST', '/sync/push', { token: t, body: { changes: 'x' } })).status).toBe(400);
    expect((await pull(t, '?since=abc')).status).toBe(400);
    expect((await pull(t, '?limit=100000')).status).toBe(400);
  });

  it('limits batch size, document size, duplicates, and does not partially apply a bad batch', async () => {
    expect((await push(t, Array.from({ length: 201 }, (_, i) => workout(`w${i}`, 1000)))).status).toBe(400);
    expect((await push(t, [workout('big', 1000, { blob: 'x'.repeat(300_000) })])).status).toBe(400);
    expect((await push(t, [workout('d', 1000), workout('d', 2000)])).status).toBe(400);
    expect((await push(t, [workout('ok', 1000), { kind: 'bogus', id: 'x', updatedAt: 1, data: {} }])).status).toBe(400);
    expect((await pull(t)).body.changes).toEqual([]);
  });

  it('stores data safely when it contains quotes and SQL-looking text', async () => {
    const nasty = { note: "Robert'); DROP TABLE docs;--", emoji: '💪', nested: { a: [1, 2, { b: null }] } };
    await push(t, [workout('n1', 1000, nasty)]);
    const p = await pull(t);
    expect(p.body.changes[0].data).toMatchObject(nasty);
  });

  it('serialises concurrent pushes from one user without losing or duplicating data', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => push(t, [workout(`c${i}`, 1000), workout('contended', 1000 + i)]))
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    const p = await pull(t);
    expect(p.body.changes).toHaveLength(9);
    expect(p.body.changes.find((c: any) => c.id === 'contended').updatedAt).toBe(1007);
    const seqs = p.body.changes.map((c: any) => c.seq);
    expect(new Set(seqs).size).toBe(seqs.length);
  });
});
