import React, { useState } from 'react';
import {
  Play,
  Plus,
  Dumbbell,
  Clock,
  Sparkles,
  ChevronRight,
  Trash2,
  Layers,
  Check,
  FileSpreadsheet,
  ArrowRight,
  Flame,
} from 'lucide-react';
import { RoutineTemplate, Exercise, UserSettings } from '../types/lifting';
import { haptics } from '../utils/haptics';
import { ExerciseLibraryModal } from './ExerciseLibraryModal';

interface RoutinesViewProps {
  routines: RoutineTemplate[];
  exercises: Exercise[];
  settings: UserSettings;
  onStartRoutine: (routine: RoutineTemplate) => void;
  onStartEmptyWorkout: () => void;
  onSaveRoutine: (routine: RoutineTemplate) => void;
  onDeleteRoutine: (routineId: string) => void;
  onOpenSpreadsheetHub: () => void;
}

export const RoutinesView: React.FC<RoutinesViewProps> = ({
  routines,
  exercises,
  settings,
  onStartRoutine,
  onStartEmptyWorkout,
  onSaveRoutine,
  onDeleteRoutine,
  onOpenSpreadsheetHub,
}) => {
  const [isCreatingRoutine, setIsCreatingRoutine] = useState(false);
  const [newRoutineName, setNewRoutineName] = useState('');
  const [newRoutineDesc, setNewRoutineDesc] = useState('');
  const [newRoutineSplit, setNewRoutineSplit] = useState('Custom Split');
  const [selectedExIds, setSelectedExIds] = useState<string[]>([]);
  const [showExPicker, setShowExPicker] = useState(false);

  const getExercise = (id: string) => exercises.find((e) => e.id === id);

  const handleCreateRoutine = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoutineName.trim()) return;
    haptics.medium();

    const created: RoutineTemplate = {
      id: `routine-${Date.now()}`,
      name: newRoutineName.trim(),
      description: newRoutineDesc.trim() || 'Custom workout template',
      targetSplit: newRoutineSplit.trim() || 'Custom',
      exercises: selectedExIds.map((exId) => ({
        exerciseId: exId,
        targetSets: 5,
        targetReps: 5,
        restSeconds: settings.defaultRestTimeSeconds || 120,
      })),
    };

    onSaveRoutine(created);
    setIsCreatingRoutine(false);
    setNewRoutineName('');
    setNewRoutineDesc('');
    setSelectedExIds([]);
  };

  const workoutARoutine = routines.find((r) => r.id === 'stronglifts-workout-a') || routines[0];

  return (
    <div className="pb-32 pt-2 space-y-4">
      {/* Up Next Highlight Card */}
      <div className="relative overflow-hidden rounded-3xl border border-red-500/40 bg-gradient-to-br from-red-600/15 via-zinc-900 to-zinc-950 p-5 shadow-2xl ring-1 ring-red-500/20">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-black text-red-500 uppercase tracking-wider">
              <Flame className="w-3.5 h-3.5 fill-current" />
              <span>UP NEXT FROM SPREADSHEET (OCT 9)</span>
            </div>
            <h3 className="text-xl font-black text-white tracking-tight mt-1">
              5x5 Workout A
            </h3>
            <p className="text-xs text-zinc-300 mt-1">
              Target: <strong className="text-white">Squat 200 lbs</strong>,{' '}
              <strong className="text-white">Bench 175 lbs</strong>,{' '}
              <strong className="text-white">Row 125 lbs</strong> (5x5).
            </p>
          </div>

          <button
            onClick={() => {
              haptics.medium();
              if (workoutARoutine) onStartRoutine(workoutARoutine);
            }}
            className="flex items-center gap-1.5 rounded-2xl bg-red-600 px-4 py-3 text-xs font-black text-white hover:bg-red-500 active:scale-95 transition shadow-lg shadow-red-600/40 shrink-0"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Start Session</span>
          </button>
        </div>

        {/* Target breakdown badges */}
        <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-red-500/20 text-center">
          <div className="p-2 rounded-xl bg-zinc-950/80 border border-zinc-800">
            <span className="text-[10px] text-zinc-400 block font-bold">Squat</span>
            <span className="font-mono font-black text-red-500 text-sm">200 lbs</span>
            <span className="text-[9px] text-zinc-400 block">5×5 sets</span>
          </div>
          <div className="p-2 rounded-xl bg-zinc-950/80 border border-zinc-800">
            <span className="text-[10px] text-zinc-400 block font-bold">Bench</span>
            <span className="font-mono font-black text-white text-sm">175 lbs</span>
            <span className="text-[9px] text-zinc-400 block">5×5 sets</span>
          </div>
          <div className="p-2 rounded-xl bg-zinc-950/80 border border-zinc-800">
            <span className="text-[10px] text-zinc-400 block font-bold">Row</span>
            <span className="font-mono font-black text-zinc-200 text-sm">125 lbs</span>
            <span className="text-[9px] text-zinc-400 block">5×5 sets</span>
          </div>
        </div>
      </div>

      {/* Spreadsheet Quick Bar */}
      <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-bold text-white block">
              Spreadsheet Connected
            </span>
            <span className="text-[10px] text-zinc-400">
              30 sessions logged · Linear increments active
            </span>
          </div>
        </div>

        <button
          onClick={onOpenSpreadsheetHub}
          className="text-xs font-bold text-red-400 hover:text-red-300 px-2 py-1 flex items-center gap-1"
        >
          <span>View Hub</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Routine Templates Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h3 className="text-sm font-bold text-white tracking-tight">
            Workout Routines
          </h3>
          <p className="text-xs text-zinc-400">
            StrongLifts 5x5 alternating sessions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              haptics.medium();
              onStartEmptyWorkout();
            }}
            className="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold"
          >
            Freestyle
          </button>
          <button
            onClick={() => {
              haptics.light();
              setIsCreatingRoutine(!isCreatingRoutine);
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-zinc-800 text-zinc-200 hover:text-white hover:bg-zinc-700 text-xs font-bold transition"
          >
            <Plus className="w-3.5 h-3.5 text-red-500" />
            <span>{isCreatingRoutine ? 'Cancel' : 'New'}</span>
          </button>
        </div>
      </div>

      {/* Create Custom Routine Form */}
      {isCreatingRoutine && (
        <form
          onSubmit={handleCreateRoutine}
          className="rounded-2xl border border-red-500/30 bg-zinc-900 p-4 space-y-3.5 shadow-xl animate-in fade-in"
        >
          <h4 className="text-sm font-bold text-white">Create Custom Routine</h4>

          <div>
            <label className="text-xs font-semibold text-zinc-300">Routine Name</label>
            <input
              type="text"
              required
              value={newRoutineName}
              onChange={(e) => setNewRoutineName(e.target.value)}
              placeholder="e.g. Arms & Core Auxiliary"
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-semibold text-zinc-300">Split Tag</label>
              <input
                type="text"
                value={newRoutineSplit}
                onChange={(e) => setNewRoutineSplit(e.target.value)}
                placeholder="e.g. StrongLifts 5x5"
                className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-300">Description</label>
              <input
                type="text"
                value={newRoutineDesc}
                onChange={(e) => setNewRoutineDesc(e.target.value)}
                placeholder="Target goals, sets x reps"
                className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-zinc-300">
                Exercises ({selectedExIds.length})
              </label>
              <button
                type="button"
                onClick={() => setShowExPicker(true)}
                className="text-xs font-bold text-red-400 hover:underline"
              >
                + Add Exercise
              </button>
            </div>

            {selectedExIds.length === 0 ? (
              <div
                onClick={() => setShowExPicker(true)}
                className="p-3 rounded-xl border border-dashed border-zinc-800 text-center text-xs text-zinc-500 cursor-pointer hover:border-zinc-700"
              >
                Tap here to pick exercises for this routine
              </div>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {selectedExIds.map((exId, idx) => {
                  const ex = getExercise(exId);
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-lg bg-zinc-950 text-xs"
                    >
                      <span className="text-white font-medium truncate">
                        {ex?.name || exId}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedExIds(selectedExIds.filter((_, i) => i !== idx))
                        }
                        className="text-zinc-500 hover:text-red-400 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-red-600 text-white font-bold text-xs hover:bg-red-500 transition shadow-lg shadow-red-600/30"
          >
            Save Routine Template
          </button>
        </form>
      )}

      {/* Routine Cards Grid */}
      <div className="space-y-3">
        {routines.map((routine) => {
          return (
            <div
              key={routine.id}
              className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden shadow-lg hover:border-zinc-700 transition"
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <span className="text-[11px] font-bold text-red-500">
                      {routine.targetSplit}
                    </span>
                    <h4 className="text-base font-black text-white tracking-tight mt-0.5">
                      {routine.name}
                    </h4>
                    <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                      {routine.description}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      haptics.medium();
                      onStartRoutine(routine);
                    }}
                    className="flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-red-500 active:scale-95 transition shadow-md shadow-red-600/30 shrink-0"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Start</span>
                  </button>
                </div>

                {/* Exercises preview pills */}
                <div className="mt-3.5 pt-3 border-t border-zinc-800/80">
                  <div className="text-[10px] uppercase font-bold text-zinc-400 mb-2 tracking-wider">
                    Exercises ({routine.exercises.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {routine.exercises.map((item, idx) => {
                      const ex = getExercise(item.exerciseId);
                      return (
                        <span
                          key={idx}
                          className="px-2.5 py-1 rounded-lg bg-zinc-950/70 border border-zinc-800 text-[11px] font-medium text-zinc-300"
                        >
                          {ex?.name || item.exerciseId} ({item.targetSets}×{item.targetReps})
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Exercise Picker Modal */}
      {showExPicker && (
        <ExerciseLibraryModal
          exercises={exercises}
          onSelectExercise={(ex) => {
            if (!selectedExIds.includes(ex.id)) {
              setSelectedExIds([...selectedExIds, ex.id]);
            }
            setShowExPicker(false);
          }}
          onAddCustomExercise={() => {}}
          onClose={() => setShowExPicker(false)}
        />
      )}
    </div>
  );
};
