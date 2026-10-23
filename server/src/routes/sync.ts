import { HttpError, intParam, readJson, route, type Ctx } from '../http';

/** Document kinds the app may sync. The active (in-progress) workout stays on the device. */
export const SYNC_KINDS = ['workout', 'routine', 'exercise', 'settings', 'progression'] as const;
export type SyncKind = (typeof SYNC_KINDS)[number];
/** What a coach can read about a client. Settings are private to the client. */
export const COACH_VISIBLE_KINDS: SyncKind[] = ['workout', 'routine', 'exercise', 'progression'];

const MAX_CHANGES_PER_PUSH = 200;
const MAX_DOC_BYTES = 256 * 1024;
const MAX_DOC_ID = 120;
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

interface ChangeIn {
  kind: SyncKind;
  id: string;
  data: unknown;
  deleted: boolean;
  updatedAt: number;
}

function parseChange(raw: unknown, index: number): ChangeIn {
  const bad = (msg: string) => new HttpError(400, 'invalid_change', `changes[${index}]: ${msg}`);
  if (raw === null || typeof raw !== 'object') throw bad('must be an object');
  const c = raw as Record<string, unknown>;
  if (typeof c.kind !== 'string' || !(SYNC_KINDS as readonly string[]).includes(c.kind)) throw bad('unknown kind');
  if (typeof c.id !== 'string' || c.id.length < 1 || c.id.length > MAX_DOC_ID) throw bad('id must be 1-120 characters');
  if (!Number.isSafeInteger(c.updatedAt) || (c.updatedAt as number) <= 0) throw bad('updatedAt must be a positive integer (ms)');
  if ((c.updatedAt as number) > Date.now() + MAX_FUTURE_MS) throw bad('updatedAt is too far in the future');
  const deleted = c.deleted === true;
  if (!deleted) {
    if (c.data === null || typeof c.data !== 'object') throw bad('data must be an object (or set deleted: true)');
    if (JSON.stringify(c.data).length > MAX_DOC_BYTES) throw bad('data is too large');
  }
  return { kind: c.kind as SyncKind, id: c.id, data: deleted ? null : c.data, deleted, updatedAt: c.updatedAt as number };
}

/** Shared by the client's own pull and the coach's read-only pull. */
export async function pullDocs(ctx: Ctx, userId: string, kinds: readonly SyncKind[]) {
  const since = intParam(ctx.url.searchParams.get('since'), 'since', 0, 0, Number.MAX_SAFE_INTEGER);
  const limit = intParam(ctx.url.searchParams.get('limit'), 'limit', 500, 1, 1000);
  const rows = await ctx.sql`
    select kind, doc_id, data, deleted, client_updated_at, seq
    from docs
    where user_id = ${userId} and seq > ${since} and kind in ${ctx.sql(kinds as string[])}
    order by seq
    limit ${limit + 1}`;
  const page = rows.slice(0, limit);
  return {
    changes: page.map((r: any) => ({
      kind: r.kind,
      id: r.doc_id,
      data: r.data,
      deleted: r.deleted,
      updatedAt: Number(r.client_updated_at),
      seq: Number(r.seq),
    })),
    cursor: page.length ? Number(page[page.length - 1].seq) : since,
    hasMore: rows.length > limit,
  };
}

export function syncRoutes() {
  return [
    route('GET', '/sync/pull', { auth: true }, (ctx) => pullDocs(ctx, ctx.user.id, SYNC_KINDS)),

    // Last-write-wins per document, judged by the client's updatedAt.
    route('POST', '/sync/push', { auth: true }, async (ctx) => {
      const body = await readJson(ctx.req);
      if (!Array.isArray(body.changes)) throw new HttpError(400, 'invalid_field', 'changes must be an array');
      if (body.changes.length > MAX_CHANGES_PER_PUSH) {
        throw new HttpError(400, 'too_many_changes', `At most ${MAX_CHANGES_PER_PUSH} changes per push`);
      }
      const changes = body.changes.map(parseChange);
      const seen = new Set<string>();
      for (const c of changes) {
        const key = `${c.kind}/${c.id}`;
        if (seen.has(key)) throw new HttpError(400, 'invalid_change', `Duplicate change for ${key}`);
        seen.add(key);
      }

      const userId = ctx.user.id;
      const result = await ctx.sql.begin(async (tx) => {
        // Serialise writers per user so seq order matches commit order and pulls never skip rows.
        await tx`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
        const accepted: { kind: string; id: string }[] = [];
        const rejected: { kind: string; id: string; reason: string; serverUpdatedAt: number }[] = [];

        for (const c of changes) {
          const dataJson = c.data === null ? null : JSON.stringify(c.data);
          const written = await tx`
            insert into docs (user_id, kind, doc_id, data, deleted, client_updated_at, seq)
            values (${userId}, ${c.kind}, ${c.id}, ${dataJson}::text::jsonb, ${c.deleted}, ${c.updatedAt}, nextval('docs_seq'))
            on conflict (user_id, kind, doc_id) do update
              set data = excluded.data, deleted = excluded.deleted,
                  client_updated_at = excluded.client_updated_at, seq = excluded.seq
              where docs.client_updated_at < excluded.client_updated_at
            returning doc_id`;
          if (written.length > 0) {
            accepted.push({ kind: c.kind, id: c.id });
            continue;
          }
          const [existing] = await tx`
            select client_updated_at from docs where user_id = ${userId} and kind = ${c.kind} and doc_id = ${c.id}`;
          const serverUpdatedAt = Number(existing.client_updated_at);
          // Same timestamp = a retry of something already stored: report success.
          if (serverUpdatedAt === c.updatedAt) accepted.push({ kind: c.kind, id: c.id });
          else rejected.push({ kind: c.kind, id: c.id, reason: 'stale', serverUpdatedAt });
        }
        const [{ cursor }] = await tx`select coalesce(max(seq), 0) as cursor from docs where user_id = ${userId}`;
        return { accepted, rejected, cursor: Number(cursor) };
      });
      return result;
    }),
  ];
}
