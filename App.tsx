import React, { useState, useEffect } from 'react';
import { storage } from './utils/storage';
import {
  ActiveWorkout,
  CompletedWorkout,
  Exercise,
  PersonalRecord,
  RoutineTemplate,
  UserSettings,
} from './types/lifting';
import { TopBar } from './components/TopBar';
import { BottomNav, TabType } from './components/BottomNav';
import { ActiveWorkoutView } from './components/ActiveWorkoutView';
import { RoutinesView } from './components/RoutinesView';
import { ExerciseCatalogView } from './components/ExerciseCatalogView';
import { HistoryView } from './components/HistoryView';
import { RestTimerBar } from './components/RestTimerBar';
import { PlateCalculatorModal } from './components/PlateCalculatorModal';
import { OneRepMaxModal } from './components/OneRepMaxModal';
import { SettingsModal } from './components/SettingsModal';
import { WorkoutFinishModal } from './components/WorkoutFinishModal';
import { ExerciseLibraryModal } from './components/ExerciseLibraryModal';
import { SpreadsheetSyncModal } from './components/SpreadsheetSyncModal';
import { MobileTestModal } from './components/MobileTestModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { haptics } from './utils/haptics';
import { wakeLockService } from './utils/wakeLock';
import { Dumbbell, Plus, Play, Sparkles, FileSpreadsheet, Flame, Disc, Timer, QrCode } from 'lucide-react';

export default function App() {
  const [settings, setSettings] = useState<UserSettings>(() => storage.getSettings());
  const [exercises, setExercises] = useState<Exercise[]>(() => storage.getExercises());
  const [routines, setRoutines] = useState<RoutineTemplate[]>(() => storage.getRoutines());
  const [history, setHistory] = useState<CompletedWorkout[]>(() => storage.getHistory());
  const [prs, setPRs] = useState<Record<string, PersonalRecord>>(() => storage.getPersonalRecords());
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkout | null>(() => storage.getActiveWorkout());

  const [currentTab, setCurrentTab] = useState<TabType>(() => (activeWorkout ? 'workout' : 'routines'));

  // Modals & Floaters
  const [showPlateCalc, setShowPlateCalc] = useState(false);
  const [show1RMCalc, setShow1RMCalc] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showExerciseLibrary, setShowExerciseLibrary] = useState(false);
  const [showSpreadsheetHub, setShowSpreadsheetHub] = useState(false);
  const [showMobileTest, setShowMobileTest] = useState(false);

  // Rest Timer State
  const [restTimer, setRestTimer] = useState<{
    totalSeconds: number;
    initialRemaining: number;
    exerciseName: string;
  } | null>(null);

  // Keep screen awake if workout is active and setting is on
  useEffect(() => {
    if (activeWorkout && settings.keepScreenAwake) {
      wakeLockService.request();
    } else {
      wakeLockService.release();
    }
  }, [activeWorkout, settings.keepScreenAwake]);

  // Sync active workout to localStorage
  const handleUpdateActiveWorkout = (workout: ActiveWorkout | null) => {
    setActiveWorkout(workout);
    storage.saveActiveWorkout(workout);
  };

  const startEmptyWorkout = () => {
    haptics.medium();
    const newWorkout: ActiveWorkout = {
      id: `workout-${Date.now()}`,
      name: 'Freestyle Workout',
      startTime: Date.now(),
      exercises: [],
    };
    handleUpdateActiveWorkout(newWorkout);
    setCurrentTab('workout');
  };

  const startRoutineWorkout = (routine: RoutineTemplate) => {
    haptics.medium();
    const progressionConfigs = storage.getProgressionConfigs();

    const newWorkout: ActiveWorkout = {
      id: `workout-${Date.now()}`,
      name: routine.name,
      routineId: routine.id,
      startTime: Date.now(),
      exercises: routine.exercises.map((item, idx) => {
        const foundEx = exercises.find((e) => e.id === item.exerciseId);
        const ex: Exercise = foundEx || {
          id: item.exerciseId,
          name: 'Exercise',
          category: 'Chest',
          equipment: 'Barbell',
        };

        const defaultWeight = progressionConfigs[item.exerciseId]?.currentWeight || 135;

        const sets = Array.from({ length: item.targetSets }).map((_, sIdx) => ({
          id: `set-${Date.now()}-${idx}-${sIdx}`,
          type: 'normal' as const,
          weight: defaultWeight,
          reps: item.targetReps,
          completed: false,
        }));

        return {
          id: `we-${Date.now()}-${idx}`,
          exerciseId: item.exerciseId,
          exercise: ex,
          restTimerSeconds: item.restSeconds || 120,
          sets,
        };
      }),
    };

    handleUpdateActiveWorkout(newWorkout);
    setCurrentTab('workout');
  };

  const handleAddExerciseToWorkout = (exercise: Exercise) => {
    haptics.light();
    let current = activeWorkout;
    if (!current) {
      current = {
        id: `workout-${Date.now()}`,
        name: 'Quick Workout',
        startTime: Date.now(),
        exercises: [],
      };
    }

    const configs = storage.getProgressionConfigs();
    const defaultWeight = configs[exercise.id]?.currentWeight || 95;

    const newWorkoutExercise = {
      id: `we-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      exerciseId: exercise.id,
      exercise,
      restTimerSeconds: settings.defaultRestTimeSeconds || 120,
      sets: [
        {
          id: `s-${Date.now()}-1`,
          type: 'normal' as const,
          weight: defaultWeight,
          reps: 5,
          completed: false,
        },
      ],
    };

    const updated = {
      ...current,
      exercises: [...current.exercises, newWorkoutExercise],
    };
    handleUpdateActiveWorkout(updated);
    setShowExerciseLibrary(false);
    setCurrentTab('workout');
  };

  const handleFinishWorkout = () => {
    if (!activeWorkout) return;
    haptics.medium();
    setShowFinishModal(true);
  };

  const handleSaveCompletedWorkout = (completed: CompletedWorkout) => {
    storage.addCompletedWorkout(completed);

    // Auto-update progression targets if 5x5 passed!
    const configs = storage.getProgressionConfigs();
    let updatedConfigs = false;

    for (const we of completed.exercises) {
      const cfg = configs[we.exerciseId];
      if (cfg) {
        const completedSets = we.sets.filter((s) => s.completed && s.reps >= 5);
        const requiredSets = cfg.defaultSetsReps === '1x5' ? 1 : 5;
        if (completedSets.length >= requiredSets) {
          cfg.currentWeight += cfg.weightIncrement;
          updatedConfigs = true;
        }
      }
    }
    if (updatedConfigs) {
      storage.saveProgressionConfigs(configs);
    }

    setHistory(storage.getHistory());
    setPRs(storage.getPersonalRecords());
    handleUpdateActiveWorkout(null);
    setShowFinishModal(false);
    setRestTimer(null);
    setCurrentTab('history');
  };

  const handleCancelWorkout = () => {
    if (confirm('Discard this workout? Recorded sets will not be saved.')) {
      haptics.medium();
      handleUpdateActiveWorkout(null);
      setRestTimer(null);
      setCurrentTab('routines');
    }
  };

  const handleStartRestTimer = (seconds: number, exerciseName: string = 'Rest Interval') => {
    setRestTimer({
      totalSeconds: seconds,
      initialRemaining: seconds,
      exerciseName,
    });
  };

  const handleAddCustomExercise = (newEx: Exercise) => {
    storage.addCustomExercise(newEx);
    setExercises(storage.getExercises());
  };

  const handleSaveRoutine = (routine: RoutineTemplate) => {
    const list = storage.getRoutines();
    list.unshift(routine);
    storage.saveRoutines(list);
    setRoutines(storage.getRoutines());
  };

  const handleDeleteRoutine = (routineId: string) => {
    const list = storage.getRoutines().filter((r) => r.id !== routineId);
    storage.saveRoutines(list);
    setRoutines(storage.getRoutines());
  };

  const handleDeleteHistoryWorkout = (id: string) => {
    storage.deleteCompletedWorkout(id);
    setHistory(storage.getHistory());
    setPRs(storage.getPersonalRecords());
  };

  const handleUpdateSettings = (newSettings: UserSettings) => {
    storage.saveSettings(newSettings);
    setSettings(newSettings);
  };

  const handleDataSynced = () => {
    setHistory(storage.getHistory());
    setPRs(storage.getPersonalRecords());
    setRoutines(storage.getRoutines());
  };

  const workoutARoutine = routines.find((r) => r.id === 'stronglifts-workout-a') || routines[0];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex justify-center">
      <div className="w-full max-w-md min-h-screen flex flex-col bg-zinc-950 relative shadow-2xl border-x border-zinc-900/60">
        <OfflineIndicator />

        {/* Top App Bar with Red Theme and Direct Plate Calc / Rest Timer / Phone QR triggers */}
        <TopBar
          hasActiveWorkout={!!activeWorkout}
          onOpenPlateCalc={() => setShowPlateCalc(true)}
          onOpen1RMCalc={() => setShow1RMCalc(true)}
          onOpenSettings={() => setShowSettings(true)}
          onOpenSpreadsheetHub={() => setShowSpreadsheetHub(true)}
          onTriggerRestTimer={() => handleStartRestTimer(settings.defaultRestTimeSeconds || 120, 'Rest Interval')}
          onOpenMobileTest={() => setShowMobileTest(true)}
        />

        {/* Main Content Area */}
        <main className="flex-1 px-3.5 sm:px-4 overflow-y-auto">
          {currentTab === 'workout' && (
            <>
              {activeWorkout ? (
                <ActiveWorkoutView
                  workout={activeWorkout}
                  settings={settings}
                  onUpdateWorkout={handleUpdateActiveWorkout}
                  onOpenExerciseLibrary={() => setShowExerciseLibrary(true)}
                  onStartRestTimer={handleStartRestTimer}
                  onFinishWorkout={handleFinishWorkout}
                  onCancelWorkout={handleCancelWorkout}
                />
              ) : (
                <div className="pt-6 pb-32 text-center space-y-4">
                  {/* Up Next Card in Dark & Red Theme */}
                  <div className="p-4 rounded-3xl border border-red-500/40 bg-gradient-to-br from-red-600/15 via-zinc-900 to-zinc-950 text-left shadow-2xl ring-1 ring-red-500/20">
                    <div className="flex items-center gap-1.5 text-[11px] font-black text-red-500 uppercase tracking-wide">
                      <Flame className="w-3.5 h-3.5 fill-current" />
                      <span>UP NEXT: 5x5 WORKOUT A</span>
                    </div>
                    <h3 className="text-lg font-black text-white tracking-tight mt-1">
                      Ready for Oct 9 Session
                    </h3>
                    <p className="text-xs text-zinc-300 mt-1">
                      Squat 200 lbs · Bench 175 lbs · Barbell Row 125 lbs (5×5)
                    </p>

                    <button
                      onClick={() => {
                        if (workoutARoutine) startRoutineWorkout(workoutARoutine);
                      }}
                      className="mt-3.5 w-full py-3 rounded-2xl bg-red-600 text-white font-black text-xs hover:bg-red-500 active:scale-95 transition shadow-lg shadow-red-600/30 flex items-center justify-center gap-2"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Start Workout A</span>
                    </button>
                  </div>

                  {/* Quick gym utilities bar with Phone Test */}
                  <div className="grid grid-cols-3 gap-2 max-w-sm mx-auto">
                    <button
                      onClick={() => setShowPlateCalc(true)}
                      className="flex flex-col items-center justify-center gap-1 p-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-red-500/50 text-zinc-200 text-xs font-bold transition"
                    >
                      <Disc className="w-4 h-4 text-red-500" />
                      <span className="text-[11px]">Plates</span>
                    </button>
                    <button
                      onClick={() => handleStartRestTimer(settings.defaultRestTimeSeconds || 120, 'Rest Interval')}
                      className="flex flex-col items-center justify-center gap-1 p-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-red-500/50 text-zinc-200 text-xs font-bold transition"
                    >
                      <Timer className="w-4 h-4 text-red-500" />
                      <span className="text-[11px]">Rest {settings.defaultRestTimeSeconds}s</span>
                    </button>
                    <button
                      onClick={() => setShowMobileTest(true)}
                      className="flex flex-col items-center justify-center gap-1 p-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-red-500/50 text-red-400 text-xs font-bold transition"
                    >
                      <QrCode className="w-4 h-4 text-red-500" />
                      <span className="text-[11px]">On Phone</span>
                    </button>
                  </div>

                  <div className="pt-2 flex flex-col gap-2 max-w-xs mx-auto">
                    <button
                      onClick={() => setCurrentTab('routines')}
                      className="w-full py-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-200 font-bold text-xs hover:bg-zinc-800 active:scale-95 transition"
                    >
                      Browse 5x5 Workout Routines
                    </button>
                    <button
                      onClick={startEmptyWorkout}
                      className="w-full py-3 rounded-2xl border border-zinc-800/80 text-zinc-400 font-semibold text-xs hover:text-white transition"
                    >
                      Start Freestyle Workout
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {currentTab === 'routines' && (
            <RoutinesView
              routines={routines}
              exercises={exercises}
              settings={settings}
              onStartRoutine={startRoutineWorkout}
              onStartEmptyWorkout={startEmptyWorkout}
              onSaveRoutine={handleSaveRoutine}
              onDeleteRoutine={handleDeleteRoutine}
              onOpenSpreadsheetHub={() => setShowSpreadsheetHub(true)}
            />
          )}

          {currentTab === 'exercises' && (
            <ExerciseCatalogView
              exercises={exercises}
              personalRecords={prs}
              settings={settings}
              onAddCustomExercise={handleAddCustomExercise}
              onSelectForWorkout={handleAddExerciseToWorkout}
            />
          )}

          {currentTab === 'history' && (
            <HistoryView
              history={history}
              personalRecords={prs}
              settings={settings}
              onDeleteWorkout={handleDeleteHistoryWorkout}
            />
          )}
        </main>

        {/* Rest Interval Timer Component */}
        {restTimer && (
          <RestTimerBar
            totalSeconds={restTimer.totalSeconds}
            initialRemaining={restTimer.initialRemaining}
            exerciseName={restTimer.exerciseName}
            soundEnabled={settings.soundEnabled}
            hapticsEnabled={settings.hapticsEnabled}
            onFinish={() => setRestTimer(null)}
            onDismiss={() => setRestTimer(null)}
            onSetInterval={(sec) => setRestTimer((prev) => prev ? { ...prev, totalSeconds: sec, initialRemaining: sec } : null)}
          />
        )}

        {/* Bottom Navigation */}
        <BottomNav
          activeTab={currentTab}
          hasActiveWorkout={!!activeWorkout}
          onTabChange={(tab) => setCurrentTab(tab)}
        />

        {/* Mobile Test QR Code Modal */}
        {showMobileTest && (
          <MobileTestModal onClose={() => setShowMobileTest(false)} />
        )}

        {/* Spreadsheet Data Hub Modal */}
        {showSpreadsheetHub && (
          <SpreadsheetSyncModal
            onClose={() => setShowSpreadsheetHub(false)}
            onDataSynced={handleDataSynced}
          />
        )}

        {/* Plate Loader Modal */}
        {showPlateCalc && (
          <PlateCalculatorModal
            initialUnit={settings.weightUnit}
            initialBarWeight={settings.barWeight}
            onClose={() => setShowPlateCalc(false)}
          />
        )}

        {/* 1RM Calculator Modal */}
        {show1RMCalc && (
          <OneRepMaxModal
            unit={settings.weightUnit}
            onClose={() => setShow1RMCalc(false)}
          />
        )}

        {/* Settings Modal */}
        {showSettings && (
          <SettingsModal
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onOpenPlateCalc={() => setShowPlateCalc(true)}
            onOpen1RMCalc={() => setShow1RMCalc(true)}
            onOpenMobileTest={() => setShowMobileTest(true)}
            onClose={() => setShowSettings(false)}
          />
        )}

        {/* Workout Finish Celebration Modal */}
        {showFinishModal && activeWorkout && (
          <WorkoutFinishModal
            workout={activeWorkout}
            settings={settings}
            onSave={handleSaveCompletedWorkout}
            onClose={() => setShowFinishModal(false)}
          />
        )}

        {/* Exercise Library Modal */}
        {showExerciseLibrary && (
          <ExerciseLibraryModal
            exercises={exercises}
            onSelectExercise={handleAddExerciseToWorkout}
            onAddCustomExercise={handleAddCustomExercise}
            onClose={() => setShowExerciseLibrary(false)}
          />
        )}
      </div>
    </div>
  );
}
