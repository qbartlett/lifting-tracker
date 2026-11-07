import { afterEach, describe, expect, it } from 'bun:test';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { GoogleSheets, SheetsError, loadGoogleCredentials, parseSpreadsheetId, tabRange } from '../src/google';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

interface Seen { method: string; path: string; auth: string | null; body: string }
let server: ReturnType<typeof Bun.serve> | null = null;
afterEach(() => { server?.stop(true); server = null; });

function fakeGoogle(handler: (req: Request, url: URL) => Response | Promise<Response>) {
  const seen: Seen[] = [];
  let tokenCalls = 0;
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const body = await req.text();
      if (url.pathname === '/token') {
        tokenCalls++;
        const jwt = new URLSearchParams(body).get('assertion')!;
        const [h, c, s] = jwt.split('.');
        const ok = createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(s, 'base64url'));
        const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
        seen.push({ method: 'TOKEN', path: JSON.stringify({ ok, claims, grant: new URLSearchParams(body).get('grant_type') }), auth: null, body: '' });
        return Response.json({ access_token: `tok${tokenCalls}`, expires_in: 3600 });
      }
      seen.push({ method: req.method, path: url.pathname + url.search, auth: req.headers.get('authorization'), body });
      return handler(req, url);
    },
  });
  const base = `http://localhost:${server.port}`;
  const make = (now?: () => number) => new GoogleSheets({ clientEmail: 'bot@proj.iam.gserviceaccount.com', privateKey: pem, tokenUri: `${base}/token` }, { apiBase: base, now });
  return { seen, make, tokenCalls: () => tokenCalls };
}

describe('GoogleSheets', () => {
  it('signs a valid service-account JWT and sends it as the bearer token', async () => {
    const g = fakeGoogle(() => Response.json({ properties: { title: 'Team' }, sheets: [{ properties: { title: 'Sam' } }, { properties: { title: 'Alex' } }] }));
    const info = await g.make().info('abc');
    expect(info).toEqual({ title: 'Team', tabs: ['Sam', 'Alex'] });
    const token = JSON.parse(g.seen[0].path);
    expect(token.ok).toBe(true);
    expect(token.grant).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(token.claims).toMatchObject({ iss: 'bot@proj.iam.gserviceaccount.com', scope: 'https://www.googleapis.com/auth/spreadsheets' });
    expect(token.claims.exp - token.claims.iat).toBe(3600);
    expect(g.seen[1].auth).toBe('Bearer tok1');
  });

  it('reuses the token, and fetches a new one near expiry', async () => {
    let t = 1_000_000;
    const g = fakeGoogle(() => Response.json({ valueRanges: [] }));
    const s = g.make(() => t);
    await s.readTabs('abc', ['A']);
    await s.readTabs('abc', ['A']);
    expect(g.tokenCalls()).toBe(1);
    t += 3_600_000;
    await s.readTabs('abc', ['A']);
    expect(g.tokenCalls()).toBe(2);
  });

  it('shares one token request between simultaneous calls', async () => {
    const g = fakeGoogle(() => Response.json({ valueRanges: [] }));
    const s = g.make();
    await Promise.all([s.readTabs('a', ['x']), s.readTabs('a', ['y']), s.readTabs('a', ['z'])]);
    expect(g.tokenCalls()).toBe(1);
  });

  it('reads many tabs in one request and quotes tab names', async () => {
    const g = fakeGoogle(() => Response.json({ valueRanges: [{ values: [['Week', 'Day']] }, {}, { values: [['x']] }] }));
    const out = await g.make().readTabs('sheet1', ["Sam's plan", 'Alex', 'A&B']);
    expect(out).toEqual({ "Sam's plan": [['Week', 'Day']], Alex: [], 'A&B': [['x']] });
    const url = new URL(`http://x${g.seen[1].path}`);
    expect(url.pathname).toBe('/v4/spreadsheets/sheet1/values:batchGet');
    expect(url.searchParams.getAll('ranges')).toEqual(["'Sam''s plan'", "'Alex'", "'A&B'"]);
    expect(url.searchParams.get('valueRenderOption')).toBe('FORMATTED_VALUE');
    expect(tabRange("it's")).toBe("'it''s'");
  });

  it('adds a tab and writes its header', async () => {
    const g = fakeGoogle(() => Response.json({}));
    await g.make().addTab('sheet1', 'Sam', ['Week', 'Day']);
    const [, add, put] = g.seen;
    expect(add).toMatchObject({ method: 'POST', path: '/v4/spreadsheets/sheet1:batchUpdate' });
    expect(JSON.parse(add.body)).toEqual({ requests: [{ addSheet: { properties: { title: 'Sam' } } }] });
    expect(put.method).toBe('PUT');
    expect(decodeURIComponent(put.path)).toBe("/v4/spreadsheets/sheet1/values/'Sam'!A1?valueInputOption=RAW");
    expect(JSON.parse(put.body)).toEqual({ values: [['Week', 'Day']] });
  });

  it('turns Google errors into messages a coach can act on', async () => {
    const cases: [number, unknown, string, RegExp][] = [
      [404, { error: { message: 'not found' } }, 'not_found', /not found/i],
      [403, { error: { message: 'The caller does not have permission' } }, 'forbidden', /bot@proj\.iam\.gserviceaccount\.com/],
      [403, { error: { message: 'Google Sheets API has not been used in project 123 before or it is disabled.' } }, 'api_disabled', /not enabled/],
      [429, { error: { message: 'Quota exceeded' } }, 'rate_limited', /minute/],
      [400, { error: { message: 'Unable to parse range: Nope' } }, 'bad_request', /parse range/],
      [503, { error: { message: 'oops' } }, 'unavailable', /problem/],
    ];
    for (const [status, body, code, msg] of cases) {
      const g = fakeGoogle(() => Response.json(body, { status }));
      const err = await g.make().info('abc').catch((e) => e);
      expect(err).toBeInstanceOf(SheetsError);
      expect(err.code).toBe(code);
      expect(err.message).toMatch(msg);
      server?.stop(true);
    }
  });

  it('reports bad credentials without leaking Google\'s response', async () => {
    server = Bun.serve({ port: 0, fetch: () => Response.json({ error: 'invalid_grant', error_description: 'Invalid JWT Signature.' }, { status: 400 }) });
    const s = new GoogleSheets({ clientEmail: 'b@x', privateKey: pem, tokenUri: `http://localhost:${server.port}/token` }, { apiBase: `http://localhost:${server.port}` });
    const err = await s.info('abc').catch((e) => e);
    expect(err.code).toBe('misconfigured');
    expect(err.message).not.toContain('Invalid JWT');
  });

  it('reports an unusable private key', async () => {
    const s = new GoogleSheets({ clientEmail: 'b@x', privateKey: 'not a key', tokenUri: 'http://localhost:1/token' });
    expect((await s.info('abc').catch((e) => e)).code).toBe('misconfigured');
  });

  it('reports Google being unreachable', async () => {
    const s = new GoogleSheets({ clientEmail: 'b@x', privateKey: pem, tokenUri: 'http://localhost:1/token' });
    expect((await s.info('abc').catch((e) => e)).code).toBe('unavailable');
  });
});

describe('credentials and links', () => {
  it('loads a service account key from JSON, and complains clearly when it is wrong', () => {
    const key = JSON.stringify({ client_email: 'a@b', private_key: 'k' });
    expect(loadGoogleCredentials({ GOOGLE_SERVICE_ACCOUNT_JSON: key })).toEqual({ clientEmail: 'a@b', privateKey: 'k', tokenUri: 'https://oauth2.googleapis.com/token' });
    expect(loadGoogleCredentials({})).toBeNull();
    expect(() => loadGoogleCredentials({ GOOGLE_SERVICE_ACCOUNT_JSON: '{nope' })).toThrow(/not valid JSON/);
    expect(() => loadGoogleCredentials({ GOOGLE_SERVICE_ACCOUNT_JSON: '{}' })).toThrow(/client_email/);
    expect(() => loadGoogleCredentials({ GOOGLE_SERVICE_ACCOUNT_FILE: '/nonexistent/key.json' })).toThrow(/could not be read/);
  });

  it('extracts the spreadsheet id from links, and rejects other things', () => {
    const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-aB';
    expect(parseSpreadsheetId(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`)).toBe(id);
    expect(parseSpreadsheetId(`https://docs.google.com/spreadsheets/u/1/d/${id}/edit?usp=sharing`)).toBe(id);
    expect(parseSpreadsheetId(`  ${id}  `)).toBe(id);
    expect(parseSpreadsheetId('https://evil.example.com/spreadsheets/d/' + id)).toBeNull();
    expect(parseSpreadsheetId('https://docs.google.com/document/d/' + id)).toBeNull();
    expect(parseSpreadsheetId('hello')).toBeNull();
    expect(parseSpreadsheetId('')).toBeNull();
  });
});
