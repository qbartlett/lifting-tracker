import React, { useState } from 'react';
import {
  X,
  FileSpreadsheet,
  Download,
  Check,
  RefreshCw,
  Copy,
} from 'lucide-react';
import { storage } from '../utils/storage';
import { haptics } from '../utils/haptics';

interface SpreadsheetSyncModalProps {
  onClose: () => void;
  onDataSynced: () => void;
}

export const SpreadsheetSyncModal: React.FC<SpreadsheetSyncModalProps> = ({
  onClose,
  onDataSynced,
}) => {
  const [csvContent, setCsvContent] = useState<string>(() => storage.getSpreadsheetCSV());
  const [activeSubTab, setActiveSubTab] = useState<'view' | 'edit'>('view');
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const configs = storage.getProgressionConfigs();

  const handleCopy = () => {
    navigator.clipboard.writeText(csvContent);
    setCopied(true);
    haptics.light();
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadCSV = () => {
    haptics.medium();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `lifting-tracker-5x5-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSaveAndSync = () => {
    haptics.medium();
    storage.saveSpreadsheetCSV(csvContent);
    setStatusMessage('Spreadsheet data synced and history updated!');
    onDataSynced();
    setTimeout(() => {
      setStatusMessage(null);
    }, 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in">
      <div className="relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-3xl border border-zinc-800 bg-zinc-900 shadow-2xl overflow-hidden ring-1 ring-red-500/20">
        {/* Header */}
        <div className="flex items-center justify-between p-4 pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Spreadsheet Data Hub
              </h3>
              <p className="text-[11px] text-zinc-400">
                Connected 5x5 log & progression settings
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

        {/* Sub-tabs */}
        <div className="flex items-center gap-1 p-2 bg-zinc-950 border-b border-zinc-800 text-xs">
          <button
            onClick={() => setActiveSubTab('view')}
            className={`flex-1 py-1.5 rounded-lg font-bold transition ${
              activeSubTab === 'view'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Exercise Targets & Increments
          </button>
          <button
            onClick={() => setActiveSubTab('edit')}
            className={`flex-1 py-1.5 rounded-lg font-bold transition ${
              activeSubTab === 'edit'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Raw CSV Log (Edit / Paste)
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {statusMessage && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>{statusMessage}</span>
            </div>
          )}

          {activeSubTab === 'view' ? (
            <div className="space-y-4">
              <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-2">
                  Linear Progression Matrix (lbs)
                </span>
                <div className="divide-y divide-zinc-800 text-xs">
                  {Object.values(configs).map((cfg) => (
                    <div key={cfg.exerciseId} className="py-2.5 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-white block">{cfg.name}</span>
                        <span className="text-[10px] text-zinc-400">
                          Started: {cfg.startingWeight} lbs · Scheme: {cfg.defaultSetsReps}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-black text-red-500 block text-sm">
                          {cfg.currentWeight} lbs
                        </span>
                        <span className="text-[10px] text-zinc-400 font-semibold">
                          +{cfg.weightIncrement} lbs on pass
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-red-600/10 border border-red-500/20 text-xs text-red-300 leading-relaxed">
                <p className="font-bold mb-1">StrongLifts 5x5 Progression Rules:</p>
                <ul className="list-disc list-inside space-y-1 text-zinc-300 text-[11px]">
                  <li>Pass: 5 sets of 5 reps completed &rarr; auto-add increment for next session.</li>
                  <li>Fail: Repeat weight next time until 5x5 is achieved.</li>
                  <li>Deadlift uses standard 1x5 heavy working set (+10 lbs jump).</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400 font-medium">
                  Paste updated rows or edit directly:
                </span>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 font-semibold"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy CSV'}</span>
                </button>
              </div>

              <textarea
                value={csvContent}
                onChange={(e) => setCsvContent(e.target.value)}
                rows={12}
                className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] text-zinc-200 leading-relaxed focus:border-red-500 focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between gap-2">
          <button
            onClick={handleDownloadCSV}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV</span>
          </button>

          {activeSubTab === 'edit' ? (
            <button
              onClick={handleSaveAndSync}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition shadow-lg shadow-red-600/30"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Save & Sync Data</span>
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
