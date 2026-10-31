import net from 'node:net';
import tls from 'node:tls';
import { hostname } from 'node:os';

/**
 * Minimal SMTP client (RFC 5321) with implicit TLS (port 465), STARTTLS (port 587) and AUTH PLAIN.
 * Sends one multipart text+HTML message per connection. No dependencies.
 */
export type StartTls = 'required' | 'optional' | 'never';

export interface SmtpOptions {
  host: string;
  port: number;
  /** Implicit TLS from the first byte (usually port 465). */
  secure: boolean;
  /** For non-implicit connections. Default: required, except for localhost. */
  startTls?: StartTls;
  user?: string;
  pass?: string;
  /** Full From header, e.g. `IronTrack <no-reply@example.com>`. */
  from: string;
  /** Name announced in EHLO. */
  heloName?: string;
  /** Extra TLS options (tests use this to trust a self-signed certificate). */
  tls?: tls.ConnectionOptions;
  timeoutMs?: number;
}

export interface SmtpMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const CRLF = '\r\n';
const isLocal = (h: string) => h === 'localhost' || h === '127.0.0.1' || h === '::1';

/** Parses smtp://user:pass@host:587 or smtps://user:pass@host:465 (add ?starttls=0 to turn STARTTLS off). */
export function parseSmtpUrl(raw: string, from: string): SmtpOptions {
  const u = new URL(raw);
  if (u.protocol !== 'smtp:' && u.protocol !== 'smtps:') throw new Error('SMTP_URL must start with smtp:// or smtps://');
  const secure = u.protocol === 'smtps:';
  const q = u.searchParams.get('starttls');
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : secure ? 465 : 587,
    secure,
    startTls: q === '0' ? 'never' : q === 'optional' ? 'optional' : undefined,
    user: u.username ? decodeURIComponent(u.username) : undefined,
    pass: u.password ? decodeURIComponent(u.password) : undefined,
    from,
  };
}

export class SmtpError extends Error {
  constructor(message: string, public code?: number) {
    super(message);
  }
}

/** Plain address from `Name <addr>` or `addr`. Rejects anything that could inject SMTP commands or headers. */
export function addressOf(value: string): string {
  const m = /<([^<>]+)>\s*$/.exec(value);
  const addr = (m ? m[1] : value).trim();
  if (!/^[^\s<>@"]+@[^\s<>@"]+$/.test(addr)) throw new SmtpError(`Invalid email address: ${value.slice(0, 80)}`);
  return addr;
}

const noNewlines = (s: string, what: string) => {
  if (/[\r\n]/.test(s)) throw new SmtpError(`${what} must not contain line breaks`);
  return s;
};

/** RFC 2047 encoded-word for non-ASCII header values. */
const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);

const b64Lines = (s: string) => (Buffer.from(s, 'utf8').toString('base64').match(/.{1,76}/g) ?? ['']).join(CRLF);

export function buildMessage(opts: Pick<SmtpOptions, 'from'>, msg: SmtpMessage, now = new Date(), domain = 'irontrack.local'): string {
  const boundary = `=_irontrack_${crypto.randomUUID().replace(/-/g, '')}`;
  const headers = [
    `From: ${noNewlines(opts.from, 'From')}`,
    `To: ${noNewlines(msg.to, 'To')}`,
    `Subject: ${encodeHeader(noNewlines(msg.subject, 'Subject'))}`,
    `Date: ${now.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const part = (type: string, body: string) =>
    [`--${boundary}`, `Content-Type: ${type}; charset=utf-8`, 'Content-Transfer-Encoding: base64', '', b64Lines(body)].join(CRLF);
  return [headers.join(CRLF), '', part('text/plain', msg.text), part('text/html', msg.html), `--${boundary}--`, ''].join(CRLF);
}

type Reply = { code: number; lines: string[] };

class Reader {
  private buf = '';
  private waiting: { resolve: (r: Reply) => void; reject: (e: Error) => void } | null = null;
  private failed: Error | null = null;
  private lines: string[] = [];

  constructor(private sock: net.Socket) {
    sock.setEncoding('utf8');
    sock.on('data', (d: string) => {
      this.buf += d;
      this.pump();
    });
    const fail = (e: Error) => {
      this.failed = e;
      this.waiting?.reject(e);
      this.waiting = null;
    };
    sock.on('error', fail);
    sock.on('close', () => fail(new SmtpError('Connection closed by the mail server')));
    sock.on('timeout', () => fail(new SmtpError('Mail server timed out')));
  }

  private pump() {
    for (;;) {
      const i = this.buf.indexOf('\n');
      if (i < 0) return;
      const line = this.buf.slice(0, i).replace(/\r$/, '');
      this.buf = this.buf.slice(i + 1);
      this.lines.push(line);
      const m = /^(\d{3})([ -])/.exec(line);
      if (m && m[2] === ' ' && this.waiting) {
        const w = this.waiting;
        this.waiting = null;
        const lines = this.lines;
        this.lines = [];
        w.resolve({ code: Number(m[1]), lines });
      }
    }
  }

  next(): Promise<Reply> {
    if (this.failed) return Promise.reject(this.failed);
    return new Promise((resolve, reject) => {
      this.waiting = { resolve, reject };
      this.pump();
    });
  }
}

export async function sendSmtp(opts: SmtpOptions, msg: SmtpMessage): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const to = addressOf(msg.to);
  const envelopeFrom = addressOf(opts.from);
  const body = buildMessage(opts, msg, new Date(), envelopeFrom.split('@')[1]);

  let sock: net.Socket = opts.secure
    ? tls.connect({ host: opts.host, port: opts.port, servername: opts.host, ...opts.tls })
    : net.connect({ host: opts.host, port: opts.port });
  sock.setTimeout(timeoutMs);
  let reader = new Reader(sock);

  const send = (line: string) => sock.write(line + CRLF);
  const expect = async (ok: number[], what: string): Promise<Reply> => {
    const r = await reader.next();
    if (!ok.includes(r.code)) throw new SmtpError(`${what} failed: ${r.lines.join(' ').slice(0, 200)}`, r.code);
    return r;
  };
  const command = async (line: string, ok: number[], what: string) => {
    send(line);
    return expect(ok, what);
  };

  try {
    await expect([220], 'Connecting');
    const helo = opts.heloName ?? (hostname() || 'localhost');
    let ehlo = await command(`EHLO ${helo}`, [250], 'EHLO');

    if (!opts.secure) {
      const policy: StartTls = opts.startTls ?? (isLocal(opts.host) ? 'optional' : 'required');
      const offered = ehlo.lines.some((l) => /^250[ -]STARTTLS\s*$/i.test(l));
      if (policy !== 'never' && offered) {
        await command('STARTTLS', [220], 'STARTTLS');
        sock.removeAllListeners('data');
        sock = tls.connect({ socket: sock, servername: opts.host, ...opts.tls });
        sock.setTimeout(timeoutMs);
        reader = new Reader(sock);
        ehlo = await command(`EHLO ${helo}`, [250], 'EHLO after STARTTLS');
      } else if (policy === 'required') {
        throw new SmtpError('The mail server does not offer STARTTLS; refusing to send credentials in clear text');
      }
    }

    if (opts.user !== undefined) {
      const plain = Buffer.from(`\0${opts.user}\0${opts.pass ?? ''}`, 'utf8').toString('base64');
      await command(`AUTH PLAIN ${plain}`, [235], 'Login to the mail server');
    }
    await command(`MAIL FROM:<${envelopeFrom}>`, [250], 'MAIL FROM');
    await command(`RCPT TO:<${to}>`, [250, 251], 'RCPT TO');
    await command('DATA', [354], 'DATA');
    // Dot-stuffing: a line starting with "." must be doubled.
    sock.write(body.replace(/\r?\n/g, CRLF).replace(/^\./gm, '..') + '.' + CRLF);
    await expect([250], 'Sending the message');
    send('QUIT');
  } finally {
    sock.destroy();
  }
}
