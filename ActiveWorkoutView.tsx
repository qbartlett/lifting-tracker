import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Check,
  Disc,
  Award,
  Timer,
  FileText,
  Dumbbell,
  Play,
} from 'lucide-react';
import {
  ActiveWorkout,
  Exercise,
  WorkoutExercise,
  WorkoutSet,
  SetType,
  UserSettings,
} from '../types/lifting';
import { soundFX } from '../utils/audio';
import { haptics } from '../utils/haptics';
import { PlateCalculatorModal } from './PlateCalculatorModal';
import { OneRepMaxModal } from './OneRepMaxModal';

interface ActiveWorkoutViewProps {
  workout: ActiveWorkout;
  settings: UserSettings;
  onUpdateWorkout: (workout: ActiveWorkout) => void;
  onOpenExerciseLibrary: () => void;
  onStartRestTimer: (seconds: number, exerciseName: string) => void;
  onFinishWorkout: () => void;
  onCancelWorkout: () => void;
}

export const ActiveWorkoutView: React.FC<ActiveWorkoutViewProps> = ({
  workout,
  settings,
  onUpdateWorkout,
  onOpenExerciseLibrary,
  onStartRestTimer,
  onFinishWorkout,
  onCancelWorkout,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [activePlateCalc, setActivePlateCalc] = useState<{
    weight: number;
    exerciseName: string;
    exerciseIndex?: number;
    setIndex?: number;
  } | null>(null);
  const [active1RMCalc, setActive1RMCalc] = useState<{
    weight: number;
    reps: number;
  } | null>(null);
  const [showWorkoutNotes, setShowWorkoutNotes] = useState(false);
  const [showRPE, setShowRPE] = useState(false);

  // Live workout timer
  useEffect(() => {
    const calcElapsed = () =>
      Math.floor((Date.now() - workout.startTime) / 1000);

    setElapsedSeconds(calcElapsed());
    const interval = setInterval(() => {
      setElapsedSeconds(calcElapsed());
    }, 1000);

    return () => clearInterval(interval);
  }, [workout.startTime]);

  const formatDuration = (secs: number) => {
    const hours = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (hours > 0) {
      return `${hours}:${mins < 10 ? '0' : ''}${mins}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  // Exercise management
  const removeExercise = (exerciseIndex: number) => {
    haptics.medium();
    const updated = { ...workout };
    updated.exercises = updated.exercises.filter((_, i) => i !== exerciseIndex);
    onUpdateWorkout(updated);
  };

  const updateRestTimerSeconds = (exerciseIndex: number, seconds: number) => {
    const updated = { ...workout };
    updated.exercises[exerciseIndex].restTimerSeconds = seconds;
    onUpdateWorkout(updated);
  };

  // Set management
  const addSet = (exerciseIndex: number) => {
    haptics.light();
    const updated = { ...workout };
    const ex = updated.exercises[exerciseIndex];
    const lastSet = ex.sets[ex.sets.length - 1];

    const newSet: WorkoutSet = {
      id: `set-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: 'normal',
      weight: lastSet ? lastSet.weight : 135,
      reps: lastSet ? lastSet.reps : 5,
      completed: false,
      previousWeight: lastSet?.weight,
      previousReps: lastSet?.reps,
    };

    ex.sets.push(newSet);
    onUpdateWorkout(updated);
  };

  const removeSet = (exerciseIndex: number, setIndex: number) => {
    haptics.light();
    const updated = { ...workout };
    updated.exercises[exerciseIndex].sets = updated.exercises[
      exerciseIndex
    ].sets.filter((_, i) => i !== setIndex);
    onUpdateWorkout(updated);
  };

  const updateSet = (
    exerciseIndex: number,
    setIndex: number,
    fields: Partial<WorkoutSet>
  ) => {
    const updated = { ...workout };
    const currentSet = updated.exercises[exerciseIndex].sets[setIndex];
    updated.exercises[exerciseIndex].sets[setIndex] = {
      ...currentSet,
      ...fields,
    };
    onUpdateWorkout(updated);
  };

  const toggleSetComplete = (exerciseIndex: number, setIndex: number) => {
    const updated = { ...workout };
    const ex = updated.exercises[exerciseIndex];
    const currentSet = ex.sets[setIndex];
    const willBeCompleted = !currentSet.completed;

    currentSet.completed = willBeCompleted;

    if (willBeCompleted) {
      if (settings.soundEnabled) soundFX.playSetComplete();
      if (settings.hapticsEnabled) haptics.light();

      // Trigger Rest Interval Timer!
      onStartRestTimer(ex.restTimerSeconds || 120, ex.exercise.name);

      // Auto fill next set if next set has 0 weight/reps
      const nextSet = ex.sets[setIndex + 1];
      if (nextSet && (!nextSet.weight || nextSet.weight === 0)) {
        nextSet.weight = currentSet.weight;
        nextSet.reps = currentSet.reps;
      }
    }

    onUpdateWorkout(updated);
  };

  const cycleSetType = (exerciseIndex: number, setIndex: number) => {
    haptics.light();
    const types: SetType[] = ['normal', 'warmup', 'drop', 'failure'];
    const current = workout.exercises[exerciseIndex].sets[setIndex].type;
    const nextIdx = (types.indexOf(current) + 1) % types.length;
    updateSet(exerciseIndex, setIndex, { type: types[nextIdx] });
  };

  const totalVolume = workout.exercises.reduce((acc, ex) => {
    return (
      acc +
      ex.sets.reduce((sAcc, s) => {
        return s.completed ? sAcc + s.weight * s.reps : sAcc;
      }, 0)
    );
  }, 0);

  const completedSetsCount = workout.exercises.reduce((acc, ex) => {
    return acc + ex.sets.filter((s) => s.completed).length;
  }, 0);

  return (
    <div className="pb-36 pt-2">
      {/* Active Workout Header Bar */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex-1 mr-3">
            <input
              type="text"
              value={workout.name}
              onChange={(e) =>
                onUpdateWorkout({ ...workout, name: e.target.value })
              }
              className="w-full bg-transparent text-lg sm:text-xl font-black text-white tracking-tight focus:outline-none focus:border-b focus:border-red-500"
            />
            <div className="flex items-center gap-3 text-xs text-zinc-400 mt-1">
              <span className="font-mono text-red-400 font-bold tabular-nums">
                {formatDuration(elapsedSeconds)}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <strong className="text-white font-mono tabular-nums">
                  {completedSetsCount}
                </strong>{' '}
                sets checked
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <strong className="text-white font-mono tabular-nums">
                  {totalVolume.toLocaleString()}
                </strong>{' '}
                {settings.weightUnit}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRPE(!showRPE)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${
                showRPE
                  ? 'bg-red-600 text-white'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
              title="Toggle RPE column"
            >
              RPE
            </button>
            <button
              onClick={onFinishWorkout}
              className="px-4 py-1.5 rounded-xl bg-red-600 text-white font-black text-xs hover:bg-red-500 active:scale-95 transition shadow-lg shadow-red-600/30"
            >
              Finish
            </button>
          </div>
        </div>

        {/* Workout Notes Accordion */}
        <div className="mt-3 pt-3 border-t border-zinc-800/80">
          <button
            onClick={() => setShowWorkoutNotes(!showWorkoutNotes)}
            className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white"
          >
            <FileText className="w-3.5 h-3.5 text-red-500" />
            <span>{workout.notes ? 'Edit workout notes' : '+ Add workout notes'}</span>
          </button>
          {showWorkoutNotes && (
            <textarea
              value={workout.notes || ''}
              onChange={(e) =>
                onUpdateWorkout({ ...workout, notes: e.target.value })
              }
              placeholder="Session notes, feeling, energy, equipment..."
              rows={2}
              className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
            />
          )}
        </div>
      </div>

      {/* Exercises Section */}
      <div className="mt-4 space-y-4">
        {workout.exercises.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-zinc-800 p-8 text-center bg-zinc-900/30">
            <Dumbbell className="w-10 h-10 mx-auto text-red-500/60 mb-3" />
            <h4 className="text-sm font-bold text-white">No exercises in this session</h4>
            <p className="text-xs text-zinc-400 mt-1 max-w-xs mx-auto">
              Add movements from the library or start a pre-built 5x5 routine.
            </p>
            <button
              onClick={onOpenExerciseLibrary}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-red-500 active:scale-95 transition shadow-lg shadow-red-600/30"
            >
              <Plus className="w-4 h-4" />
              Add Exercise
            </button>
          </div>
        ) : (
          workout.exercises.map((we, exIdx) => (
            <div
              key={we.id}
              className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden shadow-xl"
            >
              {/* Exercise Header */}
              <div className="p-3.5 bg-zinc-900/90 border-b border-zinc-800/80 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-black text-white tracking-tight">
                      {we.exercise.name}
                    </h4>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                    <span className="text-red-500 font-bold">
                      {we.exercise.category}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{we.exercise.equipment}</span>
                    <span aria-hidden="true">·</span>
                    {/* Rest Interval Selector */}
                    <span className="flex items-center gap-1 text-zinc-300">
                      <Timer className="w-3.5 h-3.5 text-red-400" />
                      <select
                        value={we.restTimerSeconds}
                        onChange={(e) =>
                          updateRestTimerSeconds(exIdx, parseInt(e.target.value))
                        }
                        className="bg-zinc-950 border border-zinc-800 px-1.5 py-0.5 rounded text-zinc-200 font-mono font-bold text-[10px] focus:outline-none focus:border-red-500 cursor-pointer"
                      >
                        <option value={45} className="bg-zinc-900">45s rest</option>
                        <option value={60} className="bg-zinc-900">60s rest</option>
                        <option value={90} className="bg-zinc-900">90s rest</option>
                        <option value={120} className="bg-zinc-900">120s (2m)</option>
                        <option value={180} className="bg-zinc-900">180s (3m)</option>
                        <option value={300} className="bg-zinc-900">300s (5m)</option>
                      </select>
                    </span>
                  </div>
                </div>

                {/* Quick tools for this exercise */}
                <div className="flex items-center gap-1.5">
                  {/* Plate Calculator Button */}
                  <button
                    onClick={() => {
                      const topWeight =
                        we.sets.find((s) => s.weight > 0)?.weight || 135;
                      setActivePlateCalc({
                        weight: topWeight,
                        exerciseName: we.exercise.name,
                        exerciseIndex: exIdx,
                      });
                    }}
                    title="Calculate Barbell Plates"
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-red-400 text-xs font-bold transition border border-zinc-700/60"
                  >
                    <Disc className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-[10px] hidden sm:inline">Plates</span>
                  </button>

                  {/* 1RM Calculator Button */}
                  <button
                    onClick={() => {
                      const completed = we.sets.find((s) => s.completed) || we.sets[0];
                      setActive1RMCalc({
                        weight: completed ? completed.weight : 135,
                        reps: completed ? completed.reps : 5,
                      });
                    }}
                    title="1RM Calculator"
                    className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:text-red-400 hover:bg-zinc-700 transition"
                  >
                    <Award className="w-4 h-4" />
                  </button>

                  {/* Remove Exercise */}
                  <button
                    onClick={() => removeExercise(exIdx)}
                    title="Remove Exercise"
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Set Table */}
              <div className="p-2 sm:p-3">
                <div className="grid grid-cols-12 gap-1.5 pb-2 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-center items-center">
                  <div className="col-span-2">SET</div>
                  <div className="col-span-3">PREVIOUS</div>
                  <div className={showRPE ? 'col-span-3' : 'col-span-3'}>
                    {settings.weightUnit.toUpperCase()}
                  </div>
                  <div className={showRPE ? 'col-span-2' : 'col-span-2'}>REPS</div>
                  {showRPE && <div className="col-span-1">RPE</div>}
                  <div className="col-span-1">✓</div>
                </div>

                <div className="space-y-1.5">
                  {we.sets.map((s, setIdx) => (
                    <div
                      key={s.id}
                      className={`grid grid-cols-12 gap-1.5 p-1.5 rounded-xl items-center text-xs transition-colors ${
                        s.completed
                          ? 'bg-red-600/10 border border-red-500/30'
                          : 'bg-zinc-950/70 border border-zinc-800/80'
                      }`}
                    >
                      {/* Set Type badge button */}
                      <div className="col-span-2 flex items-center justify-center">
                        <button
                          onClick={() => cycleSetType(exIdx, setIdx)}
                          className={`w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center transition ${
                            s.type === 'warmup'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : s.type === 'drop'
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                              : s.type === 'failure'
                              ? 'bg-red-600/30 text-red-300 border border-red-500/50'
                              : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                          }`}
                          title="Click to toggle set type (Normal, Warmup, Drop, Failure)"
                        >
                          {s.type === 'warmup'
                            ? 'W'
                            : s.type === 'drop'
                            ? 'D'
                            : s.type === 'failure'
                            ? 'F'
                            : setIdx + 1}
                        </button>
                      </div>

                      {/* Previous Performance Ghost */}
                      <div className="col-span-3 text-center font-mono text-[11px] text-zinc-400 tabular-nums">
                        {s.previousWeight ? `${s.previousWeight} × ${s.previousReps}` : '—'}
                      </div>

                      {/* Weight Input */}
                      <div className={showRPE ? 'col-span-3' : 'col-span-3'}>
                        <input
                          type="number"
                          step={settings.weightUnit === 'lbs' ? '5' : '2.5'}
                          value={s.weight === 0 ? '' : s.weight}
                          onChange={(e) =>
                            updateSet(exIdx, setIdx, {
                              weight: parseFloat(e.target.value) || 0,
                            })
                          }
                          placeholder="0"
                          className="w-full text-center rounded-lg bg-zinc-900 border border-zinc-800 py-1.5 font-mono font-bold text-white tabular-nums focus:border-red-500 focus:outline-none"
                        />
                      </div>

                      {/* Reps Input */}
                      <div className={showRPE ? 'col-span-2' : 'col-span-2'}>
                        <input
                          type="number"
                          value={s.reps === 0 ? '' : s.reps}
                          onChange={(e) =>
                            updateSet(exIdx, setIdx, {
                              reps: parseInt(e.target.value) || 0,
                            })
                          }
                          placeholder="0"
                          className="w-full text-center rounded-lg bg-zinc-900 border border-zinc-800 py-1.5 font-mono font-bold text-white tabular-nums focus:border-red-500 focus:outline-none"
                        />
                      </div>

                      {/* RPE */}
                      {showRPE && (
                        <div className="col-span-1">
                          <input
                            type="number"
                            step="0.5"
                            min="6"
                            max="10"
                            value={s.rpe || ''}
                            onChange={(e) =>
                              updateSet(exIdx, setIdx, {
                                rpe: parseFloat(e.target.value) || undefined,
                              })
                            }
                            placeholder="-"
                            className="w-full text-center rounded-lg bg-zinc-900 border border-zinc-800 py-1.5 font-mono text-xs text-red-400 tabular-nums focus:border-red-500 focus:outline-none"
                          />
                        </div>
                      )}

                      {/* Complete Checkbox */}
                      <div className="col-span-1 flex items-center justify-center">
                        <button
                          onClick={() => toggleSetComplete(exIdx, setIdx)}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center transition active:scale-90 ${
                            s.completed
                              ? 'bg-red-600 text-white font-black shadow-md shadow-red-600/40 ring-1 ring-red-400'
                              : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300 border border-zinc-700'
                          }`}
                        >
                          <Check className="w-4 h-4 stroke-[3]" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Set Actions Bar */}
                <div className="mt-2.5 flex items-center justify-between pt-1">
                  <button
                    onClick={() => addSet(exIdx)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold active:scale-95 transition"
                  >
                    <Plus className="w-3.5 h-3.5 text-red-500" />
                    <span>Add Set</span>
                  </button>

                  {we.sets.length > 1 && (
                    <button
                      onClick={() => removeSet(exIdx, we.sets.length - 1)}
                      className="text-[11px] text-zinc-500 hover:text-red-400 transition"
                    >
                      Delete Last Set
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}

        {/* Add Exercise CTA Button */}
        {workout.exercises.length > 0 && (
          <div className="pt-2 flex flex-col gap-2">
            <button
              onClick={onOpenExerciseLibrary}
              className="w-full py-3.5 rounded-2xl border-2 border-dashed border-zinc-800 hover:border-red-500/50 hover:bg-zinc-900/50 text-zinc-300 hover:text-red-400 font-bold text-xs flex items-center justify-center gap-2 active:scale-98 transition"
            >
              <Plus className="w-4 h-4 text-red-500" />
              <span>Add Another Exercise</span>
            </button>

            <button
              onClick={onCancelWorkout}
              className="py-2.5 text-zinc-500 hover:text-red-400 text-xs font-medium transition text-center"
            >
              Discard Workout
            </button>
          </div>
        )}
      </div>

      {/* Plate Calculator Modal */}
      {activePlateCalc && (
        <PlateCalculatorModal
          initialWeight={activePlateCalc.weight}
          initialUnit={settings.weightUnit}
          initialBarWeight={settings.barWeight}
          onApplyWeight={(newWeight) => {
            if (
              activePlateCalc.exerciseIndex !== undefined &&
              workout.exercises[activePlateCalc.exerciseIndex]
            ) {
              const updated = { ...workout };
              updated.exercises[activePlateCalc.exerciseIndex].sets.forEach(
                (s) => {
                  if (!s.completed) s.weight = newWeight;
                }
              );
              onUpdateWorkout(updated);
            }
          }}
          onClose={() => setActivePlateCalc(null)}
        />
      )}

      {/* 1RM Calculator Modal */}
      {active1RMCalc && (
        <OneRepMaxModal
          initialWeight={active1RMCalc.weight}
          initialReps={active1RMCalc.reps}
          unit={settings.weightUnit}
          onClose={() => setActive1RMCalc(null)}
        />
      )}
    </div>
  );
};
