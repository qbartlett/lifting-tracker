import type { AppRepository, AppSeed } from './repository';
import type { ActiveWorkout, UserSettings } from '../types/lifting';
import { computePersonalRecords } from '../domain/records';
import { DEFAULT_SEED } from './seeds';

/** Same keys as the original app, so existing on-device data keeps working. */
export const STORAGE_KEYS = {
  EXERCISES: 'irontrack_exercises_v2',
  ROUTINES: 'irontrack_routines_v2',
  ACTIVE_WORKOUT: 'irontrack_active_workout_v2',
  HISTORY: 'irontrack_history_v2',
  SETTINGS: 'irontrack_settings_v2',
  PRS: 'irontrack_prs_v2', // legacy: derived data, no longer written
  SPREADSHEET_CSV: 'irontrack_spreadsheet_csv_v2',
  PROGRESSION: 'irontrack_progression_v2',
} as const;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createLocalStorageRepository(
  store: KeyValueStore = globalThis.localStorage,
  seed: AppSeed = DEFAULT_SEED
): AppRepository {
  function read<T>(key: string, fallback: T): T {
    try {
      const raw = store.getItem(key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  }

  function write(key: string, value: unknown): void {
    try {
      store.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error(`Failed to save ${key}`, e);
    }
  }

  const repo: AppRepository = {
    getSettings: () => ({ ...seed.settings, ...read<Partial<UserSettings>>(STORAGE_KEYS.SETTINGS, {}) }),
    saveSettings: (v) => write(STORAGE_KEYS.SETTINGS, v),

    getExercises: () => read(STORAGE_KEYS.EXERCISES, seed.exercises),
    saveExercises: (v) => write(STORAGE_KEYS.EXERCISES, v),

    getRoutines: () => read(STORAGE_KEYS.ROUTINES, seed.routines),
    saveRoutines: (v) => write(STORAGE_KEYS.ROUTINES, v),

    getHistory: () => read(STORAGE_KEYS.HISTORY, seed.history),
    saveHistory: (v) => write(STORAGE_KEYS.HISTORY, v),

    getProgression: () => read(STORAGE_KEYS.PROGRESSION, seed.progression),
    saveProgression: (v) => write(STORAGE_KEYS.PROGRESSION, v),

    getActiveWorkout: () => read<ActiveWorkout | null>(STORAGE_KEYS.ACTIVE_WORKOUT, null),
    saveActiveWorkout: (workout) => {
      try {
        if (workout) store.setItem(STORAGE_KEYS.ACTIVE_WORKOUT, JSON.stringify(workout));
        else store.removeItem(STORAGE_KEYS.ACTIVE_WORKOUT);
      } catch (e) {
        console.error('Failed to save active workout', e);
      }
    },

    getSpreadsheetCsv: () => {
      try {
        return store.getItem(STORAGE_KEYS.SPREADSHEET_CSV) || seed.spreadsheetCsv;
      } catch {
        return seed.spreadsheetCsv;
      }
    },
    saveSpreadsheetCsv: (csv) => {
      try {
        store.setItem(STORAGE_KEYS.SPREADSHEET_CSV, csv);
      } catch (e) {
        console.error('Failed to save spreadsheet CSV', e);
      }
    },

    exportJSON: () =>
      JSON.stringify(
        {
          settings: repo.getSettings(),
          exercises: repo.getExercises(),
          routines: repo.getRoutines(),
          history: repo.getHistory(),
          prs: computePersonalRecords(repo.getHistory()),
          spreadsheetCSV: repo.getSpreadsheetCsv(),
          progression: repo.getProgression(),
          exportedAt: new Date().toISOString(),
        },
        null,
        2
      ),

    importJSON: (json) => {
      try {
        const data = JSON.parse(json);
        if (data.settings) repo.saveSettings(data.settings);
        if (Array.isArray(data.exercises)) repo.saveExercises(data.exercises);
        if (Array.isArray(data.routines)) repo.saveRoutines(data.routines);
        if (Array.isArray(data.history)) repo.saveHistory(data.history);
        if (typeof data.spreadsheetCSV === 'string') repo.saveSpreadsheetCsv(data.spreadsheetCSV);
        if (data.progression) repo.saveProgression(data.progression);
        return true;
      } catch (e) {
        console.error('Import failed', e);
        return false;
      }
    },

    reset: () => {
      try {
        for (const key of Object.values(STORAGE_KEYS)) store.removeItem(key);
      } catch (e) {
        console.error('Reset failed', e);
      }
    },
  };

  return repo;
}
