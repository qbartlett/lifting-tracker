import type { PullResult, PushChange, PushResult, RemoteChange } from '../api/client';
import {
  applyRemoteChanges, docKey, hashDoc, isSingleton, parseDocKey, snapshotToDocs, type Snapshot,
} from './docs';

/** Marker hash for "known to be deleted". */
export const DELETED = '#deleted';
const PUSH_CHUNK = 200;

export interface SyncMeta {
  /** Account this device's data belongs to. */
  userId: string | null;
  /** Last server position we have pulled up to. */
  cursor: number;
  /** What we last agreed on with the server, per document. */
  known: Record<string, { hash: string; updatedAt: number }>;
}

export const emptyMeta = (userId: string | null = null): SyncMeta => ({ userId, cursor: 0, known: {} });

export interface SyncTransport {
  pull(since: number, limit: number): Promise<PullResult>;
  push(changes: PushChange[]): Promise<PushResult>;
}

export interface SyncDeps {
  getSnapshot(): Snapshot;
  /** Tell the app which server changes to merge into its state. */
  applyRemote(changes: RemoteChange[]): void;
  transport: SyncTransport;
  now?: () => number;
}

export interface SyncOutcome {
  meta: SyncMeta;
  pulled: number;
  pushed: number;
  /** Server had newer copies; run again soon (the timestamps have been bumped). */
  needsResync: boolean;
}

/**
 * One sync round: pull everything new, merge it, then push local edits.
 *
 * Rules
 * - Edits made on this device that have not been uploaded yet win over server changes to the
 *   same document (they are re-stamped with the current time when pushed).
 * - Exception: a device that has never synced settings/progression takes the server's copy
 *   instead of overwriting it with defaults.
 * - If this throws (offline etc.) nothing is lost: the caller keeps its old meta and retries.
 */
export async function runSync(meta: SyncMeta, deps: SyncDeps): Promise<SyncOutcome> {
  const now = deps.now ?? Date.now;
  const known: SyncMeta['known'] = { ...meta.known };
  let working = deps.getSnapshot();

  // 1. Pull
  const latestByKey = new Map<string, RemoteChange>();
  let cursor = meta.cursor;
  for (;;) {
    const page = await deps.transport.pull(cursor, 500);
    for (const c of page.changes) latestByKey.set(docKey(c.kind, c.id), c);
    cursor = page.cursor;
    if (!page.hasMore) break;
  }

  // 2. Merge
  const localDocs = snapshotToDocs(working);
  const toApply: RemoteChange[] = [];
  for (const [key, remote] of latestByKey) {
    const local = localDocs.get(key);
    const k = known[key];
    const hasLocalEdit = local ? k?.hash !== hashDoc(local.data) : k !== undefined && k.hash !== DELETED;
    const freshSingleton = isSingleton(remote.kind) && k === undefined && !remote.deleted;
    if (hasLocalEdit && !freshSingleton) continue; // local wins; the push below overwrites the server
    const remoteHash = remote.deleted ? DELETED : hashDoc(remote.data);
    known[key] = { hash: remoteHash, updatedAt: remote.updatedAt };
    // Already identical here (e.g. the echo of our own push): nothing to apply.
    const alreadyMatches = remote.deleted ? !local : local !== undefined && hashDoc(local.data) === remoteHash;
    if (!alreadyMatches) toApply.push(remote);
  }
  if (toApply.length) {
    working = applyRemoteChanges(working, toApply);
    deps.applyRemote(toApply);
  }

  // 3. Work out what to push
  const docs = snapshotToDocs(working);
  const pending: { key: string; change: PushChange; hash: string }[] = [];
  const stamp = (k: { updatedAt: number } | undefined) => Math.max(now(), (k?.updatedAt ?? 0) + 1);

  for (const [key, doc] of docs) {
    const hash = hashDoc(doc.data);
    if (known[key]?.hash === hash) continue;
    pending.push({ key, hash, change: { kind: doc.kind, id: doc.id, data: doc.data, updatedAt: stamp(known[key]) } });
  }
  for (const [key, k] of Object.entries(known)) {
    if (docs.has(key) || k.hash === DELETED) continue;
    const { kind, id } = parseDocKey(key);
    pending.push({ key, hash: DELETED, change: { kind, id, deleted: true, updatedAt: stamp(k) } });
  }

  // 4. Push
  let pushed = 0;
  let needsResync = false;
  const byKey = new Map(pending.map((p) => [p.key, p]));
  for (let i = 0; i < pending.length; i += PUSH_CHUNK) {
    const chunk = pending.slice(i, i + PUSH_CHUNK);
    const res = await deps.transport.push(chunk.map((p) => p.change));
    for (const a of res.accepted) {
      const p = byKey.get(docKey(a.kind, a.id));
      if (!p) continue;
      known[p.key] = { hash: p.hash, updatedAt: p.change.updatedAt };
      pushed++;
    }
    for (const r of res.rejected) {
      const key = docKey(r.kind, r.id);
      // Keep the edit pending, but remember the server's clock so the next stamp beats it.
      known[key] = { hash: known[key]?.hash ?? '', updatedAt: r.serverUpdatedAt };
      needsResync = true;
    }
  }

  return { meta: { userId: meta.userId, cursor, known }, pulled: toApply.length, pushed, needsResync };
}
