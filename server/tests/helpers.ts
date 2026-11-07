import { SQL } from 'bun';
import { createApp, type App } from '../src/app';
import { loadConfig } from '../src/config';
import { migrate } from '../src/migrate';
import type { Mail, Mailer } from '../src/mailer';
import { SheetsError, type SheetsApi, type SpreadsheetInfo } from '../src/google';

export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:54329/irontrack_test';

// One pooled connection set for the whole test run; the schema is rebuilt per test.
const sql = new SQL(TEST_DB, { max: 10 });

export class TestMailer implements Mailer {
  sent: Mail[] = [];
  fail = false;
  async send(mail: Mail) {
    if (this.fail) throw new Error('mail provider down');
    this.sent.push(mail);
  }
  /** The reset token from the most recent email. */
  lastToken(): string {
    const m = /#reset=([A-Za-z0-9_-]+)/.exec(this.sent[this.sent.length - 1]?.text ?? '');
    if (!m) throw new Error('no reset link in last email');
    return m[1];
  }
}

/** An in-memory Google: spreadsheets with tabs of cell values. */
export class FakeSheets implements SheetsApi {
  enabled = true;
  serviceAccountEmail = 'bot@irontrack.test';
  sheets = new Map<string, { title: string; tabs: Map<string, unknown[][]> }>();
  /** Set to make every call fail the way Google would. */
  failWith: SheetsError | null = null;
  reads = 0;
  infos = 0;
  /** Spreadsheets the bot has not been shared on behave like Google: forbidden. */
  add(id: string, title: string, tabs: Record<string, unknown[][]>) {
    this.sheets.set(id, { title, tabs: new Map(Object.entries(tabs)) });
  }
  private get(id: string) {
    if (this.failWith) throw this.failWith;
    const s = this.sheets.get(id);
    if (!s) throw new SheetsError('forbidden', `No access to that sheet. Share it with ${this.serviceAccountEmail} as an Editor.`);
    return s;
  }
  async info(id: string): Promise<SpreadsheetInfo> {
    this.infos++;
    const s = this.get(id);
    return { title: s.title, tabs: [...s.tabs.keys()] };
  }
  async readTabs(id: string, tabs: string[]) {
    this.reads++;
    const s = this.get(id);
    const out: Record<string, unknown[][]> = {};
    for (const t of tabs) {
      if (!s.tabs.has(t)) throw new SheetsError('bad_request', `Unable to parse range: ${t}`); // what real Google does
      out[t] = s.tabs.get(t)!;
    }
    return out;
  }
  async addTab(id: string, title: string, header: string[]) {
    const s = this.get(id);
    if (s.tabs.has(title)) throw new SheetsError('bad_request', 'A sheet with that name already exists');
    s.tabs.set(title, [header]);
  }
}

export async function setup(): Promise<{ sql: SQL; app: App; api: Api; mailer: TestMailer; sheets: FakeSheets }> {
  await sql.unsafe('drop schema public cascade; create schema public;');
  await migrate(sql);
  const config = loadConfig({ DATABASE_URL: TEST_DB, CORS_ORIGINS: 'https://app.example.com', APP_URL: 'https://app.example.com' });
  const mailer = new TestMailer();
  const sheets = new FakeSheets();
  const app = createApp({ sql, config, mailer, sheets });
  return { sql, app, api: makeApi(app), mailer, sheets };
}

export interface Reply<T = any> { status: number; body: T; headers: Headers }

export interface Api {
  call(method: string, path: string, opts?: { token?: string; body?: unknown; ip?: string; headers?: Record<string, string> }): Promise<Reply>;
  register(email: string, name: string, extra?: Record<string, unknown>): Promise<{ token: string; id: string }>;
}

export function makeApi(app: App): Api {
  const call: Api['call'] = async (method, path, opts = {}) => {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    const res = await app.handle(
      new Request(`http://test${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) }),
      opts.ip ?? '10.0.0.1'
    );
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  };
  return {
    call,
    async register(email, name, extra = {}) {
      const r = await call('POST', '/auth/register', {
        body: { email, name, password: 'correct horse battery', ...extra },
        ip: `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
      });
      if (r.status !== 201) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.body)}`);
      return { token: r.body.token, id: r.body.user.id };
    },
  };
}

export const workout = (id: string, updatedAt: number, extra: Record<string, unknown> = {}) => ({
  kind: 'workout', id, updatedAt, data: { id, name: `Workout ${id}`, ...extra },
});
