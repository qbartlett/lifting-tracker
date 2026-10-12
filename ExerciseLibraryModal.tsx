import React, { useState } from 'react';
import { Search, X, Plus, Dumbbell } from 'lucide-react';
import { Exercise, MuscleGroup, EquipmentType } from '../types/lifting';
import { haptics } from '../utils/haptics';

interface ExerciseLibraryModalProps {
  exercises: Exercise[];
  onSelectExercise: (exercise: Exercise) => void;
  onAddCustomExercise: (exercise: Exercise) => void;
  onClose: () => void;
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

const EQUIPMENT_TYPES: (EquipmentType | 'All')[] = [
  'All',
  'Barbell',
  'Dumbbell',
  'Cable',
  'Machine',
  'Bodyweight',
];

export const ExerciseLibraryModal: React.FC<ExerciseLibraryModalProps> = ({
  exercises,
  onSelectExercise,
  onAddCustomExercise,
  onClose,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<MuscleGroup | 'All'>('All');
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentType | 'All'>('All');
  const [isCreatingCustom, setIsCreatingCustom] = useState(false);

  // New Custom exercise state
  const [customName, setCustomName] = useState('');
  const [customCategory, setCustomCategory] = useState<MuscleGroup>('Chest');
  const [customEquipment, setCustomEquipment] = useState<EquipmentType>('Barbell');
  const [customInstructions, setCustomInstructions] = useState('');

  const filtered = exercises.filter((ex) => {
    const matchesSearch =
      ex.name.toLowerCase().includes(search.toLowerCase()) ||
      ex.category.toLowerCase().includes(search.toLowerCase()) ||
      ex.equipment.toLowerCase().includes(search.toLowerCase());

    const matchesCategory = selectedCategory === 'All' || ex.category === selectedCategory;
    const matchesEquipment = selectedEquipment === 'All' || ex.equipment === selectedEquipment;

    return matchesSearch && matchesCategory && matchesEquipment;
  });

  const handleCreateCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim()) return;

    haptics.medium();
    const newEx: Exercise = {
      id: `custom-${Date.now()}`,
      name: customName.trim(),
      category: customCategory,
      equipment: customEquipment,
      instructions: customInstructions.trim() || undefined,
      isCustom: true,
    };

    onAddCustomExercise(newEx);
    onSelectExercise(newEx);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in">
      <div className="relative w-full max-w-lg h-[88vh] sm:h-[80vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-zinc-800 bg-zinc-900 shadow-2xl overflow-hidden ring-1 ring-red-500/20">
        {/* Mobile handle indicator */}
        <div className="w-12 h-1.5 bg-zinc-700 rounded-full mx-auto mt-3 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between p-4 pb-3 border-b border-zinc-800">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Exercise Library
            </h3>
            <p className="text-xs text-zinc-400">
              {filtered.length} exercises available
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                haptics.light();
                setIsCreatingCustom(!isCreatingCustom);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                isCreatingCustom
                  ? 'bg-red-600 text-white'
                  : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isCreatingCustom ? 'Cancel' : 'New Custom'}</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {isCreatingCustom ? (
          <form onSubmit={handleCreateCustom} className="p-4 space-y-4 overflow-y-auto flex-1">
            <div className="p-3 rounded-2xl bg-red-600/10 border border-red-500/20 text-xs text-red-300">
              Create a custom movement with muscle and equipment tagging for personalized logging.
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-300">Exercise Name</label>
              <input
                type="text"
                required
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Pendlay Row, Hack Squat..."
                className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-zinc-300">Target Muscle</label>
                <select
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value as MuscleGroup)}
                  className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-white focus:border-red-500 focus:outline-none"
                >
                  {MUSCLE_CATEGORIES.filter((c) => c !== 'All').map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-300">Equipment</label>
                <select
                  value={customEquipment}
                  onChange={(e) => setCustomEquipment(e.target.value as EquipmentType)}
                  className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-white focus:border-red-500 focus:outline-none"
                >
                  {EQUIPMENT_TYPES.filter((e) => e !== 'All').map((eq) => (
                    <option key={eq} value={eq}>
                      {eq}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-300">Form Cues / Notes</label>
              <textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="Setup notes, foot position, cues..."
                rows={3}
                className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-sm text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-red-600 font-black text-xs text-white hover:bg-red-500 active:scale-98 transition shadow-lg shadow-red-600/30"
            >
              Save & Add to Workout
            </button>
          </form>
        ) : (
          <>
            <div className="p-3 border-b border-zinc-800/80 space-y-2.5">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search exercise or muscle..."
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 pl-10 pr-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
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
                        : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/50 p-2">
              {filtered.length === 0 ? (
                <div className="py-12 text-center text-zinc-500 text-xs">
                  <Dumbbell className="w-8 h-8 mx-auto mb-2 opacity-40 text-zinc-400" />
                  No exercises match your filter.
                </div>
              ) : (
                filtered.map((exercise) => (
                  <div
                    key={exercise.id}
                    onClick={() => {
                      haptics.medium();
                      onSelectExercise(exercise);
                    }}
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-zinc-800/60 active:bg-zinc-800 cursor-pointer transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700/60 flex items-center justify-center text-red-500 shrink-0">
                        <Dumbbell className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs sm:text-sm font-bold text-white tracking-tight">
                          {exercise.name}
                        </h4>
                        <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                          <span className="text-red-500 font-bold">{exercise.category}</span>
                          <span aria-hidden="true">·</span>
                          <span>{exercise.equipment}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        haptics.medium();
                        onSelectExercise(exercise);
                      }}
                      className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-red-600 hover:text-white text-zinc-300 flex items-center justify-center transition border border-zinc-700/60"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
