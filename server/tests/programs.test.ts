import { beforeEach, describe, expect, it } from 'bun:test';
import { setup, workout, type Api } from './helpers';

let api: Api;
beforeEach(async () => { ({ api } = await setup()); });

const ex = (over: Record<string, unknown> = {}) => ({
  exerciseId: 'bench', name: 'Bench Press', category: 'Chest', equipment: 'Barbell', sets: 3, reps: 8, restSeconds: 120, ...over,
});
const program = (over: Record<string, unknown> = {}) => ({
  name: 'Strength block', notes: 'Eat well', weeks: 4,
  sessions: [
    { id: 'push', day: 0, name: 'Push', exercises: [ex()] },
    { id: 'pull', day: 2, name: 'Pull', exercises: [ex({ exerciseId: 'row', name: 'Row', category: 'Back' })] },
  ],
  ...over,
});

async function coachAndClient() {
  const coach = await api.register('coach@x.com', 'Coach');
  const inv = await api.call('POST', '/coach/invites', { token: coach.token, body: {} });
  const client = await api.register('sam@x.com', 'Sam', { inviteCode: inv.body.code });
  return { coach, client };
}

async function assigned() {
  const { coach, client } = await coachAndClient();
  const p = await api.call('POST', '/coach/programs', { token: coach.token, body: program() });
  expect(p.status).toBe(200);
  const a = await api.call('POST', `/coach/programs/${p.body.id}/assign`, { token: coach.token, body: { clientId: client.id, startDate: '2026-11-09' } });
  expect(a.status).toBe(200);
  return { coach, client, programId: p.body.id as string, assignmentId: a.body.id as string };
}

describe('program authoring', () => {
  it('creates, lists, reads, updates and deletes a coach\'s own programs', async () => {
    const coach = await api.register('coach@x.com', 'Coach');
    const c = await api.call('POST', '/coach/programs', { token: coach.token, body: program() });
    expect(c.status).toBe(200);
    expect(c.body.sessions).toHaveLength(2);
    const list = await api.call('GET', '/coach/programs', { token: coach.token });
    expect(list.body.programs.map((p: any) => p.name)).toEqual(['Strength block']);
    const u = await api.call('PUT', `/coach/programs/${c.body.id}`, { token: coach.token, body: program({ name: 'Renamed', weeks: 6 }) });
    expect(u.body).toMatchObject({ name: 'Renamed', weeks: 6 });
    expect((await api.call('GET', `/coach/programs/${c.body.id}`, { token: coach.token })).body.name).toBe('Renamed');
    expect((await api.call('DELETE', `/coach/programs/${c.body.id}`, { token: coach.token })).status).toBe(200);
    expect((await api.call('GET', `/coach/programs/${c.body.id}`, { token: coach.token })).status).toBe(404);
  });

  it('rejects malformed programs', async () => {
    const coach = await api.register('coach@x.com', 'Coach');
    const bad = async (body: unknown) => (await api.call('POST', '/coach/programs', { token: coach.token, body })).status;
    expect(await bad(program({ weeks: 0 }))).toBe(400);
    expect(await bad(program({ weeks: 53 }))).toBe(400);
    expect(await bad(program({ weeks: 1.5 }))).toBe(400);
    expect(await bad(program({ sessions: [] }))).toBe(400);
    expect(await bad(program({ sessions: 'x' }))).toBe(400);
    expect(await bad(program({ sessions: [{ id: 'a', day: 7, name: 'x', exercises: [ex()] }] }))).toBe(400);
    expect(await bad(program({ sessions: [{ id: 'a', day: 0, name: 'x', exercises: [] }] }))).toBe(400);
    expect(await bad(program({ sessions: [{ id: 'a', day: 0, name: 'x', exercises: [ex({ sets: 0 })] }] }))).toBe(400);
    expect(await bad(program({ sessions: [{ id: 'a', day: 0, name: 'x', exercises: [ex({ reps: '8' })] }] }))).toBe(400);
    expect(await bad(program({ sessions: [{ id: 'a', day: 0, name: 'x', exercises: [ex()] }, { id: 'a', day: 1, name: 'y', exercises: [ex()] }] }))).toBe(400);
    expect(await bad(program({ name: '' }))).toBe(400);
    expect(await bad(program({ name: 'x'.repeat(101) }))).toBe(400);
  });

  it('keeps programs private to the coach who wrote them, and clients cannot author', async () => {
    const { coach, client } = await coachAndClient();
    const other = await api.register('other@x.com', 'Other');
    const p = await api.call('POST', '/coach/programs', { token: coach.token, body: program() });
    for (const [m, path] of [['GET', `/coach/programs/${p.body.id}`], ['PUT', `/coach/programs/${p.body.id}`], ['DELETE', `/coach/programs/${p.body.id}`]] as const) {
      expect((await api.call(m, path, { token: other.token, body: program() })).status).toBe(404);
    }
    expect((await api.call('GET', '/coach/programs', { token: other.token })).body.programs).toEqual([]);
    expect((await api.call('POST', '/coach/programs', { token: client.token, body: program() })).status).toBe(403);
    expect((await api.call('GET', '/coach/programs')).status).toBe(401);
  });

  it('ignores unexpected fields and unsafe session ids', async () => {
    const coach = await api.register('coach@x.com', 'Coach');
    const r = await api.call('POST', '/coach/programs', {
      token: coach.token,
      body: program({ admin: true, sessions: [{ id: '../x y', day: 0, name: 'A', evil: 1, exercises: [ex({ extra: 1 })] }] }),
    });
    expect(r.status).toBe(200);
    expect(r.body.admin).toBeUndefined();
    expect(r.body.sessions[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.body.sessions[0].evil).toBeUndefined();
    expect(r.body.sessions[0].exercises[0].extra).toBeUndefined();
  });
});

describe('assignment', () => {
  it('shows the client their plan, with the coach name', async () => {
    const { client, assignmentId } = await assigned();
    const mine = await api.call('GET', '/me/program', { token: client.token });
    expect(mine.status).toBe(200);
    expect(mine.body.assignment).toMatchObject({ id: assignmentId, startDate: '2026-11-09', coach: { name: 'Coach' } });
    expect(mine.body.assignment.program.sessions.map((s: any) => s.name)).toEqual(['Push', 'Pull']);
  });

  it('has no plan until one is assigned', async () => {
    const { client } = await coachAndClient();
    expect((await api.call('GET', '/me/program', { token: client.token })).body.assignment).toBeNull();
  });

  it('refuses clients who are not this coach\'s, and bad dates', async () => {
    const { coach } = await coachAndClient();
    const stranger = await api.register('stranger@x.com', 'Stranger');
    const p = await api.call('POST', '/coach/programs', { token: coach.token, body: program() });
    const go = (clientId: string, startDate: unknown) =>
      api.call('POST', `/coach/programs/${p.body.id}/assign`, { token: coach.token, body: { clientId, startDate } });
    expect((await go(stranger.id, '2026-11-09')).status).toBe(404);
    expect((await go('not-a-uuid', '2026-11-09')).status).toBe(404);
    const { client } = await coachAndClient2(coach);
    expect((await go(client.id, '2026-02-30')).status).toBe(400);
    expect((await go(client.id, 'tomorrow')).status).toBe(400);
    expect((await go(client.id, '2026-11-09')).status).toBe(200);
  });

  it('a second assignment replaces the first, and a program in use cannot be deleted', async () => {
    const { coach, client, programId } = await assigned();
    expect((await api.call('DELETE', `/coach/programs/${programId}`, { token: coach.token })).status).toBe(409);
    const p2 = await api.call('POST', '/coach/programs', { token: coach.token, body: program({ name: 'Second' }) });
    await api.call('POST', `/coach/programs/${p2.body.id}/assign`, { token: coach.token, body: { clientId: client.id, startDate: '2026-12-01' } });
    const mine = await api.call('GET', '/me/program', { token: client.token });
    expect(mine.body.assignment.program.name).toBe('Second');
    expect((await api.call('DELETE', `/coach/programs/${programId}`, { token: coach.token })).status).toBe(200);
  });

  it('a coach editing a program updates what the client sees', async () => {
    const { coach, client, programId } = await assigned();
    await api.call('PUT', `/coach/programs/${programId}`, { token: coach.token, body: program({ weeks: 8 }) });
    expect((await api.call('GET', '/me/program', { token: client.token })).body.assignment.program.weeks).toBe(8);
  });

  it('coaches cannot call the client endpoint and vice versa', async () => {
    const { coach, client } = await assigned();
    expect((await api.call('GET', '/me/program', { token: coach.token })).status).toBe(403);
    expect((await api.call('GET', `/coach/clients/${client.id}/program`, { token: client.token })).status).toBe(403);
  });

  it('ending a plan removes it for the client', async () => {
    const { coach, client } = await assigned();
    expect((await api.call('DELETE', `/coach/clients/${client.id}/program`, { token: coach.token })).status).toBe(200);
    expect((await api.call('GET', '/me/program', { token: client.token })).body.assignment).toBeNull();
    expect((await api.call('GET', `/coach/clients/${client.id}/program`, { token: coach.token })).body.assignment).toBeNull();
  });
});

describe('link changes', () => {
  it('leaving the coach ends the plan, and it does not come back with a new coach', async () => {
    const { client, coach } = await assigned();
    await api.call('DELETE', '/me/coach', { token: client.token });
    expect((await api.call('GET', '/me/program', { token: client.token })).body.assignment).toBeNull();
    // Re-joining the same coach must not revive the old plan.
    const inv = await api.call('POST', '/coach/invites', { token: coach.token, body: {} });
    const again = await api.register('sam2@x.com', 'Sam2', { inviteCode: inv.body.code });
    expect((await api.call('GET', '/me/program', { token: again.token })).body.assignment).toBeNull();
    const rows = await api.call('GET', `/coach/clients/${client.id}/program`, { token: coach.token });
    expect(rows.status).toBe(404);
  });

  it('a coach removing a client ends their plan', async () => {
    const { coach, client } = await assigned();
    await api.call('DELETE', `/coach/clients/${client.id}`, { token: coach.token });
    expect((await api.call('GET', '/me/program', { token: client.token })).body.assignment).toBeNull();
  });
});

describe('plan vs actual', () => {
  it('reports workouts the client logged against the plan, and nothing else', async () => {
    const { coach, client, assignmentId } = await assigned();
    const log = (id: string, ref: unknown, end = 1_700_000_000_000) =>
      workout(id, end, { endTime: end, ...(ref ? { programRef: ref } : {}) });
    const push = await api.call('POST', '/sync/push', {
      token: client.token,
      body: { changes: [
        log('w1', { assignmentId, sessionId: 'push', week: 0 }, 1_700_000_001_000),
        log('w2', { assignmentId, sessionId: 'pull', week: 0 }, 1_700_000_002_000),
        log('w3', null),
        log('w4', { assignmentId: 'someone-elses', sessionId: 'push', week: 0 }),
        log('w5', { assignmentId, sessionId: 'push', week: 'x' }),
      ] },
    });
    expect(push.status).toBe(200);
    const r = await api.call('GET', `/coach/clients/${client.id}/program`, { token: coach.token });
    expect(r.body.assignment.startDate).toBe('2026-11-09');
    expect(r.body.completions.map((c: any) => c.workoutId).sort()).toEqual(['w1', 'w2']);
    expect(r.body.completions.find((c: any) => c.workoutId === 'w1')).toMatchObject({ sessionId: 'push', week: 0, completedAt: 1_700_000_001_000 });
  });

  it('does not count deleted workouts', async () => {
    const { coach, client, assignmentId } = await assigned();
    const base = { id: 'w1', name: 'x', endTime: 5, programRef: { assignmentId, sessionId: 'push', week: 0 } };
    await api.call('POST', '/sync/push', { token: client.token, body: { changes: [{ kind: 'workout', id: 'w1', updatedAt: 1, data: base }] } });
    await api.call('POST', '/sync/push', { token: client.token, body: { changes: [{ kind: 'workout', id: 'w1', updatedAt: 2, data: null, deleted: true }] } });
    const r = await api.call('GET', `/coach/clients/${client.id}/program`, { token: coach.token });
    expect(r.body.completions).toEqual([]);
  });

  it('is not visible to a coach who is not linked to the client', async () => {
    const { client } = await assigned();
    const other = await api.register('other@x.com', 'Other');
    expect((await api.call('GET', `/coach/clients/${client.id}/program`, { token: other.token })).status).toBe(404);
  });
});

async function coachAndClient2(coach: { token: string }) {
  const inv = await api.call('POST', '/coach/invites', { token: coach.token, body: {} });
  const client = await api.register('c2@x.com', 'C2', { inviteCode: inv.body.code });
  return { client };
}
