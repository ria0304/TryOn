import React, { useState } from 'react';
import { Outfit, Category } from '../types';
import { ThreeMannequin } from './ThreeMannequin';
import { Columns, ArrowRightLeft, Shirt, Plus, Info, Check } from 'lucide-react';
import { motion } from 'motion/react';
import { soundFx } from '../lib/sound';

interface CompareViewProps {
  outfits: Outfit[];
  onNavigateToBuilder: () => void;
  onLoadOutfit?: (outfit: Outfit) => void;
  initialCompareOutfit?: Outfit;
}

const ALL_CATEGORIES: Category[] = [
  'top', 'bottom', 'dress', 'jacket', 'shoes', 'bag', 'jewellery', 'accessories'
];

const CATEGORY_LABELS: Record<Category, string> = {
  top: 'Top',
  bottom: 'Bottom',
  dress: 'Dress',
  jacket: 'Jacket',
  shoes: 'Shoes',
  bag: 'Bag',
  jewellery: 'Jewellery',
  accessories: 'Accessories',
};

const CATEGORY_ICONS: Record<Category, string> = {
  top: '👚',
  bottom: '👖',
  dress: '👗',
  jacket: '🧥',
  shoes: '👟',
  bag: '👜',
  jewellery: '💍',
  accessories: '🎀',
};

export const CompareView: React.FC<CompareViewProps> = ({
  outfits,
  onNavigateToBuilder,
  onLoadOutfit,
  initialCompareOutfit,
}) => {
  const [leftSelectionId, setLeftSelectionId] = useState<string>(
    initialCompareOutfit?.id || outfits[0]?.id || ''
  );
  const [rightSelectionId, setRightSelectionId] = useState<string>(
    outfits[1]?.id || outfits[0]?.id || ''
  );

  const leftOutfit = outfits.find((o) => o.id === leftSelectionId) || outfits[0];
  const rightOutfit = outfits.find((o) => o.id === rightSelectionId) || outfits[1] || outfits[0];

  const handleSwap = () => {
    soundFx.playSnapSound();
    const temp = leftSelectionId;
    setLeftSelectionId(rightSelectionId);
    setRightSelectionId(temp);
  };

  const handleLoad = (outfit: Outfit) => {
    soundFx.playSnapSound();
    if (onLoadOutfit) onLoadOutfit(outfit);
  };

  if (outfits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
        <div className="w-20 h-20 bg-[#FFF8FA] rounded-full flex items-center justify-center text-[#E97A9A] border border-[#F3D3DB]">
          <Columns className="w-10 h-10" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-[#2F2A2E]">No Outfits to Compare</h3>
          <p className="text-sm text-[#6D6670] max-w-xs mx-auto">
            Save at least two outfit combinations in the planner to compare them side-by-side.
          </p>
        </div>
        <button
          onClick={onNavigateToBuilder}
          className="flex items-center gap-2 px-6 py-3 bg-[#111827] text-white rounded-xl font-bold text-sm hover:bg-[#1f2937] transition-all shadow-md"
        >
          <Plus className="w-4 h-4 text-[#E97A9A]" />
          <span>Go to Planner</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-[#F3D3DB] rounded-3xl p-6 shadow-sm">
        <div>
          <h2 className="text-2xl font-sans font-bold text-[#2F2A2E] tracking-wide">Compatibility Comparison</h2>
          <p className="text-xs text-[#6D6670] mt-1">
            Compare two different combinations to see which pieces work better together.
          </p>
        </div>

        <button
          onClick={handleSwap}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#FFF8FA] border border-[#F3D3DB] text-[#2F2A2E] text-xs font-bold rounded-xl hover:bg-[#F6C9D5] transition-all shadow-sm"
        >
          <ArrowRightLeft className="w-4 h-4 text-[#E97A9A]" />
          <span>Swap Sides</span>
        </button>
      </div>

      {/* Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left Side */}
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-[#6D6670] uppercase tracking-wider block">Outfit A</label>
            <select
              value={leftSelectionId}
              onChange={(e) => setLeftSelectionId(e.target.value)}
              className="w-full px-4 py-3 border border-[#F3D3DB] bg-white rounded-2xl text-sm font-bold text-[#2F2A2E] focus:outline-none focus:ring-2 focus:ring-[#E97A9A] cursor-pointer shadow-sm"
            >
              {outfits.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>

          <div className="aspect-[3/4] bg-[#FFF8FA] border border-[#F3D3DB] rounded-[40px] p-8 flex items-center justify-center relative overflow-hidden shadow-inner">
            {leftOutfit && <ThreeMannequin state={{ ...leftOutfit.items, avatar: leftOutfit.avatar }} />}
          </div>

          <button
            onClick={() => handleLoad(leftOutfit)}
            className="w-full py-4 bg-white border border-[#F3D3DB] text-[#2F2A2E] text-xs font-bold rounded-2xl hover:bg-[#FFF8FA] transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            <Shirt className="w-4 h-4 text-[#E97A9A]" />
            <span>Open in Planner</span>
          </button>
        </div>

        {/* Right Side */}
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-[#6D6670] uppercase tracking-wider block">Outfit B</label>
            <select
              value={rightSelectionId}
              onChange={(e) => setRightSelectionId(e.target.value)}
              className="w-full px-4 py-3 border border-[#F3D3DB] bg-white rounded-2xl text-sm font-bold text-[#2F2A2E] focus:outline-none focus:ring-2 focus:ring-[#E97A9A] cursor-pointer shadow-sm"
            >
              {outfits.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>

          <div className="aspect-[3/4] bg-[#FFF8FA] border border-[#F3D3DB] rounded-[40px] p-8 flex items-center justify-center relative overflow-hidden shadow-inner">
            {rightOutfit && <ThreeMannequin state={{ ...rightOutfit.items, avatar: rightOutfit.avatar }} />}
          </div>

          <button
            onClick={() => handleLoad(rightOutfit)}
            className="w-full py-4 bg-white border border-[#F3D3DB] text-[#2F2A2E] text-xs font-bold rounded-2xl hover:bg-[#FFF8FA] transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            <Shirt className="w-4 h-4 text-[#E97A9A]" />
            <span>Open in Planner</span>
          </button>
        </div>
      </div>

      {/* Piece-by-Piece Matrix */}
      <div className="bg-white border border-[#F3D3DB] rounded-3xl p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500">
            <Info className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[#2F2A2E]">Compatibility Matrix</h3>
            <p className="text-xs text-[#6D6670]">Direct comparison of pieces across categories</p>
          </div>
        </div>

        <div className="space-y-4">
          {ALL_CATEGORIES.map((cat) => {
            const itemA = leftOutfit?.items[cat];
            const itemB = rightOutfit?.items[cat];
            if (!itemA && !itemB) return null;

            return (
              <div key={cat} className="grid grid-cols-12 gap-4 items-center p-4 bg-[#FFF8FA] rounded-2xl border border-[#F3D3DB]/50">
                <div className="col-span-2 flex items-center gap-2">
                  <span className="text-xl">{CATEGORY_ICONS[cat]}</span>
                  <span className="text-[10px] font-bold text-[#6D6670] uppercase">{CATEGORY_LABELS[cat]}</span>
                </div>
                
                <div className="col-span-5 flex items-center gap-3 px-4 border-l border-[#F3D3DB]">
                  {itemA ? (
                    <>
                      <div className="w-10 h-10 rounded-lg bg-white border border-[#F3D3DB] p-1 overflow-hidden shrink-0">
                        <img src={itemA.cutoutUrl || itemA.imageUrl} alt="" className="w-full h-full object-contain" />
                      </div>
                      <span className="text-xs font-bold text-[#2F2A2E] truncate">{itemA.name}</span>
                    </>
                  ) : (
                    <span className="text-[10px] text-[#6D6670] italic">Empty</span>
                  )}
                </div>

                <div className="col-span-5 flex items-center gap-3 px-4 border-l border-[#F3D3DB]">
                  {itemB ? (
                    <>
                      <div className="w-10 h-10 rounded-lg bg-white border border-[#F3D3DB] p-1 overflow-hidden shrink-0">
                        <img src={itemB.cutoutUrl || itemB.imageUrl} alt="" className="w-full h-full object-contain" />
                      </div>
                      <span className="text-xs font-bold text-[#2F2A2E] truncate">{itemB.name}</span>
                    </>
                  ) : (
                    <span className="text-[10px] text-[#6D6670] italic">Empty</span>
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
