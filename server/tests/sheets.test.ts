import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { SQL } from 'bun';
import { setup, workout, FakeSheets, type Api } from './helpers';
import type { App } from '../src/app';
import { SheetsError } from '../src/google';

let api: Api, sheets: FakeSheets, sql: SQL, app: App;
beforeEach(async () => { ({ api, sheets, sql, app } = await setup()); });
// Let background refreshes finish before the next test rebuilds the schema.
afterEach(async () => { await app.idle(); });

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-aB';
const URL_ = `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`;
const H = ['Week', 'Day', 'Session', 'Exercise', 'Sets', 'Reps', 'Rest (sec)', 'Notes'];
const planRows = (extra: string[][] = []) => [
  H,
  ['1', 'Mon', 'Push', 'Bench Press', '4', '6', '120', 'Pause'],
  ['1', 'Wed', 'Pull', 'Barbell Row', '3', '8-10', '90', ''],
  ['2', 'Mon', 'Push', 'Bench Press', '4', '7', '120', ''],
  ...extra,
];

async function team() {
  const coach = await api.register('coach@x.com', 'Coach');
  const inv = await api.call('POST', '/coach/invites', { token: coach.token, body: {} });
  const sam = await api.register('sam@x.com', 'Sam', { inviteCode: inv.body.code });
  const inv2 = await api.call('POST', '/coach/invites', { token: coach.token, body: {} });
  const alex = await api.register('alex@x.com', 'Alex', { inviteCode: inv2.body.code });
  return { coach, sam, alex };
}

async function connect(token: string, url = URL_) {
  return api.call('POST', '/coach/sheets', { token, body: { url } });
}
const map = (token: string, linkId: string, tab: string, clientId: string | null, startDate = '2026-11-09') =>
  api.call('PUT', `/coach/sheets/${linkId}/mappings`, { token, body: { tab, clientId, startDate } });

/** A connected sheet with Sam's tab mapped and parsed. */
async function mapped() {
  const t = await team();
  sheets.add(ID, 'Team Plan', { Sam: planRows(), Alex: [H] });
  const link = (await connect(t.coach.token)).body;
  const m = await map(t.coach.token, link.id, 'Sam', t.sam.id);
  expect(m.status).toBe(200);
  return { ...t, linkId: link.id as string };
}

describe('connecting a sheet', () => {
  it('tells the coach what to share the sheet with', async () => {
    const { coach } = await team();
    const r = await api.call('GET', '/coach/sheets', { token: coach.token });
    expect(r.body).toMatchObject({ enabled: true, serviceAccountEmail: 'bot@irontrack.test', links: [] });
    expect(r.body.templateHeader).toEqual(H);
  });

  it('connects a sheet from its link and lists its tabs', async () => {
    const { coach } = await team();
    sheets.add(ID, 'Team Plan', { Sam: planRows(), Alex: [H] });
    const r = await connect(coach.token);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ title: 'Team Plan', tabs: ['Sam', 'Alex'], mappings: [], lastError: null });
    expect(r.body.url).toContain(ID);
    expect((await api.call('GET', '/coach/sheets', { token: coach.token })).body.links).toHaveLength(1);
  });

  it('explains when the sheet has not been shared, the link is bad, or Google is not set up', async () => {
    const { coach } = await team();
    const notShared = await connect(coach.token);
    expect(notShared.status).toBe(422);
    expect(notShared.body.error.code).toBe('sheet_forbidden');
    expect(notShared.body.error.message).toContain('bot@irontrack.test');
    expect((await connect(coach.token, 'https://example.com/x')).status).toBe(400);
    expect((await api.call('POST', '/coach/sheets', { token: coach.token, body: {} })).status).toBe(400);
    sheets.failWith = new SheetsError('api_disabled', 'The Google Sheets API is not enabled');
    sheets.add(ID, 'T', {});
    expect((await connect(coach.token)).body.error.code).toBe('sheet_api_disabled');
    sheets.failWith = null;
    sheets.enabled = false;
    expect((await connect(coach.token)).status).toBe(501);
  });

  it('allows a sheet to belong to one coach only', async () => {
    const { coach } = await team();
    const other = await api.register('other@x.com', 'Other');
    sheets.add(ID, 'T', {});
    expect((await connect(coach.token)).status).toBe(200);
    const again = await connect(coach.token);
    expect(again.status).toBe(409);
    expect(again.body.error.message).toContain('already connected');
    const stolen = await connect(other.token);
    expect(stolen.status).toBe(409);
    expect(stolen.body.error.message).toContain('another coach');
  });

  it('is for coaches only, and links are private to their coach', async () => {
    const { coach, sam } = await team();
    const other = await api.register('other@x.com', 'Other');
    sheets.add(ID, 'T', { A: [H] });
    const link = (await connect(coach.token)).body;
    expect((await api.call('GET', '/coach/sheets', { token: sam.token })).status).toBe(403);
    expect((await api.call('GET', '/coach/sheets')).status).toBe(401);
    expect((await api.call('GET', '/coach/sheets', { token: other.token })).body.links).toEqual([]);
    for (const [m, p] of [['POST', `/coach/sheets/${link.id}/sync`], ['DELETE', `/coach/sheets/${link.id}`], ['PUT', `/coach/sheets/${link.id}/mappings`], ['POST', `/coach/sheets/${link.id}/tabs`]] as const) {
      expect((await api.call(m, p, { token: other.token, body: { tab: 'A', clientId: null } })).status).toBe(404);
    }
  });
});

describe('a tab becomes the athlete\'s plan', () => {
  it('shows the athlete the coach\'s week-by-week plan', async () => {
    const { sam } = await mapped();
    const r = await api.call('GET', '/me/program', { token: sam.token });
    const a = r.body.assignment;
    expect(a.startDate).toBe('2026-11-09');
    expect(a.coach.name).toBe('Coach');
    expect(a.program.weeks).toBe(2);
    expect(a.program.perWeek[0].map((s: any) => s.name)).toEqual(['Push', 'Pull']);
    expect(a.program.perWeek[0][1].exercises[0]).toMatchObject({ name: 'Barbell Row', sets: 3, reps: 8, repsLabel: '8-10', restSeconds: 90 });
    expect(a.program.perWeek[1][0].exercises[0].reps).toBe(7);
  });

  it('reports the tab as linked and healthy to the coach', async () => {
    const { coach, sam } = await mapped();
    const v = (await api.call('GET', '/coach/sheets', { token: coach.token })).body.links[0];
    expect(v.mappings).toEqual([expect.objectContaining({ tab: 'Sam', clientId: sam.id, startDate: '2026-11-09', hasPlan: true, problems: [] })]);
  });

  it('keeps sheet plans out of the coach\'s own program list and editing routes', async () => {
    const { coach, sam } = await mapped();
    expect((await api.call('GET', '/coach/programs', { token: coach.token })).body.programs).toEqual([]);
    const id = (await api.call('GET', '/me/program', { token: sam.token })).body.assignment.program.id;
    for (const [m, p] of [['GET', ''], ['PUT', ''], ['DELETE', ''], ['POST', '/assign']] as const) {
      expect((await api.call(m, `/coach/programs/${id}${p}`, { token: coach.token, body: { clientId: sam.id, startDate: '2026-11-09' } })).status).toBe(404);
    }
  });

  it('picks up the coach\'s edits to the sheet on sync', async () => {
    const { coach, sam, linkId } = await mapped();
    sheets.sheets.get(ID)!.tabs.set('Sam', planRows([['3', 'Fri', 'Legs', 'Squat', '5', '5', '180', '']]));
    const r = await api.call('POST', `/coach/sheets/${linkId}/sync`, { token: coach.token });
    expect(r.status).toBe(200);
    const plan = (await api.call('GET', '/me/program', { token: sam.token })).body.assignment.program;
    expect(plan.weeks).toBe(3);
    expect(plan.perWeek[2][0].exercises[0].name).toBe('Squat');
    expect(plan.perWeek[1]).toHaveLength(1);
  });

  it('does not create a second plan or lose the athlete\'s logged workouts when the sheet changes', async () => {
    const { coach, sam, linkId } = await mapped();
    const before = (await api.call('GET', '/me/program', { token: sam.token })).body.assignment;
    await api.call('POST', '/sync/push', { token: sam.token, body: { changes: [workout('w1', 1, { endTime: 5, programRef: { assignmentId: before.id, sessionId: before.program.perWeek[0][0].id, week: 0 } })] } });
    sheets.sheets.get(ID)!.tabs.set('Sam', planRows([['1', 'Fri', 'Legs', 'Squat', '5', '5', '', '']]));
    await api.call('POST', `/coach/sheets/${linkId}/sync`, { token: coach.token });
    const after = (await api.call('GET', '/me/program', { token: sam.token })).body.assignment;
    expect(after.id).toBe(before.id);
    expect(after.program.id).toBe(before.program.id);
    const progress = await api.call('GET', `/coach/clients/${sam.id}/program`, { token: coach.token });
    expect(progress.body.completions.map((c: any) => c.workoutId)).toEqual(['w1']);
    const n = await sql`select count(*)::int as n from program_assignments where client_id = ${sam.id}`;
    expect(n[0].n).toBe(1);
  });

  it('changing the start date moves the athlete\'s plan', async () => {
    const { coach, sam, linkId } = await mapped();
    await map(coach.token, linkId, 'Sam', sam.id, '2026-12-07');
    expect((await api.call('GET', '/me/program', { token: sam.token })).body.assignment.startDate).toBe('2026-12-07');
  });
});

describe('mistakes in the sheet', () => {
  it('leaves the athlete on their last good plan and tells the coach exactly which cells are wrong', async () => {
    const { coach, sam, linkId } = await mapped();
    sheets.sheets.get(ID)!.tabs.set('Sam', planRows([['4', 'Funday', 'Legs', 'Squat', 'lots', '5', '', '']]));
    const v = (await api.call('POST', `/coach/sheets/${linkId}/sync`, { token: coach.token })).body;
    expect(v.mappings[0].problems.map((p: any) => `${p.row}:${p.column}`)).toEqual(['5:Day', '5:Sets']);
    expect(v.mappings[0].hasPlan).toBe(true);
    const plan = (await api.call('GET', '/me/program', { token: sam.token })).body.assignment.program;
    expect(plan.weeks).toBe(2); // unchanged
    // Fixing the sheet clears the problems.
    sheets.sheets.get(ID)!.tabs.set('Sam', planRows());
    const fixed = (await api.call('POST', `/coach/sheets/${linkId}/sync`, { token: coach.token })).body;
    expect(fixed.mappings[0].problems).toEqual([]);
  });

  it('gives the athlete nothing until the first good read', async () => {
    const t = await team();
    sheets.add(ID, 'T', { Alex: [H] });
    const link = (await connect(t.coach.token)).body;
    const v = (await map(t.coach.token, link.id, 'Alex', t.alex.id)).body;
    expect(v.mappings[0]).toMatchObject({ hasPlan: false });
    expect(v.mappings[0].problems[0].message).toContain('No exercises');
    expect((await api.call('GET', '/me/program', { token: t.alex.token })).body.assignment).toBeNull();
    // The coach fills the tab in.
    sheets.sheets.get(ID)!.tabs.set('Alex', planRows());
    await api.call('POST', `/coach/sheets/${link.id}/sync`, { token: t.coach.token });
    expect((await api.call('GET', '/me/program', { token: t.alex.token })).body.assignment.program.weeks).toBe(2);
  });

  it('keeps the plan when a tab is renamed or deleted, and says so', async () => {
    const { coach, sam, linkId } = await mapped();
    sheets.sheets.get(ID)!.tabs.delete('Sam');
    const v = (await api.call('POST', `/coach/sheets/${linkId}/sync`, { token: coach.token })).body;
    expect(v.lastError).toBeNull(); // one missing tab must not break the whole sheet
    expect(v.tabs).toEqual(['Alex']);
    expect(v.mappings[0].problems[0].message).toContain('not found');
    expect((await api.call('GET', '/me/program', { token: sam.token })).body.assignment.program.weeks).toBe(2);
  });

  it('survives Google being down: records the error, keeps every plan', async () => {
    const { coach, sam, linkId } = await mapped();
    sheets.failWith = new SheetsError('unavailable', 'Google Sheets had a problem. Try again in a moment.');
    const v = (await api.call('POST', `/coach/sheets/${linkId}/sync`, { token: coach.token })).body;
    expect(v.lastError).toContain('Google Sheets had a problem');
    expect((await api.call('GET', '/me/program', { token: sam.token })).body.assignment).not.toBeNull();
    sheets.failWith = null;
    const ok = (await api.call('POST', `/coach/sheets/${linkId}/sync`, { token: coach.token })).body;
    expect(ok.lastError).toBeNull();
  });
});

describe('mapping tabs to athletes', () => {
  it('validates the tab, the athlete and the date', async () => {
    const t = await team();
    const stranger = await api.register('stranger@x.com', 'Stranger');
    sheets.add(ID, 'T', { Sam: planRows() });
    const link = (await connect(t.coach.token)).body;
    expect((await map(t.coach.token, link.id, 'Nope', t.sam.id)).status).toBe(400);
    expect((await map(t.coach.token, link.id, 'Sam', stranger.id)).status).toBe(404);
    expect((await map(t.coach.token, link.id, 'Sam', 'not-a-uuid')).status).toBe(404);
    expect((await map(t.coach.token, link.id, 'Sam', t.sam.id, 'soon')).status).toBe(400);
    expect((await map(t.coach.token, link.id, 'Sam', t.sam.id, '2026-02-30')).status).toBe(400);
    expect((await map(t.coach.token, link.id, 'Sam', t.sam.id)).status).toBe(200);
  });

  it('one tab per athlete', async () => {
    const t = await team();
    sheets.add(ID, 'T', { Sam: planRows(), 'Sam copy': planRows() });
    const link = (await connect(t.coach.token)).body;
    await map(t.coach.token, link.id, 'Sam', t.sam.id);
    const r = await map(t.coach.token, link.id, 'Sam copy', t.sam.id);
    expect(r.status).toBe(409);
    expect(r.body.error.message).toContain('"Sam"');
  });

  it('moving a tab to another athlete removes the first athlete\'s plan', async () => {
    const { coach, sam, alex, linkId } = await mapped();
    await map(coach.token, linkId, 'Sam', alex.id);
    expect((await api.call('GET', '/me/program', { token: sam.token })).body.assignment).toBeNull();
    expect((await api.call('GET', '/me/program', { token: alex.token })).body.assignment.program.weeks).toBe(2);
  });

  it('unlinking a tab removes the athlete\'s plan but not the sheet', async () => {
    const { coach, sam, linkId } = await mapped();
    const v = (await map(coach.token, linkId, 'Sam', null)).body;
    expect(v.mappings).toEqual([]);
    expect(sheets.sheets.get(ID)!.tabs.has('Sam')).toBe(true);
    expect((await api.call('GET', '/me/program', { token: sam.token })).body.assignment).toBeNull();
  });

  it('replaces a plan the athlete already had', async () => {
    const t = await team();
    const p = await api.call('POST', '/coach/programs', { token: t.coach.token, body: { name: 'Manual', weeks: 2, sessions: [{ id: 'a', day: 0, name: 'A', exercises: [{ exerciseId: 'x', name: 'X', category: 'Chest', equipment: 'Barbell', sets: 3, reps: 5, restSeconds: 60 }] }] } });
    await api.call('POST', `/coach/programs/${p.body.id}/assign`, { token: t.coach.token, body: { clientId: t.sam.id, startDate: '2026-11-09' } });
    sheets.add(ID, 'T', { Sam: planRows() });
    const link = (await connect(t.coach.token)).body;
    await map(t.coach.token, link.id, 'Sam', t.sam.id);
    expect((await api.call('GET', '/me/program', { token: t.sam.token })).body.assignment.program.perWeek).toBeDefined();
    const active = await sql`select count(*)::int as n from program_assignments where client_id = ${t.sam.id} and ended_at is null`;
    expect(active[0].n).toBe(1);
  });
});

describe('creating a tab for an athlete', () => {
  it('adds a tab with the header row, named after the athlete, and links it', async () => {
    const t = await team();
    sheets.add(ID, 'T', {});
    const link = (await connect(t.coach.token)).body;
    const r = await api.call('POST', `/coach/sheets/${link.id}/tabs`, { token: t.coach.token, body: { clientId: t.sam.id, startDate: '2026-11-09' } });
    expect(r.status).toBe(200);
    expect(r.body.tabs).toEqual(['Sam']);
    expect(sheets.sheets.get(ID)!.tabs.get('Sam')).toEqual([H]);
    expect(r.body.mappings[0]).toMatchObject({ tab: 'Sam', clientId: t.sam.id, hasPlan: false });
    expect((await api.call('POST', `/coach/sheets/${link.id}/tabs`, { token: t.coach.token, body: { clientId: t.sam.id, startDate: '2026-11-09' } })).status).toBe(409);
  });

  it('avoids clashing with an existing tab name and strips characters Google forbids', async () => {
    const t = await team();
    sheets.add(ID, 'T', { Sam: [H] });
    const link = (await connect(t.coach.token)).body;
    const r = await api.call('POST', `/coach/sheets/${link.id}/tabs`, { token: t.coach.token, body: { clientId: t.sam.id, startDate: '2026-11-09' } });
    expect(r.body.tabs).toEqual(['Sam', 'Sam (2)']);
  });

  it('strips characters Google does not allow in tab names', async () => {
    const t = await team();
    const inv = await api.call('POST', '/coach/invites', { token: t.coach.token, body: {} });
    const odd = await api.register('odd@x.com', 'A/B: [C]?*', { inviteCode: inv.body.code });
    sheets.add(ID, 'T', {});
    const link = (await connect(t.coach.token)).body;
    const r = await api.call('POST', `/coach/sheets/${link.id}/tabs`, { token: t.coach.token, body: { clientId: odd.id, startDate: '2026-11-09' } });
    expect(r.body.tabs).toEqual(['A B C']);
  });

  it('only for the coach\'s own clients', async () => {
    const t = await team();
    const stranger = await api.register('s2@x.com', 'S2');
    sheets.add(ID, 'T', {});
    const link = (await connect(t.coach.token)).body;
    expect((await api.call('POST', `/coach/sheets/${link.id}/tabs`, { token: t.coach.token, body: { clientId: stranger.id, startDate: '2026-11-09' } })).status).toBe(404);
  });
});

describe('refreshing when athletes open their plan', () => {
  const stale = (linkId: string) => sql`update sheet_links set last_attempt_at = now() - interval '5 minutes' where id = ${linkId}`;

  it('picks up edits in the background when the last read was a while ago', async () => {
    const { sam, linkId } = await mapped();
    sheets.sheets.get(ID)!.tabs.set('Sam', planRows([['3', 'Fri', 'Legs', 'Squat', '5', '5', '', '']]));
    await stale(linkId);
    const first = await api.call('GET', '/me/program', { token: sam.token });
    expect(first.body.assignment.program.weeks).toBe(2); // answers immediately with what it has
    await app.idle();
    expect((await api.call('GET', '/me/program', { token: sam.token })).body.assignment.program.weeks).toBe(3);
  });

  it('does not hit Google again within a minute, however many athletes ask', async () => {
    const { sam, alex, coach, linkId } = await mapped();
    await map(coach.token, linkId, 'Alex', alex.id);
    await stale(linkId);
    const readsBefore = sheets.reads;
    await Promise.all([1, 2, 3, 4].map(() => api.call('GET', '/me/program', { token: sam.token })));
    await app.idle();
    expect(sheets.reads - readsBefore).toBeLessThanOrEqual(1);
    const mid = sheets.reads;
    await api.call('GET', '/me/program', { token: sam.token });
    await app.idle();
    expect(sheets.reads).toBe(mid);
  });

  it('never fails the athlete\'s request when Google is down', async () => {
    const { sam, linkId } = await mapped();
    await stale(linkId);
    sheets.failWith = new SheetsError('unavailable', 'down');
    const r = await api.call('GET', '/me/program', { token: sam.token });
    await app.idle();
    expect(r.status).toBe(200);
    expect(r.body.assignment).not.toBeNull();
  });

  it('shares one Google read between simultaneous manual syncs', async () => {
    const { coach, linkId } = await mapped();
    const before = sheets.reads;
    await Promise.all([1, 2, 3].map(() => api.call('POST', `/coach/sheets/${linkId}/sync`, { token: coach.token })));
    expect(sheets.reads - before).toBeLessThanOrEqual(1);
  });
});

describe('cleanup', () => {
  it('disconnecting a sheet removes the athletes\' sheet plans', async () => {
    const { coach, sam, linkId } = await mapped();
    expect((await api.call('DELETE', `/coach/sheets/${linkId}`, { token: coach.token })).status).toBe(200);
    expect((await api.call('GET', '/me/program', { token: sam.token })).body.assignment).toBeNull();
    expect((await api.call('GET', '/coach/sheets', { token: coach.token })).body.links).toEqual([]);
    const progs = await sql`select count(*)::int as n from programs where source = 'sheet'`;
    expect(progs[0].n).toBe(0);
  });

  it('an athlete leaving their coach, or being removed, drops the sheet plan and its tab link', async () => {
    const { coach, sam, alex, linkId } = await mapped();
    await map(coach.token, linkId, 'Alex', alex.id);
    await api.call('DELETE', '/me/coach', { token: sam.token });
    await api.call('DELETE', `/coach/clients/${alex.id}`, { token: coach.token });
    for (const c of [sam, alex]) expect((await api.call('GET', '/me/program', { token: c.token })).body.assignment).toBeNull();
    const v = (await api.call('GET', '/coach/sheets', { token: coach.token })).body.links[0];
    expect(v.mappings).toEqual([]);
    const progs = await sql`select count(*)::int as n from programs where source = 'sheet'`;
    expect(progs[0].n).toBe(0);
  });

  it('deleting an athlete\'s account leaves no hidden plan behind', async () => {
    const { sam } = await mapped();
    const r = await api.call('DELETE', '/me', { token: sam.token, body: { password: 'correct horse battery' } });
    expect(r.status).toBe(200);
    const progs = await sql`select count(*)::int as n from programs where source = 'sheet'`;
    expect(progs[0].n).toBe(0);
  });
});

describe('limits', () => {
  it('rate limits syncing so a coach cannot exhaust the Google quota', async () => {
    const { coach, linkId } = await mapped();
    const statuses: number[] = [];
    for (let i = 0; i < 32; i++) statuses.push((await api.call('POST', `/coach/sheets/${linkId}/sync`, { token: coach.token })).status);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
    expect(statuses[0]).toBe(200);
  });
});
