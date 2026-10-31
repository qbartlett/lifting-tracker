import { afterEach, describe, expect, it } from 'bun:test';
import net from 'node:net';
import tls from 'node:tls';
import { readFileSync } from 'node:fs';
import { addressOf, buildMessage, parseSmtpUrl, sendSmtp, type SmtpOptions } from '../src/smtp';
import { passwordResetEmail, SmtpMailer, createMailer } from '../src/mailer';
import { loadConfig } from '../src/config';

const key = readFileSync(new URL('./fixtures/localhost.key', import.meta.url));
const cert = readFileSync(new URL('./fixtures/localhost.crt', import.meta.url));
const trustTestCert = { ca: cert, rejectUnauthorized: true };

interface Fake {
  port: number;
  /** Raw bytes the server saw per command, for assertions. */
  commands: string[];
  messages: { from: string; to: string; data: string }[];
  close(): Promise<void>;
}

/** A tiny SMTP server good enough to exercise the client. */
async function fakeServer(o: { mode: 'plain' | 'implicit' | 'starttls'; auth?: { user: string; pass: string }; offerStartTls?: boolean; rejectRcpt?: boolean }): Promise<Fake> {
  const fake: Fake = { port: 0, commands: [], messages: [], close: async () => {} };
  const handle = (initial: net.Socket) => {
    let sock: net.Socket = initial;
    let buf = '';
    let inData = false;
    let authed = !o.auth;
    let from = '', to = '';
    const reply = (s: string) => sock.write(s + '\r\n');
    const onData = (d: Buffer | string) => {
      buf += d.toString();
      for (;;) {
        if (inData) {
          const end = buf.indexOf('\r\n.\r\n');
          if (end < 0) return;
          const data = buf.slice(0, end + 2).replace(/^\.\./gm, '.');
          buf = buf.slice(end + 5);
          inData = false;
          fake.messages.push({ from, to, data });
          reply('250 queued');
          continue;
        }
        const i = buf.indexOf('\r\n');
        if (i < 0) return;
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        fake.commands.push(line.startsWith('AUTH PLAIN') ? 'AUTH PLAIN <redacted>' : line);
        const cmd = line.toUpperCase();
        if (cmd.startsWith('EHLO')) {
          const secured = o.mode !== 'starttls' || sock instanceof tls.TLSSocket;
          const extra = [!secured && o.offerStartTls !== false ? '250-STARTTLS' : null, o.auth ? '250-AUTH PLAIN' : null].filter(Boolean);
          sock.write(['250-fake.local', ...extra, '250 8BITMIME'].join('\r\n') + '\r\n');
        } else if (cmd === 'STARTTLS') {
          reply('220 go ahead');
          // Stop reading the raw socket ourselves: from here the TLS wrapper owns it.
          sock.removeAllListeners('data');
          const secure = new tls.TLSSocket(sock, { isServer: true, key, cert });
          secure.on('data', onData);
          secure.on('error', () => {});
          sock = secure;
        } else if (cmd.startsWith('AUTH PLAIN')) {
          const [, user, pass] = Buffer.from(line.split(' ')[2], 'base64').toString().split('\0');
          if (o.auth && user === o.auth.user && pass === o.auth.pass) { authed = true; reply('235 ok'); } else reply('535 bad credentials');
        } else if (cmd.startsWith('MAIL FROM:')) {
          if (!authed) { reply('530 auth required'); continue; }
          from = line.slice(10).replace(/[<>]/g, ''); reply('250 ok');
        } else if (cmd.startsWith('RCPT TO:')) {
          if (o.rejectRcpt) reply('550 no such user'); else { to = line.slice(8).replace(/[<>]/g, ''); reply('250 ok'); }
        } else if (cmd === 'DATA') { inData = true; reply('354 go'); }
        else if (cmd === 'QUIT') { reply('221 bye'); sock.end(); return; }
        else reply('502 unknown');
      }
    };
    initial.on('data', onData);
    initial.on('error', () => {});
    reply('220 fake.local ESMTP');
  };
  const server = o.mode === 'implicit'
    ? tls.createServer({ key, cert }, handle)
    : net.createServer(handle);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  fake.port = (server.address() as net.AddressInfo).port;
  fake.close = () => new Promise((r) => server.close(() => r()));
  return fake;
}

const mail = { to: 'sam@example.com', subject: 'Reset your password', text: 'Link: https://x/#reset=abc\n.leading dot line\nbye', html: '<p>Hi</p>' };
const base = (port: number, extra: Partial<SmtpOptions> = {}): SmtpOptions => ({ host: 'localhost', port, secure: false, from: 'IronTrack <no-reply@example.com>', ...extra });

let open: Fake | null = null;
afterEach(async () => { await open?.close(); open = null; });

const decodeParts = (data: string) =>
  [...data.matchAll(/Content-Type: (text\/\w+); charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/g)]
    .map(([, type, b64]) => [type, Buffer.from(b64.replace(/\r\n/g, ''), 'base64').toString('utf8')]);

describe('SMTP client', () => {
  it('delivers a multipart message over plain SMTP with AUTH', async () => {
    open = await fakeServer({ mode: 'plain', auth: { user: 'u', pass: 'p@ss' }, offerStartTls: false });
    await sendSmtp(base(open.port, { startTls: 'never', user: 'u', pass: 'p@ss' }), mail);
    expect(open.messages).toHaveLength(1);
    const m = open.messages[0];
    expect(m.from).toBe('no-reply@example.com');
    expect(m.to).toBe('sam@example.com');
    expect(m.data).toContain('From: IronTrack <no-reply@example.com>');
    expect(m.data).toContain('Subject: Reset your password');
    expect(m.data).toContain('multipart/alternative');
    const parts = Object.fromEntries(decodeParts(m.data));
    expect(parts['text/plain']).toBe(mail.text);
    expect(parts['text/html']).toBe('<p>Hi</p>');
  });

  it('works over implicit TLS (port 465 style)', async () => {
    open = await fakeServer({ mode: 'implicit', auth: { user: 'u', pass: 'p' } });
    await sendSmtp(base(open.port, { secure: true, user: 'u', pass: 'p', tls: trustTestCert }), mail);
    expect(open.messages).toHaveLength(1);
  });

  it('upgrades with STARTTLS before sending credentials (port 587 style)', async () => {
    open = await fakeServer({ mode: 'starttls', auth: { user: 'u', pass: 'p' } });
    await sendSmtp(base(open.port, { startTls: 'required', user: 'u', pass: 'p', tls: trustTestCert }), mail);
    const order = open.commands.map((c) => c.split(' ')[0]);
    expect(order.indexOf('STARTTLS')).toBeGreaterThan(-1);
    expect(order.indexOf('STARTTLS')).toBeLessThan(order.indexOf('AUTH'));
    expect(open.messages).toHaveLength(1);
  });

  it('refuses to send credentials in clear text when STARTTLS is required but not offered', async () => {
    open = await fakeServer({ mode: 'plain', auth: { user: 'u', pass: 'p' }, offerStartTls: false });
    await expect(sendSmtp(base(open.port, { startTls: 'required', user: 'u', pass: 'p' }), mail)).rejects.toThrow(/STARTTLS/);
    expect(open.commands.some((c) => c.startsWith('AUTH'))).toBe(false);
  });

  it('does not trust an unknown certificate', async () => {
    open = await fakeServer({ mode: 'implicit' });
    await expect(sendSmtp(base(open.port, { secure: true }), mail)).rejects.toThrow();
    expect(open.messages).toHaveLength(0);
  });

  it('reports bad credentials and rejected recipients clearly', async () => {
    open = await fakeServer({ mode: 'plain', auth: { user: 'u', pass: 'right' }, offerStartTls: false });
    await expect(sendSmtp(base(open.port, { startTls: 'never', user: 'u', pass: 'wrong' }), mail)).rejects.toThrow(/Login.*535/);
    await open.close();
    open = await fakeServer({ mode: 'plain', rejectRcpt: true });
    await expect(sendSmtp(base(open.port, { startTls: 'never' }), mail)).rejects.toThrow(/RCPT TO.*550/);
  });

  it('dot-stuffs lines that start with a dot so the message is not cut short', async () => {
    open = await fakeServer({ mode: 'plain' });
    await sendSmtp(base(open.port, { startTls: 'never' }), mail);
    const parts = Object.fromEntries(decodeParts(open.messages[0].data));
    expect(parts['text/plain']).toContain('.leading dot line');
    expect(parts['text/plain']).toEndWith('bye');
  });

  it('fails fast when nothing is listening', async () => {
    await expect(sendSmtp(base(1, { startTls: 'never', timeoutMs: 2000 }), mail)).rejects.toThrow();
  });
});

describe('message safety', () => {
  it('rejects line breaks in headers and bad addresses (header/command injection)', async () => {
    expect(() => buildMessage({ from: 'a@b.com' }, { ...mail, subject: 'Hi\r\nBcc: evil@x.com' })).toThrow(/line breaks/);
    expect(() => buildMessage({ from: 'a@b.com' }, { ...mail, to: 'x@y.com\r\nRCPT TO:<evil@x.com>' })).toThrow(/line breaks/);
    expect(() => addressOf('sam@example.com>\r\nRCPT TO:<evil@x.com')).toThrow();
    expect(() => addressOf('not an address')).toThrow();
    expect(addressOf('Sam <sam@example.com>')).toBe('sam@example.com');
  });

  it('encodes non-ASCII subjects and bodies', () => {
    const msg = buildMessage({ from: 'a@b.com' }, { ...mail, subject: 'Réinitialiser 💪', text: 'héllo' });
    expect(msg).toMatch(/Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/);
    expect(msg).not.toContain('héllo');
  });
});

describe('configuration', () => {
  it('parses SMTP URLs, including encoded passwords and ports', () => {
    expect(parseSmtpUrl('smtps://me%40x.com:p%2Fw%3A@smtp.example.com', 'a@b.com')).toMatchObject({ host: 'smtp.example.com', port: 465, secure: true, user: 'me@x.com', pass: 'p/w:' });
    expect(parseSmtpUrl('smtp://smtp.example.com:2525?starttls=0', 'a@b.com')).toMatchObject({ port: 2525, secure: false, startTls: 'never' });
    expect(parseSmtpUrl('smtp://smtp.example.com', 'a@b.com')).toMatchObject({ port: 587 });
    expect(() => parseSmtpUrl('http://x', 'a@b.com')).toThrow();
  });

  it('uses SMTP when configured and builds the reset email', async () => {
    const config = loadConfig({ DATABASE_URL: 'x', SMTP_URL: 'smtp://localhost:1', MAIL_FROM: 'IronTrack <a@b.com>' });
    expect(createMailer(config)).toBeInstanceOf(SmtpMailer);
    const m = passwordResetEmail('sam@x.com', 'Sam <script>', 'https://app/#reset=abc', 60);
    expect(m.html).not.toContain('<script>');
    expect(m.text).toContain('expires in 60 minutes');
  });
});
