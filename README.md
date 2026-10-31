# IronTrack

Offline-first lifting tracker (React 19 + Vite + Tailwind 4, installable PWA).
Workouts, routines, exercise library, PRs, plate and 1RM calculators, rest timer,
and StrongLifts-style linear progression.

## Run

```bash
bun install        # or: npm install
bun run dev        # http://localhost:3000
bun run build
bun run lint       # tsc --noEmit
bun test           # unit tests (domain + storage)
```

The app works fully offline and local. To add accounts, cloud sync and the coach dashboard, run the
server (see `server/README.md`) and set `VITE_API_URL` (see `.env.example`). Without it the account
button and Coach tab are hidden.

## Architecture

```
src/
  domain/    Pure logic, no React/browser APIs. Fully unit-tested.
             records (PRs), progression, workoutFactory, csvImport, oneRepMax, plateCalculator
  storage/   AppRepository interface + localStorage implementation + seed data sets.
             This is the ONLY place that knows where data lives.
  state/     useAppData: React state + actions, persisting through the repository.
             useAuth (login state) and useSync (keeps this device in step with the account).
  api/       Typed client for the server.
  sync/      Sync engine: pull, merge, push, per-document change tracking. Pure and unit-tested.
  components/  UI. Receives data and callbacks as props; never touches storage.
  data/      Static data: exercise library, starter (seed) workout log and routines.
  utils/     Browser helpers: haptics, audio, wake lock.
  hooks/     usePWAInstall.
  types/     Shared TypeScript types.
```

Data flow: `component -> callback from useAppData -> repository -> storage`.
Personal records are derived from workout history, never stored separately.

### Accounts, sync and coaching

- Everything is saved on the device first; signing in adds background sync (on change, every minute,
  when back online). The in-progress workout never leaves the device.
- Last write wins per document. An edit made offline is kept and uploaded when you reconnect.
- Signing in as a different account than the one this device last synced wipes the device's local copy
  (it lives on the other account) so data can never leak between accounts.
- Coaches get a Coach tab: invite clients (single-use codes), see each client's recent workouts,
  volume and working weights. Read-only; clients can leave at any time from the Account dialog.

### Hosting

`deploy/` has a one-server setup (Postgres + API + Caddy with automatic HTTPS, nightly backups). See `deploy/README.md`.

### Moving to a backend (done: see `server/`)

1. Implement `AppRepository` (src/storage/repository.ts) against the new backend.
2. Make its methods async and update `useAppData`, the only consumer.
3. Change one line in `src/storage/index.ts`.
4. Start new accounts from `EMPTY_SEED` (src/storage/seeds.ts) instead of `DEFAULT_SEED`,
   which is the original owner's starter log.

Existing on-device data keeps working: the localStorage keys are unchanged.
