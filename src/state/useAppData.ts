import { useCallback, useMemo, useState } from 'react';
import type { AppRepository } from '../storage/repository';
import type {
  ActiveWorkout,
  CompletedWorkout,
  Exercise,
  RoutineTemplate,
  UserSettings,
} from '../types/lifting';
import { applyWorkoutToRecords, computePersonalRecords } from '../domain/records';
import { applyProgression } from '../domain/progression';
import { parseSpreadsheetCSV } from '../domain/csvImport';
import {
  addExerciseToWorkout,
  createEmptyWorkout,
  createRoutineWorkout,
} from '../domain/workoutFactory';

/**
 * All persistent app data + the actions that change it.
 * Components get plain values and callbacks; they never touch storage.
 * Every mutation goes: update React state -> persist through the repository.
 */
export function useAppData(repo: AppRepository) {
  const [settings, setSettings] = useState(() => repo.getSettings());
  const [exercises, setExercises] = useState(() => repo.getExercises());
  const [routines, setRoutines] = useState(() => repo.getRoutines());
  const [history, setHistory] = useState(() => repo.getHistory());
  const [progression, setProgression] = useState(() => repo.getProgression());
  const [activeWorkout, setActiveWorkoutState] = useState(() => repo.getActiveWorkout());

  // Records are derived from history, never stored separately.
  const personalRecords = useMemo(() => computePersonalRecords(history), [history]);

  const reload = useCallback(() => {
    setSettings(repo.getSettings());
    setExercises(repo.getExercises());
    setRoutines(repo.getRoutines());
    setHistory(repo.getHistory());
    setProgression(repo.getProgression());
    setActiveWorkoutState(repo.getActiveWorkout());
  }, [repo]);

  // ---- active workout ---------------------------------------------------
  const setActiveWorkout = useCallback(
    (workout: ActiveWorkout | null) => {
      setActiveWorkoutState(workout);
      repo.saveActiveWorkout(workout);
    },
    [repo]
  );

  const startEmptyWorkout = useCallback(() => {
    setActiveWorkout(createEmptyWorkout(Date.now()));
  }, [setActiveWorkout]);

  const startRoutineWorkout = useCallback(
    (routine: RoutineTemplate) => {
      setActiveWorkout(createRoutineWorkout(routine, exercises, progression, Date.now()));
    },
    [exercises, progression, setActiveWorkout]
  );

  const addExerciseToActiveWorkout = useCallback(
    (exercise: Exercise) => {
      setActiveWorkout(
        addExerciseToWorkout(
          activeWorkout,
          exercise,
          progression,
          settings.defaultRestTimeSeconds,
          Date.now()
        )
      );
    },
    [activeWorkout, progression, settings.defaultRestTimeSeconds, setActiveWorkout]
  );

  const discardWorkout = useCallback(() => setActiveWorkout(null), [setActiveWorkout]);

  /** Saves a finished workout, flags any PRs, advances progression. */
  const completeWorkout = useCallback(
    (completed: CompletedWorkout) => {
      const { newRecordCount } = applyWorkoutToRecords(
        computePersonalRecords(history),
        completed
      );
      const saved: CompletedWorkout = newRecordCount > 0
        ? { ...completed, prCount: newRecordCount }
        : completed;

      const nextHistory = [saved, ...history];
      setHistory(nextHistory);
      repo.saveHistory(nextHistory);

      const result = applyProgression(progression, completed);
      if (result.changed) {
        setProgression(result.configs);
        repo.saveProgression(result.configs);
      }
      setActiveWorkout(null);
    },
    [history, progression, repo, setActiveWorkout]
  );

  // ---- library / routines / history -------------------------------------
  const addCustomExercise = useCallback(
    (exercise: Exercise) => {
      const next = [exercise, ...exercises];
      setExercises(next);
      repo.saveExercises(next);
    },
    [exercises, repo]
  );

  const saveRoutine = useCallback(
    (routine: RoutineTemplate) => {
      const next = [routine, ...routines];
      setRoutines(next);
      repo.saveRoutines(next);
    },
    [routines, repo]
  );

  const deleteRoutine = useCallback(
    (routineId: string) => {
      const next = routines.filter((r) => r.id !== routineId);
      setRoutines(next);
      repo.saveRoutines(next);
    },
    [routines, repo]
  );

  const deleteWorkout = useCallback(
    (id: string) => {
      const next = history.filter((w) => w.id !== id);
      setHistory(next);
      repo.saveHistory(next);
    },
    [history, repo]
  );

  const updateSettings = useCallback(
    (next: UserSettings) => {
      setSettings(next);
      repo.saveSettings(next);
    },
    [repo]
  );

  // ---- spreadsheet / backup ---------------------------------------------
  /** Stores the CSV and, if it holds workouts, rebuilds history from it. */
  const syncSpreadsheet = useCallback(
    (csv: string) => {
      repo.saveSpreadsheetCsv(csv);
      const parsed = parseSpreadsheetCSV(csv, progression);
      if (parsed.workouts.length > 0) {
        repo.saveHistory(parsed.workouts);
        repo.saveProgression(parsed.configs);
      }
      reload();
    },
    [progression, repo, reload]
  );

  const exportBackup = useCallback(() => repo.exportJSON(), [repo]);

  const importBackup = useCallback(
    (json: string) => {
      const ok = repo.importJSON(json);
      if (ok) reload();
      return ok;
    },
    [repo, reload]
  );

  const resetAll = useCallback(() => {
    repo.reset();
    reload();
  }, [repo, reload]);

  return {
    // data
    settings,
    exercises,
    routines,
    history,
    progression,
    personalRecords,
    activeWorkout,
    // actions
    getSpreadsheetCsv: () => repo.getSpreadsheetCsv(),
    setActiveWorkout,
    startEmptyWorkout,
    startRoutineWorkout,
    addExerciseToActiveWorkout,
    discardWorkout,
    completeWorkout,
    addCustomExercise,
    saveRoutine,
    deleteRoutine,
    deleteWorkout,
    updateSettings,
    syncSpreadsheet,
    exportBackup,
    importBackup,
    resetAll,
  };
}
