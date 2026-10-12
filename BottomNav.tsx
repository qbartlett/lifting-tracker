import React from 'react';
import { Dumbbell, Layers, BookOpen, History } from 'lucide-react';
import { haptics } from '../utils/haptics';

export type TabType = 'workout' | 'routines' | 'exercises' | 'history';

interface BottomNavProps {
  activeTab: TabType;
  hasActiveWorkout: boolean;
  onTabChange: (tab: TabType) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  hasActiveWorkout,
  onTabChange,
}) => {
  const tabs = [
    {
      id: 'workout' as TabType,
      label: hasActiveWorkout ? 'Active' : 'Workout',
      icon: Dumbbell,
      hasBadge: hasActiveWorkout,
    },
    {
      id: 'routines' as TabType,
      label: 'Routines',
      icon: Layers,
    },
    {
      id: 'exercises' as TabType,
      label: 'Exercises',
      icon: BookOpen,
    },
    {
      id: 'history' as TabType,
      label: 'History',
      icon: History,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800/80 pb-safe">
      <div className="max-w-md mx-auto grid grid-cols-4 items-center h-16 px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => {
                haptics.light();
                onTabChange(tab.id);
              }}
              className="relative flex flex-col items-center justify-center h-full min-h-[44px] transition-colors group"
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-transform group-active:scale-90 ${
                    isActive ? 'text-red-500 stroke-[2.5]' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                />
                {tab.hasBadge && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                )}
                {tab.hasBadge && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-600 border border-zinc-950" />
                )}
              </div>
              <span
                className={`text-[10px] font-bold tracking-tight mt-1 transition-colors ${
                  isActive ? 'text-white' : 'text-zinc-500'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
