import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, ExternalLink, FileSpreadsheet, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { ApiClient, ClientSummary, SheetLink, SheetMapping, SheetsOverview } from '../api/client';
import { errorMessage } from '../state/useAuth';
import { localDateString } from '../domain/program';
import { haptics } from '../utils/haptics';

const card = 'rounded-2xl border border-zinc-800 bg-zinc-900';
const errorBox = 'rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300';
const field = 'w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500';

/** "3 min ago", "just now". */
export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export const SheetsSection: React.FC<{ api: ApiClient }> = ({ api }) => {
  const [overview, setOverview] = useState<SheetsOverview | null>(null);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, c] = await Promise.all([api.sheets(), api.listClients()]);
      setOverview(o);
      setClients(c.clients);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  /** Replace one link with the fresh copy the server sent back. */
  const replaceLink = (link: SheetLink) =>
    setOverview((o) => (o ? { ...o, links: o.links.some((l) => l.id === link.id) ? o.links.map((l) => (l.id === link.id ? link : l)) : [...o.links, link] } : o));

  if (!overview) {
    return error ? <div role="alert" className={errorBox}>{error}</div> : <div className="text-xs text-zinc-500 text-center py-6">Loading…</div>;
  }

  if (!overview.enabled) {
    return (
      <div className={`${card} p-4 space-y-2`}>
        <div className="text-sm font-black text-white flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-red-500" /> Google Sheets</div>
        <p className="text-xs text-zinc-400">
          Run each athlete's plan from a Google Sheet. This server has not been connected to Google yet. Whoever runs the server needs to add a Google service account; the steps are in the hosting guide (deploy/README.md, "Google Sheets").
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <div role="alert" className={errorBox}>{error}</div>}
      <ConnectCard api={api} email={overview.serviceAccountEmail} header={overview.templateHeader} onConnected={(l) => replaceLink(l)} />
      {overview.links.map((link) => (
        <LinkCard
          key={link.id}
          api={api}
          link={link}
          clients={clients}
          onChange={replaceLink}
          onRemoved={() => setOverview((o) => (o ? { ...o, links: o.links.filter((l) => l.id !== link.id) } : o))}
        />
      ))}
    </div>
  );
};

/* ------------------------------------------------------------- connect */

const ConnectCard: React.FC<{ api: ApiClient; email: string | null; header: string[]; onConnected: (l: SheetLink) => void }> = ({ api, email, header, onConnected }) => {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked: the address is still on screen to select */ }
  };

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onConnected(await api.connectSheet(url.trim()));
      haptics.medium();
      setUrl('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={connect} className={`${card} p-4 space-y-3`}>
      <div className="text-sm font-black text-white flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-red-500" /> Connect a Google Sheet</div>
      <ol className="text-xs text-zinc-400 space-y-1.5 list-decimal list-inside">
        <li>Open your Google Sheet (or make a new one).</li>
        <li>
          Click <span className="text-zinc-200 font-bold">Share</span> and add this address as an <span className="text-zinc-200 font-bold">Editor</span>:
          <div className="mt-1.5 flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate rounded-lg bg-zinc-950 border border-zinc-800 px-2.5 py-1.5 text-[11px] text-zinc-200 select-all">{email}</code>
            <button type="button" onClick={() => void copy()} aria-label="Copy address" className="p-2 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white transition shrink-0">
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </li>
        <li>Paste the sheet's link below.</li>
      </ol>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." aria-label="Google Sheet link" className={field} />
      {error && <div role="alert" className={errorBox}>{error}</div>}
      <button type="submit" disabled={busy || url.trim() === ''} className="w-full py-3 rounded-2xl bg-red-600 text-white text-sm font-black hover:bg-red-500 transition disabled:opacity-50">
        {busy ? 'Connecting…' : 'Connect sheet'}
      </button>
      <details className="text-xs text-zinc-400">
        <summary className="cursor-pointer text-zinc-300 font-bold">How each athlete's tab should look</summary>
        <p className="mt-2">One tab per athlete. Row 1 has these column names, then one row per exercise:</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {header.map((h) => <span key={h} className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-200 text-[11px] font-bold">{h}</span>)}
        </div>
        <ul className="mt-2 space-y-1 list-disc list-inside">
          <li><b>Week</b>: 1, 2, 3 … A week you leave out is a rest week.</li>
          <li><b>Day</b>: Mon to Sun (or 1 to 7).</li>
          <li><b>Session</b>: a name such as Push. Rows with the same week, day and session form one workout.</li>
          <li><b>Reps</b>: 8, or a range like 8-10, or 5+.</li>
          <li><b>Rest</b>: seconds (90), or 2m, or 1:30. Blank means 2 minutes.</li>
        </ul>
        <p className="mt-2">If any cell is wrong, the athlete keeps their previous plan and you will see exactly which cells to fix.</p>
      </details>
    </form>
  );
};

/* ------------------------------------------------------------ one sheet */

const LinkCard: React.FC<{
  api: ApiClient;
  link: SheetLink;
  clients: ClientSummary[];
  onChange: (l: SheetLink) => void;
  onRemoved: () => void;
}> = ({ api, link, clients, onChange, onRemoved }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newClient, setNewClient] = useState('');
  const [newStart, setNewStart] = useState(() => localDateString(Date.now()));

  const byTab = useMemo(() => new Map(link.mappings.map((m) => [m.tab, m])), [link.mappings]);
  const taken = useMemo(() => new Set(link.mappings.map((m) => m.clientId)), [link.mappings]);
  const free = clients.filter((c) => !taken.has(c.id));

  const act = async (what: string, f: () => Promise<SheetLink | void>) => {
    setBusy(what);
    setError(null);
    try {
      const r = await f();
      if (r) onChange(r);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const disconnect = () => {
    if (!window.confirm(`Disconnect "${link.title}"? Athletes lose the plans that come from this sheet. The sheet itself is not changed.`)) return;
    void act('remove', async () => { await api.disconnectSheet(link.id); onRemoved(); });
  };

  return (
    <div className={`${card} p-4 space-y-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-black text-white truncate">{link.title}</div>
          <div className="text-[11px] text-zinc-500">Last read {timeAgo(link.lastSyncedAt)}</div>
        </div>
        <div className="flex items-center shrink-0">
          <a href={link.url} target="_blank" rel="noopener noreferrer" aria-label="Open the sheet in Google" className="p-2 text-zinc-400 hover:text-white transition"><ExternalLink className="w-4 h-4" /></a>
          <button onClick={() => void act('sync', () => api.syncSheet(link.id))} disabled={busy !== null} aria-label="Read the sheet now" className="p-2 text-zinc-400 hover:text-white transition disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${busy === 'sync' ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={disconnect} disabled={busy !== null} aria-label="Disconnect sheet" className="p-2 text-zinc-500 hover:text-red-400 transition disabled:opacity-50"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>

      {link.lastError && <div role="alert" className={errorBox}>Could not read the sheet: {link.lastError}</div>}
      {error && <div role="alert" className={errorBox}>{error}</div>}

      <div className="space-y-2">
        {link.tabs.length === 0 && <div className="text-xs text-zinc-500">This sheet has no tabs.</div>}
        {link.tabs.map((tab) => (
          <TabRow
            key={tab}
            tab={tab}
            mapping={byTab.get(tab)}
            clients={clients}
            taken={taken}
            busy={busy !== null}
            onMap={(clientId, startDate) => void act(`map:${tab}`, () => api.mapSheetTab(link.id, tab, clientId, startDate))}
          />
        ))}
      </div>

      {free.length > 0 && (
        <div className="rounded-xl border border-dashed border-zinc-700 p-3 space-y-2">
          <div className="text-[11px] font-bold text-zinc-300 flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Add a tab for an athlete</div>
          <div className="flex gap-2">
            <select aria-label="Athlete for the new tab" value={newClient} onChange={(e) => setNewClient(e.target.value)} className="flex-1 min-w-0 rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-2 text-xs text-white focus:outline-none focus:border-red-500">
              <option value="">Choose an athlete…</option>
              {free.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="date" aria-label="Start date" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-2 text-xs text-white focus:outline-none focus:border-red-500" />
          </div>
          <button
            disabled={!newClient || !newStart || busy !== null}
            onClick={() => void act('add', async () => { const r = await api.addSheetTab(link.id, newClient, newStart); setNewClient(''); return r; })}
            className="w-full py-2 rounded-xl border border-zinc-700 text-xs font-bold text-zinc-200 hover:border-red-500/50 transition disabled:opacity-50"
          >
            {busy === 'add' ? 'Creating…' : 'Create tab with the template'}
          </button>
        </div>
      )}
    </div>
  );
};

const TabRow: React.FC<{
  tab: string;
  mapping: SheetMapping | undefined;
  clients: ClientSummary[];
  taken: Set<string>;
  busy: boolean;
  onMap: (clientId: string | null, startDate: string) => void;
}> = ({ tab, mapping, clients, taken, busy, onMap }) => {
  const [start, setStart] = useState(mapping?.startDate ?? localDateString(Date.now()));
  useEffect(() => { if (mapping) setStart(mapping.startDate); }, [mapping]);
  const choices = clients.filter((c) => !taken.has(c.id) || c.id === mapping?.clientId);
  const problems = mapping?.problems ?? [];

  return (
    <div className="rounded-xl border border-zinc-800 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-bold text-white truncate">{tab}</div>
        {mapping && problems.length === 0 && mapping.hasPlan && <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg border text-emerald-400 bg-emerald-500/10 border-emerald-500/30 shrink-0">Plan live</span>}
        {mapping && problems.length > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg border text-amber-400 bg-amber-500/10 border-amber-500/30 shrink-0 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{problems.length} to fix</span>}
      </div>
      <div className="flex gap-2">
        <select
          aria-label={`Athlete for ${tab}`}
          value={mapping?.clientId ?? ''}
          disabled={busy}
          onChange={(e) => onMap(e.target.value === '' ? null : e.target.value, start)}
          className="flex-1 min-w-0 rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-2 text-xs text-white focus:outline-none focus:border-red-500 disabled:opacity-50"
        >
          <option value="">Not linked</option>
          {choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {mapping && (
          <input
            type="date"
            aria-label={`Start date for ${tab}`}
            value={start}
            disabled={busy}
            onChange={(e) => setStart(e.target.value)}
            onBlur={() => { if (start && start !== mapping.startDate) onMap(mapping.clientId, start); }}
            className="rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-2 text-xs text-white focus:outline-none focus:border-red-500 disabled:opacity-50"
          />
        )}
      </div>
      {problems.length > 0 && (
        <ul className="space-y-1" aria-label={`Problems in ${tab}`}>
          {problems.slice(0, 8).map((p, i) => (
            <li key={i} className="text-[11px] text-amber-300">
              {p.row > 0 ? `Row ${p.row}${p.column ? `, ${p.column}` : ''}: ` : ''}{p.message}
            </li>
          ))}
          {problems.length > 8 && <li className="text-[11px] text-zinc-500">…and {problems.length - 8} more</li>}
          {mapping?.hasPlan && <li className="text-[11px] text-zinc-500">The athlete still sees the last good version until this is fixed.</li>}
        </ul>
      )}
    </div>
  );
};
