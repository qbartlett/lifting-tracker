import { beforeEach, describe, expect, it } from 'bun:test';
import { setup, TestMailer, type Api } from './helpers';
import type { App } from '../src/app';
import type { SQL } from 'bun';

let api: Api; let app: App; let sql: SQL; let mailer: TestMailer;
beforeEach(async () => { ({ api, app, sql, mailer } = await setup()); });

const PW = 'correct horse battery';
const forgot = async (email: string, ip = '10.2.0.1') => {
  const r = await api.call('POST', '/auth/forgot', { body: { email }, ip });
  await app.idle();
  return r;
};
const reset = (token: string, password = 'a brand new password') =>
  api.call('POST', '/auth/reset', { body: { token, password } });

describe('forgot password', () => {
  it('emails a reset link to a real account', async () => {
    await api.register('sam@x.com', 'Sam');
    const r = await forgot('SAM@x.com');
    expect(r.status).toBe(200);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toBe('sam@x.com');
    expect(mailer.sent[0].text).toContain('https://app.example.com/#reset=');
    expect(mailer.sent[0].html).toContain('Choose a new password');
  });

  it('gives an identical answer for unknown emails and sends nothing', async () => {
    await api.register('sam@x.com', 'Sam');
    const known = await forgot('sam@x.com');
    const unknown = await forgot('ghost@x.com', '10.2.0.2');
    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    expect(mailer.sent).toHaveLength(1);
  });

  it('stores only a hash of the token', async () => {
    await api.register('sam@x.com', 'Sam');
    await forgot('sam@x.com');
    const token = mailer.lastToken();
    const [row] = await sql`select token_hash from password_resets`;
    expect(row.token_hash).not.toContain(token);
  });

  it('a newer request invalidates the older link', async () => {
    await api.register('sam@x.com', 'Sam');
    await forgot('sam@x.com');
    const first = mailer.lastToken();
    await forgot('sam@x.com');
    const second = mailer.lastToken();
    expect(second).not.toBe(first);
    expect((await reset(first)).status).toBe(400);
    expect((await reset(second)).status).toBe(200);
  });

  it('still answers ok when the email provider is down', async () => {
    await api.register('sam@x.com', 'Sam');
    mailer.fail = true;
    const r = await forgot('sam@x.com');
    expect(r.status).toBe(200);
  });

  it('limits repeat requests for one address silently and per IP loudly', async () => {
    await api.register('sam@x.com', 'Sam');
    for (let i = 0; i < 6; i++) expect((await forgot('sam@x.com', `10.3.0.${i}`)).status).toBe(200);
    expect(mailer.sent.length).toBe(3);
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await forgot(`u${i}@x.com`, '10.4.0.1')).status;
    expect(last).toBe(429);
  });

  it('validates the email field', async () => {
    expect((await api.call('POST', '/auth/forgot', { body: {} })).status).toBe(400);
  });
});

describe('reset password', () => {
  it('sets a new password, which works, while the old one stops working', async () => {
    await api.register('sam@x.com', 'Sam');
    await forgot('sam@x.com');
    expect((await reset(mailer.lastToken())).status).toBe(200);
    expect((await api.call('POST', '/auth/login', { body: { email: 'sam@x.com', password: 'a brand new password' } })).status).toBe(200);
    expect((await api.call('POST', '/auth/login', { body: { email: 'sam@x.com', password: PW }, ip: '10.9.9.9' })).status).toBe(401);
  });

  it('signs out every existing session', async () => {
    const { token } = await api.register('sam@x.com', 'Sam');
    await forgot('sam@x.com');
    await reset(mailer.lastToken());
    expect((await api.call('GET', '/me', { token })).status).toBe(401);
  });

  it('links work only once', async () => {
    await api.register('sam@x.com', 'Sam');
    await forgot('sam@x.com');
    const t = mailer.lastToken();
    expect((await reset(t)).status).toBe(200);
    const again = await reset(t, 'yet another password');
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('invalid_token');
    expect((await api.call('POST', '/auth/login', { body: { email: 'sam@x.com', password: 'a brand new password' } })).status).toBe(200);
  });

  it('rejects expired, made-up and malformed tokens', async () => {
    await api.register('sam@x.com', 'Sam');
    await forgot('sam@x.com');
    const t = mailer.lastToken();
    await sql`update password_resets set expires_at = now() - interval '1 minute'`;
    expect((await reset(t)).status).toBe(400);
    expect((await reset('x'.repeat(43))).status).toBe(400);
    expect((await reset('short')).status).toBe(400);
    expect((await api.call('POST', '/auth/reset', { body: { password: 'a brand new password' } })).status).toBe(400);
  });

  it('enforces the password rules and keeps the token usable after a rejected password', async () => {
    await api.register('sam@x.com', 'Sam');
    await forgot('sam@x.com');
    const t = mailer.lastToken();
    expect((await reset(t, 'short')).status).toBe(400);
    expect((await reset(t, 'a brand new password')).status).toBe(200);
  });

  it("a token cannot be used to change a different account", async () => {
    await api.register('a@x.com', 'A');
    await api.register('b@x.com', 'B');
    await forgot('a@x.com');
    await reset(mailer.lastToken());
    expect((await api.call('POST', '/auth/login', { body: { email: 'b@x.com', password: PW }, ip: '10.8.8.8' })).status).toBe(200);
  });
});
