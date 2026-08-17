import React, { useState } from 'react';
import { Category, Garment, OutfitBuilderState, Placement } from '../types';
import { ThreeMannequin } from './ThreeMannequin';
import { WardrobePanel } from './WardrobePanel';
import { StyleMeter } from './StyleMeter';
import { RunwayPhotoboothModal } from './RunwayPhotoboothModal';
import { PhotorealisticTryOnModal } from './PhotorealisticTryOnModal';
import { Settings, X, Undo, Redo, Save, Plus } from 'lucide-react';
import { soundFx } from '../lib/sound';

interface OutfitBuilderCanvasProps {
  state: OutfitBuilderState;
  onSelectGarment: (garment: Garment) => void;
  onRemoveGarment: (category: Category) => void;
  onUpdatePlacement: (category: Category, placement: Placement) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  garments: Garment[];
  onSaveOutfit: (name: string) => void;
  onNavigateToUpload: () => void;
  onFileDrop: (url: string) => void;
  onAvatarChange?: (avatar: 'feminine' | 'masculine' | 'neutral') => void;
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

export const OutfitBuilderCanvas: React.FC<OutfitBuilderCanvasProps> = ({
  state,
  onSelectGarment,
  onRemoveGarment,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  garments,
  onSaveOutfit,
  onNavigateToUpload,
  onFileDrop,
  onAvatarChange,
}) => {
  const [activeCategory, setActiveCategory] = useState<Category>('top');
  const [showSettings, setShowSettings] = useState(false);
  const [outfitName, setOutfitName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showPhotobooth, setShowPhotobooth] = useState(false);
  const [showPhotorealisticTryOn, setShowPhotorealisticTryOn] = useState(false);

  const categories = ALL_CATEGORIES.map((id) => ({
    id,
    label: CATEGORY_LABELS[id],
    icon: CATEGORY_ICONS[id],
  }));

  const handleSelectGarmentWithSound = (garment: Garment) => {
    soundFx.playSnapSound();
    onSelectGarment(garment);
  };

  const handleSave = () => {
    if (!outfitName.trim()) {
      const generatedName = `Outfit ${new Date().toLocaleDateString()}`;
      onSaveOutfit(generatedName);
    } else {
      onSaveOutfit(outfitName);
    }
    setOutfitName('');
    setIsSaving(false);
  };

  return (
    <div className="bg-[#FFFFFF] border border-[#F3D3DB] rounded-3xl p-6 shadow-sm space-y-6 relative overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#F3D3DB] pb-6">
        <div>
          <h2 className="text-xl font-sans font-bold text-[#2F2A2E] tracking-wide">Composition Canvas</h2>
          <p className="text-xs text-[#6D6670] mt-1">Mix pieces to visualize outfit compatibility</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-[#FFF8FA] rounded-xl border border-[#F3D3DB] p-1">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className={`p-2 rounded-lg transition-all ${canUndo ? 'text-[#2F2A2E] hover:bg-[#F6C9D5]' : 'text-gray-300'}`}
              title="Undo"
            >
              <Undo className="w-4 h-4" />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className={`p-2 rounded-lg transition-all ${canRedo ? 'text-[#2F2A2E] hover:bg-[#F6C9D5]' : 'text-gray-300'}`}
              title="Redo"
            >
              <Redo className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => setShowSettings(true)}
            className="p-2.5 rounded-xl bg-[#FFF8FA] border border-[#F3D3DB] text-[#6D6670] hover:bg-[#F6C9D5] hover:text-[#2F2A2E] transition-all"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsSaving(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#111827] text-white text-xs font-bold rounded-xl hover:bg-[#1f2937] transition-all shadow-sm"
          >
            <Save className="w-3.5 h-3.5 text-[#E97A9A]" />
            <span>Save Combination</span>
          </button>
        </div>
      </div>

      {/* Main Builder Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Wardrobe Panel */}
        <div className="lg:col-span-4 h-[500px]">
          <WardrobePanel
            category={activeCategory}
            garments={garments}
            onSelectGarment={handleSelectGarmentWithSound}
            equippedGarmentId={state[activeCategory]?.id}
            onNavigateToUpload={onNavigateToUpload}
            onFileDrop={(file) => {
              const reader = new FileReader();
              reader.onload = () => onFileDrop(reader.result as string);
              reader.readAsDataURL(file);
            }}
          />
        </div>

        {/* Mannequin Preview */}
        <div className="lg:col-span-5 relative bg-[#FFF8FA] border border-[#F3D3DB] rounded-3xl p-4 flex items-center justify-center min-h-[500px] shadow-inner group">
          <ThreeMannequin state={state} />
          
          {/* Category Quick Select (Overlay) */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 bg-white/80 backdrop-blur-md p-2 rounded-2xl border border-[#F3D3DB] shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${
                  activeCategory === cat.id ? 'bg-[#E97A9A] text-white shadow-md' : 'hover:bg-[#F6C9D5]'
                }`}
                title={cat.label}
              >
                <span className="text-lg">{cat.icon}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Selection Details & Controls */}
        <div className="lg:col-span-3 space-y-4">
          <StyleMeter
            state={state}
            onOpenPhotobooth={() => setShowPhotobooth(true)}
            onOpenPhotorealisticTryOn={() => setShowPhotorealisticTryOn(true)}
          />

          <div className="bg-[#FFFFFF] border border-[#F3D3DB] rounded-2xl p-5 shadow-sm">
            <h3 className="text-[10px] font-bold text-[#6D6670] uppercase tracking-wider mb-4">Current Selection</h3>
            <div className="space-y-3">
              {ALL_CATEGORIES.map((cat) => {
                const item = state[cat];
                if (!item) return null;
                return (
                  <div key={cat} className="flex items-center justify-between p-2 bg-[#FFF8FA] rounded-xl border border-[#F3D3DB]/50">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="text-sm shrink-0">{CATEGORY_ICONS[cat]}</span>
                      <span className="text-[11px] font-bold text-[#2F2A2E] truncate">{item.name}</span>
                    </div>
                    <button 
                      onClick={() => onRemoveGarment(cat)}
                      className="p-1 text-[#6D6670] hover:text-rose-500 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
              {!Object.values(state).some(v => typeof v === 'object') && (
                <p className="text-[11px] text-[#6D6670] italic text-center py-4">No pieces selected</p>
              )}
            </div>
          </div>

          <div className="bg-[#FFFFFF] border border-[#F3D3DB] rounded-2xl p-5 shadow-sm">
            <h3 className="text-[10px] font-bold text-[#6D6670] uppercase tracking-wider mb-4">Quick Actions</h3>
            <button 
              onClick={onNavigateToUpload}
              className="w-full flex items-center justify-center gap-2 py-3 bg-[#FFF8FA] border border-dashed border-[#E97A9A]/40 text-[#E97A9A] rounded-xl hover:bg-[#FFF0F3] transition-all text-xs font-bold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add New Piece</span>
            </button>
          </div>
        </div>
      </div>

      {/* Save Modal */}
      {isSaving && (
        <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white border border-[#F3D3DB] rounded-3xl p-8 shadow-2xl max-w-sm w-full space-y-6">
            <div className="text-center">
              <h3 className="text-lg font-bold text-[#2F2A2E]">Save Combination</h3>
              <p className="text-xs text-[#6D6670] mt-1">Give this outfit a name to save it to your library</p>
            </div>
            <input
              type="text"
              value={outfitName}
              onChange={(e) => setOutfitName(e.target.value)}
              placeholder="e.g., Summer Brunch Look"
              className="w-full px-4 py-3 bg-[#FFF8FA] border border-[#F3D3DB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#E97A9A] text-sm"
              autoFocus
            />
            <div className="flex gap-3">
              <button 
                onClick={() => setIsSaving(false)}
                className="flex-1 py-3 text-xs font-bold text-[#6D6670] bg-slate-100 rounded-xl hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                className="flex-1 py-3 text-xs font-bold text-white bg-[#E97A9A] rounded-xl hover:bg-[#D66585] transition-all"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-md w-full relative">
            <button onClick={() => setShowSettings(false)} className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full">
              <X className="w-5 h-5 text-slate-400" />
            </button>
            
            <h3 className="text-lg font-bold text-[#2F2A2E] mb-6">Mannequin Settings</h3>
            
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-[#6D6670] uppercase tracking-wider">Mannequin Type</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['feminine', 'masculine', 'neutral'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => onAvatarChange?.(type)}
                      className={`py-3 rounded-xl text-xs font-bold transition-all border ${
                        state.avatar === type
                          ? 'bg-[#E97A9A] text-white border-[#E97A9A] shadow-md'
                          : 'bg-[#FFF8FA] text-[#6D6670] border-[#F3D3DB] hover:border-[#E97A9A]'
                      }`}
                    >
                      <div className="text-xl mb-1">
                        {type === 'feminine' ? '👩' : type === 'masculine' ? '👨' : '🧑'}
                      </div>
                      <span className="capitalize">{type}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            <button 
              onClick={() => setShowSettings(false)}
              className="w-full mt-8 py-3 bg-[#111827] text-white text-xs font-bold rounded-xl hover:bg-[#1f2937] transition-all"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Runway Photobooth */}
      {showPhotobooth && (
        <RunwayPhotoboothModal
          state={state}
          onClose={() => setShowPhotobooth(false)}
        />
      )}

      {/* Photorealistic AI Mannequin */}
      {showPhotorealisticTryOn && (
        <PhotorealisticTryOnModal
          state={state}
          onClose={() => setShowPhotorealisticTryOn(false)}
        />
      )}
    </div>
  );
};
