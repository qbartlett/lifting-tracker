import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

export type SheetsErrorCode = 'not_configured' | 'not_found' | 'forbidden' | 'api_disabled' | 'rate_limited' | 'bad_request' | 'misconfigured' | 'unavailable';

/** Something the coach can act on, with a message safe to show them. */
export class SheetsError extends Error {
  constructor(public code: SheetsErrorCode, message: string) {
    super(message);
  }
}

export interface SpreadsheetInfo {
  title: string;
  tabs: string[];
}

export interface SheetsApi {
  /** False when the server has no Google credentials. */
  readonly enabled: boolean;
  /** The address coaches must share their sheet with. */
  readonly serviceAccountEmail: string | null;
  info(spreadsheetId: string): Promise<SpreadsheetInfo>;
  /** Cell values per tab, as the sheet displays them. Missing/empty tabs give []. */
  readTabs(spreadsheetId: string, tabs: string[]): Promise<Record<string, unknown[][]>>;
  /** Adds a tab and writes one header row to it. */
  addTab(spreadsheetId: string, title: string, header: string[]): Promise<void>;
}

export interface GoogleCredentials {
  clientEmail: string;
  privateKey: string;
  tokenUri: string;
}

/** Reads a service account key (the JSON file Google gives you) from an env value or file path. */
export function loadGoogleCredentials(env: Record<string, string | undefined>): GoogleCredentials | null {
  let raw = env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw && env.GOOGLE_SERVICE_ACCOUNT_FILE) {
    try {
      raw = readFileSync(env.GOOGLE_SERVICE_ACCOUNT_FILE, 'utf8');
    } catch {
      throw new Error(`GOOGLE_SERVICE_ACCOUNT_FILE could not be read: ${env.GOOGLE_SERVICE_ACCOUNT_FILE}`);
    }
  }
  if (!raw) return null;
  let key: any;
  try {
    key = JSON.parse(raw);
  } catch {
    throw new Error('Google service account key is not valid JSON (check GOOGLE_SERVICE_ACCOUNT_JSON / _FILE).');
  }
  if (typeof key?.client_email !== 'string' || typeof key?.private_key !== 'string') {
    throw new Error('Google service account key must contain client_email and private_key.');
  }
  return {
    clientEmail: key.client_email,
    privateKey: key.private_key,
    tokenUri: typeof key.token_uri === 'string' ? key.token_uri : 'https://oauth2.googleapis.com/token',
  };
}

const b64url = (v: Buffer | string) => Buffer.from(v).toString('base64url');
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

/** A1 reference to a whole tab: 'My Tab' with quotes doubled. */
export const tabRange = (title: string) => `'${title.replace(/'/g, "''")}'`;

class DisabledSheets implements SheetsApi {
  readonly enabled = false;
  readonly serviceAccountEmail = null;
  private fail(): never {
    throw new SheetsError('not_configured', 'Google Sheets is not set up on this server.');
  }
  info(): Promise<SpreadsheetInfo> { return this.fail(); }
  readTabs(): Promise<Record<string, unknown[][]>> { return this.fail(); }
  addTab(): Promise<void> { return this.fail(); }
}

export class GoogleSheets implements SheetsApi {
  readonly enabled = true;
  private token: { value: string; expiresAt: number } | null = null;
  private tokenRequest: Promise<string> | null = null;

  constructor(
    private creds: GoogleCredentials,
    private opts: { apiBase?: string; fetchFn?: typeof fetch; now?: () => number } = {}
  ) {}

  get serviceAccountEmail() { return this.creds.clientEmail; }
  private get base() { return this.opts.apiBase ?? 'https://sheets.googleapis.com'; }
  private get now() { return (this.opts.now ?? Date.now)(); }
  private get http() { return this.opts.fetchFn ?? fetch; }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt - 60_000 > this.now) return this.token.value;
    // Several requests at once share one token request.
    this.tokenRequest ??= this.fetchToken().finally(() => { this.tokenRequest = null; });
    return this.tokenRequest;
  }

  private async fetchToken(): Promise<string> {
    const iat = Math.floor(this.now / 1000);
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(JSON.stringify({ iss: this.creds.clientEmail, scope: SCOPE, aud: this.creds.tokenUri, iat, exp: iat + 3600 }));
    let signature: string;
    try {
      signature = createSign('RSA-SHA256').update(`${head}.${claims}`).sign(this.creds.privateKey, 'base64url');
    } catch {
      throw new SheetsError('misconfigured', 'The Google service account private key is not valid.');
    }
    let res: Response;
    try {
      res = await this.http(this.creds.tokenUri, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${signature}` }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new SheetsError('unavailable', 'Could not reach Google. Try again in a moment.');
    }
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || typeof body.access_token !== 'string') {
      console.error('Google token request failed:', res.status, body?.error, body?.error_description);
      throw new SheetsError('misconfigured', 'Google rejected the server\'s credentials. Check the service account key and that the server clock is correct.');
    }
    this.token = { value: body.access_token, expiresAt: this.now + (Number(body.expires_in) || 3600) * 1000 };
    return body.access_token;
  }

  private async call(method: string, path: string, body?: unknown): Promise<any> {
    const token = await this.accessToken();
    let res: Response;
    try {
      res = await this.http(`${this.base}${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new SheetsError('unavailable', 'Could not reach Google Sheets. Try again in a moment.');
    }
    const text = await res.text();
    if (text.length > MAX_RESPONSE_BYTES) throw new SheetsError('bad_request', 'The sheet is too large to read.');
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { /* not JSON */ }
    if (res.ok) return data;

    const message: string = String(data?.error?.message ?? '');
    if (res.status === 429) throw new SheetsError('rate_limited', 'Google is limiting requests right now. Try again in a minute.');
    if (res.status === 404) throw new SheetsError('not_found', 'Sheet not found. Check the link.');
    if (res.status === 403) {
      if (/has not been used|is disabled|accessNotConfigured/i.test(message + JSON.stringify(data?.error?.details ?? ''))) {
        throw new SheetsError('api_disabled', 'The Google Sheets API is not enabled for the server\'s Google Cloud project.');
      }
      throw new SheetsError('forbidden', `No access to that sheet. Share it with ${this.creds.clientEmail} as an Editor.`);
    }
    if (res.status === 400) throw new SheetsError('bad_request', message ? `Google rejected the request: ${message}` : 'Google rejected the request.');
    console.error('Google Sheets error:', res.status, message);
    throw new SheetsError('unavailable', 'Google Sheets had a problem. Try again in a moment.');
  }

  async info(id: string): Promise<SpreadsheetInfo> {
    const d = await this.call('GET', `/v4/spreadsheets/${encodeURIComponent(id)}?fields=properties.title,sheets.properties.title`);
    return {
      title: String(d?.properties?.title ?? 'Untitled'),
      tabs: (d?.sheets ?? []).map((s: any) => String(s?.properties?.title ?? '')).filter(Boolean),
    };
  }

  async readTabs(id: string, tabs: string[]): Promise<Record<string, unknown[][]>> {
    if (tabs.length === 0) return {};
    const q = new URLSearchParams();
    for (const t of tabs) q.append('ranges', tabRange(t));
    q.set('majorDimension', 'ROWS');
    q.set('valueRenderOption', 'FORMATTED_VALUE');
    const d = await this.call('GET', `/v4/spreadsheets/${encodeURIComponent(id)}/values:batchGet?${q}`);
    const out: Record<string, unknown[][]> = {};
    const ranges: any[] = Array.isArray(d?.valueRanges) ? d.valueRanges : [];
    tabs.forEach((t, i) => { out[t] = Array.isArray(ranges[i]?.values) ? ranges[i].values : []; });
    return out;
  }

  async addTab(id: string, title: string, header: string[]): Promise<void> {
    await this.call('POST', `/v4/spreadsheets/${encodeURIComponent(id)}:batchUpdate`, { requests: [{ addSheet: { properties: { title } } }] });
    await this.call('PUT', `/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(`${tabRange(title)}!A1`)}?valueInputOption=RAW`, { values: [header] });
  }
}

export function createSheets(creds: GoogleCredentials | null): SheetsApi {
  return creds ? new GoogleSheets(creds) : new DisabledSheets();
}

/** Pulls the spreadsheet id out of a pasted link (or accepts a bare id). */
export function parseSpreadsheetId(input: string): string | null {
  const s = input.trim();
  const m = /^https:\/\/docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,})(?:[/?#]|$)/.exec(s);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(s) ? s : null;
}
