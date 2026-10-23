export interface PlateCount {
  weight: number;
  countPerSide: number;
  color: string;
}

export interface PlateCalculationResult {
  targetWeight: number;
  barWeight: number;
  weightPerSide: number;
  actualTotalWeight: number;
  remainder: number;
  platesPerSide: PlateCount[];
}

export const KG_PLATES = [
  { weight: 25, color: '#dc2626' }, // Red
  { weight: 20, color: '#2563eb' }, // Blue
  { weight: 15, color: '#eab308' }, // Yellow
  { weight: 10, color: '#16a34a' }, // Green
  { weight: 5, color: '#f8fafc' },  // White
  { weight: 2.5, color: '#000000' }, // Black
  { weight: 1.25, color: '#94a3b8' } // Silver
];

export const LBS_PLATES = [
  { weight: 45, color: '#2563eb' }, // Standard Blue / Black
  { weight: 35, color: '#eab308' }, // Yellow
  { weight: 25, color: '#16a34a' }, // Green
  { weight: 10, color: '#000000' }, // Black
  { weight: 5, color: '#f8fafc' },  // White
  { weight: 2.5, color: '#94a3b8' } // Silver
];

export function calculatePlates(
  targetWeight: number,
  barWeight: number = 20,
  unit: 'kg' | 'lbs' = 'kg'
): PlateCalculationResult {
  if (targetWeight <= barWeight) {
    return {
      targetWeight,
      barWeight,
      weightPerSide: 0,
      actualTotalWeight: barWeight,
      remainder: 0,
      platesPerSide: [],
    };
  }

  const availablePlates = unit === 'kg' ? KG_PLATES : LBS_PLATES;
  let remainingPerSide = (targetWeight - barWeight) / 2;
  const platesPerSide: PlateCount[] = [];

  for (const plate of availablePlates) {
    if (remainingPerSide >= plate.weight) {
      const count = Math.floor(remainingPerSide / plate.weight);
      platesPerSide.push({
        weight: plate.weight,
        countPerSide: count,
        color: plate.color,
      });
      remainingPerSide = Math.round((remainingPerSide - count * plate.weight) * 100) / 100;
    }
  }

  const loadedPerSide = platesPerSide.reduce(
    (acc, p) => acc + p.weight * p.countPerSide,
    0
  );
  const actualTotalWeight = barWeight + loadedPerSide * 2;

  return {
    targetWeight,
    barWeight,
    weightPerSide: loadedPerSide,
    actualTotalWeight,
    remainder: Math.round((targetWeight - actualTotalWeight) * 100) / 100,
    platesPerSide,
  };
}
