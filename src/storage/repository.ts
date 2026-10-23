import type {
  ActiveWorkout,
  CompletedWorkout,
  Exercise,
  ProgressionConfigs,
  RoutineTemplate,
  UserSettings,
} from '../types/lifting';

/**
 * The only way the app reads or writes user data.
 *
 * Today it is backed by localStorage (see localStorageRepository.ts). The
 * methods are synchronous because localStorage is; a remote backend
 * (Supabase etc.) will make them async, and the only consumer that has to
 * change is `useAppData` in src/state.
 */
export interface AppRepository {
  getSettings(): UserSettings;
  saveSettings(settings: UserSettings): void;

  getExercises(): Exercise[];
  saveExercises(exercises: Exercise[]): void;

  getRoutines(): RoutineTemplate[];
  saveRoutines(routines: RoutineTemplate[]): void;

  /** Newest first. */
  getHistory(): CompletedWorkout[];
  saveHistory(history: CompletedWorkout[]): void;

  getProgression(): ProgressionConfigs;
  saveProgression(configs: ProgressionConfigs): void;

  getActiveWorkout(): ActiveWorkout | null;
  saveActiveWorkout(workout: ActiveWorkout | null): void;

  getSpreadsheetCsv(): string;
  saveSpreadsheetCsv(csv: string): void;

  /** JSON backup (same shape the original app exported). */
  exportJSON(): string;
  /** Returns false if the payload is not valid JSON. */
  importJSON(json: string): boolean;
  /** Clears everything back to the seed data. */
  reset(): void;
}

/** What a brand-new user starts with. */
export interface AppSeed {
  settings: UserSettings;
  exercises: Exercise[];
  routines: RoutineTemplate[];
  history: CompletedWorkout[];
  progression: ProgressionConfigs;
  spreadsheetCsv: string;
}
