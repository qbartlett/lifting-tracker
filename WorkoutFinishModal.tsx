import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, Clock, Flame, Dumbbell } from 'lucide-react';
import { ActiveWorkout, CompletedWorkout, UserSettings } from '../types/lifting';
import { haptics } from '../utils/haptics';

interface WorkoutFinishModalProps {
  workout: ActiveWorkout;
  settings: UserSettings;
  onSave: (finalWorkout: CompletedWorkout) => void;
  onClose: () => void;
}

export const WorkoutFinishModal: React.FC<WorkoutFinishModalProps> = ({
  workout,
  settings,
  onSave,
  onClose,
}) => {
  const [workoutName, setWorkoutName] = useState(workout.name);
  const [notes, setNotes] = useState(workout.notes || '');

  const durationSeconds = Math.max(
    60,
    Math.floor((Date.now() - workout.startTime) / 1000)
  );

  const totalVolume = workout.exercises.reduce((acc, ex) => {
    return (
      acc +
      ex.sets.reduce((sAcc, s) => {
        return s.completed ? sAcc + s.weight * s.reps : sAcc;
      }, 0)
    );
  }, 0);

  const completedSets = workout.exercises.reduce((acc, ex) => {
    return acc + ex.sets.filter((s) => s.completed).length;
  }, 0);

  useEffect(() => {
    // Red-themed victory confetti
    confetti({
      particleCount: 85,
      spread: 75,
      origin: { y: 0.6 },
      colors: ['#dc2626', '#ef4444', '#ffffff', '#f43f5e', '#b91c1c'],
    });
    haptics.celebratePR();
  }, []);

  const formatDuration = (secs: number) => {
    const hours = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins} mins`;
  };

  const handleSave = () => {
    haptics.medium();
    const completed: CompletedWorkout = {
      id: `workout-${Date.now()}`,
      name: workoutName.trim() || 'Workout',
      startTime: workout.startTime,
      endTime: Date.now(),
      durationSeconds,
      exercises: workout.exercises,
      totalVolume,
      totalSets: completedSets,
      notes: notes.trim() || undefined,
    };
    onSave(completed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in">
      <div className="relative w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl overflow-hidden ring-1 ring-red-500/20">
        {/* Glow backdrop */}
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-red-600/20 rounded-full blur-2xl pointer-events-none" />

        <div className="text-center pb-4">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-red-600/15 border border-red-500/30 flex items-center justify-center text-red-500 mb-3 shadow-lg shadow-red-600/20">
            <Trophy className="w-7 h-7" />
          </div>
          <h3 className="text-xl font-black text-white tracking-tight">
            Session Crushed!
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            Excellent execution on the platform today.
          </p>
        </div>

        {/* Big Metrics Grid */}
        <div className="grid grid-cols-3 gap-2.5 my-4">
          <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 text-center">
            <Clock className="w-4 h-4 text-zinc-400 mx-auto mb-1" />
            <div className="text-base font-black text-white font-mono tabular-nums">
              {formatDuration(durationSeconds)}
            </div>
            <div className="text-[10px] text-zinc-400 uppercase font-bold">
              Time
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 text-center">
            <Flame className="w-4 h-4 text-red-500 mx-auto mb-1" />
            <div className="text-base font-black text-red-500 font-mono tabular-nums">
              {totalVolume.toLocaleString()}
            </div>
            <div className="text-[10px] text-zinc-400 uppercase font-bold">
              Vol ({settings.weightUnit})
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 text-center">
            <Dumbbell className="w-4 h-4 text-zinc-300 mx-auto mb-1" />
            <div className="text-base font-black text-white font-mono tabular-nums">
              {completedSets}
            </div>
            <div className="text-[10px] text-zinc-400 uppercase font-bold">
              Sets
            </div>
          </div>
        </div>

        {/* Workout Name & Notes inputs */}
        <div className="space-y-3 mt-4">
          <div>
            <label className="text-[11px] font-bold text-zinc-400 uppercase">
              Workout Name
            </label>
            <input
              type="text"
              value={workoutName}
              onChange={(e) => setWorkoutName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-sm text-white font-bold focus:border-red-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-zinc-400 uppercase">
              Workout Reflection / Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="RPE feeling, barbell bar path, form notes..."
              rows={2}
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Exercises summary */}
        <div className="mt-4 pt-3 border-t border-zinc-800">
          <div className="text-[11px] font-bold text-zinc-400 uppercase mb-2">
            Exercises Logged ({workout.exercises.length})
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
            {workout.exercises.map((we) => {
              const setsDone = we.sets.filter((s) => s.completed).length;
              const topWeight = Math.max(...we.sets.filter((s) => s.completed).map((s) => s.weight), 0);
              return (
                <div
                  key={we.id}
                  className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-zinc-950/70"
                >
                  <span className="text-white font-bold truncate max-w-[180px]">
                    {we.exercise.name}
                  </span>
                  <span className="text-zinc-400 font-mono text-[11px] tabular-nums">
                    {setsDone} sets · {topWeight > 0 ? `${topWeight} ${settings.weightUnit}` : 'BW'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-zinc-800 text-zinc-300 font-bold text-xs hover:bg-zinc-700 transition"
          >
            Resume
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-3 rounded-xl bg-red-600 text-white font-black text-xs hover:bg-red-500 active:scale-95 transition shadow-lg shadow-red-600/40"
          >
            Save Session
          </button>
        </div>
      </div>
    </div>
  );
};
