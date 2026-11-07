import type { SQL } from 'bun';
import { SheetsError, type SheetsApi } from './google';
import { parseSheetPlan, type SheetProblem } from './sheetPlan';

/** Lazy refreshes (triggered by athletes opening their plan) never hit Google more often than this per sheet. */
export const MIN_REFRESH_MS = 60_000;

export interface SyncOutcome {
  ok: boolean;
  error: string | null;
}

const inflight = new Map<string, Promise<SyncOutcome>>();

/**
 * Reads the sheet and brings each mapped athlete's plan up to date. Safe to call often:
 * concurrent calls for one sheet share a single run.
 */
export function syncLink(sql: SQL, sheets: SheetsApi, linkId: string): Promise<SyncOutcome> {
  const running = inflight.get(linkId);
  if (running) return running;
  const p = run(sql, sheets, linkId).finally(() => inflight.delete(linkId));
  inflight.set(linkId, p);
  return p;
}

/** Refresh in the background if the last attempt was a while ago. Never throws. */
export async function refreshIfStale(sql: SQL, sheets: SheetsApi, linkId: string): Promise<void> {
  if (!sheets.enabled) return;
  const rows = await sql`select 1 from sheet_links where id = ${linkId} and (last_attempt_at is null or last_attempt_at < now() - ${MIN_REFRESH_MS / 1000} * interval '1 second')`;
  if (rows.length > 0) await syncLink(sql, sheets, linkId);
}

async function run(sql: SQL, sheets: SheetsApi, linkId: string): Promise<SyncOutcome> {
  const links = await sql`select * from sheet_links where id = ${linkId}`;
  if (links.length === 0) return { ok: false, error: 'Sheet is no longer connected.' };
  const link = links[0];
  await sql`update sheet_links set last_attempt_at = now() where id = ${linkId}`;

  try {
    const info = await sheets.info(link.spreadsheet_id);
    const mappings = await sql`
      select m.*, m.start_date::text as start_text, cc.client_id is not null as linked
      from sheet_mappings m
      left join coach_clients cc on cc.client_id = m.client_id and cc.coach_id = ${link.coach_id}
      where m.link_id = ${linkId}`;

    // Reading a tab that no longer exists would fail the whole request, so only ask for tabs that are there.
    const present = new Set(info.tabs);
    const wanted = mappings.filter((m: any) => present.has(m.tab_title) && m.linked).map((m: any) => m.tab_title);
    const data = await sheets.readTabs(link.spreadsheet_id, wanted);

    for (const m of mappings) {
      let problems: SheetProblem[] = [];
      let plan: ReturnType<typeof parseSheetPlan> | null = null;
      if (!m.linked) problems = [{ row: 0, message: 'This athlete is no longer your client.' }];
      else if (!present.has(m.tab_title)) problems = [{ row: 0, message: 'This tab was not found in the sheet. Was it renamed or deleted?' }];
      else {
        plan = parseSheetPlan(data[m.tab_title] ?? []);
        problems = plan.problems;
      }
      await sql.begin(async (tx: SQL) => {
        if (problems.length > 0 || !plan) {
          // Keep whatever plan the athlete already has; just tell the coach what is wrong.
          await tx`update sheet_mappings set errors = ${JSON.stringify(problems)}::text::jsonb where id = ${m.id}`;
          return;
        }
        const content = { notes: null, weeks: plan.weeks.length, sessions: [], perWeek: plan.weeks };
        const name = `${link.title} - ${m.tab_title}`.slice(0, 100);
        let programId: string | null = m.program_id;
        if (programId === null) {
          const [p] = await tx`
            insert into programs (coach_id, name, content, source)
            values (${link.coach_id}, ${name}, ${JSON.stringify(content)}::text::jsonb, 'sheet') returning id`;
          programId = p.id as string;
          await tx`update program_assignments set ended_at = now() where client_id = ${m.client_id} and ended_at is null`;
          await tx`insert into program_assignments (program_id, coach_id, client_id, start_date) values (${programId}, ${link.coach_id}, ${m.client_id}, ${m.start_text}::date)`;
        } else {
          // Only touch the row when something actually changed.
          await tx`update programs set name = ${name}, content = ${JSON.stringify(content)}::text::jsonb, updated_at = now()
                   where id = ${programId} and (content is distinct from ${JSON.stringify(content)}::text::jsonb or name <> ${name})`;
          await tx`update program_assignments set start_date = ${m.start_text}::date where program_id = ${programId} and ended_at is null and start_date <> ${m.start_text}::date`;
        }
        await tx`update sheet_mappings set program_id = ${programId}, errors = '[]'::jsonb, parsed_at = now() where id = ${m.id}`;
      });
    }

    await sql`update sheet_links set title = ${info.title}, tabs = ${JSON.stringify(info.tabs)}::text::jsonb, last_synced_at = now(), last_error = null where id = ${linkId}`;
    return { ok: true, error: null };
  } catch (e) {
    const message = e instanceof SheetsError ? e.message : 'Could not read the sheet.';
    if (!(e instanceof SheetsError)) console.error('Sheet sync failed:', e);
    await sql`update sheet_links set last_error = ${message} where id = ${linkId}`;
    return { ok: false, error: message };
  }
}

/** Removes an athlete's sheet-based plan and mappings (their coach link ended). */
export async function dropSheetPlans(sql: SQL, clientId: string, coachId?: string): Promise<void> {
  const rows = await sql`
    select m.id, m.program_id from sheet_mappings m join sheet_links l on l.id = m.link_id
    where m.client_id = ${clientId} and (${coachId ?? null}::uuid is null or l.coach_id = ${coachId ?? null}::uuid)`;
  for (const r of rows) {
    if (r.program_id) await sql`delete from programs where id = ${r.program_id} and source = 'sheet'`;
    await sql`delete from sheet_mappings where id = ${r.id}`;
  }
}
