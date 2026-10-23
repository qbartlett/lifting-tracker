import type { SQL } from 'bun';
import { HttpError, type AuthUser } from './http';

export const sha256 = (s: string): string => new Bun.CryptoHasher('sha256').update(s).digest('hex');

export const randomToken = (): string =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');

// No 0/O/1/I/L so codes are easy to read out or type.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]);
  return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`;
}

export const normalizeInviteCode = (code: string): string => code.trim().toUpperCase().replace(/\s+/g, '');

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function validEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}

export const MIN_PASSWORD = 10;
export const MAX_PASSWORD = 200;

export const hashPassword = (pw: string): Promise<string> => Bun.password.hash(pw);
export const verifyPassword = (pw: string, hash: string): Promise<boolean> => Bun.password.verify(pw, hash);

// Used to spend equal time when the email is unknown, so login timing doesn't reveal accounts.
let dummyHash: Promise<string> | undefined;
export const dummyVerify = async (pw: string): Promise<void> => {
  dummyHash ??= hashPassword('not-a-real-password');
  await verifyPassword(pw, await dummyHash);
};

export async function createSession(sql: SQL, userId: string, ttlMs: number): Promise<string> {
  const token = randomToken();
  const expires = new Date(Date.now() + ttlMs);
  await sql`insert into sessions (token_hash, user_id, expires_at) values (${sha256(token)}, ${userId}, ${expires})`;
  // Opportunistic cleanup keeps the table small without a scheduler.
  if (Math.random() < 0.02) await sql`delete from sessions where expires_at < now()`;
  return token;
}

export async function authenticate(sql: SQL, req: Request): Promise<{ user: AuthUser; tokenHash: string }> {
  const header = req.headers.get('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(header);
  if (!match) throw new HttpError(401, 'unauthorized');
  const tokenHash = sha256(match[1]);
  const rows = await sql`
    select u.id, u.email, u.name, u.role
    from sessions s join users u on u.id = s.user_id
    where s.token_hash = ${tokenHash} and s.expires_at > now()`;
  if (rows.length === 0) throw new HttpError(401, 'unauthorized');
  return { user: rows[0] as AuthUser, tokenHash };
}
