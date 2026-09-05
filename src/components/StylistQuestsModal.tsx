import React from 'react';
import { StylistStats, StylistQuest } from '../types';
import { Award, Trophy, CheckCircle2, Circle, Sparkles, X, Flame } from 'lucide-react';
import { soundFx } from '../lib/sound';

interface StylistQuestsModalProps {
  stats: StylistStats;
  quests: StylistQuest[];
  onClose: () => void;
  onClaimQuest: (questId: string) => void;
}

export const StylistQuestsModal: React.FC<StylistQuestsModalProps> = ({
  stats,
  quests,
  onClose,
  onClaimQuest,
}) => {
  const handleClaim = (q: StylistQuest) => {
    const alreadyClaimed = stats.completedQuestIds.includes(q.id);
    if (alreadyClaimed || !q.unlocked) return;
    soundFx.playLevelUpSound();
    onClaimQuest(q.id);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#111827]/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white border border-[#F3D3DB] rounded-3xl p-6 sm:p-8 max-w-xl w-full relative shadow-2xl space-y-6">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#F3D3DB] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#E97A9A]/10 border border-[#E97A9A]/20 flex items-center justify-center text-[#E97A9A]">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#2F2A2E]">Dress-Up Quests &amp; Stylist Rank</h2>
              <p className="text-xs text-[#6D6670]">Complete styling challenges to earn XP and level up!</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-[#FFF8FA] border border-[#F3D3DB] text-[#6D6670] hover:text-[#2F2A2E] flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Level Stats Summary */}
        <div className="bg-gradient-to-r from-[#FFF8FA] via-[#F8D7DE]/40 to-[#FFF8FA] border border-[#F3D3DB] rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#E97A9A]">Stylist Level</span>
            <p className="text-2xl font-black text-[#2F2A2E]">Level {stats.level}</p>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#6D6670]">Total XP Earned</span>
            <p className="text-xl font-mono font-bold text-[#E97A9A]">{stats.xp} XP</p>
          </div>
        </div>

        {/* Quests List */}
        <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
          {quests.map((q) => {
            const isCompleted = stats.completedQuestIds.includes(q.id);

            return (
              <div
                key={q.id}
                className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 ${
                  isCompleted
                    ? 'bg-[#FFF8FA] border-[#F3D3DB]/60 opacity-80'
                    : 'bg-white border-[#F3D3DB] hover:border-[#E97A9A]/40 shadow-sm'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <span className="text-2xl">{q.icon}</span>
                  <div>
                    <h4 className="text-xs font-bold text-[#2F2A2E] flex items-center gap-1.5">
                      {q.title}
                      {isCompleted && (
                        <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md font-normal">
                          Completed
                        </span>
                      )}
                    </h4>
                    <p className="text-[11px] text-[#6D6670] mt-0.5">{q.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-[#E97A9A] bg-[#FFF8FA] px-2.5 py-1 rounded-xl border border-[#F3D3DB]">
                    +{q.xpReward} XP
                  </span>

                  {isCompleted ? null : q.unlocked ? (
                    <button
                      type="button"
                      onClick={() => handleClaim(q)}
                      className="px-3.5 py-1.5 bg-[#E97A9A] hover:bg-[#E5678C] text-white font-bold text-xs rounded-xl shadow-sm cursor-pointer transition-all active:scale-95"
                    >
                      Complete
                    </button>
                  ) : (
                    <span className="px-3.5 py-1.5 bg-[#FFF8FA] text-[#6D6670] font-bold text-xs rounded-xl border border-[#F3D3DB] flex items-center gap-1.5">
                      <Circle className="w-3 h-3" />
                      Locked
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
