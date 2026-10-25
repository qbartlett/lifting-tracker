import React, { useState } from 'react';
import { X, UserRound, RefreshCw, LogOut, Users, ShieldCheck, Cloud, CloudOff, AlertTriangle } from 'lucide-react';
import type { ApiUser } from '../api/client';
import type { Auth } from '../state/useAuth';
import { errorMessage } from '../state/useAuth';
import type { SyncStatus } from '../state/useSync';
import { haptics } from '../utils/haptics';

interface AccountModalProps {
  user: ApiUser | null;
  coach: Auth['coach'];
  notice: string | null;
  syncStatus: SyncStatus;
  lastSyncedAt: number | null;
  syncError: string | null;
  onLogin: Auth['login'];
  onRegister: Auth['register'];
  onLogout: () => Promise<void>;
  onLeaveCoach: () => Promise<void>;
  onDeleteAccount: (password: string) => Promise<void>;
  onSyncNow: () => void;
  onClose: () => void;
}

type Mode = 'signin' | 'join' | 'coach';

const field =
  'w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500';
const label = 'block text-[11px] font-bold text-zinc-400 mb-1';
const primary =
  'w-full py-3 rounded-2xl bg-red-600 text-white font-black text-xs hover:bg-red-500 active:scale-95 transition disabled:opacity-50 disabled:active:scale-100';

const statusText = (s: SyncStatus, last: number | null): string => {
  if (s === 'syncing') return 'Syncing…';
  if (s === 'offline') return 'Offline. Will sync when you are back online.';
  if (s === 'error') return 'Sync problem';
  if (last) return `Up to date · ${new Date(last).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  return 'Not synced yet';
};

export const AccountModal: React.FC<AccountModalProps> = (props) => {
  const { user } = props;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Account"
        className="relative w-full max-w-md max-h-[90vh] flex flex-col rounded-3xl border border-zinc-800 bg-zinc-900 shadow-2xl overflow-hidden ring-1 ring-red-500/20"
      >
        <div className="flex items-center justify-between p-4 pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-600/15 text-red-400 flex items-center justify-center">
              <UserRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Account</h3>
              <p className="text-xs text-zinc-400">{user ? 'Signed in' : 'Sync your training and work with a coach'}</p>
            </div>
          </div>
          <button
            onClick={props.onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {props.notice && !user && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">{props.notice}</div>
          )}
          {user ? <SignedIn {...props} user={user} /> : <SignedOut {...props} />}
        </div>
      </div>
    </div>
  );
};

const SignedOut: React.FC<AccountModalProps> = ({ onLogin, onRegister }) => {
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode !== 'signin' && password.length < 10) {
      setError('Choose a password with at least 10 characters.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signin') await onLogin(email, password);
      else if (mode === 'coach') await onRegister({ email, name, password });
      else await onRegister({ email, name, password, inviteCode: code });
      haptics.medium();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const tabs: { id: Mode; text: string }[] = [
    { id: 'signin', text: 'Sign in' },
    { id: 'join', text: 'Join my coach' },
    { id: 'coach', text: "I'm a coach" },
  ];

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <div role="tablist" className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-zinc-950 border border-zinc-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={mode === t.id}
            onClick={() => { setMode(t.id); setError(null); }}
            className={`py-2 rounded-lg text-[11px] font-bold transition ${mode === t.id ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'}`}
          >
            {t.text}
          </button>
        ))}
      </div>

      {mode === 'join' && (
        <div>
          <label htmlFor="acct-code" className={label}>Invite code from your coach</label>
          <input id="acct-code" className={`${field} font-mono tracking-widest uppercase`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXXX-XXXXX" autoComplete="off" required />
        </div>
      )}
      {mode !== 'signin' && (
        <div>
          <label htmlFor="acct-name" className={label}>Your name</label>
          <input id="acct-name" className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={100} />
        </div>
      )}
      <div>
        <label htmlFor="acct-email" className={label}>Email</label>
        <input id="acct-email" type="email" className={field} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
      </div>
      <div>
        <label htmlFor="acct-pw" className={label}>Password{mode !== 'signin' && ' (10+ characters)'}</label>
        <input id="acct-pw" type="password" className={field} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required />
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{error}</div>}

      <button type="submit" disabled={busy} className={primary}>
        {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'join' ? 'Join my coach' : 'Create coach account'}
      </button>

      {mode === 'join' && (
        <p className="text-[11px] text-zinc-500 flex gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
          Your coach will be able to see your workouts, routines and progress. They cannot change your data, and you can leave at any time.
        </p>
      )}
      <p className="text-[11px] text-zinc-500">The app works without an account. Signing in adds cloud sync across your devices.</p>
    </form>
  );
};

const SignedIn: React.FC<AccountModalProps & { user: ApiUser }> = ({
  user, coach, syncStatus, lastSyncedAt, syncError, onSyncNow, onLogout, onLeaveCoach, onDeleteAccount, onClose,
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [password, setPassword] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const StatusIcon = syncStatus === 'offline' ? CloudOff : syncStatus === 'error' ? AlertTriangle : Cloud;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-black text-white truncate">{user.name}</div>
            <div className="text-xs text-zinc-400 truncate">{user.email}</div>
          </div>
          <span className="text-[10px] font-black uppercase tracking-wide text-red-400 bg-red-600/15 border border-red-500/30 rounded-lg px-2 py-1">
            {user.role}
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <StatusIcon className={`w-4 h-4 shrink-0 ${syncStatus === 'error' ? 'text-amber-400' : syncStatus === 'offline' ? 'text-zinc-500' : 'text-emerald-400'}`} />
          <div className="min-w-0">
            <div className="text-xs font-bold text-white">Cloud sync</div>
            <div className="text-[11px] text-zinc-400 truncate" aria-live="polite">{statusText(syncStatus, lastSyncedAt)}</div>
            {syncError && <div className="text-[11px] text-amber-400">{syncError}</div>}
          </div>
        </div>
        <button
          onClick={() => { haptics.light(); onSyncNow(); }}
          disabled={syncStatus === 'syncing'}
          aria-label="Sync now"
          className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:border-red-500/50 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {user.role === 'client' && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3.5 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-white">
            <Users className="w-4 h-4 text-red-500" />
            {coach ? `Your coach: ${coach.name}` : 'You are not linked to a coach'}
          </div>
          {coach && (
            <>
              <p className="text-[11px] text-zinc-400">
                {coach.name} can see your workouts, routines and progress. They cannot change your data.
              </p>
              <button
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Stop sharing your training with ${coach.name}? Your own data stays on your account.`)) {
                    void run(onLeaveCoach);
                  }
                }}
                className="text-[11px] font-bold text-zinc-400 hover:text-red-400 transition"
              >
                Leave coach
              </button>
            </>
          )}
        </div>
      )}

      {user.role === 'coach' && (
        <p className="text-[11px] text-zinc-400">Use the Coach tab to invite clients and review their training.</p>
      )}

      {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{error}</div>}

      <button
        disabled={busy}
        onClick={() => void run(async () => { await onLogout(); onClose(); })}
        className="w-full py-3 rounded-2xl bg-zinc-800 text-white font-black text-xs hover:bg-zinc-700 active:scale-95 transition flex items-center justify-center gap-2"
      >
        <LogOut className="w-4 h-4" /> Sign out
      </button>
      <p className="text-[11px] text-zinc-500 text-center">Signing out keeps your data on this device.</p>

      <div className="pt-2 border-t border-zinc-800">
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="w-full py-2 text-center text-xs text-zinc-500 hover:text-red-400 transition">
            Delete my account
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => onDeleteAccount(password));
            }}
            className="space-y-2.5"
          >
            <p className="text-[11px] text-zinc-400">
              This permanently deletes your account and everything synced to the cloud{user.role === 'coach' ? ', and unlinks your clients' : ''}. Data on this device is kept.
            </p>
            <label htmlFor="del-pw" className={label}>Confirm your password</label>
            <input id="del-pw" type="password" className={field} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            <div className="flex gap-2">
              <button type="button" onClick={() => { setConfirmDelete(false); setPassword(''); }} className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-200 text-xs font-bold">Cancel</button>
              <button type="submit" disabled={busy} className="flex-1 py-2.5 rounded-xl bg-red-700 text-white text-xs font-black disabled:opacity-50">Delete account</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
