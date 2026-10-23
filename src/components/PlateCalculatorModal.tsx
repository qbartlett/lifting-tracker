import React, { useState } from 'react';
import { X, Plus, Minus, Disc } from 'lucide-react';
import { calculatePlates } from '../domain/plateCalculator';
import { haptics } from '../utils/haptics';

interface PlateCalculatorModalProps {
  initialWeight?: number;
  initialUnit?: 'kg' | 'lbs';
  initialBarWeight?: number;
  onClose: () => void;
  onApplyWeight?: (weight: number) => void;
}

export const PlateCalculatorModal: React.FC<PlateCalculatorModalProps> = ({
  initialWeight = 200,
  initialUnit = 'lbs',
  initialBarWeight = 45,
  onClose,
  onApplyWeight,
}) => {
  const [weight, setWeight] = useState<number>(initialWeight);
  const [barWeight, setBarWeight] = useState<number>(
    initialBarWeight || (initialUnit === 'lbs' ? 45 : 20)
  );
  const [unit, setUnit] = useState<'kg' | 'lbs'>(initialUnit);

  const step = unit === 'lbs' ? 5 : 2.5;
  const result = calculatePlates(weight, barWeight, unit);

  const adjustWeight = (delta: number) => {
    haptics.light();
    setWeight((prev) => Math.max(barWeight, Math.round((prev + delta) * 10) / 10));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="relative w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl overflow-hidden ring-1 ring-red-500/20">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-600/15 border border-red-500/30 text-red-500 flex items-center justify-center">
              <Disc className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Plate Calculator
              </h3>
              <p className="text-[11px] text-zinc-400">
                Plates per side on Olympic barbell
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

        {/* Unit & Bar weight selectors */}
        <div className="mt-4 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1 p-1 bg-zinc-950 rounded-xl border border-zinc-800">
            <button
              onClick={() => {
                haptics.light();
                setUnit('lbs');
                setBarWeight(45);
              }}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                unit === 'lbs'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              LBS
            </button>
            <button
              onClick={() => {
                haptics.light();
                setUnit('kg');
                setBarWeight(20);
              }}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                unit === 'kg'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              KG
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-zinc-400">
            <span>Bar:</span>
            <button
              onClick={() => {
                haptics.light();
                setBarWeight((prev) => (unit === 'lbs' ? (prev === 45 ? 35 : 45) : (prev === 20 ? 15 : 20)));
              }}
              className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-200 font-bold border border-zinc-700 hover:bg-zinc-700 hover:border-red-500/40"
            >
              {barWeight} {unit}
            </button>
          </div>
        </div>

        {/* Target Weight Controls */}
        <div className="mt-4 p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] text-zinc-400 font-semibold tracking-wide uppercase">
              TARGET WEIGHT
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-3xl font-black text-white tracking-tight tabular-nums">
                {weight}
              </span>
              <span className="text-xs text-red-500 font-bold">{unit}</span>
            </div>
            <span className="text-[11px] text-zinc-400 mt-0.5 font-medium">
              <strong className="text-white font-mono">{result.weightPerSide}</strong> {unit} per side
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => adjustWeight(-step * 2)}
              className="w-9 h-9 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs flex items-center justify-center border border-zinc-800 active:scale-95 transition"
            >
              -{step * 2}
            </button>
            <button
              onClick={() => adjustWeight(-step)}
              className="w-9 h-9 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 flex items-center justify-center border border-zinc-800 active:scale-95 transition"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              onClick={() => adjustWeight(step)}
              className="w-9 h-9 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 flex items-center justify-center border border-zinc-800 active:scale-95 transition"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={() => adjustWeight(step * 2)}
              className="w-9 h-9 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs flex items-center justify-center border border-zinc-800 active:scale-95 transition"
            >
              +{step * 2}
            </button>
          </div>
        </div>

        {/* Barbell Visual Representation */}
        <div className="mt-4 p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800">
          <div className="text-[10px] font-bold text-zinc-400 tracking-wider mb-3 text-center uppercase">
            BARBELL SLEEVE LOADOUT
          </div>

          <div className="relative flex items-center justify-center h-28 overflow-x-auto py-2">
            {/* Center Bar */}
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-3.5 bg-zinc-700 rounded-full z-0" />
            {/* Collar stopper */}
            <div className="z-10 w-3.5 h-16 bg-zinc-500 rounded-sm mr-2 shadow-md border border-zinc-400/40" />

            {/* Plates stacked on side */}
            <div className="z-10 flex items-center gap-1.5">
              {result.platesPerSide.length === 0 ? (
                <div className="text-xs text-zinc-500 italic py-4">
                  Empty bar ({barWeight} {unit})
                </div>
              ) : (
                result.platesPerSide.map((plateGroup, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    {Array.from({ length: plateGroup.countPerSide }).map((_, pIdx) => {
                      const heightClass =
                        plateGroup.weight >= 45 || plateGroup.weight >= 20
                          ? 'h-24 w-4'
                          : plateGroup.weight >= 35 || plateGroup.weight >= 15
                          ? 'h-20 w-3.5'
                          : plateGroup.weight >= 25 || plateGroup.weight >= 10
                          ? 'h-16 w-3'
                          : plateGroup.weight >= 10 || plateGroup.weight >= 5
                          ? 'h-12 w-2.5'
                          : 'h-9 w-2';

                      return (
                        <div
                          key={pIdx}
                          title={`${plateGroup.weight} ${unit}`}
                          style={{ backgroundColor: plateGroup.color }}
                          className={`${heightClass} rounded-[3px] border border-black/50 shadow-md flex items-center justify-center transition-all`}
                        />
                      );
                    })}
                  </div>
                ))
              )}
            </div>
            {/* Sleeve tip */}
            <div className="z-10 w-5 h-5 bg-zinc-600 rounded-r-md ml-1 border-l border-zinc-500" />
          </div>

          {/* Plates count list */}
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
            {result.platesPerSide.map((p, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs"
              >
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                <span className="font-bold text-white tabular-nums">
                  {p.countPerSide}× {p.weight} {unit}
                </span>
              </div>
            ))}
          </div>

          {result.remainder > 0 && (
            <p className="text-[11px] text-red-400 text-center mt-2 font-medium">
              Note: {result.remainder} {unit} cannot be loaded with standard plates.
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-zinc-800 text-zinc-300 font-semibold text-xs hover:bg-zinc-700 transition"
          >
            Close
          </button>
          {onApplyWeight && (
            <button
              onClick={() => {
                haptics.medium();
                onApplyWeight(weight);
                onClose();
              }}
              className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold text-xs hover:bg-red-500 active:scale-95 transition shadow-lg shadow-red-600/30"
            >
              Apply {weight} {unit}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
