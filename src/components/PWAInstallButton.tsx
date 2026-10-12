import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Smartphone, X } from 'lucide-react';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (compact) {
    if (isInstallable) {
      return (
        <button
          onClick={install}
          title="Install Lifting Tracker on Android"
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-red-600 text-white hover:bg-red-500 active:scale-95 transition-all shadow-sm"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Install</span>
        </button>
      );
    }
    return (
      <button
        onClick={() => setShowGuide(true)}
        title="Add to Home Screen"
        className="flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white hover:bg-zinc-800 active:scale-95 transition-all"
      >
        <Smartphone className="w-3.5 h-3.5 text-red-500" />
        <span className="hidden sm:inline">Install</span>
      </button>
    );
  }

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl border border-red-500/30 bg-gradient-to-r from-red-600/10 via-zinc-900 to-zinc-900 p-4 shadow-lg ring-1 ring-red-500/20">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white shadow-md shadow-red-600/30">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-black text-white tracking-tight">
                Install Lifting Tracker
              </h4>
              <p className="text-xs text-zinc-400 mt-0.5">
                Fullscreen native feel on Android with haptics & offline logging.
              </p>
            </div>
          </div>
          {isInstallable ? (
            <button
              onClick={install}
              className="shrink-0 flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-2 text-xs font-black text-white hover:bg-red-500 active:scale-95 transition shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              Install
            </button>
          ) : (
            <button
              onClick={() => setShowGuide(true)}
              className="shrink-0 flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-800 px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-zinc-700 active:scale-95 transition"
            >
              Setup Guide
            </button>
          )}
        </div>
      </div>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl ring-1 ring-red-500/20">
            <button
              onClick={() => setShowGuide(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center text-white font-black text-sm">
                LT
              </div>
              <h3 className="text-base font-bold text-white">Install on Device</h3>
            </div>

            {isAndroid ? (
              <div className="space-y-2 text-xs text-zinc-300">
                <p className="leading-relaxed">
                  1. Tap the browser menu (<strong className="text-white">⋮ 3 dots</strong> top right).
                </p>
                <p className="leading-relaxed">
                  2. Select <strong className="text-red-400">Add to Home screen</strong> or <strong className="text-red-400">Install app</strong>.
                </p>
                <p className="leading-relaxed">
                  3. Launch Lifting Tracker directly from your home screen with fullscreen speed!
                </p>
              </div>
            ) : isIOS ? (
              <div className="space-y-2 text-xs text-zinc-300">
                <p className="leading-relaxed">
                  1. Tap the <strong className="text-white">Share</strong> button in Safari toolbar.
                </p>
                <p className="leading-relaxed">
                  2. Scroll down and tap <strong className="text-red-400">Add to Home Screen</strong>.
                </p>
                <p className="leading-relaxed">
                  3. Open from home screen for standalone gym tracking!
                </p>
              </div>
            ) : (
              <div className="space-y-2 text-xs text-zinc-300">
                <p className="leading-relaxed">
                  In Chrome / Edge, tap the <strong className="text-red-400">Install icon</strong> in the address bar, or open on your Android phone to install the APK-like standalone app.
                </p>
              </div>
            )}

            <button
              onClick={() => setShowGuide(false)}
              className="mt-4 w-full rounded-xl bg-zinc-800 py-2.5 text-xs font-bold text-white hover:bg-zinc-700 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
};
