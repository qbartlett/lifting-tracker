import React, { useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronDown, ChevronUp, Play, RefreshCw } from 'lucide-react';
import type { CompletedWorkout } from '../types/lifting';
import type { ProgramAssignment, ProgramCompletion, ProgramSession } from '../types/program';
import { buildSchedule, describeAdherence, localDateString, type ScheduledSession, type SessionStatus } from '../domain/program';
import { haptics } from '../utils/haptics';

interface ProgramViewProps {
  assignment: ProgramAssignment;
  history: CompletedWorkout[];
  loading: boolean;
  /** Set when the latest refresh failed; the saved plan is still shown. */
  error: string | null;
  onRefresh: () => void;
  onStartSession: (session: ProgramSession, week: number) => void;
}

const card = 'rounded-2xl border border-zinc-800 bg-zinc-900';

/** YYYY-MM-DD as a short local date, without time zone surprises. */
export function prettyDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export const STATUS_STYLE: Record<SessionStatus, { label: string; cls: string }> = {
  done: { label: 'Done', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  today: { label: 'Today', cls: 'text-red-400 bg-red-600/15 border-red-500/40' },
  upcoming: { label: 'Upcoming', cls: 'text-zinc-400 bg-zinc-800/60 border-zinc-700' },
  missed: { label: 'Missed', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
};

export const ProgramView: React.FC<ProgramViewProps> = ({ assignment, history, loading, error, onRefresh, onStartSession }) => {
  const { program } = assignment;
  const today = localDateString(Date.now());

  // What this client has logged against the plan comes from their own history, so it works offline.
  const completions = useMemo<ProgramCompletion[]>(
    () =>
      history
        .filter((w) => w.programRef?.assignmentId === assignment.id)
        .map((w) => ({
          workoutId: w.id,
          sessionId: w.programRef!.sessionId,
          week: w.programRef!.week,
          completedAt: w.endTime,
        })),
    [history, assignment.id]
  );

  const schedule = useMemo(
    () => buildSchedule(assignment.startDate, program, completions, today),
    [assignment.startDate, program, completions, today]
  );

  const [openWeek, setOpenWeek] = useState<number | null>(schedule.currentWeek);
  const [openSession, setOpenSession] = useState<string | null>(null);

  return (
    <div className="pt-4 pb-32 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-red-500 shrink-0" />
            <span className="truncate">{program.name}</span>
          </h2>
          <div className="text-xs text-zinc-400 mt-0.5">From {assignment.coach.name} · {program.weeks} {program.weeks === 1 ? 'week' : 'weeks'}</div>
        </div>
        <button
          onClick={() => { haptics.light(); onRefresh(); }}
          aria-label="Refresh plan"
          className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-900 transition shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
          Could not update your plan ({error}). Showing the last saved copy.
        </div>
      )}

      {program.notes && <div className={`${card} p-3.5 text-xs text-zinc-300 whitespace-pre-wrap`}>{program.notes}</div>}

      <div className={`${card} p-3.5`}>
        {schedule.notStarted ? (
          <div className="text-sm font-bold text-white">Starts {prettyDate(assignment.startDate)}</div>
        ) : schedule.finished ? (
          <div className="text-sm font-bold text-white">Program finished</div>
        ) : (
          <div className="text-sm font-bold text-white">Week {schedule.currentWeek + 1} of {program.weeks}</div>
        )}
        <div className="text-xs text-zinc-400 mt-0.5">{describeAdherence(schedule)}</div>
      </div>

      <div className="space-y-2">
        {schedule.weeks.map((wk) => {
          const isOpen = openWeek === wk.week;
          const weekDone = wk.sessions.filter((s) => s.status === 'done').length;
          return (
            <div key={wk.week} className={`${card} overflow-hidden`}>
              <button
                onClick={() => setOpenWeek(isOpen ? null : wk.week)}
                aria-expanded={isOpen}
                className="w-full px-3.5 py-3 flex items-center justify-between text-left hover:bg-zinc-800/40 transition"
              >
                <div>
                  <div className="text-sm font-black text-white">Week {wk.week + 1}</div>
                  <div className="text-[11px] text-zinc-500">{weekDone} of {wk.sessions.length} done</div>
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
              </button>
              {isOpen && (
                <div className="border-t border-zinc-800 divide-y divide-zinc-800/70">
                  {wk.sessions.map((s) => (
                    <SessionRow
                      key={s.session.id}
                      item={s}
                      open={openSession === `${wk.week}:${s.session.id}`}
                      onToggle={() => setOpenSession(openSession === `${wk.week}:${s.session.id}` ? null : `${wk.week}:${s.session.id}`)}
                      onStart={() => onStartSession(s.session, wk.week)}
                    />
                  ))}
                  {wk.sessions.length === 0 && <div className="p-3.5 text-xs text-zinc-500">Nothing scheduled this week.</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SessionRow: React.FC<{ item: ScheduledSession; open: boolean; onToggle: () => void; onStart: () => void }> = ({ item, open, onToggle, onStart }) => {
  const st = STATUS_STYLE[item.status];
  return (
    <div className="p-3.5 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <button onClick={onToggle} aria-expanded={open} className="min-w-0 flex-1 text-left">
          <div className="text-[11px] font-bold text-red-500">{prettyDate(item.date)}</div>
          <div className="text-sm font-black text-white truncate">{item.session.name}</div>
          <div className="text-[11px] text-zinc-500">{item.session.exercises.length} exercises</div>
        </button>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border flex items-center gap-1 shrink-0 ${st.cls}`}>
          {item.status === 'done' && <Check className="w-3 h-3" />}
          {st.label}
        </span>
        {item.status !== 'done' && (
          <button
            onClick={() => { haptics.medium(); onStart(); }}
            aria-label={`Start ${item.session.name}`}
            className="p-2.5 rounded-xl bg-red-600 text-white hover:bg-red-500 active:scale-95 transition shrink-0"
          >
            <Play className="w-4 h-4" />
          </button>
        )}
      </div>
      {open && (
        <div className="space-y-1.5">
          {item.session.exercises.map((e, i) => (
            <div key={`${e.exerciseId}-${i}`} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-zinc-200 truncate">{e.name}</span>
                <span className="font-mono font-bold text-white tabular-nums shrink-0">{e.sets} × {e.reps}</span>
              </div>
              {e.notes && <div className="text-[11px] text-zinc-500 italic">{e.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
