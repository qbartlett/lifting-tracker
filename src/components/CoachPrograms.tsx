import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ClipboardList, Copy, Pencil, Plus, Trash2, X } from 'lucide-react';
import { ApiError, type ApiClient, type ClientSummary, type ProgramSummary } from '../api/client';
import { errorMessage } from '../state/useAuth';
import type { Exercise, RoutineTemplate } from '../types/lifting';
import type { ProgramAssignment, ProgramCompletion, ProgramDraft, ProgramSession } from '../types/program';
import { DAY_NAMES, buildSchedule, describeAdherence, localDateString } from '../domain/program';
import { cleanDraft, clamp, emptyDraft, exerciseToProgram, newId, routineToProgramExercises, validateDraft } from '../domain/programDraft';
import { ExerciseLibraryModal } from './ExerciseLibraryModal';
import { STATUS_STYLE, prettyDate } from './ProgramView';
import { haptics } from '../utils/haptics';

const card = 'rounded-2xl border border-zinc-800 bg-zinc-900';
const errorBox = 'rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300';
const input = 'w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500';

interface LibraryProps {
  routines: RoutineTemplate[];
  exercises: Exercise[];
  onAddCustomExercise: (exercise: Exercise) => void;
}

/* ------------------------------------------------------------------ list */

export const ProgramsSection: React.FC<{ api: ApiClient } & LibraryProps> = ({ api, routines, exercises, onAddCustomExercise }) => {
  const [programs, setPrograms] = useState<ProgramSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ProgramDraft | null>(null);
  const [offer, setOffer] = useState<{ id: string; name: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPrograms((await api.listPrograms()).programs);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
      setPrograms((p) => p ?? []);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const remove = async (p: ProgramSummary) => {
    if (!window.confirm(`Delete "${p.name}"?`)) return;
    try {
      await api.deleteProgram(p.id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'in_use'
        ? `${p.name} is still assigned to a client. End their plan first (open the client, then "End plan").`
        : errorMessage(e));
    }
  };

  const duplicate = (p: ProgramSummary) => {
    haptics.light();
    setEditing({
      name: `${p.name} (copy)`, notes: p.notes, weeks: p.weeks,
      sessions: p.sessions.map((s) => ({ ...s, id: newId(), exercises: s.exercises.map((e) => ({ ...e })) })),
    });
  };

  return (
    <div className="space-y-3">
      <button
        onClick={() => { haptics.light(); setEditing(emptyDraft()); }}
        className="w-full py-3 rounded-2xl bg-red-600 text-white text-sm font-black flex items-center justify-center gap-2 hover:bg-red-500 active:scale-[0.99] transition"
      >
        <Plus className="w-4 h-4" /> New program
      </button>

      {notice && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">{notice}</div>}
      {error && <div role="alert" className={errorBox}>{error}</div>}
      {programs === null && <div className="text-xs text-zinc-500 text-center py-6">Loading…</div>}
      {programs?.length === 0 && !error && (
        <div className="rounded-3xl border border-dashed border-zinc-800 p-8 text-center text-zinc-500 text-xs">
          No programs yet. A program is a weekly plan (for example Mon Push, Wed Pull, Fri Legs) repeated for a number of weeks. Make one, then give it to a client from their page.
        </div>
      )}
      {programs?.map((p) => (
        <div key={p.id} className={`${card} p-3.5`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-black text-white truncate">{p.name}</div>
              <div className="text-[11px] text-zinc-400">
                {p.weeks} {p.weeks === 1 ? 'week' : 'weeks'} · {p.sessions.length} {p.sessions.length === 1 ? 'session' : 'sessions'} a week
                {p.activeAssignments > 0 && ` · ${p.activeAssignments} ${p.activeAssignments === 1 ? 'client' : 'clients'} on it`}
              </div>
            </div>
            <div className="flex items-center shrink-0">
              <button onClick={() => { haptics.light(); setEditing({ ...p }); }} aria-label={`Edit ${p.name}`} className="p-2 text-zinc-400 hover:text-white transition"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => duplicate(p)} aria-label={`Copy ${p.name}`} className="p-2 text-zinc-400 hover:text-white transition"><Copy className="w-4 h-4" /></button>
              <button onClick={() => void remove(p)} aria-label={`Delete ${p.name}`} className="p-2 text-zinc-500 hover:text-red-400 transition"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      ))}

      {offer && (
        <AssignToClientDialog
          api={api}
          program={offer}
          onClose={() => setOffer(null)}
          onDone={(clientName) => { setOffer(null); setNotice(`"${offer.name}" assigned to ${clientName}.`); void load(); }}
        />
      )}

      {editing && (
        <ProgramBuilder
          api={api}
          initial={editing}
          routines={routines}
          exercises={exercises}
          onAddCustomExercise={onAddCustomExercise}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null);
            setNotice(null);
            // A new program does nothing until it is given to someone, so offer to do that now.
            if (saved.isNew) setOffer({ id: saved.id, name: saved.name });
            void load();
          }}
        />
      )}
    </div>
  );
};

/* --------------------------------------------------------------- builder */

const NumberField: React.FC<{ value: number; min: number; max: number; label: string; onChange: (n: number) => void; width?: string }> = ({
  value, min, max, label, onChange, width = 'w-14',
}) => {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={label}
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(/\D/g, '').slice(0, 4);
        setText(t);
        if (t !== '') onChange(clamp(Number(t), min, max));
      }}
      onBlur={() => setText(String(value))}
      className={`${width} rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1.5 text-center text-sm text-white tabular-nums focus:outline-none focus:border-red-500`}
    />
  );
};

const ProgramBuilder: React.FC<{
  api: ApiClient;
  initial: ProgramDraft;
  onClose: () => void;
  onSaved: (saved: { id: string; name: string; isNew: boolean }) => void;
} & LibraryProps> = ({ api, initial, routines, exercises, onAddCustomExercise, onClose, onSaved }) => {
  const [draft, setDraft] = useState<ProgramDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null); // session id

  const patchSession = (id: string, f: (s: ProgramSession) => ProgramSession) =>
    setDraft((d) => ({ ...d, sessions: d.sessions.map((s) => (s.id === id ? f(s) : s)) }));

  const addSession = () =>
    setDraft((d) => {
      const used = new Set(d.sessions.map((s) => s.day));
      const day = [0, 2, 4, 1, 3, 5, 6].find((x) => !used.has(x)) ?? 0;
      return { ...d, sessions: [...d.sessions, { id: newId(), day, name: `Day ${d.sessions.length + 1}`, exercises: [] }] };
    });

  const save = async () => {
    const problem = validateDraft(draft);
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError(null);
    try {
      const body = cleanDraft(draft);
      const saved = draft.id ? await api.updateProgram(draft.id, body) : await api.createProgram(body);
      haptics.medium();
      onSaved({ id: saved.id, name: saved.name, isNew: !draft.id });
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  const close = () => {
    const changed = JSON.stringify(draft) !== JSON.stringify(initial);
    if (!changed || window.confirm('Discard your changes?')) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex justify-center" role="dialog" aria-modal="true" aria-label={draft.id ? 'Edit program' : 'New program'}>
      <div className="w-full max-w-md flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h2 className="text-base font-black text-white">{draft.id ? 'Edit program' : 'New program'}</h2>
          <button onClick={close} aria-label="Close" className="p-2 text-zinc-400 hover:text-white transition"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-28">
          <div className="space-y-2">
            <label htmlFor="prog-name" className="block text-[11px] font-bold text-zinc-400">Program name</label>
            <input id="prog-name" value={draft.name} maxLength={100} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. 8-week strength block" className={input} />
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="prog-weeks" className="text-[11px] font-bold text-zinc-400">Length (weeks)</label>
              <NumberField value={draft.weeks} min={1} max={52} label="Weeks" onChange={(n) => setDraft((d) => ({ ...d, weeks: n }))} width="w-20" />
            </div>
            <label htmlFor="prog-notes" className="block text-[11px] font-bold text-zinc-400">Notes for the client (optional)</label>
            <textarea id="prog-notes" value={draft.notes ?? ''} maxLength={2000} rows={2} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Goals, how to progress, anything they should know" className={input} />
          </div>

          <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wide">Each week</div>

          {draft.sessions.map((s) => (
            <div key={s.id} className={`${card} p-3.5 space-y-3`}>
              <div className="flex items-center gap-2">
                <select
                  aria-label="Day"
                  value={s.day}
                  onChange={(e) => patchSession(s.id, (x) => ({ ...x, day: Number(e.target.value) }))}
                  className="rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                >
                  {DAY_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
                </select>
                <input
                  aria-label="Session name"
                  value={s.name}
                  maxLength={100}
                  onChange={(e) => patchSession(s.id, (x) => ({ ...x, name: e.target.value }))}
                  className="flex-1 min-w-0 rounded-lg bg-zinc-950 border border-zinc-800 px-2.5 py-2 text-sm font-bold text-white focus:outline-none focus:border-red-500"
                />
                {draft.sessions.length > 1 && (
                  <button
                    onClick={() => { if (s.exercises.length === 0 || window.confirm(`Remove "${s.name || 'this session'}"?`)) setDraft((d) => ({ ...d, sessions: d.sessions.filter((x) => x.id !== s.id) })); }}
                    aria-label="Remove session"
                    className="p-1.5 text-zinc-500 hover:text-red-400 transition"
                  ><Trash2 className="w-4 h-4" /></button>
                )}
              </div>

              {s.exercises.map((e, i) => (
                <div key={`${e.exerciseId}-${i}`} className="rounded-xl bg-zinc-950/60 border border-zinc-800/70 p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-bold text-white truncate">{e.name}</div>
                    <div className="flex items-center shrink-0">
                      <button disabled={i === 0} aria-label={`Move ${e.name} up`} onClick={() => patchSession(s.id, (x) => swap(x, i, i - 1))} className="p-1 text-zinc-500 hover:text-white disabled:opacity-30 transition"><ChevronUp className="w-4 h-4" /></button>
                      <button disabled={i === s.exercises.length - 1} aria-label={`Move ${e.name} down`} onClick={() => patchSession(s.id, (x) => swap(x, i, i + 1))} className="p-1 text-zinc-500 hover:text-white disabled:opacity-30 transition"><ChevronDown className="w-4 h-4" /></button>
                      <button aria-label={`Remove ${e.name}`} onClick={() => patchSession(s.id, (x) => ({ ...x, exercises: x.exercises.filter((_, j) => j !== i) }))} className="p-1 text-zinc-500 hover:text-red-400 transition"><X className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                    <NumberField value={e.sets} min={1} max={20} label={`${e.name} sets`} onChange={(n) => patchSession(s.id, (x) => setEx(x, i, { sets: n }))} />
                    <span>sets ×</span>
                    <NumberField value={e.reps} min={1} max={100} label={`${e.name} reps`} onChange={(n) => patchSession(s.id, (x) => setEx(x, i, { reps: n }))} />
                    <span>reps</span>
                    <span className="ml-auto flex items-center gap-1">
                      <NumberField value={e.restSeconds} min={0} max={1800} label={`${e.name} rest seconds`} width="w-16" onChange={(n) => patchSession(s.id, (x) => setEx(x, i, { restSeconds: n }))} />
                      <span>s rest</span>
                    </span>
                  </div>
                  <input
                    aria-label={`${e.name} note`}
                    value={e.notes ?? ''}
                    maxLength={500}
                    onChange={(ev) => patchSession(s.id, (x) => setEx(x, i, { notes: ev.target.value }))}
                    placeholder="Note (optional), e.g. 2 second pause"
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500"
                  />
                </div>
              ))}

              <div className="flex gap-2">
                <button onClick={() => setPickerFor(s.id)} className="flex-1 py-2 rounded-xl border border-zinc-700 text-xs font-bold text-zinc-200 hover:border-red-500/50 transition flex items-center justify-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Add exercise
                </button>
                {routines.length > 0 && (
                  <select
                    aria-label="Copy exercises from one of your routines"
                    value=""
                    onChange={(e) => {
                      const r = routines.find((x) => x.id === e.target.value);
                      if (r) patchSession(s.id, (x) => ({ ...x, exercises: [...x.exercises, ...routineToProgramExercises(r, exercises)].slice(0, 30) }));
                    }}
                    className="flex-1 min-w-0 rounded-xl bg-zinc-950 border border-zinc-700 px-2 py-2 text-xs font-bold text-zinc-200 focus:outline-none focus:border-red-500"
                  >
                    <option value="">Copy from routine…</option>
                    {routines.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                )}
              </div>
            </div>
          ))}

          {draft.sessions.length < 21 && (
            <button onClick={addSession} className="w-full py-2.5 rounded-2xl border border-dashed border-zinc-700 text-xs font-bold text-zinc-300 hover:border-red-500/50 transition flex items-center justify-center gap-1.5">
              <Plus className="w-4 h-4" /> Add a session
            </button>
          )}

          {error && <div role="alert" className={errorBox}>{error}</div>}
        </div>

        <div className="absolute bottom-0 left-0 right-0 flex justify-center bg-zinc-950/95 border-t border-zinc-800 backdrop-blur-md">
          <div className="w-full max-w-md px-4 py-3 flex gap-2">
            <button onClick={close} className="px-4 py-3 rounded-2xl border border-zinc-700 text-sm font-bold text-zinc-300 hover:text-white transition">Cancel</button>
            <button onClick={() => void save()} disabled={saving} className="flex-1 py-3 rounded-2xl bg-red-600 text-white text-sm font-black hover:bg-red-500 active:scale-[0.99] transition disabled:opacity-50">
              {saving ? 'Saving…' : 'Save program'}
            </button>
          </div>
        </div>
      </div>

      {pickerFor && (
        <ExerciseLibraryModal
          exercises={exercises}
          onAddCustomExercise={onAddCustomExercise}
          onSelectExercise={(ex) => {
            patchSession(pickerFor, (x) => (x.exercises.length >= 30 ? x : { ...x, exercises: [...x.exercises, exerciseToProgram(ex)] }));
            setPickerFor(null);
          }}
          onClose={() => setPickerFor(null)}
        />
      )}
    </div>
  );
};

function swap(s: ProgramSession, a: number, b: number): ProgramSession {
  const list = [...s.exercises];
  [list[a], list[b]] = [list[b], list[a]];
  return { ...s, exercises: list };
}

function setEx(s: ProgramSession, i: number, patch: Partial<ProgramSession['exercises'][number]>): ProgramSession {
  return { ...s, exercises: s.exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)) };
}

/* ------------------------------------------------- one client's plan card */

export const ClientPlan: React.FC<{ api: ApiClient; clientId: string; clientName: string }> = ({ api, clientId, clientName }) => {
  const [state, setState] = useState<{ assignment: ProgramAssignment | null; completions: ProgramCompletion[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [openWeek, setOpenWeek] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.clientProgram(clientId);
      setState(r);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [api, clientId]);

  useEffect(() => { void load(); }, [load]);

  const today = localDateString(Date.now());
  const schedule = useMemo(
    () => (state?.assignment ? buildSchedule(state.assignment.startDate, state.assignment.program, state.completions, today) : null),
    [state, today]
  );
  useEffect(() => { if (schedule) setOpenWeek((w) => w ?? schedule.currentWeek); }, [schedule]);

  const end = async () => {
    if (!window.confirm(`End ${clientName}'s plan? They will no longer see it. Their logged workouts stay.`)) return;
    try {
      await api.endClientProgram(clientId);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className={`${card} p-3.5 space-y-3`}>
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wide flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5" /> Training plan</div>
        <button onClick={() => { haptics.light(); setAssigning(true); }} className="text-[11px] font-bold text-red-400 hover:text-red-300 transition">
          {state?.assignment ? 'Change plan' : 'Assign program'}
        </button>
      </div>

      {error && <div role="alert" className={errorBox}>{error}</div>}
      {!state && !error && <div className="text-xs text-zinc-500">Loading…</div>}
      {state && !state.assignment && <div className="text-xs text-zinc-400">{clientName} has no plan yet.</div>}

      {state?.assignment && schedule && (
        <>
          <div>
            <div className="text-sm font-black text-white">{state.assignment.program.name}</div>
            <div className="text-[11px] text-zinc-400">
              Starts {prettyDate(state.assignment.startDate)} ·{' '}
              {schedule.notStarted ? 'not started' : schedule.finished ? 'finished' : `week ${schedule.currentWeek + 1} of ${state.assignment.program.weeks}`}
            </div>
            <div className="text-xs text-white mt-1 font-bold">{describeAdherence(schedule)}</div>
            {state.assignment.program.perWeek && <div className="text-[11px] text-zinc-500 mt-1">This plan comes from a Google Sheet. Edit it there (Coach, then Sheets).</div>}
          </div>
          <div className="space-y-1.5">
            {schedule.weeks.map((wk) => {
              const open = openWeek === wk.week;
              const done = wk.sessions.filter((x) => x.status === 'done').length;
              return (
                <div key={wk.week} className="rounded-xl border border-zinc-800 overflow-hidden">
                  <button onClick={() => setOpenWeek(open ? null : wk.week)} aria-expanded={open} className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-zinc-800/40 transition">
                    <span className="text-xs font-bold text-white">Week {wk.week + 1}</span>
                    <span className="text-[11px] text-zinc-500">{done} of {wk.sessions.length} done</span>
                  </button>
                  {open && (
                    <div className="border-t border-zinc-800 divide-y divide-zinc-800/70">
                      {wk.sessions.map((x) => (
                        <div key={x.session.id} className="px-3 py-2 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs text-white truncate">{x.session.name}</div>
                            <div className="text-[11px] text-zinc-500">{prettyDate(x.date)}{x.completedAt ? ` · done ${new Date(x.completedAt).toLocaleDateString()}` : ''}</div>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border shrink-0 ${STATUS_STYLE[x.status].cls}`}>{STATUS_STYLE[x.status].label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button onClick={() => void end()} className="text-[11px] text-zinc-500 hover:text-red-400 transition">End plan</button>
        </>
      )}

      {assigning && (
        <AssignDialog
          api={api}
          clientId={clientId}
          clientName={clientName}
          replacing={!!state?.assignment}
          onClose={() => setAssigning(false)}
          onDone={() => { setAssigning(false); setOpenWeek(null); void load(); }}
        />
      )}
    </div>
  );
};

const AssignDialog: React.FC<{ api: ApiClient; clientId: string; clientName: string; replacing: boolean; onClose: () => void; onDone: () => void }> = ({
  api, clientId, clientName, replacing, onClose, onDone,
}) => {
  const [programs, setPrograms] = useState<ProgramSummary[] | null>(null);
  const [programId, setProgramId] = useState('');
  const [start, setStart] = useState(() => localDateString(Date.now()));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listPrograms().then((r) => { setPrograms(r.programs); setProgramId(r.programs[0]?.id ?? ''); }).catch((e) => { setError(errorMessage(e)); setPrograms([]); });
  }, [api]);

  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!programId) return;
    if (replacing && !window.confirm(`This replaces ${clientName}'s current plan. Continue?`)) return;
    setBusy(true);
    try {
      await api.assignProgram(programId, clientId, start);
      haptics.medium();
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label="Assign program">
      <form onSubmit={go} className="w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-white">Assign to {clientName}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        {programs === null && <div className="text-xs text-zinc-500">Loading…</div>}
        {programs?.length === 0 && !error && <div className="text-xs text-zinc-400">Make a program first (Coach tab, then Programs).</div>}
        {programs && programs.length > 0 && (
          <>
            <label htmlFor="assign-prog" className="block text-[11px] font-bold text-zinc-400">Program</label>
            <select id="assign-prog" value={programId} onChange={(e) => setProgramId(e.target.value)} className={input}>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.weeks} wk)</option>)}
            </select>
            <label htmlFor="assign-start" className="block text-[11px] font-bold text-zinc-400">Start date</label>
            <input id="assign-start" type="date" required value={start} onChange={(e) => setStart(e.target.value)} className={input} />
            <p className="text-[11px] text-zinc-500">Week 1 is the Monday to Sunday week that contains this date. Sessions earlier in that week are skipped.</p>
          </>
        )}
        {error && <div role="alert" className={errorBox}>{error}</div>}
        <button type="submit" disabled={busy || !programId || !start} className="w-full py-3 rounded-2xl bg-red-600 text-white text-sm font-black hover:bg-red-500 transition disabled:opacity-50">
          {busy ? 'Assigning…' : replacing ? 'Replace plan' : 'Assign program'}
        </button>
      </form>
    </div>
  );
};

/** Offered right after a new program is saved: pick a client and a start date. */
const AssignToClientDialog: React.FC<{
  api: ApiClient;
  program: { id: string; name: string };
  onClose: () => void;
  onDone: (clientName: string) => void;
}> = ({ api, program, onClose, onDone }) => {
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [clientId, setClientId] = useState('');
  const [start, setStart] = useState(() => localDateString(Date.now()));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listClients().then((r) => { setClients(r.clients); setClientId(r.clients[0]?.id ?? ''); }).catch((e) => { setError(errorMessage(e)); setClients([]); });
  }, [api]);

  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = clients?.find((c) => c.id === clientId);
    if (!client) return;
    setBusy(true);
    try {
      await api.assignProgram(program.id, client.id, start);
      haptics.medium();
      onDone(client.name);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label="Assign this program">
      <form onSubmit={go} className="w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-black text-white">Program saved</h3>
            <p className="text-xs text-zinc-400 mt-0.5">"{program.name}" is not visible to anyone until you assign it. Give it to a client now?</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Not now" className="p-1.5 text-zinc-400 hover:text-white shrink-0"><X className="w-5 h-5" /></button>
        </div>
        {clients === null && <div className="text-xs text-zinc-500">Loading…</div>}
        {clients?.length === 0 && !error && (
          <div className="text-xs text-zinc-400">You have no clients yet. Invite one from the Clients section, then open their page and choose Assign program.</div>
        )}
        {clients && clients.length > 0 && (
          <>
            <label htmlFor="nudge-client" className="block text-[11px] font-bold text-zinc-400">Client</label>
            <select id="nudge-client" value={clientId} onChange={(e) => setClientId(e.target.value)} className={input}>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label htmlFor="nudge-start" className="block text-[11px] font-bold text-zinc-400">Start date</label>
            <input id="nudge-start" type="date" required value={start} onChange={(e) => setStart(e.target.value)} className={input} />
            <p className="text-[11px] text-zinc-500">If they already have a plan, this replaces it.</p>
          </>
        )}
        {error && <div role="alert" className={errorBox}>{error}</div>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="px-4 py-3 rounded-2xl border border-zinc-700 text-sm font-bold text-zinc-300 hover:text-white transition">Not now</button>
          <button type="submit" disabled={busy || !clientId} className="flex-1 py-3 rounded-2xl bg-red-600 text-white text-sm font-black hover:bg-red-500 transition disabled:opacity-50">
            {busy ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      </form>
    </div>
  );
};
