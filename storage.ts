import {
  ActiveWorkout,
  CompletedWorkout,
  Exercise,
  PersonalRecord,
  RoutineTemplate,
  UserSettings,
} from '../types/lifting';
import { INITIAL_EXERCISES } from '../data/exercises';
import {
  PARSED_SPREADSHEET_DATA,
  SPREADSHEET_ROUTINES,
  SPREADSHEET_EXERCISES_CONFIG,
  INITIAL_SPREADSHEET_CSV,
  parseSpreadsheetCSV,
  StrongLiftsProgression,
} from '../data/spreadsheetData';

const STORAGE_KEYS = {
  EXERCISES: 'irontrack_exercises_v2',
  ROUTINES: 'irontrack_routines_v2',
  ACTIVE_WORKOUT: 'irontrack_active_workout_v2',
  HISTORY: 'irontrack_history_v2',
  SETTINGS: 'irontrack_settings_v2',
  PRS: 'irontrack_prs_v2',
  SPREADSHEET_CSV: 'irontrack_spreadsheet_csv_v2',
  PROGRESSION: 'irontrack_progression_v2',
};

const DEFAULT_SETTINGS: UserSettings = {
  weightUnit: 'lbs', // User spreadsheet uses lbs!
  barWeight: 45,    // Standard Olympic barbell in lbs
  soundEnabled: true,
  hapticsEnabled: true,
  defaultRestTimeSeconds: 120, // 5x5 recommends 90s - 180s
  keepScreenAwake: true,
  theme: 'dark',
};

export const storage = {
  getSettings: (): UserSettings => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  },

  saveSettings: (settings: UserSettings) => {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.error(e);
    }
  },

  getExercises: (): Exercise[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.EXERCISES);
      if (data) {
        return JSON.parse(data);
      }
      localStorage.setItem(STORAGE_KEYS.EXERCISES, JSON.stringify(INITIAL_EXERCISES));
      return INITIAL_EXERCISES;
    } catch {
      return INITIAL_EXERCISES;
    }
  },

  saveExercises: (exercises: Exercise[]) => {
    try {
      localStorage.setItem(STORAGE_KEYS.EXERCISES, JSON.stringify(exercises));
    } catch (e) {
      console.error(e);
    }
  },

  addCustomExercise: (exercise: Exercise) => {
    const list = storage.getExercises();
    list.unshift(exercise);
    storage.saveExercises(list);
  },

  getRoutines: (): RoutineTemplate[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ROUTINES);
      if (data) {
        return JSON.parse(data);
      }
      localStorage.setItem(STORAGE_KEYS.ROUTINES, JSON.stringify(SPREADSHEET_ROUTINES));
      return SPREADSHEET_ROUTINES;
    } catch {
      return SPREADSHEET_ROUTINES;
    }
  },

  saveRoutines: (routines: RoutineTemplate[]) => {
    try {
      localStorage.setItem(STORAGE_KEYS.ROUTINES, JSON.stringify(routines));
    } catch (e) {
      console.error(e);
    }
  },

  getActiveWorkout: (): ActiveWorkout | null => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ACTIVE_WORKOUT);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  saveActiveWorkout: (workout: ActiveWorkout | null) => {
    try {
      if (workout) {
        localStorage.setItem(STORAGE_KEYS.ACTIVE_WORKOUT, JSON.stringify(workout));
      } else {
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_WORKOUT);
      }
    } catch (e) {
      console.error(e);
    }
  },

  getHistory: (): CompletedWorkout[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.HISTORY);
      if (data) {
        return JSON.parse(data);
      }
      const initial = PARSED_SPREADSHEET_DATA.workouts;
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(initial));
      return initial;
    } catch {
      return PARSED_SPREADSHEET_DATA.workouts;
    }
  },

  addCompletedWorkout: (workout: CompletedWorkout) => {
    const list = storage.getHistory();
    list.unshift(workout);
    try {
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(list));
      storage.updatePersonalRecords(workout);
    } catch (e) {
      console.error(e);
    }
  },

  deleteCompletedWorkout: (id: string) => {
    const list = storage.getHistory().filter((w) => w.id !== id);
    try {
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(list));
    } catch (e) {
      console.error(e);
    }
  },

  getPersonalRecords: (): Record<string, PersonalRecord> => {
    try {
      const history = storage.getHistory();
      const prs: Record<string, PersonalRecord> = {};

      for (const workout of [...history].reverse()) {
        for (const we of workout.exercises) {
          for (const s of we.sets) {
            if (s.completed && s.weight > 0 && s.reps > 0) {
              const est1RM = Math.round(s.weight * (1 + s.reps / 30));
              const volume = s.weight * s.reps;
              const existing = prs[we.exerciseId];
              if (!existing) {
                prs[we.exerciseId] = {
                  exerciseId: we.exerciseId,
                  exerciseName: we.exercise.name,
                  maxWeight: s.weight,
                  maxRepsAtMaxWeight: s.reps,
                  estimated1RM: est1RM,
                  bestVolumeSet: volume,
                  achievedDate: new Date(workout.startTime).toISOString().split('T')[0],
                };
              } else {
                if (s.weight > existing.maxWeight) {
                  existing.maxWeight = s.weight;
                  existing.maxRepsAtMaxWeight = s.reps;
                  existing.achievedDate = new Date(workout.startTime).toISOString().split('T')[0];
                }
                if (est1RM > existing.estimated1RM) {
                  existing.estimated1RM = est1RM;
                }
                if (volume > existing.bestVolumeSet) {
                  existing.bestVolumeSet = volume;
                }
              }
            }
          }
        }
      }
      localStorage.setItem(STORAGE_KEYS.PRS, JSON.stringify(prs));
      return prs;
    } catch {
      return {};
    }
  },

  updatePersonalRecords: (workout: CompletedWorkout): number => {
    const prs = storage.getPersonalRecords();
    let newPRsCount = 0;

    for (const we of workout.exercises) {
      for (const s of we.sets) {
        if (!s.completed || s.weight <= 0 || s.reps <= 0) continue;
        const est1RM = Math.round(s.weight * (1 + s.reps / 30));
        const volume = s.weight * s.reps;
        const existing = prs[we.exerciseId];

        if (!existing) {
          prs[we.exerciseId] = {
            exerciseId: we.exerciseId,
            exerciseName: we.exercise.name,
            maxWeight: s.weight,
            maxRepsAtMaxWeight: s.reps,
            estimated1RM: est1RM,
            bestVolumeSet: volume,
            achievedDate: new Date(workout.startTime).toISOString().split('T')[0],
          };
          newPRsCount++;
        } else {
          let broken = false;
          if (s.weight > existing.maxWeight) {
            existing.maxWeight = s.weight;
            existing.maxRepsAtMaxWeight = s.reps;
            existing.achievedDate = new Date(workout.startTime).toISOString().split('T')[0];
            broken = true;
          }
          if (est1RM > existing.estimated1RM) {
            existing.estimated1RM = est1RM;
            broken = true;
          }
          if (volume > existing.bestVolumeSet) {
            existing.bestVolumeSet = volume;
          }
          if (broken) newPRsCount++;
        }
      }
    }

    try {
      localStorage.setItem(STORAGE_KEYS.PRS, JSON.stringify(prs));
    } catch (e) {
      console.error(e);
    }
    return newPRsCount;
  },

  // Get Progression settings & current targets
  getProgressionConfigs: (): Record<string, StrongLiftsProgression> => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROGRESSION);
      return data ? JSON.parse(data) : SPREADSHEET_EXERCISES_CONFIG;
    } catch {
      return SPREADSHEET_EXERCISES_CONFIG;
    }
  },

  saveProgressionConfigs: (configs: Record<string, StrongLiftsProgression>) => {
    try {
      localStorage.setItem(STORAGE_KEYS.PROGRESSION, JSON.stringify(configs));
    } catch (e) {
      console.error(e);
    }
  },

  // Raw Spreadsheet CSV storage
  getSpreadsheetCSV: (): string => {
    return localStorage.getItem(STORAGE_KEYS.SPREADSHEET_CSV) || INITIAL_SPREADSHEET_CSV;
  },

  saveSpreadsheetCSV: (csv: string) => {
    try {
      localStorage.setItem(STORAGE_KEYS.SPREADSHEET_CSV, csv);
      const parsed = parseSpreadsheetCSV(csv);
      if (parsed.workouts.length > 0) {
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(parsed.workouts));
        storage.saveProgressionConfigs(parsed.configs);
      }
    } catch (e) {
      console.error(e);
    }
  },

  // Export full JSON
  exportDataJSON: (): string => {
    return JSON.stringify(
      {
        settings: storage.getSettings(),
        exercises: storage.getExercises(),
        routines: storage.getRoutines(),
        history: storage.getHistory(),
        prs: storage.getPersonalRecords(),
        spreadsheetCSV: storage.getSpreadsheetCSV(),
        progression: storage.getProgressionConfigs(),
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    );
  },

  importDataJSON: (jsonStr: string): boolean => {
    try {
      const data = JSON.parse(jsonStr);
      if (data.settings) storage.saveSettings(data.settings);
      if (Array.isArray(data.exercises)) storage.saveExercises(data.exercises);
      if (Array.isArray(data.routines)) storage.saveRoutines(data.routines);
      if (Array.isArray(data.history)) {
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(data.history));
      }
      if (data.prs) {
        localStorage.setItem(STORAGE_KEYS.PRS, JSON.stringify(data.prs));
      }
      if (data.spreadsheetCSV) {
        localStorage.setItem(STORAGE_KEYS.SPREADSHEET_CSV, data.spreadsheetCSV);
      }
      if (data.progression) {
        storage.saveProgressionConfigs(data.progression);
      }
      return true;
    } catch (e) {
      console.error('Import failed', e);
      return false;
    }
  },

  resetDemoData: () => {
    localStorage.removeItem(STORAGE_KEYS.EXERCISES);
    localStorage.removeItem(STORAGE_KEYS.ROUTINES);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_WORKOUT);
    localStorage.removeItem(STORAGE_KEYS.HISTORY);
    localStorage.removeItem(STORAGE_KEYS.SETTINGS);
    localStorage.removeItem(STORAGE_KEYS.PRS);
    localStorage.removeItem(STORAGE_KEYS.SPREADSHEET_CSV);
    localStorage.removeItem(STORAGE_KEYS.PROGRESSION);
  },
};
