import React, { useState } from 'react';
import {
  Calendar,
  Flame,
  Clock,
  Dumbbell,
  Award,
  ChevronDown,
  ChevronUp,
  Trash2,
  Trophy,
} from 'lucide-react';
import { CompletedWorkout, PersonalRecord, UserSettings } from '../types/lifting';
import { haptics } from '../utils/haptics';

interface HistoryViewProps {
  history: CompletedWorkout[];
  personalRecords: Record<string, PersonalRecord>;
  settings: UserSettings;
  onDeleteWorkout: (id: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  history,
  personalRecords,
  settings,
  onDeleteWorkout,
}) => {
  const [activeTab, setActiveTab] = useState<'history' | 'prs' | 'stats'>('history');
  const [expandedWorkoutId, setExpandedWorkoutId] = useState<string | null>(null);

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDuration = (secs: number) => {
    const hours = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const allTimeVolume = history.reduce((acc, w) => acc + w.totalVolume, 0);
  const allTimeSets = history.reduce((acc, w) => acc + w.totalSets, 0);
  const prList = Object.values(personalRecords).sort((a, b) => b.maxWeight - a.maxWeight);

  return (
    <div className="pb-32 pt-2 space-y-4">
      {/* Segmented Control */}
      <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
        <button
          onClick={() => {
            haptics.light();
            setActiveTab('history');
          }}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'history'
              ? 'bg-red-600 text-white shadow-sm'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Workout Log ({history.length})
        </button>
        <button
          onClick={() => {
            haptics.light();
            setActiveTab('prs');
          }}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'prs'
              ? 'bg-red-600 text-white shadow-sm'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          PR Trophies ({prList.length})
        </button>
        <button
          onClick={() => {
            haptics.light();
            setActiveTab('stats');
          }}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'stats'
              ? 'bg-red-600 text-white shadow-sm'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Analytics
        </button>
      </div>

      {/* Tab 1: Workout History Feed */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          {history.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-zinc-800 p-8 text-center text-zinc-500 text-xs">
              <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
              No workouts logged yet. Complete your first workout to see your log here!
            </div>
          ) : (
            history.map((workout) => {
              const isExpanded = expandedWorkoutId === workout.id;
              return (
                <div
                  key={workout.id}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden shadow-xl"
                >
                  <div
                    onClick={() => {
                      haptics.light();
                      setExpandedWorkoutId(isExpanded ? null : workout.id);
                    }}
                    className="p-4 cursor-pointer hover:bg-zinc-800/40 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-bold text-red-500">
                          {formatDate(workout.startTime)}
                        </div>
                        <h4 className="text-base font-black text-white tracking-tight mt-0.5">
                          {workout.name}
                        </h4>
                      </div>
                      <div className="flex items-center gap-2">
                        {workout.prCount && workout.prCount > 0 && (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-red-400 bg-red-600/15 px-2 py-0.5 rounded-lg border border-red-500/30">
                            <Trophy className="w-3 h-3 text-red-500" />
                            {workout.prCount} PR
                          </span>
                        )}
                        <span className="text-zinc-500">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Summary row */}
                    <div className="mt-3 flex items-center gap-4 text-xs text-zinc-400">
                      <div className="flex items-center gap-1 font-mono tabular-nums">
                        <Clock className="w-3.5 h-3.5 text-zinc-500" />
                        <span>{formatDuration(workout.durationSeconds)}</span>
                      </div>
                      <div className="flex items-center gap-1 font-mono tabular-nums">
                        <Flame className="w-3.5 h-3.5 text-red-500" />
                        <span>
                          <strong className="text-white">{workout.totalVolume.toLocaleString()}</strong> {settings.weightUnit}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 font-mono tabular-nums">
                        <Dumbbell className="w-3.5 h-3.5 text-zinc-400" />
                        <span>{workout.totalSets} sets</span>
                      </div>
                    </div>

                    {workout.notes && (
                      <p className="mt-2 text-xs text-zinc-400 italic line-clamp-1">
                        "{workout.notes}"
                      </p>
                    )}
                  </div>

                  {/* Expanded exercise details */}
                  {isExpanded && (
                    <div className="p-4 pt-0 border-t border-zinc-800/80 bg-zinc-950/40 divide-y divide-zinc-800/60">
                      {workout.exercises.map((we) => (
                        <div key={we.id} className="py-2.5">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="font-bold text-white">{we.exercise.name}</span>
                            <span className="text-red-500 text-[11px] font-semibold">
                              {we.exercise.category}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {we.sets
                              .filter((s) => s.completed)
                              .map((s) => (
                                <span
                                  key={s.id}
                                  className="px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 font-mono text-[11px] text-zinc-200 tabular-nums"
                                >
                                  {s.weight > 0 ? `${s.weight}×${s.reps}` : `${s.reps} reps`}
                                </span>
                              ))}
                          </div>
                          {we.notes && (
                            <p className="text-[11px] text-zinc-400 mt-1 italic">
                              {we.notes}
                            </p>
                          )}
                        </div>
                      ))}

                      <div className="pt-3 flex items-center justify-end">
                        <button
                          onClick={() => {
                            if (confirm('Delete this workout from history?')) {
                              haptics.medium();
                              onDeleteWorkout(workout.id);
                            }
                          }}
                          className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 font-medium py-1 px-2"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Log</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab 2: Personal Records */}
      {activeTab === 'prs' && (
        <div className="space-y-3">
          <div className="p-4 rounded-2xl bg-red-600/10 border border-red-500/20 text-xs text-red-300 flex items-center gap-2.5">
            <Trophy className="w-5 h-5 shrink-0 text-red-500" />
            <span>
              All-time personal records calculated from your heaviest sets and 1RM formula projections.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {prList.map((pr) => (
              <div
                key={pr.exerciseId}
                className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900 shadow-xl ring-1 ring-zinc-800"
              >
                <div className="flex items-start justify-between">
                  <h4 className="text-sm font-black text-white tracking-tight">
                    {pr.exerciseName}
                  </h4>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    {pr.achievedDate}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800">
                    <span className="text-[9px] uppercase font-bold text-zinc-400 block">
                      Max Weight
                    </span>
                    <span className="text-sm font-black text-red-500 font-mono tabular-nums">
                      {pr.maxWeight} {settings.weightUnit}
                    </span>
                    <span className="text-[10px] text-zinc-400 block">
                      × {pr.maxRepsAtMaxWeight} reps
                    </span>
                  </div>

                  <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800">
                    <span className="text-[9px] uppercase font-bold text-zinc-400 block">
                      Est. 1RM
                    </span>
                    <span className="text-sm font-black text-white font-mono tabular-nums">
                      {pr.estimated1RM} {settings.weightUnit}
                    </span>
                    <span className="text-[10px] text-zinc-400 block">
                      Calculated
                    </span>
                  </div>

                  <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800">
                    <span className="text-[9px] uppercase font-bold text-zinc-400 block">
                      Max Vol Set
                    </span>
                    <span className="text-sm font-black text-zinc-200 font-mono tabular-nums">
                      {pr.bestVolumeSet.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-zinc-400 block">
                      {settings.weightUnit}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Analytics */}
      {activeTab === 'stats' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900 text-center">
              <span className="text-xs text-zinc-400 uppercase font-bold">
                Total Volume Lifted
              </span>
              <div className="text-2xl font-black text-red-500 font-mono tabular-nums mt-1">
                {allTimeVolume.toLocaleString()}
              </div>
              <span className="text-[11px] text-zinc-400">
                {settings.weightUnit} cumulative
              </span>
            </div>

            <div className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900 text-center">
              <span className="text-xs text-zinc-400 uppercase font-bold">
                Total Sets Logged
              </span>
              <div className="text-2xl font-black text-white font-mono tabular-nums mt-1">
                {allTimeSets.toLocaleString()}
              </div>
              <span className="text-[11px] text-zinc-400">across {history.length} sessions</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900 shadow-xl">
            <h4 className="text-sm font-black text-white mb-3">
              Muscle Group Training Frequency
            </h4>
            <div className="space-y-2.5">
              {['Quads', 'Back', 'Chest', 'Shoulders', 'Biceps', 'Triceps', 'Hamstrings'].map(
                (muscle) => {
                  const count = history.reduce((acc, w) => {
                    return (
                      acc +
                      w.exercises.filter((e) => e.exercise.category === muscle).length
                    );
                  }, 0);
                  const maxCount = Math.max(
                    ...['Quads', 'Back', 'Chest', 'Shoulders', 'Biceps', 'Triceps', 'Hamstrings'].map(
                      (m) =>
                        history.reduce(
                          (acc, w) =>
                            acc +
                            w.exercises.filter((e) => e.exercise.category === m).length,
                          0
                        )
                    ),
                    1
                  );
                  const pct = Math.round((count / maxCount) * 100);

                  return (
                    <div key={muscle} className="text-xs">
                      <div className="flex justify-between text-zinc-300 font-bold mb-1">
                        <span>{muscle}</span>
                        <span className="font-mono text-zinc-400 tabular-nums">
                          {count} exercises
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-zinc-950 overflow-hidden">
                        <div
                          className="h-full bg-red-600 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
