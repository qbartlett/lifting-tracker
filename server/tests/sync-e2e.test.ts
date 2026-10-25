// Runs the app's real API client and sync engine against the real server code and Postgres.
import { beforeEach, describe, expect, it } from 'bun:test';
import { setup, type Api } from './helpers';
import type { App } from '../src/app';
import { createApiClient } from '../../src/api/client';
import { runSync, emptyMeta, type SyncMeta } from '../../src/sync/engine';
import { applyRemoteChanges, type Snapshot } from '../../src/sync/docs';
import { aRoutine, aWorkout, emptySnapshot } from '../../src/sync/testUtils';

let app: App; let api: Api;
beforeEach(async () => { ({ app, api } = await setup()); });

function device(token: string, userId: string) {
  const client = createApiClient({
    baseUrl: 'http://test',
    getToken: () => token,
    fetchFn: ((url: string, init: RequestInit) => app.handle(new Request(url, init), '10.0.0.1')) as unknown as typeof fetch,
  });
  const d = {
    client,
    state: emptySnapshot() as Snapshot,
    meta: emptyMeta(userId) as SyncMeta,
    async sync() {
      const out = await runSync(d.meta, {
        getSnapshot: () => d.state,
        applyRemote: (c) => { d.state = applyRemoteChanges(d.state, c); },
        transport: client,
      });
      d.meta = out.meta;
      return out;
    },
  };
  return d;
}

describe('app sync engine against the real server', () => {
  it('syncs two devices of one account and converges', async () => {
    const u = await api.register('a@x.com', 'A');
    const phone = device(u.token, u.id); const laptop = device(u.token, u.id);
    phone.state.history = [aWorkout('w1', 5000, 'Leg day')];
    phone.state.routines = [aRoutine('r1')];
    await phone.sync();
    await laptop.sync();
    expect(laptop.state.history.map((w) => w.name)).toEqual(['Leg day']);

    laptop.state.history = [];
    await laptop.sync(); await phone.sync();
    expect(phone.state.history).toEqual([]);
    const again = await phone.sync();
    expect(again.pushed).toBe(0);
  });

  it("a coach sees a client's synced workouts but never their settings", async () => {
    const coach = await api.register('coach@x.com', 'Coach');
    const inv = await api.call('POST', '/coach/invites', { token: coach.token, body: {} });
    const client = await api.register('c@x.com', 'Sam', { inviteCode: inv.body.code });

    const phone = device(client.token, client.id);
    phone.state.history = [aWorkout('w1', 9000, 'Bench day'), aWorkout('w2', 8000, 'Squat day')];
    phone.state.settings = { ...phone.state.settings, weightUnit: 'kg' };
    await phone.sync();

    const coachApi = device(coach.token, coach.id).client;
    const view = await coachApi.pullClient(client.id, 0);
    const kinds = new Set(view.changes.map((c) => c.kind));
    expect(kinds.has('workout')).toBe(true);
    expect(kinds.has('settings')).toBe(false);
    const seen = applyRemoteChanges(emptySnapshot(), view.changes);
    expect(seen.history.map((w) => w.name)).toEqual(['Bench day', 'Squat day']);

    const clients = await coachApi.listClients();
    expect(clients.clients[0]).toMatchObject({ name: 'Sam', lastWorkoutAt: expect.any(Number) });
  });

  it('a signed-out/expired session surfaces as an unauthorized error', async () => {
    const u = await api.register('a@x.com', 'A');
    const d = device(u.token, u.id);
    await api.call('POST', '/auth/logout', { token: u.token });
    await expect(d.sync()).rejects.toMatchObject({ status: 401, code: 'unauthorized' });
  });
});
