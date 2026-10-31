import { SQL } from 'bun';
import { createApp, type App } from '../src/app';
import { loadConfig } from '../src/config';
import { migrate } from '../src/migrate';
import type { Mail, Mailer } from '../src/mailer';

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

export async function setup(): Promise<{ sql: SQL; app: App; api: Api; mailer: TestMailer }> {
  await sql.unsafe('drop schema public cascade; create schema public;');
  await migrate(sql);
  const config = loadConfig({ DATABASE_URL: TEST_DB, CORS_ORIGINS: 'https://app.example.com', APP_URL: 'https://app.example.com' });
  const mailer = new TestMailer();
  const app = createApp({ sql, config, mailer });
  return { sql, app, api: makeApi(app), mailer };
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
