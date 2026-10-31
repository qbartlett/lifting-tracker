import { SQL } from 'bun';
import { createApp } from './app';
import { loadConfig } from './config';
import { migrate } from './migrate';

const config = loadConfig();
const sql = new SQL(config.databaseUrl);

const applied = await migrate(sql);
if (applied.length) console.log(`Applied migrations: ${applied.join(', ')}`);

const app = createApp({ sql, config });
if (!config.smtpUrl || !config.mailFrom) console.warn('Email is not configured (SMTP_URL / MAIL_FROM): password reset emails will not be sent.');
if (!config.appUrl) console.warn('APP_URL is not set: password reset links cannot be built.');

const server = Bun.serve({
  port: config.port,
  maxRequestBodySize: 2_500_000,
  async fetch(req, srv) {
    const forwarded = config.trustProxy ? req.headers.get('x-forwarded-for')?.split(',')[0].trim() : undefined;
    return app.handle(req, forwarded || srv.requestIP(req)?.address || 'unknown');
  },
});

console.log(`IronTrack server listening on :${server.port}`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    server.stop();
    await app.idle(); // let any queued emails finish
    await sql.close();
    process.exit(0);
  });
}
