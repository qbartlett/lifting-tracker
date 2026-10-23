import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full border border-red-500/40 bg-zinc-950/95 px-3 py-1 text-xs font-semibold text-red-400 shadow-2xl backdrop-blur-md ring-1 ring-red-500/20">
      <WifiOff className="w-3.5 h-3.5 animate-pulse text-red-500" />
      <span>Offline Mode · Logging locally</span>
    </div>
  );
};
