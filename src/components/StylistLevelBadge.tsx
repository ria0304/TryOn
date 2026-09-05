import React from 'react';
import { StylistStats } from '../types';
import { Sparkles, Trophy, Award, Scroll } from 'lucide-react';

interface StylistLevelBadgeProps {
  stats: StylistStats;
  onOpenQuests: () => void;
}

const LEVEL_TITLES = [
  'Novice Stylist',
  'Trendsetter',
  'Haute Couturier',
  'Fashion Icon',
  'Runway Legend',
];

export const StylistLevelBadge: React.FC<StylistLevelBadgeProps> = ({ stats, onOpenQuests }) => {
  const currentTitle = LEVEL_TITLES[Math.min(stats.level - 1, LEVEL_TITLES.length - 1)];
  const xpForNextLevel = stats.level * 300;
  const currentLevelXp = stats.xp % 300;
  const xpPercentage = Math.min(100, Math.floor((currentLevelXp / 300) * 100));

  return (
    <div className="flex items-center gap-3">
      {/* Level Banner Pill */}
      <button
        type="button"
        onClick={onOpenQuests}
        className="flex items-center gap-2.5 px-3 py-1.5 bg-[#FFF8FA] border border-[#F3D3DB] hover:border-[#E97A9A]/60 rounded-2xl shadow-sm transition-all cursor-pointer group"
      >
        <div className="w-7 h-7 rounded-xl bg-[#E97A9A] text-white flex items-center justify-center font-bold text-xs shadow-sm">
          {stats.level}
        </div>
        <div className="text-left hidden sm:block">
          <div className="flex items-center gap-1">
            <span className="text-xs font-bold text-[#2F2A2E]">{currentTitle}</span>
            <Sparkles className="w-3 h-3 text-[#E97A9A] group-hover:scale-125 transition-transform" />
          </div>
          <div className="w-24 h-1.5 bg-[#F8D7DE] rounded-full overflow-hidden mt-0.5">
            <div
              className="h-full bg-gradient-to-r from-[#F6C9D5] to-[#E97A9A] rounded-full transition-all duration-300"
              style={{ width: `${xpPercentage}%` }}
            />
          </div>
        </div>
      </button>

      {/* Quests Launch Button */}
      <button
        type="button"
        onClick={onOpenQuests}
        className="p-2 bg-[#FFF8FA] border border-[#F3D3DB] hover:border-[#E97A9A] text-[#2F2A2E] rounded-2xl transition-all cursor-pointer relative"
        title="View Dress-Up Quests & Achievements"
      >
        <Scroll className="w-4.5 h-4.5 text-[#E97A9A]" />
        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#E97A9A] rounded-full ring-2 ring-white animate-pulse" />
      </button>
    </div>
  );
};
