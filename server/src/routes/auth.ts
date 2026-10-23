import {
  HttpError, json, readJson, route, str, type Ctx,
} from '../http';
import {
  MAX_PASSWORD, MIN_PASSWORD, createSession, dummyVerify, hashPassword, normalizeEmail,
  normalizeInviteCode, sha256, validEmail, verifyPassword,
} from '../auth';
import type { RateLimiter } from '../ratelimit';

export function authRoutes(limits: { ip: RateLimiter; login: RateLimiter; register: RateLimiter }) {
  const throttle = (limiter: RateLimiter, key: string) => {
    const wait = limiter.hit(key);
    if (wait > 0) throw new HttpError(429, 'rate_limited', 'Too many attempts. Try again later.', { 'retry-after': String(wait) });
  };

  const publicUser = (u: { id: string; email: string; name: string; role: string }) => ({
    id: u.id, email: u.email, name: u.name, role: u.role,
  });

  async function coachOf(ctx: Ctx) {
    const rows = await ctx.sql`
      select c.id, c.name from coach_clients cc join users c on c.id = cc.coach_id
      where cc.client_id = ${ctx.user.id}`;
    return rows[0] ?? null;
  }

  return [
    // Coaches sign up themselves. Clients can only sign up with an invite code from a coach.
    route('POST', '/auth/register', {}, async (ctx) => {
      throttle(limits.register, `register:${ctx.ip}`);
      const body = await readJson(ctx.req);
      const email = normalizeEmail(str(body.email, 'email', 3, 254));
      if (!validEmail(email)) throw new HttpError(400, 'invalid_field', 'email is not valid');
      const name = str(body.name, 'name', 1, 100);
      const password = body.password;
      if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
        throw new HttpError(400, 'invalid_field', `password must be ${MIN_PASSWORD}-${MAX_PASSWORD} characters`);
      }
      const inviteCode = body.inviteCode === undefined ? null : normalizeInviteCode(str(body.inviteCode, 'inviteCode', 1, 40));
      const wantsRole = body.role === undefined ? (inviteCode ? 'client' : 'coach') : body.role;
      if (wantsRole !== 'coach' && wantsRole !== 'client') throw new HttpError(400, 'invalid_field', 'role must be coach or client');
      if (wantsRole === 'client' && !inviteCode) throw new HttpError(400, 'invite_required', 'Clients need an invite code from their coach');
      if (wantsRole === 'coach' && inviteCode) throw new HttpError(400, 'invalid_field', 'Coach accounts do not use invite codes');

      const passwordHash = await hashPassword(password);

      try {
        const user = await ctx.sql.begin(async (tx) => {
          let coachId: string | null = null;
          let inviteId: string | null = null;
          if (inviteCode) {
            const invites = await tx`
              select id, coach_id from invites
              where code_hash = ${sha256(inviteCode)} and used_by is null and expires_at > now()
              for update`;
            if (invites.length === 0) throw new HttpError(400, 'invalid_invite', 'That invite code is invalid or has expired');
            coachId = invites[0].coach_id;
            inviteId = invites[0].id;
          }
          const [u] = await tx`
            insert into users (email, password_hash, name, role)
            values (${email}, ${passwordHash}, ${name}, ${wantsRole})
            returning id, email, name, role`;
          if (coachId && inviteId) {
            await tx`insert into coach_clients (client_id, coach_id) values (${u.id}, ${coachId})`;
            await tx`update invites set used_by = ${u.id}, used_at = now() where id = ${inviteId}`;
          }
          return u;
        });
        const token = await createSession(ctx.sql, user.id, ctx.config.sessionTtlMs);
        return json({ token, user: publicUser(user) }, 201);
      } catch (e) {
        if ((e as { code?: string; errno?: string }).code === '23505' || (e as { errno?: string }).errno === '23505') {
          throw new HttpError(409, 'email_taken', 'An account with that email already exists');
        }
        throw e;
      }
    }),

    route('POST', '/auth/login', {}, async (ctx) => {
      throttle(limits.ip, `login-ip:${ctx.ip}`);
      const body = await readJson(ctx.req);
      const email = normalizeEmail(str(body.email, 'email', 3, 254));
      const password = typeof body.password === 'string' ? body.password : '';
      if (!password || password.length > MAX_PASSWORD) throw new HttpError(400, 'invalid_field', 'password is required');
      throttle(limits.login, `login:${email}`);

      const rows = await ctx.sql`select id, email, name, role, password_hash from users where lower(email) = ${email}`;
      const user = rows[0];
      const ok = user ? await verifyPassword(password, user.password_hash) : (await dummyVerify(password), false);
      if (!user || !ok) throw new HttpError(401, 'invalid_credentials', 'Email or password is incorrect');

      limits.login.reset(`login:${email}`);
      const token = await createSession(ctx.sql, user.id, ctx.config.sessionTtlMs);
      return { token, user: publicUser(user) };
    }),

    route('POST', '/auth/logout', { auth: true }, async (ctx) => {
      const header = ctx.req.headers.get('authorization')!.slice('Bearer '.length);
      await ctx.sql`delete from sessions where token_hash = ${sha256(header)}`;
      return { ok: true };
    }),

    route('GET', '/me', { auth: true }, async (ctx) => {
      const coach = ctx.user.role === 'client' ? await coachOf(ctx) : null;
      return { user: publicUser(ctx.user), coach };
    }),

    // A client can leave their coach at any time; the coach immediately loses access.
    route('DELETE', '/me/coach', { auth: true, role: 'client' }, async (ctx) => {
      await ctx.sql`delete from coach_clients where client_id = ${ctx.user.id}`;
      return { ok: true };
    }),

    // Permanently deletes the account and all synced data. Requires the password.
    route('DELETE', '/me', { auth: true }, async (ctx) => {
      throttle(limits.login, `login:${ctx.user.email.toLowerCase()}`);
      const body = await readJson(ctx.req);
      const password = typeof body.password === 'string' ? body.password : '';
      const [row] = await ctx.sql`select password_hash from users where id = ${ctx.user.id}`;
      if (!password || !(await verifyPassword(password, row.password_hash))) {
        throw new HttpError(401, 'invalid_credentials', 'Password is incorrect');
      }
      await ctx.sql`delete from users where id = ${ctx.user.id}`;
      return { ok: true };
    }),
  ];
}
