export const haptics = {
  // Light tap for button click / set completion
  light: () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(18);
      } catch {
        // Fallback
      }
    }
  },

  // Medium vibration for starting or editing
  medium: () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(35);
      } catch {
        // Fallback
      }
    }
  },

  // Double pulse for rest timer completion
  restTimerFinished: () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([60, 80, 80, 100, 140]);
      } catch {
        // Fallback
      }
    }
  },

  // Celebratory triple rumble for new personal record (PR)
  celebratePR: () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([40, 50, 40, 50, 100, 50, 150]);
      } catch {
        // Fallback
      }
    }
  },
};
