import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { X, Smartphone, Copy, Check, ExternalLink, QrCode } from 'lucide-react';
import { haptics } from '../utils/haptics';

interface MobileTestModalProps {
  onClose: () => void;
}

export const MobileTestModal: React.FC<MobileTestModalProps> = ({ onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);

  // Preferred public shared URL, or fallback to window.location.href
  const appUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://ais-pre-g6sjo6xcrkxwpigid73a2g-612071328255.us-west2.run.app';

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(
        canvasRef.current,
        appUrl,
        {
          width: 220,
          margin: 1.5,
          color: {
            dark: '#ffffff',
            light: '#09090b',
          },
        },
        (error) => {
          if (error) console.error('QR code generation error', error);
        }
      );
    }
  }, [appUrl]);

  const handleCopyLink = () => {
    haptics.light();
    navigator.clipboard.writeText(appUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="relative w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl overflow-hidden ring-1 ring-red-500/20">
        {/* Glow */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-red-600/15 rounded-full blur-2xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-600/15 border border-red-500/30 text-red-500 flex items-center justify-center">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Test on Your Phone
              </h3>
              <p className="text-[11px] text-zinc-400">
                Scan with camera or open URL
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

        {/* QR Code Container */}
        <div className="my-5 flex flex-col items-center justify-center">
          <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 shadow-xl flex items-center justify-center ring-1 ring-red-500/20">
            <canvas ref={canvasRef} className="rounded-xl" />
          </div>
          <span className="text-[11px] text-zinc-400 mt-2 font-medium">
            Scan with your phone's camera
          </span>
        </div>

        {/* URL Box & Copy */}
        <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-2">
          <span className="text-[11px] font-mono text-zinc-300 truncate max-w-[200px]">
            {appUrl}
          </span>
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-red-400 active:scale-95 transition"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        {/* Android Steps */}
        <div className="mt-4 pt-3 border-t border-zinc-800 space-y-2 text-xs text-zinc-300">
          <span className="text-[11px] font-bold text-red-500 uppercase tracking-wide block">
            How to install on Android:
          </span>
          <div className="space-y-1.5 text-[11px] leading-relaxed text-zinc-400">
            <p>
              1. Open the link above in <strong className="text-zinc-200">Chrome</strong> on your Android phone.
            </p>
            <p>
              2. Tap the <strong className="text-zinc-200">⋮ 3 dots menu</strong> at the top right of Chrome.
            </p>
            <p>
              3. Tap <strong className="text-red-400 font-semibold">"Install app"</strong> or <strong className="text-red-400 font-semibold">"Add to Home screen"</strong>.
            </p>
            <p>
              4. The app icon will appear on your phone screen. Open it to test fullscreen workouts with real haptic vibration and audio timers!
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-5 w-full py-2.5 rounded-xl bg-zinc-800 text-zinc-200 font-bold text-xs hover:bg-zinc-700 transition"
        >
          Close
        </button>
      </div>
    </div>
  );
};
