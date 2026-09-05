import React, { useMemo } from 'react';
import { OutfitBuilderState, Category } from '../types';
import { Sparkles, Trophy, Flame, Award, Wand2 } from 'lucide-react';
import { soundFx } from '../lib/sound';

interface StyleMeterProps {
  state: OutfitBuilderState;
  onOpenPhotobooth: () => void;
  onOpenPhotorealisticTryOn: () => void;
  onTriggerConfetti?: () => void;
}

export const StyleMeter: React.FC<StyleMeterProps> = ({ state, onOpenPhotobooth, onOpenPhotorealisticTryOn }) => {
  // Calculate real-time dress-up game score based on cutout combination
  const analysis = useMemo(() => {
    let equippedCount = 0;
    const items = [
      state.top,
      state.bottom,
      state.dress,
      state.jacket,
      state.shoes,
      state.bag,
      state.jewellery,
      state.accessories,
    ].filter(Boolean);

    equippedCount = items.length;

    if (equippedCount === 0) {
      return {
        score: 0,
        grade: 'UNSTYLED',
        vibe: 'Bare Mannequin',
        colorHarmony: 'Neutral',
        critique: 'Select cutouts from your wardrobe to start dressing up your mannequin!',
        tips: ['Pick a Top + Bottom or Dress to build your core look.'],
        stars: 0,
      };
    }

    // Base score calculation based on category coverage
    let baseScore = Math.min(100, equippedCount * 22);

    // Bonus for cohesive sets or dress + jacket combinations
    if (state.dress && state.jacket) baseScore += 12;
    if (state.top && state.bottom) baseScore += 10;
    if (state.shoes) baseScore += 8;
    if (state.accessories || state.jewellery) baseScore += 8;
    if (state.bag) baseScore += 8;

    const finalScore = Math.min(100, baseScore);

    // Determine Grade & Stars
    let grade = 'C-RANK';
    let stars = 1;
    if (finalScore >= 90) {
      grade = 'S-RANK';
      stars = 5;
    } else if (finalScore >= 75) {
      grade = 'A-RANK';
      stars = 4;
    } else if (finalScore >= 55) {
      grade = 'B-RANK';
      stars = 3;
    } else if (finalScore >= 35) {
      grade = 'C-RANK';
      stars = 2;
    }

    // Classify Style Vibe based on active cutouts & colors
    const colors = items.map((i) => i!.color.toLowerCase());
    const styles = items.map((i) => i!.style.toLowerCase());

    let vibe = 'Chic Ensemble';
    if (styles.some((s) => s.includes('beret') || s.includes('blouse') || s.includes('pleated'))) {
      vibe = 'Parisian Atelier Chic';
    } else if (styles.some((s) => s.includes('hoodie') || s.includes('sneakers') || s.includes('denim'))) {
      vibe = 'Urban Streetwear Rebel';
    } else if (styles.some((s) => s.includes('sundress') || s.includes('ribbon') || s.includes('pink'))) {
      vibe = 'Coquette Romantic Dream';
    } else if (styles.some((s) => s.includes('blazer') || s.includes('wide_pants') || s.includes('leather'))) {
      vibe = 'Haute Couture Power Suit';
    } else if (colors.some((c) => c.includes('db2777') || c.includes('e879f9'))) {
      vibe = 'Pastel Glamour Goddess';
    }

    // Construct stylist feedback
    const tips: string[] = [];
    if (!state.shoes) tips.push('Add shoes or boots to complete the grounding posture.');
    if (!state.accessories && !state.jewellery) tips.push('Layer a hat, beret, or necklace for S-Rank sparkle points.');
    if (!state.bag) tips.push('Match a clutch or shoulder bag cutout.');
    if (tips.length === 0) tips.push('Spotless styling! This cutout look is runway ready.');

    return {
      score: finalScore,
      grade,
      vibe,
      stars,
      critique: `Your cutout layer synergy scores ${finalScore}%!`,
      tips,
    };
  }, [state]);

  const handleRunwayPhotobooth = () => {
    soundFx.playSparkleSound();
    onOpenPhotobooth();
  };

  const handlePhotorealisticTryOn = () => {
    soundFx.playSparkleSound();
    onOpenPhotorealisticTryOn();
  };

  return (
    <div className="bg-gradient-to-br from-[#FFF8FA] via-[#FFFFFF] to-[#FFF8FA] border border-[#F3D3DB] rounded-3xl p-5 shadow-sm space-y-4 relative overflow-hidden">
      {/* Decorative Glow */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-[#E97A9A]/10 rounded-full blur-2xl pointer-events-none" />

      {/* Header Row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[#E97A9A]/10 border border-[#E97A9A]/20 flex items-center justify-center text-[#E97A9A]">
            <Trophy className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-sans font-bold text-[#2F2A2E] tracking-wider uppercase flex items-center gap-1.5">
              Style Meter &amp; Vibe Score
            </h3>
            <p className="text-[10px] text-[#6D6670]">Real-time Cutout Harmony Evaluation</p>
          </div>
        </div>

        {/* Grade Badge */}
        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1 rounded-xl font-mono text-xs font-bold tracking-wider shadow-sm flex items-center gap-1 ${
              analysis.grade === 'S-RANK'
                ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-white animate-pulse'
                : analysis.grade === 'A-RANK'
                ? 'bg-[#E97A9A] text-white'
                : 'bg-[#F6C9D5] text-[#2F2A2E]'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            {analysis.grade}
          </span>
        </div>
      </div>

      {/* Progress Bar & Vibe Title */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-[#2F2A2E] flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-[#E97A9A]" />
            {analysis.vibe}
          </span>
          <span className="font-mono font-bold text-[#E97A9A]">{analysis.score}%</span>
        </div>

        {/* Meter Bar */}
        <div className="w-full h-3 bg-[#F8D7DE]/50 rounded-full overflow-hidden p-0.5 border border-[#F3D3DB]">
          <div
            className="h-full bg-gradient-to-r from-[#F6C9D5] via-[#E97A9A] to-[#db2777] rounded-full transition-all duration-500 shadow-sm"
            style={{ width: `${analysis.score}%` }}
          />
        </div>

        {/* Stars */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1 text-amber-400">
            {[1, 2, 3, 4, 5].map((starIndex) => (
              <span
                key={starIndex}
                className={`text-sm transition-transform duration-200 ${
                  starIndex <= analysis.stars ? 'scale-110 opacity-100' : 'opacity-25 grayscale'
                }`}
              >
                ★
              </span>
            ))}
          </div>

          <span className="text-[10px] text-[#6D6670]">
            {state.top || state.dress ? 'Main Garment Equipped' : 'Awaiting Main Cutout'}
          </span>
        </div>
      </div>

      {/* Stylist Critique & Tips */}
      <div className="bg-[#FFF8FA] border border-[#F3D3DB] rounded-2xl p-3 space-y-1.5">
        <p className="text-[11px] font-bold text-[#2F2A2E] flex items-center gap-1.5">
          <Wand2 className="w-3.5 h-3.5 text-[#E97A9A]" />
          Stylist Notes:
        </p>
        <p className="text-[11px] text-[#6D6670] leading-relaxed">
          {analysis.tips[0]}
        </p>
      </div>

      {/* Photobooth Runway Launch Button */}
      <button
        type="button"
        onClick={handleRunwayPhotobooth}
        className="w-full py-3 bg-gradient-to-r from-[#111827] to-[#1f2937] hover:from-[#1f2937] hover:to-[#111827] text-white font-bold text-xs rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer group"
      >
        <Flame className="w-4 h-4 text-[#E97A9A] group-hover:scale-125 transition-transform" />
        <span>Snapshot Look in Runway Photobooth</span>
      </button>

      {/* Photorealistic AI Mannequin Launch Button */}
      <button
        type="button"
        onClick={handlePhotorealisticTryOn}
        className="w-full py-3 bg-white border border-[#E97A9A]/40 hover:bg-[#FFF0F3] text-[#E97A9A] font-bold text-xs rounded-2xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer group"
      >
        <Sparkles className="w-4 h-4 group-hover:scale-125 transition-transform" />
        <span>See This Look, Photorealistically</span>
      </button>
    </div>
  );
};
