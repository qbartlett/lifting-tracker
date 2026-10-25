export type MuscleGroup =
  | 'Chest'
  | 'Back'
  | 'Shoulders'
  | 'Biceps'
  | 'Triceps'
  | 'Quads'
  | 'Hamstrings'
  | 'Glutes'
  | 'Calves'
  | 'Abs'
  | 'Forearms';

export type EquipmentType =
  | 'Barbell'
  | 'Dumbbell'
  | 'Cable'
  | 'Machine'
  | 'Bodyweight'
  | 'Smith Machine'
  | 'Kettlebell'
  | 'Other';

export type SetType = 'normal' | 'warmup' | 'drop' | 'failure';

export interface Exercise {
  id: string;
  name: string;
  category: MuscleGroup;
  secondaryMuscles?: MuscleGroup[];
  equipment: EquipmentType;
  instructions?: string;
  isCustom?: boolean;
}

export interface WorkoutSet {
  id: string;
  type: SetType;
  weight: number;
  reps: number;
  rpe?: number;
  completed: boolean;
  previousWeight?: number;
  previousReps?: number;
}

export interface WorkoutExercise {
  id: string;
  exerciseId: string;
  exercise: Exercise;
  notes?: string;
  restTimerSeconds: number;
  sets: WorkoutSet[];
  supersetWithId?: string; // ID of another exercise if paired in superset
}

export interface ActiveWorkout {
  id: string;
  name: string;
  startTime: number;
  routineId?: string;
  exercises: WorkoutExercise[];
  notes?: string;
}

export interface CompletedWorkout {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  durationSeconds: number;
  exercises: WorkoutExercise[];
  totalVolume: number;
  totalSets: number;
  notes?: string;
  prCount?: number;
}

export interface RoutineTemplate {
  id: string;
  name: string;
  description: string;
  targetSplit: string;
  exercises: {
    exerciseId: string;
    targetSets: number;
    targetReps: number;
    restSeconds: number;
  }[];
}

export interface PersonalRecord {
  exerciseId: string;
  exerciseName: string;
  maxWeight: number;
  maxRepsAtMaxWeight: number;
  estimated1RM: number;
  bestVolumeSet: number; // weight * reps
  achievedDate: string;
}

export interface UserSettings {
  weightUnit: 'kg' | 'lbs';
  barWeight: number; // e.g. 20 for kg, 45 for lbs
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  defaultRestTimeSeconds: number;
  keepScreenAwake: boolean;
  theme: 'dark';
}

/** Linear-progression settings for one lift (StrongLifts-style). */
export interface ProgressionConfig {
  exerciseId: string;
  name: string;
  startingWeight: number;
  weightIncrement: number;
  /** e.g. '5x5' or '1x5' */
  defaultSetsReps: string;
  currentWeight: number;
}

export type ProgressionConfigs = Record<string, ProgressionConfig>;
export type PersonalRecords = Record<string, PersonalRecord>;

export type WeightUnit = UserSettings['weightUnit'];
