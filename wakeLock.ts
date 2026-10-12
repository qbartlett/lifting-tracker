let wakeLockSentinel: WakeLockSentinel | null = null;

export const wakeLockService = {
  isSupported: () => {
    return typeof window !== 'undefined' && 'wakeLock' in navigator;
  },

  request: async (): Promise<boolean> => {
    if (!wakeLockService.isSupported()) return false;
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
      });
      return true;
    } catch {
      return false;
    }
  },

  release: async () => {
    if (wakeLockSentinel) {
      try {
        await wakeLockSentinel.release();
        wakeLockSentinel = null;
      } catch {
        // Sentinel release error
      }
    }
  },

  isActive: () => {
    return wakeLockSentinel !== null && !wakeLockSentinel.released;
  },
};
