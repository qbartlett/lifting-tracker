import type { PullResult, PushChange, PushResult, RemoteChange } from '../api/client';
import type { SyncTransport } from './engine';
import type { Snapshot } from './docs';
import type { CompletedWorkout, RoutineTemplate } from '../types/lifting';

/** In-memory stand-in for the server with the same last-write-wins rules. */
export class FakeServer {
  docs = new Map<string, RemoteChange>();
  seq = 0;
  pushes = 0;
  failNext = false;

  transport(): SyncTransport {
    return {
      pull: async (since, limit): Promise<PullResult> => {
        this.maybeFail();
        const all = [...this.docs.values()].filter((d) => d.seq > since).sort((a, b) => a.seq - b.seq);
        const page = all.slice(0, limit);
        return { changes: page, cursor: page.length ? page[page.length - 1].seq : since, hasMore: all.length > limit };
      },
      push: async (changes: PushChange[]): Promise<PushResult> => {
        this.maybeFail();
        this.pushes++;
        const accepted: PushResult['accepted'] = [];
        const rejected: PushResult['rejected'] = [];
        for (const c of changes) {
          const key = `${c.kind}/${c.id}`;
          const ex = this.docs.get(key);
          if (ex && ex.updatedAt > c.updatedAt) {
            rejected.push({ kind: c.kind, id: c.id, reason: 'stale', serverUpdatedAt: ex.updatedAt });
          } else if (ex && ex.updatedAt === c.updatedAt) {
            accepted.push({ kind: c.kind, id: c.id });
          } else {
            this.docs.set(key, {
              kind: c.kind, id: c.id, data: c.deleted ? null : JSON.parse(JSON.stringify(c.data)),
              deleted: !!c.deleted, updatedAt: c.updatedAt, seq: ++this.seq,
            });
            accepted.push({ kind: c.kind, id: c.id });
          }
        }
        return { accepted, rejected, cursor: this.seq };
      },
    };
  }

  private maybeFail() {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('offline');
    }
  }
}

export const baseSettings = {
  weightUnit: 'lbs', barWeight: 45, soundEnabled: true, hapticsEnabled: true,
  defaultRestTimeSeconds: 120, keepScreenAwake: true, theme: 'dark',
} as const;

export const emptySnapshot = (): Snapshot => ({
  history: [], routines: [], exercises: [], settings: { ...baseSettings }, progression: {},
});

export const aWorkout = (id: string, startTime = 1_000, name = `W ${id}`): CompletedWorkout => ({
  id, name, startTime, endTime: startTime + 1, durationSeconds: 1, exercises: [], totalVolume: 0, totalSets: 0,
});

export const aRoutine = (id: string, name = `R ${id}`): RoutineTemplate => ({
  id, name, description: '', targetSplit: '', exercises: [],
});
