import type { SQL } from 'bun';
import { HttpError, route, readJson, uuidParam, type Ctx } from '../http';
import { parseDate, parseProgram } from '../program';
import { refreshIfStale } from '../sheetSync';

const iso = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

function programRow(r: any) {
  return { id: r.id, name: r.name, ...r.content, createdAt: r.created_at, updatedAt: r.updated_at };
}

/** Workouts a client logged against an assignment, newest first. The client reports these; they are not trusted for anything but display. */
async function completions(sql: SQL, clientId: string, assignmentId: string) {
  const rows = await sql`
    select doc_id,
           data->'programRef'->>'sessionId' as session_id,
           data->'programRef'->>'week' as week,
           coalesce(data->>'endTime', client_updated_at::text) as at
    from docs
    where user_id = ${clientId} and kind = 'workout' and not deleted
      and data->'programRef'->>'assignmentId' = ${assignmentId}
    order by client_updated_at desc
    limit 1000`;
  return rows
    .filter((r: any) => r.session_id && /^\d+$/.test(r.week ?? ''))
    .map((r: any) => ({ workoutId: r.doc_id, sessionId: r.session_id, week: Number(r.week), completedAt: Number(r.at) }));
}

/** The one active assignment of a client, but only while the coach link still exists. */
async function activeAssignment(sql: SQL, clientId: string, coachId?: string) {
  const rows = await sql`
    select a.id, a.start_date::text as start_date, a.created_at, a.coach_id, a.program_id, p.name, p.content, u.name as coach_name,
           (select link_id from sheet_mappings where program_id = p.id) as sheet_link_id
    from program_assignments a
    join programs p on p.id = a.program_id
    join coach_clients cc on cc.client_id = a.client_id and cc.coach_id = a.coach_id
    join users u on u.id = a.coach_id
    where a.client_id = ${clientId} and a.ended_at is null
      and (${coachId ?? null}::uuid is null or a.coach_id = ${coachId ?? null}::uuid)`;
  return rows[0] ?? null;
}

const assignmentView = (r: any) => ({
  id: r.id,
  startDate: iso(r.start_date),
  coach: { id: r.coach_id, name: r.coach_name },
  program: programRow({ id: r.program_id, name: r.name, content: r.content, created_at: null, updated_at: null }),
});

export function programRoutes() {
  async function ownProgram(ctx: Ctx, id: string) {
    const rows = await ctx.sql`select * from programs where id = ${uuidParam(id)} and coach_id = ${ctx.user.id} and source = 'app'`;
    if (rows.length === 0) throw new HttpError(404, 'not_found');
    return rows[0];
  }
  async function requireClient(ctx: Ctx, clientId: string) {
    const rows = await ctx.sql`select 1 from coach_clients where coach_id = ${ctx.user.id} and client_id = ${uuidParam(clientId)}`;
    if (rows.length === 0) throw new HttpError(404, 'not_found');
  }

  return [
    route('GET', '/coach/programs', { auth: true, role: 'coach' }, async (ctx) => {
      const rows = await ctx.sql`
        select p.*, (select count(*) from program_assignments a where a.program_id = p.id and a.ended_at is null)::int as active
        from programs p where p.coach_id = ${ctx.user.id} and p.source = 'app' order by p.updated_at desc limit 200`;
      return { programs: rows.map((r: any) => ({ ...programRow(r), activeAssignments: r.active })) };
    }),

    route('POST', '/coach/programs', { auth: true, role: 'coach' }, async (ctx) => {
      const { name, content } = parseProgram(await readJson(ctx.req));
      const count = await ctx.sql`select count(*)::int as n from programs where coach_id = ${ctx.user.id} and source = 'app'`;
      if (count[0].n >= 200) throw new HttpError(400, 'limit_reached', 'Too many programs; delete some first');
      const [row] = await ctx.sql`
        insert into programs (coach_id, name, content) values (${ctx.user.id}, ${name}, ${JSON.stringify(content)}::text::jsonb)
        returning *`;
      return programRow(row);
    }),

    route('GET', '/coach/programs/:id', { auth: true, role: 'coach' }, async (ctx) => programRow(await ownProgram(ctx, ctx.params.id))),

    // Edits apply to clients already on this program (the coach adjusts the plan as they go).
    route('PUT', '/coach/programs/:id', { auth: true, role: 'coach' }, async (ctx) => {
      await ownProgram(ctx, ctx.params.id);
      const { name, content } = parseProgram(await readJson(ctx.req));
      const [row] = await ctx.sql`
        update programs set name = ${name}, content = ${JSON.stringify(content)}::text::jsonb, updated_at = now()
        where id = ${ctx.params.id} and coach_id = ${ctx.user.id} returning *`;
      return programRow(row);
    }),

    route('DELETE', '/coach/programs/:id', { auth: true, role: 'coach' }, async (ctx) => {
      await ownProgram(ctx, ctx.params.id);
      const active = await ctx.sql`select 1 from program_assignments where program_id = ${ctx.params.id} and ended_at is null limit 1`;
      if (active.length > 0) throw new HttpError(409, 'in_use', 'Some clients are still on this program. End their plan first.');
      await ctx.sql`delete from programs where id = ${ctx.params.id} and coach_id = ${ctx.user.id}`;
      return { ok: true };
    }),

    // Gives the program to a linked client. Replaces whatever plan they were on.
    route('POST', '/coach/programs/:id/assign', { auth: true, role: 'coach' }, async (ctx) => {
      await ownProgram(ctx, ctx.params.id);
      const body = await readJson(ctx.req);
      if (typeof body.clientId !== 'string') throw new HttpError(400, 'invalid_field', 'clientId is required');
      await requireClient(ctx, body.clientId);
      const startDate = parseDate(body.startDate, 'startDate');
      const created = await ctx.sql.begin(async (tx: SQL) => {
        await tx`update program_assignments set ended_at = now() where client_id = ${body.clientId as string} and ended_at is null`;
        const [a] = await tx`
          insert into program_assignments (program_id, coach_id, client_id, start_date)
          values (${ctx.params.id}, ${ctx.user.id}, ${body.clientId as string}, ${startDate}::date) returning id`;
        return a;
      });
      return { id: created.id, startDate };
    }),

    // Plan, and what the client has logged against it.
    route('GET', '/coach/clients/:id/program', { auth: true, role: 'coach' }, async (ctx) => {
      await requireClient(ctx, ctx.params.id);
      const a = await activeAssignment(ctx.sql, ctx.params.id, ctx.user.id);
      if (!a) return { assignment: null, completions: [] };
      return { assignment: assignmentView(a), completions: await completions(ctx.sql, ctx.params.id, a.id) };
    }),

    route('DELETE', '/coach/clients/:id/program', { auth: true, role: 'coach' }, async (ctx) => {
      await requireClient(ctx, ctx.params.id);
      await ctx.sql`update program_assignments set ended_at = now() where client_id = ${ctx.params.id} and coach_id = ${ctx.user.id} and ended_at is null`;
      return { ok: true };
    }),

    // The client's own plan.
    route('GET', '/me/program', { auth: true, role: 'client' }, async (ctx) => {
      const a = await activeAssignment(ctx.sql, ctx.user.id);
      // The plan lives in a Google Sheet: show what we have now and pick up the coach's latest edits for next time.
      if (a?.sheet_link_id) ctx.background(refreshIfStale(ctx.sql, ctx.sheets, a.sheet_link_id));
      return { assignment: a ? assignmentView(a) : null };
    }),
  ];
}
