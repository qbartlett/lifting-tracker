import type { ProgressionConfigs, RoutineTemplate } from '../types/lifting';

/**
 * Starter data shipped with the app (the original owner's StrongLifts log).
 * Per-user data should come from the repository, not from this file: pass a
 * different `AppSeed` (e.g. EMPTY_SEED) to start a fresh account.
 */

export const SPREADSHEET_EXERCISES_CONFIG: ProgressionConfigs = {
  'barbell-back-squat': {
    exerciseId: 'barbell-back-squat',
    name: 'Squat',
    startingWeight: 145,
    weightIncrement: 5,
    defaultSetsReps: '5x5',
    currentWeight: 200, // Upcoming target for 10/9/2026
  },
  'barbell-bench-press': {
    exerciseId: 'barbell-bench-press',
    name: 'Bench Press',
    startingWeight: 145,
    weightIncrement: 5,
    defaultSetsReps: '5x5',
    currentWeight: 175, // Upcoming target
  },
  'barbell-bent-over-row': {
    exerciseId: 'barbell-bent-over-row',
    name: 'Barbell Row',
    startingWeight: 95,
    weightIncrement: 5,
    defaultSetsReps: '5x5',
    currentWeight: 125, // Upcoming target
  },
  'overhead-press': {
    exerciseId: 'overhead-press',
    name: 'Overhead Press',
    startingWeight: 65,
    weightIncrement: 5,
    defaultSetsReps: '5x5',
    currentWeight: 100, // Upcoming target
  },
  'barbell-deadlift': {
    exerciseId: 'barbell-deadlift',
    name: 'Deadlift',
    startingWeight: 175,
    weightIncrement: 10,
    defaultSetsReps: '1x5',
    currentWeight: 245, // Upcoming target
  },
  'leg-press': {
    exerciseId: 'leg-press',
    name: 'Leg Press',
    startingWeight: 270,
    weightIncrement: 5,
    defaultSetsReps: '5x5',
    currentWeight: 295,
  },
};

// Raw CSV string for easy viewing and re-exporting in exact spreadsheet format
export const INITIAL_SPREADSHEET_CSV = `Exercise Setup & Starting Weights,,,,,,,,,Default Sets x Reps,
Exercise,Starting Weight (lbs),Weight Increment (lbs),Default Sets x Reps,,,,,,,
Squat,145,5,5x5,,,,,,,
Bench Press,145,5,5x5,,,,,,,
Barbell Row,95,5,5x5,,,,,,,
Overhead Press,65,5,5x5,,,,,,,
Deadlift,175,10,1x5,,,,,,,
leg press,270,5,,,,,,,,
,,,,,,,,,,
Tracker Log,,,,,,,,,,
,,,,,,,,,,
Date,Workout,Exercise,Target Weight (lbs),Set 1,Set 2,Set 3,Set 4,Set 5,Status (Pass/Fail),Notes
8/12/2026,Workout A,Squat,145,5,5,5,5,5,Pass,First session
8/12/2026,Workout A,Bench Press,145,5,5,5,5,5,Pass,
8/12/2026,Workout A,Barbell Row,95,5,5,5,5,5,Pass,
8/14/2026,Workout B,Squat,150,5,5,5,5,5,Pass,+5 lbs from Mon
8/14/2026,Workout B,Overhead Press,75,5,5,5,5,5,Pass,
8/14/2026,Workout B,Deadlift,175,5,,,,,1x5 standard set,
8/17/2026,Workout A,Squat,155,5,5,5,5,5,Pass,
8/17/2026,Workout A,Bench Press,150,5,5,5,5,5,Pass,
8/17/2026,Workout A,Barbell Row,100,5,5,5,5,5,Pass,
8/21/2026,Workout A,Squat,160,5,5,5,5,5,Pass,
8/21/2026,Workout A,Bench Press,155,5,5,5,5,5,Pass,
8/24/2026,Workout B,Squat,165,5,5,5,5,5,Pass,
8/24/2026,Workout B,Overhead Press,80,5,5,5,5,5,Pass,
8/24/2026,Workout B,Deadlift,185,5,,,,,1x5 standard set,
8/26/2026,Workout A,Squat,170,5,5,5,5,5,Pass,
8/26/2026,Workout A,Bench Press,160,5,5,5,5,5,Pass,
8/26/2026,Workout A,Barbell Row,105,5,5,5,-,-,,
8/28/2026,Workout B,Squat,175,5,4,4,-,-,,
8/28/2026,Workout B,Overhead Press,85,5,5,4,4,3,,
8/28/2026,Workout B,Deadlift,-,-,-,-,-,-,,
8/30/2026,Workout A,Leg Press,270,5,5,5,5,5,Pass,
8/30/2026,Workout A,Bench Press,165,5,5,5,5,5,Pass,
8/30/2026,Workout A,Barbell Row,85,5,5,5,5,5,Pass,
9/2/2026,Workout B,Leg Press,275,5,5,5,5,5,Pass,
9/2/2026,Workout B,Overhead Press,85,5,5,5,5,5,Pass,
9/2/2026,Workout B,Deadlift,185,5,,,,,1x5 standard set,
9/4/2026,Workout A,Leg Press,280,5,5,5,5,5,Pass,
9/4/2026,Workout A,Bench Press,170,5,5,5,5,5,Pass,
9/4/2026,Workout A,Barbell Row,95,5,5,5,5,5,Pass,
9/9/2026,Workout B,Leg Press,285,5,5,5,5,5,Pass,
9/9/2026,Workout B,Overhead Press,90,5,5,4,2,2,,
9/9/2026,Workout B,Deadlift,195,5,,,,,Pass,
9/11/2026,Workout A,Leg Press,290,5,5,5,5,5,Pass,
9/11/2026,Workout A,Bench Press,165,5,5,4,4,3,,
9/11/2026,Workout A,Barbell Row,100,5,5,5,5,5,Pass,
9/14/2026,Workout B,Leg Press,295,5,5,5,5,5,Pass,
9/14/2026,Workout B,Overhead Press,90,,,,,,Fail,
9/14/2026,Workout B,Deadlift,205,5,-,-,-,-,1x5 standard set,
9/16/2026,Workout A,Squat,185,5,5,5,,,,groin strain
9/16/2026,Workout A,Bench Press,165,5,5,5,5,5,Pass,
9/16/2026,Workout A,Barbell Row,105,5,5,5,5,5,Pass,
9/18/2026,Workout B,Squat,165,5,5,5,,,,deload
9/18/2026,Workout B,Overhead Press,90,5,5,5,5,5,Pass,
9/18/2026,Workout B,Deadlift,215,5,,,,,1x5 standard set,
9/21/2026,Workout A,Squat,185,5,5,5,5,5,Pass,
9/21/2026,Workout A,Bench Press,165,5,5,5,-,-,Fail,
9/21/2026,Workout A,Barbell Row,110,5,5,5,5,5,Pass,
9/23/2026,Workout B,Squat,190,5,5,5,5,5,Pass,
9/23/2026,Workout B,Overhead Press,95,5,5,5,5,5,Pass,
9/23/2026,Workout B,Deadlift,185,3,-,-,-,-,Fail,
9/28/2026,Workout B,Squat,185,4,4,,,,Fail,
9/28/2026,Workout B,Overhead Press,100,4,-,-,-,-,Fail,
9/28/2026,Workout B,Deadlift,225,5,,,,,1x5 standard set,
9/30/2026,Workout A,Squat,185,5,5,5,5,5,Pass,
9/30/2026,Workout A,Bench Press,165,5,5,5,5,5,Pass,
10/2/2026,Workout B,Barbell Row,120,5,5,5,5,5,Pass,
10/2/2026,Workout B,Overhead Press,100,4,4,3,2,1,Fail,
10/5/2026,Workout A,Squat,190,5,5,5,5,5,Pass,
10/5/2026,Workout A,Bench Press,170,5,5,5,5,5,Pass,
10/7/2026,Workout B,Squat,195,5,5,5,5,5,Pass,
10/7/2026,Workout B,Overhead Press,100,5,3,2,5,5,Fail,90 on last two
10/7/2026,Workout B,Deadlift,235,5,,,,,Pass,
10/9/2026,Workout A,Squat,200,,,,,,,
10/9/2026,Workout A,Bench Press,175,,,,,,,
10/9/2026,Workout A,Barbell Row,125,,,,,,,`;

// Define StrongLifts 5x5 Workout A and Workout B routines with user's current targets!
export const SPREADSHEET_ROUTINES: RoutineTemplate[] = [
  {
    id: 'stronglifts-workout-a',
    name: '5x5 Workout A (Squat, Bench, Row)',
    description: 'Current Target: Squat 200 lbs, Bench Press 175 lbs, Barbell Row 125 lbs (5 sets of 5 reps).',
    targetSplit: 'StrongLifts 5x5',
    exercises: [
      { exerciseId: 'barbell-back-squat', targetSets: 5, targetReps: 5, restSeconds: 180 },
      { exerciseId: 'barbell-bench-press', targetSets: 5, targetReps: 5, restSeconds: 150 },
      { exerciseId: 'barbell-bent-over-row', targetSets: 5, targetReps: 5, restSeconds: 120 },
    ],
  },
  {
    id: 'stronglifts-workout-b',
    name: '5x5 Workout B (Squat, OHP, Deadlift)',
    description: 'Current Target: Squat 200 lbs (5x5), OHP 100 lbs (5x5), Deadlift 245 lbs (1x5).',
    targetSplit: 'StrongLifts 5x5',
    exercises: [
      { exerciseId: 'barbell-back-squat', targetSets: 5, targetReps: 5, restSeconds: 180 },
      { exerciseId: 'overhead-press', targetSets: 5, targetReps: 5, restSeconds: 150 },
      { exerciseId: 'barbell-deadlift', targetSets: 1, targetReps: 5, restSeconds: 180 },
    ],
  },
];
