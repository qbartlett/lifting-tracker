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

Password reset and email verification (needs an email provider), coach-assigned programs, billing, admin tooling.
