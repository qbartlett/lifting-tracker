import React from 'react';
import { Disc, Settings, Timer, FileSpreadsheet, Dumbbell, QrCode, UserRound } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { haptics } from '../utils/haptics';

interface TopBarProps {
  hasActiveWorkout: boolean;
  onOpenPlateCalc: () => void;
  onOpen1RMCalc: () => void;
  onOpenSettings: () => void;
  onOpenSpreadsheetHub?: () => void;
  onTriggerRestTimer?: () => void;
  onOpenMobileTest?: () => void;
  /** Omit to hide the account button (no server configured). */
  onOpenAccount?: () => void;
  signedIn?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  hasActiveWorkout,
  onOpenPlateCalc,
  onOpen1RMCalc,
  onOpenSettings,
  onOpenSpreadsheetHub,
  onTriggerRestTimer,
  onOpenMobileTest,
  onOpenAccount,
  signedIn = false,
}) => {
  return (
    <header className="sticky top-0 z-30 h-14 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80 px-3.5 sm:px-4 flex items-center justify-between">
      {/* Zone 1: Wordmark */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-red-700 via-red-600 to-red-500 text-white font-black text-xs shadow-md shadow-red-600/30">
          <Dumbbell className="w-4 h-4" />
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="text-base font-black tracking-tight text-white">
              Lifting Tracker
            </span>
            {hasActiveWorkout && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/15 px-2 py-0.5 rounded-full border border-red-500/30 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                LIVE
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Zone 3: Actions */}
      <div className="flex items-center gap-1">
        {/* Test on Phone QR Button */}
        {onOpenMobileTest && (
          <button
            onClick={() => {
              haptics.light();
              onOpenMobileTest();
            }}
            title="Scan QR to Test on Phone"
            className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-red-500/50 hover:bg-zinc-800/80 text-red-400 hover:text-white transition active:scale-95"
          >
            <QrCode className="w-4 h-4 text-red-500" />
            <span className="text-[11px] font-bold hidden sm:inline">Phone</span>
          </button>
        )}

        <PWAInstallButton compact />

        {/* Quick Plate Calculator */}
        <button
          onClick={() => {
            haptics.light();
            onOpenPlateCalc();
          }}
          title="Barbell Plate Calculator"
          className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-red-500/50 hover:bg-zinc-800/80 text-zinc-300 hover:text-white transition active:scale-95"
        >
          <Disc className="w-4 h-4 text-red-500" />
          <span className="text-[11px] font-bold hidden sm:inline">Plates</span>
        </button>

        {/* Quick Rest Timer Trigger */}
        {onTriggerRestTimer && (
          <button
            onClick={() => {
              haptics.light();
              onTriggerRestTimer();
            }}
            title="Start Rest Timer"
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-red-500/50 hover:bg-zinc-800/80 text-red-400 hover:text-red-300 transition active:scale-95"
          >
            <Timer className="w-4 h-4" />
          </button>
        )}

        {/* Spreadsheet Sync */}
        {onOpenSpreadsheetHub && (
          <button
            onClick={() => {
              haptics.light();
              onOpenSpreadsheetHub();
            }}
            title="Spreadsheet Data Hub"
            className="p-2 rounded-xl text-emerald-400 hover:text-emerald-300 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
          </button>
        )}

        {/* Account */}
        {onOpenAccount && (
          <button
            onClick={() => {
              haptics.light();
              onOpenAccount();
            }}
            title={signedIn ? 'Account' : 'Sign in'}
            aria-label={signedIn ? 'Account' : 'Sign in'}
            className={`p-2 rounded-xl hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition ${
              signedIn ? 'text-emerald-400 hover:text-emerald-300' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <UserRound className="w-4 h-4" />
          </button>
        )}

        {/* Settings */}
        <button
          onClick={() => {
            haptics.light();
            onOpenSettings();
          }}
          title="Settings"
          className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
