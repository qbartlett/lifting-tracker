import type { AppSeed } from './repository';
import { INITIAL_EXERCISES } from '../data/exercises';
import {
  INITIAL_SPREADSHEET_CSV,
  SPREADSHEET_EXERCISES_CONFIG,
  SPREADSHEET_ROUTINES,
} from '../data/seed';
import { parseSpreadsheetCSV } from '../domain/csvImport';

export const DEFAULT_SETTINGS = {
  weightUnit: 'lbs',
  barWeight: 45,
  soundEnabled: true,
  hapticsEnabled: true,
  defaultRestTimeSeconds: 120,
  keepScreenAwake: true,
  theme: 'dark',
} as const;

/** The original owner's StrongLifts data: current behaviour of the app. */
export const DEFAULT_SEED: AppSeed = {
  settings: { ...DEFAULT_SETTINGS },
  exercises: INITIAL_EXERCISES,
  routines: SPREADSHEET_ROUTINES,
  history: parseSpreadsheetCSV(INITIAL_SPREADSHEET_CSV).workouts,
  progression: SPREADSHEET_EXERCISES_CONFIG,
  spreadsheetCsv: INITIAL_SPREADSHEET_CSV,
};

/** A clean slate for a new client account: exercise library only. */
export const EMPTY_SEED: AppSeed = {
  settings: { ...DEFAULT_SETTINGS },
  exercises: INITIAL_EXERCISES,
  routines: [],
  history: [],
  progression: {},
  spreadsheetCsv: '',
};
