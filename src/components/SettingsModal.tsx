import React, { useState } from 'react';
import {
  X,
  Volume2,
  Smartphone,
  Eye,
  Disc,
  Award,
  Download,
  Upload,
  Timer,
  QrCode,
} from 'lucide-react';
import { UserSettings } from '../types/lifting';
import { haptics } from '../utils/haptics';
import { PWAInstallButton } from './PWAInstallButton';
import { wakeLockService } from '../utils/wakeLock';

interface SettingsModalProps {
  settings: UserSettings;
  onUpdateSettings: (settings: UserSettings) => void;
  onExportBackup: () => string;
  onImportBackup: (json: string) => boolean;
  onResetData: () => void;
  onOpenPlateCalc: () => void;
  onOpen1RMCalc: () => void;
  onOpenMobileTest?: () => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onUpdateSettings,
  onExportBackup,
  onImportBackup,
  onResetData,
  onOpenPlateCalc,
  onOpen1RMCalc,
  onOpenMobileTest,
  onClose,
}) => {
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const toggleUnit = (unit: 'kg' | 'lbs') => {
    haptics.light();
    onUpdateSettings({
      ...settings,
      weightUnit: unit,
      barWeight: unit === 'lbs' ? 45 : 20,
    });
  };

  const handleExportData = () => {
    haptics.medium();
    const json = onExportBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lifting-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const success = onImportBackup(content);
      if (success) {
        haptics.celebratePR();
        setImportStatus('Backup restored successfully! Refreshing...');
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } else {
        setImportStatus('Failed to restore backup: Invalid JSON.');
      }
    };
    reader.readAsText(file);
  };

  const toggleWakeLock = async () => {
    haptics.light();
    const nextVal = !settings.keepScreenAwake;
    if (nextVal) {
      await wakeLockService.request();
    } else {
      await wakeLockService.release();
    }
    onUpdateSettings({ ...settings, keepScreenAwake: nextVal });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="relative w-full max-w-md max-h-[90vh] flex flex-col rounded-3xl border border-zinc-800 bg-zinc-900 shadow-2xl overflow-hidden ring-1 ring-red-500/20">
        {/* Header */}
        <div className="flex items-center justify-between p-4 pb-3 border-b border-zinc-800">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Settings & Preferences
            </h3>
            <p className="text-xs text-zinc-400">
              Lifting Tracker configuration
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Test on Mobile Quick Trigger */}
          {onOpenMobileTest && (
            <button
              onClick={() => {
                onClose();
                onOpenMobileTest();
              }}
              className="w-full p-3.5 rounded-2xl bg-gradient-to-r from-red-600/20 to-zinc-900 border border-red-500/40 hover:border-red-500 flex items-center justify-between transition shadow-md active:scale-98"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-md shadow-red-600/30">
                  <QrCode className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <span className="text-xs font-black text-white block">
                    Test on Your Phone
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    Scan QR code to install on Android
                  </span>
                </div>
              </div>
              <span className="text-xs font-bold text-red-400">Open QR &rarr;</span>
            </button>
          )}

          {/* PWA Install Banner */}
          <PWAInstallButton />

          {/* Unit Toggle */}
          <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-white block">Weight Units</span>
              <span className="text-[11px] text-zinc-400">
                Barbell standard: {settings.barWeight} {settings.weightUnit}
              </span>
            </div>
            <div className="flex items-center gap-1 p-1 bg-zinc-900 rounded-xl border border-zinc-800">
              <button
                onClick={() => toggleUnit('lbs')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  settings.weightUnit === 'lbs'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                LBS
              </button>
              <button
                onClick={() => toggleUnit('kg')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  settings.weightUnit === 'kg'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                KG
              </button>
            </div>
          </div>

          {/* Rest Interval Default */}
          <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-red-500">
                <Timer className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-white block">
                  Default Rest Interval
                </span>
                <span className="text-[11px] text-zinc-400">
                  Timer duration triggered on set complete
                </span>
              </div>
            </div>

            <select
              value={settings.defaultRestTimeSeconds}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  defaultRestTimeSeconds: parseInt(e.target.value, 10),
                })
              }
              className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-bold rounded-lg px-2.5 py-1.5 focus:border-red-500 focus:outline-none"
            >
              <option value={60}>60s (1m)</option>
              <option value={90}>90s (1.5m)</option>
              <option value={120}>120s (2m)</option>
              <option value={180}>180s (3m)</option>
              <option value={300}>300s (5m)</option>
            </select>
          </div>

          {/* Audio & Haptic Switches */}
          <div className="space-y-2">
            {/* Audio */}
            <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300">
                  <Volume2 className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">
                    Rest Timer Audio Chimes
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    Countdown ticks and interval finish sound
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  haptics.light();
                  onUpdateSettings({
                    ...settings,
                    soundEnabled: !settings.soundEnabled,
                  });
                }}
                className={`w-12 h-6 rounded-full transition-colors relative ${
                  settings.soundEnabled ? 'bg-red-600' : 'bg-zinc-800'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                    settings.soundEnabled ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>

            {/* Haptics */}
            <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">
                    Android Haptic Vibration
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    Physical pulse on set completion & timer
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  haptics.medium();
                  onUpdateSettings({
                    ...settings,
                    hapticsEnabled: !settings.hapticsEnabled,
                  });
                }}
                className={`w-12 h-6 rounded-full transition-colors relative ${
                  settings.hapticsEnabled ? 'bg-red-600' : 'bg-zinc-800'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                    settings.hapticsEnabled ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>

            {/* Keep Screen Awake */}
            <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-emerald-400">
                  <Eye className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">
                    Keep Screen Awake (Wake Lock)
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    Prevents screen lock during gym sessions
                  </span>
                </div>
              </div>
              <button
                onClick={toggleWakeLock}
                className={`w-12 h-6 rounded-full transition-colors relative ${
                  settings.keepScreenAwake ? 'bg-red-600' : 'bg-zinc-800'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                    settings.keepScreenAwake ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Quick Calculators */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
              Gym Tools
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => {
                  onClose();
                  onOpenPlateCalc();
                }}
                className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 hover:border-red-500/50 text-left flex items-center gap-2.5 active:scale-98 transition"
              >
                <Disc className="w-5 h-5 text-red-500 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-white block">
                    Plate Loader
                  </span>
                  <span className="text-[10px] text-zinc-400">Barbell visualizer</span>
                </div>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onOpen1RMCalc();
                }}
                className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 hover:border-red-500/50 text-left flex items-center gap-2.5 active:scale-98 transition"
              >
                <Award className="w-5 h-5 text-red-400 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-white block">
                    1RM Calculator
                  </span>
                  <span className="text-[10px] text-zinc-400">Strength projections</span>
                </div>
              </button>
            </div>
          </div>

          {/* Data Backup & Restore */}
          <div className="space-y-2 pt-2 border-t border-zinc-800">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
              Data Management
            </span>

            {importStatus && (
              <div className="p-2.5 rounded-xl bg-red-600/10 border border-red-500/30 text-xs text-red-300">
                {importStatus}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleExportData}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 text-xs font-semibold text-zinc-200 transition"
              >
                <Download className="w-3.5 h-3.5" />
                Export Backup
              </button>

              <label className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 text-xs font-semibold text-zinc-200 cursor-pointer transition">
                <Upload className="w-3.5 h-3.5" />
                Import Backup
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportFile}
                  className="hidden"
                />
              </label>
            </div>

            <button
              onClick={() => {
                if (confirm('Reset to initial sample workouts and spreadsheet data?')) {
                  onResetData();
                  window.location.reload();
                }
              }}
              className="w-full py-2 text-center text-xs text-zinc-500 hover:text-red-400 transition"
            >
              Reset to Spreadsheet Defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
