import React, { useCallback, useEffect, useState } from 'react';
import {
  UserPlus, Copy, Check, ChevronLeft, ChevronRight, Users, Trash2, Clock, Trophy, RefreshCw,
} from 'lucide-react';
import type { ApiClient, ClientSummary as ClientRow, InviteSummary } from '../api/client';
import { errorMessage } from '../state/useAuth';
import { applyRemoteChanges, type Snapshot } from '../sync/docs';
import { describeLastWorkout, summarizeTraining } from '../domain/coachStats';
import type { CompletedWorkout, WeightUnit } from '../types/lifting';
import { haptics } from '../utils/haptics';

interface CoachViewProps {
  api: ApiClient;
  unit: WeightUnit;
}

const card = 'rounded-2xl border border-zinc-800 bg-zinc-900';
const errorBox = 'rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300';

export const CoachView: React.FC<CoachViewProps> = ({ api, unit }) => {
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [invites, setInvites] = useState<InviteSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ClientRow | null>(null);
  const [newInvite, setNewInvite] = useState<{ code: string; expiresAt: string; label: string | null } | null>(null);
  const [label, setLabel] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, i] = await Promise.all([api.listClients(), api.listInvites()]);
      setClients(c.clients);
      setInvites(i.invites.filter((x) => x.status === 'pending'));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
      setClients((prev) => prev ?? []);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const createInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const inv = await api.createInvite(label.trim() || undefined);
      setNewInvite({ code: inv.code, expiresAt: inv.expiresAt, label: inv.label });
      setLabel('');
      setCopied(false);
      haptics.medium();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!newInvite) return;
    try {
      await navigator.clipboard.writeText(newInvite.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the code is on screen to read out */
    }
  };

  const revoke = async (id: string) => {
    try {
      await api.revokeInvite(id);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (selected) {
    return (
      <ClientDetail
        api={api}
        client={selected}
        unit={unit}
        onBack={() => { setSelected(null); void load(); }}
      />
    );
  }

  const now = Date.now();
  return (
    <div className="pt-4 pb-32 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
          <Users className="w-5 h-5 text-red-500" /> Clients
        </h2>
        <button
          onClick={() => { haptics.light(); void load(); }}
          aria-label="Refresh"
          className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-900 transition"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {error && <div role="alert" className={errorBox}>{error}</div>}

      <form onSubmit={createInvite} className={`${card} p-3.5 space-y-2.5`}>
        <label htmlFor="invite-label" className="block text-[11px] font-bold text-zinc-400">Invite a new client</label>
        <div className="flex gap-2">
          <input
            id="invite-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Their name (optional)"
            maxLength={100}
            className="flex-1 min-w-0 rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500"
          />
          <button
            type="submit"
            disabled={busy}
            className="px-3.5 rounded-xl bg-red-600 text-white text-xs font-black flex items-center gap-1.5 hover:bg-red-500 active:scale-95 transition disabled:opacity-50"
          >
            <UserPlus className="w-4 h-4" /> Invite
          </button>
        </div>
        {newInvite && (
          <div className="rounded-xl border border-red-500/40 bg-red-600/10 p-3 space-y-1.5">
            <div className="text-[11px] text-zinc-300">
              Give this code to {newInvite.label || 'your client'}. It works once and expires {new Date(newInvite.expiresAt).toLocaleDateString()}. It will not be shown again.
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-lg font-black tracking-widest text-white select-all">{newInvite.code}</span>
              <button type="button" onClick={copy} className="flex items-center gap-1 text-[11px] font-bold text-zinc-300 hover:text-white">
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="text-[11px] text-zinc-400">They open the app, choose Account, then "Join my coach".</div>
          </div>
        )}
      </form>

      {invites.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wide">Waiting to join</div>
          {invites.map((i) => (
            <div key={i.id} className={`${card} px-3.5 py-2.5 flex items-center justify-between`}>
              <div className="text-xs text-zinc-300">
                {i.label || 'Unnamed invite'} <span className="text-zinc-500">· expires {new Date(i.expiresAt).toLocaleDateString()}</span>
              </div>
              <button onClick={() => void revoke(i.id)} aria-label="Revoke invite" className="p-1.5 text-zinc-500 hover:text-red-400 transition">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {clients === null && <div className="text-xs text-zinc-500 text-center py-6">Loading…</div>}
        {clients?.length === 0 && !error && (
          <div className="rounded-3xl border border-dashed border-zinc-800 p-8 text-center text-zinc-500 text-xs">
            No clients yet. Send an invite code to get started.
          </div>
        )}
        {clients?.map((c) => (
          <button
            key={c.id}
            onClick={() => { haptics.light(); setSelected(c); }}
            className={`${card} w-full p-3.5 flex items-center justify-between text-left hover:border-red-500/40 transition active:scale-[0.99]`}
          >
            <div className="min-w-0">
              <div className="text-sm font-black text-white truncate">{c.name}</div>
              <div className="text-[11px] text-zinc-400">{describeLastWorkout(c.lastWorkoutAt, now)}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
};

const emptySnapshot = (): Snapshot => ({
  history: [], routines: [], exercises: [], progression: {},
  settings: {
    weightUnit: 'lbs', barWeight: 45, soundEnabled: false, hapticsEnabled: false,
    defaultRestTimeSeconds: 120, keepScreenAwake: false, theme: 'dark',
  },
});

const ClientDetail: React.FC<{ api: ApiClient; client: ClientRow; unit: WeightUnit; onBack: () => void }> = ({
  api, client, unit, onBack,
}) => {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let snap = emptySnapshot();
        let since = 0;
        for (;;) {
          const page = await api.pullClient(client.id, since, 500);
          snap = applyRemoteChanges(snap, page.changes);
          since = page.cursor;
          if (!page.hasMore) break;
        }
        if (!cancelled) setData(snap);
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      }
    })();
    return () => { cancelled = true; };
  }, [api, client.id]);

  const remove = async () => {
    if (!window.confirm(`Remove ${client.name}? You will no longer be able to see their training.`)) return;
    try {
      await api.removeClient(client.id);
      onBack();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const now = Date.now();
  const summary = data ? summarizeTraining(data.history, now) : null;
  const lifts = data ? Object.values(data.progression) : [];
  const dateText = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="pt-4 pb-32 space-y-4">
      <button onClick={() => { haptics.light(); onBack(); }} className="flex items-center gap-1 text-xs font-bold text-zinc-400 hover:text-white transition">
        <ChevronLeft className="w-4 h-4" /> All clients
      </button>
      <div>
        <h2 className="text-xl font-black text-white tracking-tight">{client.name}</h2>
        <div className="text-xs text-zinc-400">{client.email}</div>
      </div>

      {error && <div role="alert" className={errorBox}>{error}</div>}
      {!data && !error && <div className="text-xs text-zinc-500 text-center py-6">Loading…</div>}

      {data && summary && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['Last 7 days', `${summary.workoutsLast7Days}`, 'workouts'],
              ['Last 30 days', `${summary.workoutsLast30Days}`, 'workouts'],
              ['30-day volume', summary.volumeLast30Days.toLocaleString(), unit],
            ].map(([title, value, sub]) => (
              <div key={title} className={`${card} p-3 text-center`}>
                <div className="text-[10px] font-bold text-zinc-500 uppercase">{title}</div>
                <div className="text-lg font-black text-white tabular-nums">{value}</div>
                <div className="text-[10px] text-zinc-500">{sub}</div>
              </div>
            ))}
          </div>
          <div className="text-xs text-zinc-400">{describeLastWorkout(summary.lastWorkoutAt, now)}</div>

          {lifts.length > 0 && (
            <div className={`${card} p-3.5`}>
              <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wide mb-2">Working weights</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {lifts.map((l) => (
                  <div key={l.exerciseId} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300 truncate">{l.name}</span>
                    <span className="font-mono font-bold text-white tabular-nums">{l.currentWeight} {unit}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wide">Recent workouts</div>
            {data.history.length === 0 && (
              <div className="rounded-3xl border border-dashed border-zinc-800 p-6 text-center text-zinc-500 text-xs">
                {client.name} has not logged a workout yet.
              </div>
            )}
            {data.history.slice(0, 50).map((w: CompletedWorkout) => {
              const isOpen = open === w.id;
              return (
                <div key={w.id} className={`${card} overflow-hidden`}>
                  <button
                    onClick={() => setOpen(isOpen ? null : w.id)}
                    aria-expanded={isOpen}
                    className="w-full p-3.5 text-left hover:bg-zinc-800/40 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-bold text-red-500">{dateText(w.startTime)}</div>
                        <div className="text-sm font-black text-white">{w.name}</div>
                      </div>
                      {!!w.prCount && (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-red-400 bg-red-600/15 px-2 py-0.5 rounded-lg border border-red-500/30">
                          <Trophy className="w-3 h-3" /> {w.prCount} PR
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-zinc-400">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{Math.round(w.durationSeconds / 60)} min</span>
                      <span>{w.totalSets} sets</span>
                      <span>{w.totalVolume.toLocaleString()} {unit}</span>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-zinc-800 p-3.5 space-y-2.5">
                      {w.exercises.map((we) => (
                        <div key={we.id}>
                          <div className="text-xs font-bold text-white">{we.exercise.name}</div>
                          <div className="text-[11px] text-zinc-400 font-mono tabular-nums">
                            {we.sets.filter((s) => s.completed).map((s) => `${s.weight}×${s.reps}`).join('  ') || 'No sets completed'}
                          </div>
                          {we.notes && <div className="text-[11px] text-zinc-500 italic">{we.notes}</div>}
                        </div>
                      ))}
                      {w.notes && <div className="text-[11px] text-zinc-500">{w.notes}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button onClick={() => void remove()} className="w-full py-2 text-center text-xs text-zinc-500 hover:text-red-400 transition">
            Remove this client
          </button>
        </>
      )}
    </div>
  );
};
