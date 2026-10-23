import { beforeEach, describe, expect, it } from 'bun:test';
import { setup, workout, type Api } from './helpers';
import type { SQL } from 'bun';

let api: Api; let sql: SQL;
beforeEach(async () => { ({ api, sql } = await setup()); });

const PW = 'correct horse battery';

async function invite(coachToken: string, label?: string) {
  const r = await api.call('POST', '/coach/invites', { token: coachToken, body: label ? { label } : {} });
  expect(r.status).toBe(200);
  return r.body as { id: string; code: string };
}

async function addClient(coachToken: string, email: string, name = 'Client') {
  const inv = await invite(coachToken);
  return api.register(email, name, { inviteCode: inv.code });
}

describe('invites and linking', () => {
  it('lets a client join with a coach invite and links them', async () => {
    const coach = await api.register('coach@x.com', 'Coach');
    const inv = await invite(coach.token, 'Sam');
    expect(inv.code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    const client = await api.register('sam@x.com', 'Sam', { inviteCode: inv.code });
    const me = await api.call('GET', '/me', { token: client.token });
    expect(me.body.user.role).toBe('client');
    expect(me.body.coach).toMatchObject({ id: coach.id, name: 'Coach' });
    const list = await api.call('GET', '/coach/clients', { token: coach.token });
    expect(list.body.clients.map((c: any) => c.id)).toEqual([client.id]);
  });

  it('accepts codes typed in lower case or with spaces', async () => {
    const coach = await api.register('coach@x.com', 'Coach');
    const inv = await invite(coach.token);
    const r = await api.call('POST', '/auth/register', {
      body: { email: 's@x.com', name: 'S', password: PW, inviteCode: ` ${inv.code.toLowerCase()} ` },
    });
    expect(r.status).toBe(201);
  });

  it('only stores a hash of the invite code', async () => {
    const coach = await api.register('coach@x.com', 'Coach');
    const inv = await invite(coach.token);
    const [row] = await sql`select code_hash from invites`;
    expect(row.code_hash).not.toContain(inv.code);
    const list = await api.call('GET', '/coach/invites', { token: coach.token });
    expect(JSON.stringify(list.body)).not.toContain(inv.code);
    expect(list.body.invites[0].status).toBe('pending');
  });

  it('invites are single use', async () => {
    const coach = await api.register('coach@x.com', 'Coach');
    const inv = await invite(coach.token);
    await api.register('a@x.com', 'A', { inviteCode: inv.code });
    const second = await api.call('POST', '/auth/register', { body: { email: 'b@x.com', name: 'B', password: PW, inviteCode: inv.code } });
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe('invalid_invite');
    const list = await api.call('GET', '/coach/invites', { token: coach.token });
    expect(list.body.invites[0].status).toBe('used');
  });

  it('rejects expired, revoked and made-up invites', async () => {
    const coach = await api.register('coach@x.com', 'Coach');
    const expired = await invite(coach.token);
    await sql`update invites set expires_at = now() - interval '1 day' where id = ${expired.id}`;
    const revoked = await invite(coach.token);
    expect((await api.call('DELETE', `/coach/invites/${revoked.id}`, { token: coach.token })).status).toBe(200);
    for (const code of [expired.code, revoked.code, 'AAAAA-BBBBB']) {
      const r = await api.call('POST', '/auth/register', { body: { email: `${Math.random()}@x.com`, name: 'X', password: PW, inviteCode: code } });
      expect(r.status).toBe(400);
    }
  });

  it('a failed sign-up (duplicate email) does not burn the invite', async () => {
    const coach = await api.register('coach@x.com', 'Coach');
    const inv = await invite(coach.token);
    const dup = await api.call('POST', '/auth/register', { body: { email: 'coach@x.com', name: 'X', password: PW, inviteCode: inv.code } });
    expect(dup.status).toBe(409);
    const ok = await api.call('POST', '/auth/register', { body: { email: 'new@x.com', name: 'X', password: PW, inviteCode: inv.code } });
    expect(ok.status).toBe(201);
  });

  it('coaches cannot sign up with an invite and clients cannot create invites', async () => {
    const coach = await api.register('coach@x.com', 'Coach');
    const client = await addClient(coach.token, 'c@x.com');
    expect((await api.call('POST', '/coach/invites', { token: client.token, body: {} })).status).toBe(403);
    expect((await api.call('GET', '/coach/clients', { token: client.token })).status).toBe(403);
  });

  it("one coach cannot revoke another coach's invite", async () => {
    const a = await api.register('a@x.com', 'A');
    const b = await api.register('b@x.com', 'B');
    const inv = await invite(a.token);
    expect((await api.call('DELETE', `/coach/invites/${inv.id}`, { token: b.token })).status).toBe(404);
    const list = await api.call('GET', '/coach/invites', { token: b.token });
    expect(list.body.invites).toEqual([]);
  });
});

describe('coach access to client data', () => {
  it("coach can read a linked client's workouts, routines and progression, but not settings", async () => {
    const coach = await api.register('coach@x.com', 'Coach');
    const client = await addClient(coach.token, 'c@x.com');
    await api.call('POST', '/sync/push', { token: client.token, body: { changes: [
      workout('w1', 1000, { totalVolume: 5000 }),
      { kind: 'routine', id: 'r1', updatedAt: 1000, data: { name: 'Day A' } },
      { kind: 'progression', id: 'main', updatedAt: 1000, data: { squat: 200 } },
      { kind: 'settings', id: 'main', updatedAt: 1000, data: { weightUnit: 'kg' } },
    ] } });
    const r = await api.call('GET', `/coach/clients/${client.id}/pull`, { token: coach.token });
    expect(r.status).toBe(200);
    expect(r.body.changes.map((c: any) => c.kind).sort()).toEqual(['progression', 'routine', 'workout']);
    expect(r.body.changes.find((c: any) => c.kind === 'workout').data.totalVolume).toBe(5000);
  });

  it("a coach cannot read a client of a different coach (404, not 403)", async () => {
    const a = await api.register('a@x.com', 'A');
    const b = await api.register('b@x.com', 'B');
    const clientOfA = await addClient(a.token, 'ca@x.com');
    await api.call('POST', '/sync/push', { token: clientOfA.token, body: { changes: [workout('w1', 1000)] } });
    const r = await api.call('GET', `/coach/clients/${clientOfA.id}/pull`, { token: b.token });
    expect(r.status).toBe(404);
    expect(JSON.stringify(r.body)).not.toContain('Workout');
    // and B's client list does not include A's client
    expect((await api.call('GET', '/coach/clients', { token: b.token })).body.clients).toEqual([]);
    // B cannot unlink A's client either
    expect((await api.call('DELETE', `/coach/clients/${clientOfA.id}`, { token: b.token })).status).toBe(404);
    expect((await api.call('GET', '/me', { token: clientOfA.token })).body.coach.id).toBe(a.id);
  });

  it('a coach cannot read another coach, an unlinked user, or a made-up id', async () => {
    const a = await api.register('a@x.com', 'A');
    const b = await api.register('b@x.com', 'B');
    for (const id of [b.id, '00000000-0000-0000-0000-000000000000', 'not-a-uuid', "1'; drop table users;--"]) {
      expect((await api.call('GET', `/coach/clients/${encodeURIComponent(id)}/pull`, { token: a.token })).status).toBe(404);
    }
    expect((await sql`select count(*)::int as n from users`)[0].n).toBe(2);
  });

  it('a coach has no write path into a client\'s data', async () => {
    const coach = await api.register('coach@x.com', 'Coach');
    const client = await addClient(coach.token, 'c@x.com');
    // /sync/push always writes to the caller's own account
    await api.call('POST', '/sync/push', { token: coach.token, body: { changes: [workout('w-coach', 1000)] } });
    const clientDocs = await api.call('GET', '/sync/pull', { token: client.token });
    expect(clientDocs.body.changes).toEqual([]);
    expect((await api.call('POST', `/coach/clients/${client.id}/pull`, { token: coach.token, body: {} })).status).toBe(405);
  });

  it('clients cannot use the coach endpoints on anyone', async () => {
    const coach = await api.register('coach@x.com', 'Coach');
    const c1 = await addClient(coach.token, 'c1@x.com');
    const c2 = await addClient(coach.token, 'c2@x.com');
    expect((await api.call('GET', `/coach/clients/${c2.id}/pull`, { token: c1.token })).status).toBe(403);
  });

  it('access ends when the client leaves their coach', async () => {
    const coach = await api.register('coach@x.com', 'Coach');
    const client = await addClient(coach.token, 'c@x.com');
    await api.call('POST', '/sync/push', { token: client.token, body: { changes: [workout('w1', 1000)] } });
    expect((await api.call('GET', `/coach/clients/${client.id}/pull`, { token: coach.token })).status).toBe(200);
    expect((await api.call('DELETE', '/me/coach', { token: client.token })).status).toBe(200);
    expect((await api.call('GET', `/coach/clients/${client.id}/pull`, { token: coach.token })).status).toBe(404);
    // the client keeps their own data
    expect((await api.call('GET', '/sync/pull', { token: client.token })).body.changes.length).toBe(1);
  });

  it('access ends when the coach removes the client', async () => {
    const coach = await api.register('coach@x.com', 'Coach');
    const client = await addClient(coach.token, 'c@x.com');
    expect((await api.call('DELETE', `/coach/clients/${client.id}`, { token: coach.token })).status).toBe(200);
    expect((await api.call('GET', `/coach/clients/${client.id}/pull`, { token: coach.token })).status).toBe(404);
    expect((await api.call('GET', '/me', { token: client.token })).body.coach).toBeNull();
  });

  it('shows last workout time in the client list', async () => {
    const coach = await api.register('coach@x.com', 'Coach');
    const client = await addClient(coach.token, 'c@x.com', 'Sam');
    let list = await api.call('GET', '/coach/clients', { token: coach.token });
    expect(list.body.clients[0]).toMatchObject({ id: client.id, name: 'Sam', lastWorkoutAt: null });
    await api.call('POST', '/sync/push', { token: client.token, body: { changes: [workout('w1', 5000), workout('w2', 7000)] } });
    list = await api.call('GET', '/coach/clients', { token: coach.token });
    expect(list.body.clients[0].lastWorkoutAt).toBe(7000);
  });

  it("deleting a coach account unlinks clients but keeps the clients' data", async () => {
    const coach = await api.register('coach@x.com', 'Coach');
    const client = await addClient(coach.token, 'c@x.com');
    await api.call('POST', '/sync/push', { token: client.token, body: { changes: [workout('w1', 1000)] } });
    await api.call('DELETE', '/me', { token: coach.token, body: { password: PW } });
    const me = await api.call('GET', '/me', { token: client.token });
    expect(me.body.coach).toBeNull();
    expect((await api.call('GET', '/sync/pull', { token: client.token })).body.changes.length).toBe(1);
  });
});
