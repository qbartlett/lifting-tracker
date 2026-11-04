export interface ProgramExercise {
  exerciseId: string;
  name: string;
  category: string;
  equipment: string;
  sets: number;
  reps: number;
  restSeconds: number;
  notes: string | null;
}

export interface ProgramSession {
  id: string;
  /** 0 = Monday ... 6 = Sunday */
  day: number;
  name: string;
  exercises: ProgramExercise[];
}

export interface Program {
  id: string;
  name: string;
  notes: string | null;
  weeks: number;
  sessions: ProgramSession[];
}

/** What the coach edits: a program that may not be saved yet. Session ids are made by the app. */
export type ProgramDraft = Omit<Program, 'id'> & { id?: string };

export interface ProgramAssignment {
  id: string;
  /** Calendar date, YYYY-MM-DD. Week 1 is the Monday-to-Sunday week that contains it. */
  startDate: string;
  coach: { id: string; name: string };
  program: Program;
}

export interface ProgramCompletion {
  workoutId: string;
  sessionId: string;
  week: number;
  completedAt: number;
}
