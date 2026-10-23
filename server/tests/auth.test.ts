import { beforeEach, describe, expect, it } from 'bun:test';
import { setup, type Api } from './helpers';
import type { SQL } from 'bun';

let api: Api; let sql: SQL;
beforeEach(async () => { ({ api, sql } = await setup()); });

const PW = 'correct horse battery';

describe('registration', () => {
  it('lets a coach sign up and normalises the email', async () => {
    const r = await api.call('POST', '/auth/register', { body: { email: '  Coach@Example.COM ', name: 'Coach', password: PW } });
    expect(r.status).toBe(201);
    expect(r.body.user).toMatchObject({ email: 'coach@example.com', role: 'coach' });
    expect(r.body.token.length).toBeGreaterThan(30);
  });

  it('never returns the password hash and stores only a hashed password', async () => {
    const r = await api.call('POST', '/auth/register', { body: { email: 'c@x.com', name: 'C', password: PW } });
    expect(JSON.stringify(r.body)).not.toContain('argon');
    const [u] = await sql`select password_hash from users`;
    expect(u.password_hash).toStartWith('$argon2');
    expect(u.password_hash).not.toContain(PW);
  });

  it('stores only a hash of the session token', async () => {
    const r = await api.call('POST', '/auth/register', { body: { email: 'c@x.com', name: 'C', password: PW } });
    const rows = await sql`select token_hash from sessions`;
    expect(rows.length).toBe(1);
    expect(rows[0].token_hash).not.toBe(r.body.token);
  });

  it('rejects duplicate emails regardless of case', async () => {
    await api.register('dup@x.com', 'One');
    const r = await api.call('POST', '/auth/register', { body: { email: 'DUP@x.com', name: 'Two', password: PW } });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('email_taken');
  });

  it('validates input', async () => {
    const bad = (body: any) => api.call('POST', '/auth/register', { body });
    expect((await bad({ email: 'nope', name: 'A', password: PW })).status).toBe(400);
    expect((await bad({ email: 'a@x.com', name: 'A', password: 'short' })).status).toBe(400);
    expect((await bad({ email: 'a@x.com', name: '', password: PW })).status).toBe(400);
    expect((await bad({ email: 'a@x.com', name: 'A', password: PW, role: 'admin' })).status).toBe(400);
  });

  it('refuses client sign-up without an invite', async () => {
    const r = await api.call('POST', '/auth/register', { body: { email: 'c@x.com', name: 'C', password: PW, role: 'client' } });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('invite_required');
  });

  it('refuses malformed JSON', async () => {
    const res = await api.call('POST', '/auth/register', { headers: { 'content-type': 'application/json' } });
    expect(res.status).toBe(400);
  });
});

describe('login and sessions', () => {
  it('logs in with the right password only', async () => {
    await api.register('c@x.com', 'C');
    const ok = await api.call('POST', '/auth/login', { body: { email: 'C@X.com', password: PW } });
    expect(ok.status).toBe(200);
    const bad = await api.call('POST', '/auth/login', { body: { email: 'c@x.com', password: 'wrong password!' } });
    expect(bad.status).toBe(401);
  });

  it('gives the same error for unknown emails and wrong passwords', async () => {
    await api.register('c@x.com', 'C');
    const a = await api.call('POST', '/auth/login', { body: { email: 'c@x.com', password: 'wrong password!' } });
    const b = await api.call('POST', '/auth/login', { body: { email: 'ghost@x.com', password: 'wrong password!' } });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(b.body).toEqual(a.body);
  });

  it('requires a valid token', async () => {
    expect((await api.call('GET', '/me')).status).toBe(401);
    expect((await api.call('GET', '/me', { token: 'x'.repeat(43) })).status).toBe(401);
    expect((await api.call('GET', '/me', { headers: { authorization: 'Basic abc' } })).status).toBe(401);
  });

  it('logout invalidates the token', async () => {
    const { token } = await api.register('c@x.com', 'C');
    expect((await api.call('GET', '/me', { token })).status).toBe(200);
    expect((await api.call('POST', '/auth/logout', { token })).status).toBe(200);
    expect((await api.call('GET', '/me', { token })).status).toBe(401);
  });

  it('rejects expired sessions', async () => {
    const { token } = await api.register('c@x.com', 'C');
    await sql`update sessions set expires_at = now() - interval '1 minute'`;
    expect((await api.call('GET', '/me', { token })).status).toBe(401);
  });

  it('rate limits repeated failed logins per email', async () => {
    await api.register('c@x.com', 'C');
    let last = 0;
    for (let i = 0; i < 12; i++) {
      last = (await api.call('POST', '/auth/login', { body: { email: 'c@x.com', password: 'wrong password!' }, ip: `10.9.9.${i}` })).status;
    }
    expect(last).toBe(429);
    // even the right password is blocked while locked out
    const r = await api.call('POST', '/auth/login', { body: { email: 'c@x.com', password: PW }, ip: '10.9.9.99' });
    expect(r.status).toBe(429);
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});

describe('account deletion', () => {
  it('needs the password and removes the account and its data', async () => {
    const { token, id } = await api.register('c@x.com', 'C');
    await api.call('POST', '/sync/push', { token, body: { changes: [{ kind: 'workout', id: 'w1', updatedAt: 1000, data: { a: 1 } }] } });
    expect((await api.call('DELETE', '/me', { token, body: { password: 'nope nope nope' } })).status).toBe(401);
    expect((await api.call('DELETE', '/me', { token, body: { password: PW } })).status).toBe(200);
    expect((await sql`select 1 from users where id = ${id}`).length).toBe(0);
    expect((await sql`select 1 from docs where user_id = ${id}`).length).toBe(0);
    expect((await api.call('GET', '/me', { token })).status).toBe(401);
  });
});

describe('http hygiene', () => {
  it('sets security headers, 404s unknown routes and 405s wrong methods', async () => {
    const h = await api.call('GET', '/health');
    expect(h.status).toBe(200);
    expect(h.headers.get('x-content-type-options')).toBe('nosniff');
    expect(h.headers.get('cache-control')).toBe('no-store');
    expect((await api.call('GET', '/nope')).status).toBe(404);
    expect((await api.call('GET', '/auth/login')).status).toBe(405);
  });

  it('only allows configured CORS origins', async () => {
    const ok = await api.call('GET', '/health', { headers: { origin: 'https://app.example.com' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
    const evil = await api.call('GET', '/health', { headers: { origin: 'https://evil.example.com' } });
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
  });
});
