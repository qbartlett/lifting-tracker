import React, { useState } from 'react';
import { Search, Plus, Dumbbell, Award, ChevronRight } from 'lucide-react';
import { Exercise, MuscleGroup, PersonalRecord, UserSettings } from '../types/lifting';
import { haptics } from '../utils/haptics';
import { ExerciseLibraryModal } from './ExerciseLibraryModal';

interface ExerciseCatalogViewProps {
  exercises: Exercise[];
  personalRecords: Record<string, PersonalRecord>;
  settings: UserSettings;
  onAddCustomExercise: (ex: Exercise) => void;
  onSelectForWorkout?: (ex: Exercise) => void;
}

const MUSCLE_CATEGORIES: (MuscleGroup | 'All')[] = [
  'All',
  'Chest',
  'Back',
  'Shoulders',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Biceps',
  'Triceps',
  'Abs',
  'Calves',
];

export const ExerciseCatalogView: React.FC<ExerciseCatalogViewProps> = ({
  exercises,
  personalRecords,
  settings,
  onAddCustomExercise,
  onSelectForWorkout,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<MuscleGroup | 'All'>('All');
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const filtered = exercises.filter((ex) => {
    const matchesSearch =
      ex.name.toLowerCase().includes(search.toLowerCase()) ||
      ex.category.toLowerCase().includes(search.toLowerCase()) ||
      ex.equipment.toLowerCase().includes(search.toLowerCase());

    const matchesCategory = selectedCategory === 'All' || ex.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="pb-32 pt-2 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-white tracking-tight">
            Exercise Database
          </h3>
          <p className="text-xs text-zinc-400">
            {exercises.length} movements with technique cues & PR tracking
          </p>
        </div>
        <button
          onClick={() => {
            haptics.light();
            setShowAddModal(true);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 text-white hover:bg-red-500 text-xs font-bold transition shadow-md shadow-red-600/30"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Custom</span>
        </button>
      </div>

      {/* Search & Categories */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search exercises by name, muscle, equipment..."
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 pl-10 pr-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {MUSCLE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                haptics.light();
                setSelectedCategory(cat);
              }}
              className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                selectedCategory === cat
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800/80'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Exercise Cards */}
      <div className="space-y-2">
        {filtered.map((exercise) => {
          const pr = personalRecords[exercise.id];
          return (
            <div
              key={exercise.id}
              onClick={() => {
                haptics.light();
                setSelectedExercise(exercise);
              }}
              className="p-3.5 rounded-2xl border border-zinc-800 bg-zinc-900 hover:border-zinc-700 cursor-pointer transition flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-red-500 shrink-0">
                  <Dumbbell className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white tracking-tight">
                    {exercise.name}
                  </h4>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                    <span className="text-red-500 font-semibold">{exercise.category}</span>
                    <span aria-hidden="true">·</span>
                    <span>{exercise.equipment}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {pr && (
                  <div className="text-right">
                    <span className="text-[10px] text-zinc-400 uppercase font-bold block">
                      PR
                    </span>
                    <span className="text-xs font-mono font-black text-red-500 tabular-nums">
                      {pr.maxWeight} {settings.weightUnit}
                    </span>
                  </div>
                )}
                <ChevronRight className="w-4 h-4 text-zinc-500" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Exercise Detail Sheet */}
      {selectedExercise && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="relative w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl overflow-hidden ring-1 ring-red-500/20">
            <div className="flex items-start justify-between pb-3 border-b border-zinc-800">
              <div>
                <span className="text-xs font-bold text-red-500 uppercase">
                  {selectedExercise.category} · {selectedExercise.equipment}
                </span>
                <h3 className="text-lg font-black text-white tracking-tight mt-0.5">
                  {selectedExercise.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedExercise(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                ✕
              </button>
            </div>

            {/* PR stats */}
            {personalRecords[selectedExercise.id] && (
              <div className="mt-4 p-3 rounded-2xl bg-zinc-950 border border-zinc-800">
                <div className="flex items-center gap-1.5 text-xs font-bold text-red-400 mb-2">
                  <Award className="w-4 h-4" />
                  <span>Personal Best</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Max Weight</span>
                    <span className="font-mono font-black text-white text-sm tabular-nums">
                      {personalRecords[selectedExercise.id].maxWeight} {settings.weightUnit}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Estimated 1RM</span>
                    <span className="font-mono font-black text-red-500 text-sm tabular-nums">
                      {personalRecords[selectedExercise.id].estimated1RM} {settings.weightUnit}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Achieved</span>
                    <span className="font-mono text-zinc-300 text-[11px]">
                      {personalRecords[selectedExercise.id].achievedDate}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Instructions */}
            <div className="mt-4 space-y-2">
              <span className="text-xs font-bold text-zinc-300 uppercase">
                Technique Cues & Execution
              </span>
              <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                {selectedExercise.instructions ||
                  'Control the eccentric portion, brace abdominal core, and drive through a full active range of motion.'}
              </p>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setSelectedExercise(null)}
                className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-200 text-xs font-bold hover:bg-zinc-700 transition"
              >
                Close
              </button>
              {onSelectForWorkout && (
                <button
                  onClick={() => {
                    onSelectForWorkout(selectedExercise);
                    setSelectedExercise(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-xs font-black hover:bg-red-500 transition shadow-lg shadow-red-600/30"
                >
                  Add to Workout
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Custom Exercise Modal */}
      {showAddModal && (
        <ExerciseLibraryModal
          exercises={exercises}
          onSelectExercise={() => {
            setShowAddModal(false);
          }}
          onAddCustomExercise={(ex) => {
            onAddCustomExercise(ex);
            setShowAddModal(false);
          }}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
};
