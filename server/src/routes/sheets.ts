import type { SQL } from 'bun';
import { HttpError, route, readJson, uuidParam, type Ctx } from '../http';
import type { RateLimiter } from '../ratelimit';
import { SheetsError, parseSpreadsheetId } from '../google';
import { parseDate } from '../program';
import { TEMPLATE_HEADER } from '../sheetPlan';
import { syncLink } from '../sheetSync';

const MAX_LINKS_PER_COACH = 10;

/** Google problems the coach can fix get a clear status and message; the client shows the message as is. */
function fail(e: unknown): never {
  if (!(e instanceof SheetsError)) throw e;
  const status = { not_configured: 501, rate_limited: 429, unavailable: 502, misconfigured: 502 }[e.code as string] ?? 422;
  throw new HttpError(status, `sheet_${e.code}`, e.message);
}

async function linkView(sql: SQL, coachId: string, linkId: string) {
  const [l] = await sql`select * from sheet_links where id = ${linkId} and coach_id = ${coachId}`;
  if (!l) throw new HttpError(404, 'not_found');
  const ms = await sql`select *, start_date::text as start_text from sheet_mappings where link_id = ${linkId} order by tab_title`;
  return {
    id: l.id,
    title: l.title,
    url: `https://docs.google.com/spreadsheets/d/${l.spreadsheet_id}/edit`,
    tabs: l.tabs as string[],
    lastSyncedAt: l.last_synced_at,
    lastError: l.last_error,
    mappings: ms.map((m: any) => ({
      tab: m.tab_title,
      clientId: m.client_id,
      startDate: m.start_text,
      hasPlan: m.program_id !== null,
      parsedAt: m.parsed_at,
      problems: m.errors,
    })),
  };
}

export function sheetRoutes(limits: { sheetSync: RateLimiter }) {
  async function ownLink(ctx: Ctx, id: string) {
    const rows = await ctx.sql`select * from sheet_links where id = ${uuidParam(id)} and coach_id = ${ctx.user.id}`;
    if (rows.length === 0) throw new HttpError(404, 'not_found');
    return rows[0];
  }
  async function requireClient(ctx: Ctx, clientId: unknown) {
    if (typeof clientId !== 'string') throw new HttpError(400, 'invalid_field', 'clientId is required');
    const rows = await ctx.sql`
      select u.name from coach_clients cc join users u on u.id = cc.client_id
      where cc.coach_id = ${ctx.user.id} and cc.client_id = ${uuidParam(clientId)}`;
    if (rows.length === 0) throw new HttpError(404, 'not_found');
    return rows[0].name as string;
  }
  function throttle(ctx: Ctx) {
    const wait = limits.sheetSync.hit(`sheet:${ctx.user.id}`);
    if (wait > 0) throw new HttpError(429, 'rate_limited', 'You are syncing too often. Try again in a few minutes.', { 'retry-after': String(wait) });
  }

  return [
    // Everything the Sheets screen needs.
    route('GET', '/coach/sheets', { auth: true, role: 'coach' }, async (ctx) => {
      const ids = await ctx.sql`select id from sheet_links where coach_id = ${ctx.user.id} order by created_at`;
      return {
        enabled: ctx.sheets.enabled,
        serviceAccountEmail: ctx.sheets.serviceAccountEmail,
        templateHeader: TEMPLATE_HEADER,
        links: await Promise.all(ids.map((r: any) => linkView(ctx.sql, ctx.user.id, r.id))),
      };
    }),

    route('POST', '/coach/sheets', { auth: true, role: 'coach' }, async (ctx) => {
      if (!ctx.sheets.enabled) throw new HttpError(501, 'sheet_not_configured', 'Google Sheets is not set up on this server.');
      throttle(ctx);
      const body = await readJson(ctx.req);
      const id = typeof body.url === 'string' ? parseSpreadsheetId(body.url) : null;
      if (!id) throw new HttpError(400, 'invalid_field', 'Paste the link to a Google Sheet (docs.google.com/spreadsheets/...).');
      const count = await ctx.sql`select count(*)::int as n from sheet_links where coach_id = ${ctx.user.id}`;
      if (count[0].n >= MAX_LINKS_PER_COACH) throw new HttpError(400, 'limit_reached', 'You have connected the maximum number of sheets.');
      const existing = await ctx.sql`select coach_id from sheet_links where spreadsheet_id = ${id}`;
      if (existing.length > 0) {
        throw new HttpError(409, 'already_connected', existing[0].coach_id === ctx.user.id ? 'You have already connected this sheet.' : 'This sheet is already connected to another coach.');
      }
      const info = await ctx.sheets.info(id).catch(fail);
      const [row] = await ctx.sql`
        insert into sheet_links (coach_id, spreadsheet_id, title, tabs, last_attempt_at, last_synced_at)
        values (${ctx.user.id}, ${id}, ${info.title}, ${JSON.stringify(info.tabs)}::text::jsonb, now(), now()) returning id`;
      return linkView(ctx.sql, ctx.user.id, row.id);
    }),

    route('POST', '/coach/sheets/:id/sync', { auth: true, role: 'coach' }, async (ctx) => {
      await ownLink(ctx, ctx.params.id);
      throttle(ctx);
      await syncLink(ctx.sql, ctx.sheets, ctx.params.id);
      return linkView(ctx.sql, ctx.user.id, ctx.params.id);
    }),

    // Disconnecting removes the athletes' sheet-based plans (the sheet itself is untouched).
    route('DELETE', '/coach/sheets/:id', { auth: true, role: 'coach' }, async (ctx) => {
      await ownLink(ctx, ctx.params.id);
      await ctx.sql.begin(async (tx: SQL) => {
        await tx`delete from programs where source = 'sheet' and id in (select program_id from sheet_mappings where link_id = ${ctx.params.id})`;
        await tx`delete from sheet_links where id = ${ctx.params.id} and coach_id = ${ctx.user.id}`;
      });
      return { ok: true };
    }),

    // Attach a tab to an athlete (or detach with clientId: null).
    route('PUT', '/coach/sheets/:id/mappings', { auth: true, role: 'coach' }, async (ctx) => {
      const link = await ownLink(ctx, ctx.params.id);
      const body = await readJson(ctx.req);
      const tab = typeof body.tab === 'string' ? body.tab : '';
      if (!(link.tabs as string[]).includes(tab)) throw new HttpError(400, 'invalid_field', 'That tab is not in the sheet. Sync first if you just added it.');

      if (body.clientId === null) {
        await ctx.sql.begin(async (tx: SQL) => {
          await tx`delete from programs where source = 'sheet' and id in (select program_id from sheet_mappings where link_id = ${link.id} and tab_title = ${tab})`;
          await tx`delete from sheet_mappings where link_id = ${link.id} and tab_title = ${tab}`;
        });
        return linkView(ctx.sql, ctx.user.id, link.id);
      }

      await requireClient(ctx, body.clientId);
      const startDate = parseDate(body.startDate, 'startDate');
      const clientId = body.clientId as string;
      const other = await ctx.sql`select tab_title from sheet_mappings where link_id = ${link.id} and client_id = ${clientId} and tab_title <> ${tab}`;
      if (other.length > 0) throw new HttpError(409, 'already_mapped', `That athlete is already linked to the tab "${other[0].tab_title}".`);

      const existing = await ctx.sql`select program_id from sheet_mappings where link_id = ${link.id} and tab_title = ${tab}`;
      await ctx.sql.begin(async (tx: SQL) => {
        // Moving a tab to a different athlete drops the old athlete's plan from it.
        if (existing.length > 0) {
          const [prev] = await tx`select client_id from sheet_mappings where link_id = ${link.id} and tab_title = ${tab}`;
          if (prev.client_id !== clientId) {
            if (existing[0].program_id) await tx`delete from programs where id = ${existing[0].program_id} and source = 'sheet'`;
            await tx`delete from sheet_mappings where link_id = ${link.id} and tab_title = ${tab}`;
          }
        }
        await tx`
          insert into sheet_mappings (link_id, tab_title, client_id, start_date) values (${link.id}, ${tab}, ${clientId}, ${startDate}::date)
          on conflict (link_id, tab_title) do update set start_date = excluded.start_date`;
      });
      throttle(ctx);
      await syncLink(ctx.sql, ctx.sheets, link.id);
      return linkView(ctx.sql, ctx.user.id, link.id);
    }),

    // Creates a ready-made tab (with the header row) for an athlete and links it.
    route('POST', '/coach/sheets/:id/tabs', { auth: true, role: 'coach' }, async (ctx) => {
      const link = await ownLink(ctx, ctx.params.id);
      const body = await readJson(ctx.req);
      const name = await requireClient(ctx, body.clientId);
      const startDate = parseDate(body.startDate, 'startDate');
      const clientId = body.clientId as string;
      const mapped = await ctx.sql`select 1 from sheet_mappings where link_id = ${link.id} and client_id = ${clientId}`;
      if (mapped.length > 0) throw new HttpError(409, 'already_mapped', 'That athlete already has a tab in this sheet.');
      throttle(ctx);

      const taken = new Set((link.tabs as string[]).map((t) => t.toLowerCase()));
      const base = name.replace(/[\[\]*?:\/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'Athlete';
      let title = base;
      for (let n = 2; taken.has(title.toLowerCase()); n++) title = `${base} (${n})`;

      await ctx.sheets.addTab(link.spreadsheet_id, title, TEMPLATE_HEADER).catch(fail);
      await ctx.sql`
        update sheet_links set tabs = ${JSON.stringify([...(link.tabs as string[]), title])}::text::jsonb where id = ${link.id}`;
      await ctx.sql`insert into sheet_mappings (link_id, tab_title, client_id, start_date) values (${link.id}, ${title}, ${clientId}, ${startDate}::date)`;
      await syncLink(ctx.sql, ctx.sheets, link.id);
      return linkView(ctx.sql, ctx.user.id, link.id);
    }),
  ];
}
