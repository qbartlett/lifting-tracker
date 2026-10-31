import type { Config } from './config';
import { parseSmtpUrl, sendSmtp, type SmtpOptions } from './smtp';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Development only: prints the email (including reset links) to the server log. */
export class ConsoleMailer implements Mailer {
  async send(mail: Mail): Promise<void> {
    console.log(`\n--- email to ${mail.to} ---\nSubject: ${mail.subject}\n\n${mail.text}\n---`);
  }
}

/** Production without email configured: say so, but never write reset links to the logs. */
export class UnconfiguredMailer implements Mailer {
  async send(mail: Mail): Promise<void> {
    console.warn(`Email not configured (set SMTP_URL and MAIL_FROM). Not sent: "${mail.subject}"`);
  }
}

/** Sends through any SMTP server (Gmail, your domain's mail host, Postmark/SES SMTP, ...). */
export class SmtpMailer implements Mailer {
  constructor(private opts: SmtpOptions) {}

  async send(mail: Mail): Promise<void> {
    await sendSmtp(this.opts, mail);
  }
}

export function createMailer(config: Config): Mailer {
  if (config.smtpUrl && config.mailFrom) return new SmtpMailer(parseSmtpUrl(config.smtpUrl, config.mailFrom));
  return process.env.NODE_ENV === 'production' ? new UnconfiguredMailer() : new ConsoleMailer();
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function passwordResetEmail(to: string, name: string, link: string, minutes: number): Mail {
  return {
    to,
    subject: 'Reset your IronTrack password',
    text:
      `Hi ${name},\n\nSomeone asked to reset the password for your IronTrack account. ` +
      `Open this link to choose a new one (it works once and expires in ${minutes} minutes):\n\n${link}\n\n` +
      `If you didn't ask for this, you can ignore this email. Your password will not change.`,
    html:
      `<p>Hi ${esc(name)},</p><p>Someone asked to reset the password for your IronTrack account. ` +
      `<a href="${esc(link)}">Choose a new password</a>. The link works once and expires in ${minutes} minutes.</p>` +
      `<p>If you didn't ask for this, you can ignore this email. Your password will not change.</p>`,
  };
}
