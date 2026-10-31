import type { SQL } from 'bun';
import type { Config } from './config';
import { authenticate } from './auth';
import { HttpError, json, type Ctx, type Route } from './http';
import { createMailer, type Mailer } from './mailer';
import { RateLimiter } from './ratelimit';
import { authRoutes } from './routes/auth';
import { coachRoutes } from './routes/coach';
import { syncRoutes } from './routes/sync';

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
};

export interface App {
  handle(req: Request, ip?: string): Promise<Response>;
  /** Resolves when background work (emails) has finished. Used by tests and graceful shutdown. */
  idle(): Promise<void>;
}

export function createApp(deps: { sql: SQL; config: Config; mailer?: Mailer }): App {
  const { sql, config } = deps;
  const mailer = deps.mailer ?? createMailer(config);
  const pending = new Set<Promise<unknown>>();
  const background = (task: Promise<unknown>) => {
    const t: Promise<unknown> = task
      .catch((e) => console.error('Background task failed:', e instanceof Error ? e.message : e))
      .finally(() => pending.delete(t));
    pending.add(t);
  };
  const limits = {
    ip: new RateLimiter(60, 15 * 60_000),
    login: new RateLimiter(10, 15 * 60_000),
    register: new RateLimiter(10, 60 * 60_000),
    forgotIp: new RateLimiter(10, 60 * 60_000),
    forgotEmail: new RateLimiter(3, 60 * 60_000),
    reset: new RateLimiter(20, 60 * 60_000),
  };
  const routes: Route[] = [...authRoutes(limits), ...coachRoutes(), ...syncRoutes()];

  function corsHeaders(req: Request): Record<string, string> {
    const origin = req.headers.get('origin');
    if (!origin || !config.corsOrigins.includes(origin)) return {};
    return {
      'access-control-allow-origin': origin,
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
      'access-control-max-age': '600',
      vary: 'Origin',
    };
  }

  async function dispatch(req: Request, ip: string): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/health') {
      await sql`select 1`;
      return json({ ok: true });
    }

    let pathMatched = false;
    for (const r of routes) {
      const m = r.regex.exec(url.pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== req.method) continue;

      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      const ctx = { req, url, params, ip, sql, config, mailer, background } as Ctx;

      if (r.auth) {
        ctx.user = (await authenticate(sql, req)).user;
        if (r.role && ctx.user.role !== r.role) throw new HttpError(403, 'forbidden', `This requires a ${r.role} account`);
      }
      const out = await r.handler(ctx);
      return out instanceof Response ? out : json(out);
    }
    throw pathMatched ? new HttpError(405, 'method_not_allowed') : new HttpError(404, 'not_found');
  }

  return {
    async idle() {
      while (pending.size) await Promise.all([...pending]);
    },
    async handle(req, ip = 'unknown') {
      const cors = corsHeaders(req);
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...SECURITY_HEADERS, ...cors } });

      let res: Response;
      try {
        res = await dispatch(req, ip);
      } catch (e) {
        if (e instanceof HttpError) {
          res = json({ error: { code: e.code, message: e.message } }, e.status, e.headers);
        } else {
          console.error('Unhandled error', e);
          res = json({ error: { code: 'internal_error', message: 'Something went wrong' } }, 500);
        }
      }
      for (const [k, v] of Object.entries({ ...SECURITY_HEADERS, ...cors })) res.headers.set(k, v);
      return res;
    },
  };
}
