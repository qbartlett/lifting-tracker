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

No API keys or environment variables are needed.

## Architecture

```
src/
  domain/    Pure logic, no React/browser APIs. Fully unit-tested.
             records (PRs), progression, workoutFactory, csvImport, oneRepMax, plateCalculator
  storage/   AppRepository interface + localStorage implementation + seed data sets.
             This is the ONLY place that knows where data lives.
  state/     useAppData: React state + actions, persisting through the repository.
  components/  UI. Receives data and callbacks as props; never touches storage.
  data/      Static data: exercise library, starter (seed) workout log and routines.
  utils/     Browser helpers: haptics, audio, wake lock.
  hooks/     usePWAInstall.
  types/     Shared TypeScript types.
```

Data flow: `component -> callback from useAppData -> repository -> storage`.
Personal records are derived from workout history, never stored separately.

### Moving to a backend

1. Implement `AppRepository` (src/storage/repository.ts) against the new backend.
2. Make its methods async and update `useAppData`, the only consumer.
3. Change one line in `src/storage/index.ts`.
4. Start new accounts from `EMPTY_SEED` (src/storage/seeds.ts) instead of `DEFAULT_SEED`,
   which is the original owner's starter log.

Existing on-device data keeps working: the localStorage keys are unchanged.
