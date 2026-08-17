import React from 'react';
import { Garment, Category } from '../types';
import { Sparkles, Wand2, Flame, Heart } from 'lucide-react';
import { soundFx } from '../lib/sound';

interface StyleInspirationPresetsProps {
  garments: Garment[];
  onApplyPreset: (equippedMap: Partial<Record<Category, Garment>>) => void;
}

interface PresetDefinition {
  id: string;
  name: string;
  tagline: string;
  emoji: string;
  badgeColor: string;
  garmentIds: string[];
}

const PRESETS: PresetDefinition[] = [
  {
    id: 'preset-coquette',
    name: 'Coquette Tennis',
    tagline: 'Crop Tee + Pleated Skirt + Beret',
    emoji: '🎀',
    badgeColor: 'bg-[#F8D7DE] text-[#E97A9A] border-[#F3D3DB]',
    garmentIds: ['top-2', 'bottom-1', 'shoes-1', 'acc-1', 'bag-2'],
  },
  {
    id: 'preset-parisian',
    name: 'Parisian Chic',
    tagline: 'Silk Blouse + Wide Trousers + Heels',
    emoji: '🥖',
    badgeColor: 'bg-purple-100 text-purple-700 border-purple-200',
    garmentIds: ['top-4', 'bottom-3', 'shoes-2', 'bag-3', 'acc-3'],
  },
  {
    id: 'preset-streetwear',
    name: 'French Streetwear',
    tagline: 'Hoodie + Denim Jeans + Combat Boots',
    emoji: '👟',
    badgeColor: 'bg-zinc-100 text-zinc-800 border-zinc-200',
    garmentIds: ['top-5', 'bottom-2', 'shoes-3', 'bag-1', 'acc-2'],
  },
  {
    id: 'preset-cozy',
    name: 'Pastel Autumn',
    tagline: 'Over-Sweater + Midi Skirt + Scarf',
    emoji: '🍂',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    garmentIds: ['top-3', 'bottom-4', 'shoes-4', 'acc-4', 'bag-4'],
  },
];

export const StyleInspirationPresets: React.FC<StyleInspirationPresetsProps> = ({
  garments,
  onApplyPreset,
}) => {
  const handleSelectPreset = (preset: PresetDefinition) => {
    soundFx.playSparkleSound();
    const equippedMap: Partial<Record<Category, Garment>> = {};
    
    preset.garmentIds.forEach((id) => {
      const match = garments.find((g) => g.id === id);
      if (match) {
        equippedMap[match.category] = match;
      }
    });

    onApplyPreset(equippedMap);
  };

  return (
    <div className="bg-[#FFFFFF] border border-[#F3D3DB] rounded-3xl p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#F8D7DE] flex items-center justify-center text-[#E97A9A]">
            <Wand2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#2F2A2E] tracking-wide">1-Click Style Presets</h3>
            <p className="text-[11px] text-[#6D6670]">Instantly equip curated outfits onto your mannequin</p>
          </div>
        </div>

        <span className="text-[10px] font-bold uppercase tracking-wider text-[#E97A9A] bg-[#FFF8FA] px-2.5 py-1 rounded-full border border-[#F3D3DB]">
          Trending Outfits
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => handleSelectPreset(preset)}
            className="group relative p-3.5 rounded-2xl border border-[#F3D3DB] bg-[#FFF8FA] hover:bg-white hover:border-[#E97A9A] hover:shadow-md transition-all duration-200 text-left flex items-start gap-3 cursor-pointer"
          >
            <span className="text-2xl p-2 rounded-xl bg-white border border-[#F3D3DB] shadow-sm group-hover:scale-110 transition-transform">
              {preset.emoji}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <p className="text-xs font-bold text-[#2F2A2E] truncate group-hover:text-[#E97A9A] transition-colors">
                  {preset.name}
                </p>
                <Sparkles className="w-3 h-3 text-[#E97A9A] opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-[10px] text-[#6D6670] truncate mt-0.5">{preset.tagline}</p>
              <div className="mt-2 inline-flex items-center gap-1 text-[9px] font-bold text-[#E97A9A]">
                <span>Apply Outfit</span>
                <span>→</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
