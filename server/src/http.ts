import type { SQL } from 'bun';
import type { Config } from './config';
import type { Mailer } from './mailer';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string, public headers: Record<string, string> = {}) {
    super(message ?? code);
  }
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'coach' | 'client';
}

export interface Ctx {
  req: Request;
  url: URL;
  params: Record<string, string>;
  ip: string;
  sql: SQL;
  config: Config;
  mailer: Mailer;
  /** Run work after the response (e.g. sending email) without making the caller wait. Errors are logged. */
  background: (task: Promise<unknown>) => void;
  /** Set for routes registered with auth: true. */
  user: AuthUser;
}

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });

export const MAX_BODY_BYTES = 2_000_000;

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, 'body_too_large');
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'body_too_large');
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body must be a JSON object');
  }
}

export function str(v: unknown, field: string, min: number, max: number): string {
  if (typeof v !== 'string') throw new HttpError(400, 'invalid_field', `${field} must be a string`);
  const t = v.trim();
  if (t.length < min || t.length > max) {
    throw new HttpError(400, 'invalid_field', `${field} must be ${min}-${max} characters`);
  }
  return t;
}

export function optStr(v: unknown, field: string, max: number): string | null {
  if (v === undefined || v === null || v === '') return null;
  return str(v, field, 1, max);
}

export function intParam(v: string | null, field: string, def: number, min: number, max: number): number {
  if (v === null || v === '') return def;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, 'invalid_param', `${field} must be an integer ${min}-${max}`);
  }
  return n;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidParam(v: string): string {
  if (!UUID_RE.test(v)) throw new HttpError(404, 'not_found');
  return v;
}

export type Handler = (ctx: Ctx) => Promise<unknown>;

export interface Route {
  method: string;
  regex: RegExp;
  keys: string[];
  auth: boolean;
  role?: 'coach' | 'client';
  handler: Handler;
}

export function route(
  method: string,
  path: string,
  opts: { auth?: boolean; role?: 'coach' | 'client' },
  handler: Handler
): Route {
  const keys: string[] = [];
  const pattern = path.replace(/:([a-zA-Z]+)/g, (_, k) => {
    keys.push(k);
    return '([^/]+)';
  });
  return {
    method,
    regex: new RegExp(`^${pattern}$`),
    keys,
    auth: opts.auth ?? false,
    role: opts.role,
    handler,
  };
}
