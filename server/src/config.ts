export interface Config {
  databaseUrl: string;
  port: number;
  /** Browser origins allowed to call the API (CORS). Empty = none. */
  corsOrigins: string[];
  sessionTtlMs: number;
  inviteTtlMs: number;
  /** Public address of the web app, used for links in emails (e.g. https://irontrack.pages.dev). */
  appUrl: string;
  /** smtp://user:pass@host:587 or smtps://user:pass@host:465 */
  smtpUrl: string | null;
  /** From address for emails, e.g. "IronTrack <no-reply@yourdomain.com>". Must be a domain verified with your email provider. */
  mailFrom: string | null;
  resetTtlMs: number;
  /** Trust X-Forwarded-For (only enable behind a reverse proxy you control). */
  trustProxy: boolean;
}

const DAY = 24 * 60 * 60 * 1000;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  return {
    databaseUrl,
    port: Number(env.PORT ?? 8787),
    corsOrigins: (env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    sessionTtlMs: Number(env.SESSION_TTL_DAYS ?? 30) * DAY,
    inviteTtlMs: Number(env.INVITE_TTL_DAYS ?? 14) * DAY,
    appUrl: (env.APP_URL ?? '').replace(/\/+$/, ''),
    smtpUrl: env.SMTP_URL || null,
    mailFrom: env.MAIL_FROM || null,
    resetTtlMs: Number(env.RESET_TTL_MINUTES ?? 60) * 60_000,
    trustProxy: env.TRUST_PROXY === '1',
  };
}
