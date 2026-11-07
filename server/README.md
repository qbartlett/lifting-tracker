# IronTrack server

Own-server backend for the coach / client product. Bun + Postgres, **no npm dependencies**
(uses Bun's built-in HTTP server, Postgres client and argon2 password hashing).

## Run

```bash
cd server
cp .env.example .env            # edit DATABASE_URL etc.
bun run migrate                 # also runs automatically on start
bun run start
bun test                        # integration tests; needs a throwaway Postgres (see below)
```

Or with Docker: `POSTGRES_PASSWORD=... CORS_ORIGINS=https://your-app docker compose up -d --build`.
For a real deployment (HTTPS, app + API on one domain, backups) use [`../deploy`](../deploy/README.md).

### Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (required) |
| `PORT` | default 8787 |
| `APP_URL` | Public address of the app, e.g. `https://app.example.com`. Used in password reset links |
| `SMTP_URL`, `MAIL_FROM` | Outgoing email: `smtps://user:pass@host` (465) or `smtp://user:pass@host:587` (STARTTLS required). Without them, production logs a warning and reset emails are not sent; in development they print to the console |
| `RESET_TTL_MINUTES` | Reset link lifetime, default 60 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` / `GOOGLE_SERVICE_ACCOUNT_FILE` | Google service account key. Enables Sheets plans. Coaches share their sheet with its `client_email` |
| `CORS_ORIGINS` | Comma-separated origins allowed from a browser. Not needed when app and API share a domain |
| `TRUST_PROXY` | `1` only behind a reverse proxy that sets `X-Forwarded-For` |

Tests drop and recreate the `public` schema of `TEST_DATABASE_URL`
(default `postgres://postgres@localhost:54329/irontrack_test`). **Never point it at real data.**

## Model

- **Coach** accounts sign up themselves. **Client** accounts can only sign up with a single-use invite code from a coach.
- A client has at most one coach (one-on-one). Either side can end the link at any time; access stops immediately.
- A coach can read a linked client's `workout`, `routine`, `exercise` and `progression` documents. Never `settings`. Coaches cannot write to a client's data.
- Anything that isn't your own client returns **404**, not 403, so ids can't be probed.
- Data syncs as documents (`kind` + `id` + JSON `data`), last-write-wins on the client's `updatedAt`.
  The in-progress workout is never synced.

## API

All bodies are JSON. Authenticated routes need `Authorization: Bearer <token>`.
Errors look like `{"error": {"code": "...", "message": "..."}}`.

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/auth/register` | anyone | `{email, name, password}` creates a coach. With `inviteCode` creates a client linked to that coach. Returns `{token, user}` |
| POST | `/auth/login` | anyone | `{email, password}` → `{token, user}`. Rate limited |
| POST | `/auth/logout` | user | Invalidates the token |
| POST | `/auth/forgot` | anyone | `{email}` emails a reset link. Always answers the same, so it cannot be used to find out who has an account. Rate limited |
| POST | `/auth/reset` | anyone | `{token, password}` sets a new password and signs out every device. Links work once |
| GET | `/coach/programs`, `/coach/programs/:id` | coach | The coach's own programs |
| POST / PUT / DELETE | `/coach/programs`, `/coach/programs/:id` | coach | `{name, notes, weeks 1-52, sessions[{id, day 0-6 (Mon=0), name, exercises[{exerciseId, name, category, equipment, sets, reps, restSeconds, notes}]}]}`. Fully validated. Delete is refused (409) while a client is still on it |
| POST | `/coach/programs/:id/assign` | coach | `{clientId, startDate}` gives it to a linked client, replacing their current plan. Week 1 is the Monday-Sunday week containing the start date |
| GET / DELETE | `/coach/clients/:id/program` | coach | The client's plan plus the workouts they logged against it (`programRef` on a workout), or end the plan |
| GET | `/me/program` | client | The client's current plan, or `{assignment: null}` |
| GET | `/coach/sheets` | coach | Sheets connected, their tabs, tab-to-athlete mappings and any problems. Also whether Sheets is enabled and which address to share with |
| POST | `/coach/sheets` | coach | `{url}` connects a Google Sheet (must be shared with the service account) |
| POST | `/coach/sheets/:id/sync` | coach | Reads the sheet now (rate limited) |
| PUT | `/coach/sheets/:id/mappings` | coach | `{tab, clientId \| null, startDate}` links a tab to an athlete (or unlinks) and reads it |
| POST | `/coach/sheets/:id/tabs` | coach | `{clientId, startDate}` creates a tab with the template header and links it |
| DELETE | `/coach/sheets/:id` | coach | Disconnects the sheet and removes the athletes' sheet plans (the sheet is untouched) |

### Google Sheets plans

Each athlete's tab has the columns `Week, Day, Session, Exercise, Sets, Reps, Rest (sec), Notes` (any order, friendly names accepted; see `src/sheetPlan.ts`). A read turns the tab into a week-by-week plan (`program.perWeek`). Rules:

- **All or nothing per tab.** If any cell is invalid, the athlete keeps their last good plan and the coach sees the exact rows and columns to fix. Rows are never silently skipped.
- **When it reads.** On connect, on the coach's refresh button, and in the background when an athlete opens their plan, at most once a minute per sheet (one `values:batchGet` for all mapped tabs, plus one metadata call).
- **Plan identity.** A session is identified by weekday and name, so logged workouts keep matching it when other rows change. Renaming a session or moving its day makes earlier workouts of it appear as missed.
- **Exercises** come from the sheet by name. The app matches them to its library by name so athletes keep their weights; unknown names still work.
- A spreadsheet can belong to only one coach. Whoever holds the sheet's link and has it shared with the service account could connect it first, so treat sheet links as private.

| GET | `/me` | user | `{user, coach}` (`coach` is null unless a linked client) |
| DELETE | `/me/coach` | client | Leave your coach |
| DELETE | `/me` | user | `{password}`. Deletes the account and all its data |
| POST | `/coach/invites` | coach | `{label?}` → `{id, code, expiresAt}`. The code is shown once only |
| GET | `/coach/invites` | coach | Pending / used / expired invites (no codes) |
| DELETE | `/coach/invites/:id` | coach | Revoke an unused invite |
| GET | `/coach/clients` | coach | `{clients: [{id, name, email, linkedAt, lastWorkoutAt}]}` |
| DELETE | `/coach/clients/:id` | coach | Remove a client |
| GET | `/coach/clients/:id/pull?since=&limit=` | coach | Read-only view of a client's documents |
| POST | `/sync/push` | user | `{changes: [{kind, id, data, updatedAt, deleted?}]}` (max 200). Returns `{accepted, rejected, cursor}` |
| GET | `/sync/pull?since=&limit=` | user | `{changes, cursor, hasMore}`. Pass the returned `cursor` as `since` next time |
| GET | `/health` | anyone | Liveness + DB check |

Sync kinds: `workout`, `routine`, `exercise`, `settings`, `progression`.
A push entry rejected with `reason: "stale"` means the server has a newer version; pull to get it.

## Security notes

- Passwords: argon2id (Bun.password), 10-200 characters. Session tokens and invite codes are random and only their SHA-256 is stored.
- Login/registration are rate limited in memory (per IP and per email). With more than one server process, move this to Redis.
- Always serve over HTTPS (terminate TLS at your reverse proxy) and set `TRUST_PROXY=1` only behind it.
- Only origins listed in `CORS_ORIGINS` can call the API from a browser.
- Back up Postgres. Client workout data is personal health-adjacent information: tell clients that their coach can see it,
  and publish a privacy policy before you onboard real users.

## Not built yet

Email verification, billing, admin tooling.
