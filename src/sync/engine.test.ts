import { beforeEach, describe, expect, it } from 'bun:test';
import { emptyMeta, runSync, type SyncMeta } from './engine';
import { applyRemoteChanges, type Snapshot } from './docs';
import { FakeServer, aRoutine, aWorkout, emptySnapshot } from './testUtils';

/** A phone/laptop: local state + its sync metadata. */
class Device {
  state: Snapshot = emptySnapshot();
  meta: SyncMeta = emptyMeta('u1');
  clock = 10_000;
  constructor(public server: FakeServer) {}

  async sync() {
    const out = await runSync(this.meta, {
      getSnapshot: () => this.state,
      applyRemote: (changes) => { this.state = applyRemoteChanges(this.state, changes); },
      transport: this.server.transport(),
      now: () => this.clock,
    });
    this.meta = out.meta;
    return out;
  }
}

let server: FakeServer; let a: Device; let b: Device;
beforeEach(() => { server = new FakeServer(); a = new Device(server); b = new Device(server); });

describe('runSync', () => {
  it('uploads new local documents and downloads them on another device', async () => {
    a.state.history = [aWorkout('w1', 5000)];
    a.state.routines = [aRoutine('r1')];
    const first = await a.sync();
    expect(first.pushed).toBeGreaterThanOrEqual(2);

    await b.sync();
    expect(b.state.history.map((w) => w.id)).toEqual(['w1']);
    expect(b.state.routines.map((r) => r.id)).toEqual(['r1']);
  });

  it('is idempotent: a second sync with no edits pushes and pulls nothing new', async () => {
    a.state.history = [aWorkout('w1')];
    await a.sync();
    const pushesBefore = server.pushes;
    const again = await a.sync();
    expect(again.pushed).toBe(0);
    expect(again.pulled).toBe(0);
    expect(server.pushes).toBe(pushesBefore); // nothing to send, so no request
  });

  it('propagates edits and deletions', async () => {
    a.state.history = [aWorkout('w1', 1000, 'Before')];
    await a.sync(); await b.sync();

    a.clock += 1000;
    a.state.history = [aWorkout('w1', 1000, 'After')];
    await a.sync(); await b.sync();
    expect(b.state.history[0].name).toBe('After');

    b.clock += 1000;
    b.state.history = [];
    await b.sync(); await a.sync();
    expect(a.state.history).toEqual([]);
    expect(server.docs.get('workout/w1')!.deleted).toBe(true);
  });

  it('unsynced local edits win over server changes to the same document', async () => {
    a.state.routines = [aRoutine('r1', 'Original')];
    await a.sync(); await b.sync();

    a.clock = 20_000; a.state.routines = [aRoutine('r1', 'From A')];
    await a.sync();

    b.clock = 30_000; b.state.routines = [aRoutine('r1', 'From B')]; // edited before seeing A's change
    await b.sync();
    expect(b.state.routines[0].name).toBe('From B');
    await a.sync();
    expect(a.state.routines[0].name).toBe('From B'); // converged on the later edit
  });

  it('recovers when the device clock is behind the server (stale push)', async () => {
    a.clock = 1_000_000;
    a.state.routines = [aRoutine('r1', 'A1')];
    await a.sync(); await b.sync();

    a.clock = 2_000_000;
    a.state.routines = [aRoutine('r1', 'A2')];
    await a.sync(); // server now holds a timestamp far ahead of B's clock

    b.clock = 5; // badly wrong clock
    b.state.routines = [aRoutine('r1', 'B edit')];
    const first = await b.sync();
    expect(first.needsResync).toBe(true);
    const second = await b.sync();
    expect(second.needsResync).toBe(false);
    expect(server.docs.get('routine/r1')!.data).toMatchObject({ name: 'B edit' });
    await a.sync();
    expect(a.state.routines[0].name).toBe('B edit');
  });

  it("a new device takes the server's settings instead of overwriting them with defaults", async () => {
    a.state.settings = { ...a.state.settings, weightUnit: 'kg', barWeight: 20 };
    a.state.progression = { squat: { exerciseId: 'squat', name: 'Squat', startingWeight: 20, weightIncrement: 2.5, defaultSetsReps: '5x5', currentWeight: 100 } };
    await a.sync();

    await b.sync();
    expect(b.state.settings.weightUnit).toBe('kg');
    expect(b.state.progression.squat.currentWeight).toBe(100);
    expect((server.docs.get('settings/main')!.data as any).weightUnit).toBe('kg');
  });

  it('pushes more than one chunk of documents', async () => {
    a.state.history = Array.from({ length: 450 }, (_, i) => aWorkout(`w${i}`, i + 1));
    await a.sync();
    expect([...server.docs.keys()].filter((k) => k.startsWith('workout/'))).toHaveLength(450);
    expect(server.pushes).toBe(3); // 452 docs / 200 per push
    await b.sync();
    expect(b.state.history).toHaveLength(450);
  });

  it('keeps old metadata and data intact when the network fails, then catches up', async () => {
    a.state.history = [aWorkout('w1')];
    await a.sync();
    const before = JSON.stringify(a.meta);
    a.state.history = [aWorkout('w1'), aWorkout('w2')];
    server.failNext = true;
    await expect(a.sync()).rejects.toThrow('offline');
    expect(JSON.stringify(a.meta)).toBe(before);
    expect(a.state.history).toHaveLength(2);
    await a.sync();
    expect(server.docs.has('workout/w2')).toBe(true);
  });

  it('does not re-upload data it just downloaded', async () => {
    a.state.history = [aWorkout('w1')];
    await a.sync();
    const out = await b.sync();
    expect(out.pulled).toBeGreaterThan(0);
    const pushesAfterFirst = server.pushes;
    await b.sync();
    expect(server.pushes).toBe(pushesAfterFirst);
  });

  it('a local delete of something never synced does not send a tombstone', async () => {
    a.state.history = [aWorkout('tmp')];
    a.state.history = [];
    await a.sync();
    expect(server.docs.has('workout/tmp')).toBe(false);
  });
});
