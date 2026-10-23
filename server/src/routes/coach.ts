import { HttpError, route, readJson, optStr, uuidParam, type Ctx } from '../http';
import { newInviteCode, sha256 } from '../auth';
import { pullDocs, COACH_VISIBLE_KINDS } from './sync';

export function coachRoutes() {
  /** 404 (not 403) when the client is not linked to this coach, so ids can't be probed. */
  async function requireClient(ctx: Ctx, clientId: string): Promise<void> {
    const rows = await ctx.sql`
      select 1 from coach_clients where coach_id = ${ctx.user.id} and client_id = ${uuidParam(clientId)}`;
    if (rows.length === 0) throw new HttpError(404, 'not_found');
  }

  return [
    route('POST', '/coach/invites', { auth: true, role: 'coach' }, async (ctx) => {
      const body = await readJson(ctx.req).catch(() => ({} as Record<string, unknown>));
      const label = optStr(body.label, 'label', 100);
      const code = newInviteCode();
      const expires = new Date(Date.now() + ctx.config.inviteTtlMs);
      const [inv] = await ctx.sql`
        insert into invites (coach_id, code_hash, label, expires_at)
        values (${ctx.user.id}, ${sha256(code)}, ${label}, ${expires})
        returning id, label, created_at, expires_at`;
      // The code is only ever shown here; the database keeps a hash.
      return { id: inv.id, code, label: inv.label, expiresAt: inv.expires_at };
    }),

    route('GET', '/coach/invites', { auth: true, role: 'coach' }, async (ctx) => {
      const rows = await ctx.sql`
        select id, label, created_at, expires_at, used_at
        from invites where coach_id = ${ctx.user.id} order by created_at desc limit 200`;
      return {
        invites: rows.map((r: any) => ({
          id: r.id, label: r.label, createdAt: r.created_at, expiresAt: r.expires_at, usedAt: r.used_at,
          status: r.used_at ? 'used' : new Date(r.expires_at) < new Date() ? 'expired' : 'pending',
        })),
      };
    }),

    route('DELETE', '/coach/invites/:id', { auth: true, role: 'coach' }, async (ctx) => {
      const rows = await ctx.sql`
        delete from invites where id = ${uuidParam(ctx.params.id)} and coach_id = ${ctx.user.id} and used_by is null
        returning id`;
      if (rows.length === 0) throw new HttpError(404, 'not_found');
      return { ok: true };
    }),

    route('GET', '/coach/clients', { auth: true, role: 'coach' }, async (ctx) => {
      const rows = await ctx.sql`
        select u.id, u.name, u.email, cc.created_at as linked_at,
          (select max(d.client_updated_at) from docs d
            where d.user_id = u.id and d.kind = 'workout' and not d.deleted) as last_workout_at
        from coach_clients cc join users u on u.id = cc.client_id
        where cc.coach_id = ${ctx.user.id}
        order by u.name`;
      return {
        clients: rows.map((r: any) => ({
          id: r.id, name: r.name, email: r.email, linkedAt: r.linked_at,
          lastWorkoutAt: r.last_workout_at === null ? null : Number(r.last_workout_at),
        })),
      };
    }),

    route('DELETE', '/coach/clients/:id', { auth: true, role: 'coach' }, async (ctx) => {
      await requireClient(ctx, ctx.params.id);
      await ctx.sql`delete from coach_clients where coach_id = ${ctx.user.id} and client_id = ${ctx.params.id}`;
      return { ok: true };
    }),

    // Read-only view of a linked client's data (no settings, no write access).
    route('GET', '/coach/clients/:id/pull', { auth: true, role: 'coach' }, async (ctx) => {
      await requireClient(ctx, ctx.params.id);
      return pullDocs(ctx, ctx.params.id, COACH_VISIBLE_KINDS);
    }),
  ];
}
