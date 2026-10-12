import React, { useEffect, useState } from 'react';
import { Timer, Plus, Minus, X, Bell, RotateCcw } from 'lucide-react';
import { soundFX } from '../utils/audio';
import { haptics } from '../utils/haptics';

interface RestTimerBarProps {
  totalSeconds: number;
  initialRemaining: number;
  exerciseName?: string;
  soundEnabled?: boolean;
  hapticsEnabled?: boolean;
  onFinish: () => void;
  onDismiss: () => void;
  onSetInterval?: (seconds: number) => void;
}

export const RestTimerBar: React.FC<RestTimerBarProps> = ({
  totalSeconds,
  initialRemaining,
  exerciseName = 'Rest Interval',
  soundEnabled = true,
  hapticsEnabled = true,
  onFinish,
  onDismiss,
  onSetInterval,
}) => {
  const [remaining, setRemaining] = useState<number>(initialRemaining);
  const [total, setTotal] = useState<number>(totalSeconds || initialRemaining);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  useEffect(() => {
    setRemaining(initialRemaining);
    setTotal(totalSeconds || initialRemaining);
  }, [initialRemaining, totalSeconds]);

  useEffect(() => {
    if (remaining <= 0) {
      if (soundEnabled) soundFX.playTimerDone();
      if (hapticsEnabled) haptics.restTimerFinished();
      onFinish();
      return;
    }

    // Audio cue on last 3 seconds
    if (remaining <= 3 && remaining >= 1 && soundEnabled) {
      soundFX.playCountdownTick();
    }

    const interval = setInterval(() => {
      setRemaining((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [remaining, soundEnabled, hapticsEnabled, onFinish]);

  const addTime = (seconds: number) => {
    haptics.light();
    setRemaining((prev) => Math.max(0, prev + seconds));
    setTotal((prev) => Math.max(prev, remaining + seconds));
  };

  const setExactInterval = (seconds: number) => {
    haptics.medium();
    setRemaining(seconds);
    setTotal(seconds);
    if (onSetInterval) onSetInterval(seconds);
  };

  const minutes = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const formattedTime = `${minutes}:${secs < 10 ? '0' : ''}${secs}`;

  const progressPercent = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;

  if (isMinimized) {
    return (
      <button
        onClick={() => {
          haptics.light();
          setIsMinimized(false);
        }}
        className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full border border-red-500/50 bg-zinc-950/95 px-3.5 py-2 shadow-2xl backdrop-blur-md active:scale-95 transition-all text-red-500 ring-2 ring-red-500/20"
      >
        <Timer className="w-4 h-4 animate-pulse" />
        <span className="font-mono font-black text-sm tabular-nums text-white">
          {formattedTime}
        </span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-18 left-3 right-3 sm:left-auto sm:right-6 sm:w-96 z-40 animate-in slide-in-from-bottom-4 duration-200">
      <div className="relative overflow-hidden rounded-2xl border border-red-500/50 bg-zinc-950/95 p-3.5 shadow-2xl backdrop-blur-md ring-1 ring-red-500/20">
        {/* Dynamic red progress bar */}
        <div
          className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-red-700 via-red-600 to-red-500 transition-all duration-1000 shadow-sm shadow-red-500"
          style={{ width: `${progressPercent}%` }}
        />

        <div className="flex items-center justify-between gap-3">
          {/* Time & Exercise */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600/15 border border-red-500/30 text-red-500 shrink-0">
              <Timer className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl font-black text-white tracking-tight tabular-nums">
                  {formattedTime}
                </span>
                <span className="text-[10px] font-bold text-red-400 tracking-wide uppercase">
                  Rest Interval
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 truncate max-w-[140px]">
                {exerciseName}
              </p>
            </div>
          </div>

          {/* Quick adjustments */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => addTime(-15)}
              className="flex h-8 items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 px-2 text-xs font-bold text-zinc-300 hover:text-white hover:bg-zinc-800 active:scale-95 transition"
              title="Subtract 15 seconds"
            >
              <Minus className="w-3 h-3 mr-0.5" />
              15s
            </button>
            <button
              onClick={() => addTime(30)}
              className="flex h-8 items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 px-2 text-xs font-bold text-red-400 hover:text-red-300 hover:bg-zinc-800 active:scale-95 transition"
              title="Add 30 seconds"
            >
              <Plus className="w-3 h-3 mr-0.5" />
              30s
            </button>
            <button
              onClick={() => {
                haptics.light();
                setIsMinimized(true);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-white transition"
              title="Minimize timer"
            >
              _
            </button>
            <button
              onClick={() => {
                haptics.light();
                onDismiss();
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-red-400 transition"
              title="Dismiss timer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Interval preset quick selector */}
        <div className="mt-2.5 pt-2 border-t border-zinc-900 flex items-center justify-between text-[10px]">
          <span className="text-zinc-500 font-semibold uppercase">Presets:</span>
          <div className="flex items-center gap-1">
            {[60, 90, 120, 180].map((preset) => (
              <button
                key={preset}
                onClick={() => setExactInterval(preset)}
                className={`px-2 py-0.5 rounded-md font-mono font-bold transition ${
                  total === preset
                    ? 'bg-red-600 text-white'
                    : 'bg-zinc-900 text-zinc-400 hover:text-white'
                }`}
              >
                {preset >= 60 ? `${preset / 60}m` : `${preset}s`}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
