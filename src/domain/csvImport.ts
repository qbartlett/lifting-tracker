import type { CompletedWorkout, Exercise, ProgressionConfigs } from '../types/lifting';
import { INITIAL_EXERCISES } from '../data/exercises';
import { SPREADSHEET_EXERCISES_CONFIG } from '../data/seed';

// Helper to find or map exercise ID
function resolveExercise(name: string): Exercise {
  const clean = name.trim().toLowerCase();
  if (clean.includes('squat')) return INITIAL_EXERCISES.find((e) => e.id === 'barbell-back-squat')!;
  if (clean.includes('bench')) return INITIAL_EXERCISES.find((e) => e.id === 'barbell-bench-press')!;
  if (clean.includes('row')) return INITIAL_EXERCISES.find((e) => e.id === 'barbell-bent-over-row')!;
  if (clean.includes('overhead') || clean.includes('ohp')) return INITIAL_EXERCISES.find((e) => e.id === 'overhead-press')!;
  if (clean.includes('deadlift')) return INITIAL_EXERCISES.find((e) => e.id === 'barbell-deadlift')!;
  if (clean.includes('leg press')) return INITIAL_EXERCISES.find((e) => e.id === 'leg-press')!;
  return INITIAL_EXERCISES[0];
}

// Convert date string "M/D/YYYY" to epoch milliseconds
function parseDateEpoch(dateStr: string): number {
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const month = parseInt(parts[0], 10) - 1;
    const day = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    return new Date(year, month, day, 17, 30).getTime();
  }
  return Date.now();
}

export function parseSpreadsheetCSV(
  csvText: string,
  configs: ProgressionConfigs = SPREADSHEET_EXERCISES_CONFIG
): {
  workouts: CompletedWorkout[];
  configs: ProgressionConfigs;
} {
  const lines = csvText.split('\n');
  const workoutsMap: Record<string, {
    dateStr: string;
    workoutType: string;
    exercises: {
      exerciseName: string;
      weight: number;
      reps: number[];
      status: string;
      notes: string;
    }[];
  }> = {};

  let inLog = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('Tracker Log')) {
      inLog = true;
      continue;
    }

    if (inLog) {
      if (line.startsWith('Date,Workout')) continue; // Header
      const cols = line.split(',').map((c) => c.trim());
      const date = cols[0];
      const workoutName = cols[1];
      const exName = cols[2];
      const weightStr = cols[3];

      if (!date || !workoutName || !exName) continue;

      const weight = parseFloat(weightStr);
      if (isNaN(weight) || weight <= 0) continue; // Future target row without sets

      // Parse sets (cols 4, 5, 6, 7, 8)
      const reps: number[] = [];
      for (let s = 4; s <= 8; s++) {
        const val = cols[s];
        if (val && val !== '-' && !isNaN(parseInt(val, 10))) {
          reps.push(parseInt(val, 10));
        }
      }

      // If no reps parsed (e.g. deadlift was skipped), ignore
      if (reps.length === 0) continue;

      const status = cols[9] || '';
      const notes = cols.slice(10).filter(Boolean).join(', ');

      const sessionKey = `${date}_${workoutName}`;
      if (!workoutsMap[sessionKey]) {
        workoutsMap[sessionKey] = {
          dateStr: date,
          workoutType: workoutName,
          exercises: [],
        };
      }

      workoutsMap[sessionKey].exercises.push({
        exerciseName: exName,
        weight,
        reps,
        status,
        notes,
      });
    }
  }

  // Convert map into CompletedWorkout list
  const completedWorkouts: CompletedWorkout[] = Object.values(workoutsMap).map((entry, idx) => {
    const epoch = parseDateEpoch(entry.dateStr);
    const exercisesMapped = entry.exercises.map((item, eIdx) => {
      const exercise = resolveExercise(item.exerciseName);
      const isDeadlift = item.exerciseName.toLowerCase().includes('deadlift');
      const restSeconds = isDeadlift ? 180 : 120;

      const sets = item.reps.map((repCount, sIdx) => ({
        id: `set-${epoch}-${eIdx}-${sIdx}`,
        type: 'normal' as const,
        weight: item.weight,
        reps: repCount,
        completed: true,
      }));

      return {
        id: `we-${epoch}-${eIdx}`,
        exerciseId: exercise.id,
        exercise,
        notes: [item.status ? `Status: ${item.status}` : '', item.notes].filter(Boolean).join(' · '),
        restTimerSeconds: restSeconds,
        sets,
      };
    });

    const totalVolume = exercisesMapped.reduce((acc, we) => {
      return acc + we.sets.reduce((sAcc, s) => sAcc + s.weight * s.reps, 0);
    }, 0);

    const totalSets = exercisesMapped.reduce((acc, we) => acc + we.sets.length, 0);

    return {
      id: `spreadsheet-${entry.dateStr.replace(/\//g, '-')}-${idx}`,
      name: `5x5 ${entry.workoutType}`,
      startTime: epoch,
      endTime: epoch + 45 * 60 * 1000,
      durationSeconds: 2700, // 45 mins
      exercises: exercisesMapped,
      totalVolume,
      totalSets,
      notes: entry.exercises.map((e) => e.notes ? `${e.exerciseName}: ${e.notes}` : '').filter(Boolean).join(' | '),
    };
  });

  // Sort descending (latest on top)
  completedWorkouts.sort((a, b) => b.startTime - a.startTime);

  return {
    workouts: completedWorkouts,
    configs,
  };
}

