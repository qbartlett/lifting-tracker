import React, { useState } from 'react';
import { X, Award, Flame } from 'lucide-react';
import { oneRepMax } from '../domain/oneRepMax';
import { haptics } from '../utils/haptics';

interface OneRepMaxModalProps {
  initialWeight?: number;
  initialReps?: number;
  unit?: 'kg' | 'lbs';
  onClose: () => void;
}

export const OneRepMaxModal: React.FC<OneRepMaxModalProps> = ({
  initialWeight = 200,
  initialReps = 5,
  unit = 'lbs',
  onClose,
}) => {
  const [weight, setWeight] = useState<number>(initialWeight);
  const [reps, setReps] = useState<number>(initialReps);

  const epleyMax = oneRepMax.epley(weight, reps);
  const brzyckiMax = oneRepMax.brzycki(weight, reps);
  const averageMax = oneRepMax.estimate1RM(weight, reps);
  const table = oneRepMax.generateRepTable(averageMax);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="relative w-full max-w-md max-h-[85vh] flex flex-col rounded-3xl border border-zinc-800 bg-zinc-900 shadow-2xl overflow-hidden ring-1 ring-red-500/20">
        {/* Header */}
        <div className="flex items-center justify-between p-4 pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-600/15 border border-red-500/30 text-red-500 flex items-center justify-center">
              <Award className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                One-Rep Max (1RM)
              </h3>
              <p className="text-[11px] text-zinc-400">
                Calculated strength projections
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Inputs */}
        <div className="p-4 space-y-3 border-b border-zinc-800">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide">
                Weight ({unit})
              </label>
              <input
                type="number"
                min="1"
                step="5"
                value={weight}
                onChange={(e) => setWeight(parseFloat(e.target.value) || 0)}
                className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-lg font-black text-white tabular-nums focus:border-red-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide">
                Reps Performed
              </label>
              <input
                type="number"
                min="1"
                max="30"
                value={reps}
                onChange={(e) => setReps(parseInt(e.target.value, 10) || 0)}
                className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-lg font-black text-white tabular-nums focus:border-red-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Quick Rep Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pt-1">
            {[1, 3, 5, 8, 10, 12].map((r) => (
              <button
                key={r}
                onClick={() => {
                  haptics.light();
                  setReps(r);
                }}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  reps === r
                    ? 'bg-red-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                {r} reps
              </button>
            ))}
          </div>
        </div>

        {/* Output Hero */}
        <div className="p-4 bg-gradient-to-b from-zinc-950 to-zinc-900 border-b border-zinc-800 text-center">
          <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-600/15 text-red-400 text-[11px] font-bold mb-1 border border-red-500/20">
            <Flame className="w-3 h-3 fill-current" />
            <span>ESTIMATED 1RM</span>
          </div>
          <div className="flex items-baseline justify-center gap-1.5">
            <span className="text-4xl font-black text-white tracking-tight tabular-nums">
              {averageMax}
            </span>
            <span className="text-sm font-bold text-red-500">{unit}</span>
          </div>
          <div className="flex items-center justify-center gap-4 text-[11px] text-zinc-400 mt-2">
            <span>Epley: <strong className="text-zinc-200">{epleyMax} {unit}</strong></span>
            <span>·</span>
            <span>Brzycki: <strong className="text-zinc-200">{brzyckiMax} {unit}</strong></span>
          </div>
        </div>

        {/* Rep Percentages Table */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide mb-2">
            Target Percentage Breakdown
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {table.map((row) => (
              <div
                key={row.reps}
                className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800"
              >
                <div>
                  <span className="font-bold text-white tabular-nums">{row.reps}RM</span>
                  <span className="text-[10px] text-zinc-400 ml-1.5">({row.percentage}%)</span>
                </div>
                <span className="font-mono font-bold text-red-400 tabular-nums">
                  {row.estimatedWeight} {unit}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-zinc-800 text-zinc-200 font-bold text-xs hover:bg-zinc-700 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
