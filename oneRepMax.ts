export interface OneRepMaxBreakdown {
  reps: number;
  percentage: number;
  estimatedWeight: number;
}

export const oneRepMax = {
  // Epley Formula: 1RM = weight * (1 + reps / 30)
  epley: (weight: number, reps: number): number => {
    if (reps <= 0 || weight <= 0) return 0;
    if (reps === 1) return weight;
    return Math.round(weight * (1 + reps / 30));
  },

  // Brzycki Formula: 1RM = weight * (36 / (37 - reps))
  brzycki: (weight: number, reps: number): number => {
    if (reps <= 0 || weight <= 0) return 0;
    if (reps === 1) return weight;
    if (reps >= 37) return Math.round(weight * 2);
    return Math.round(weight * (36 / (37 - reps)));
  },

  // Average of standard formulas
  estimate1RM: (weight: number, reps: number): number => {
    if (reps <= 0 || weight <= 0) return 0;
    if (reps === 1) return weight;
    const ep = oneRepMax.epley(weight, reps);
    const br = oneRepMax.brzycki(weight, reps);
    return Math.round((ep + br) / 2);
  },

  // Generate rep percentages table based on 1RM
  generateRepTable: (estimated1RM: number): OneRepMaxBreakdown[] => {
    const table: { reps: number; pct: number }[] = [
      { reps: 1, pct: 1.0 },
      { reps: 2, pct: 0.95 },
      { reps: 3, pct: 0.93 },
      { reps: 4, pct: 0.90 },
      { reps: 5, pct: 0.87 },
      { reps: 6, pct: 0.85 },
      { reps: 8, pct: 0.80 },
      { reps: 10, pct: 0.75 },
      { reps: 12, pct: 0.70 },
      { reps: 15, pct: 0.65 },
    ];

    return table.map((item) => ({
      reps: item.reps,
      percentage: Math.round(item.pct * 100),
      estimatedWeight: Math.round(estimated1RM * item.pct * 2) / 2, // round to 0.5 step
    }));
  },
};
