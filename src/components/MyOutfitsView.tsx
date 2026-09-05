import React from 'react';
import { Outfit, Garment } from '../types';
import { Sparkles, Trash2, Heart, RefreshCw, Columns } from 'lucide-react';

interface MyOutfitsViewProps {
  outfits: Outfit[];
  onDeleteOutfit: (id: string) => void;
  onLoadOutfit: (outfit: Outfit) => void;
  onCompareOutfit: (outfit: Outfit) => void;
  onNavigateToBuilder: () => void;
  searchQuery: string;
}

export const MyOutfitsView: React.FC<MyOutfitsViewProps> = ({
  outfits,
  onDeleteOutfit,
  onLoadOutfit,
  onCompareOutfit,
  onNavigateToBuilder,
  searchQuery,
}) => {
  // Filter outfits by search query
  const filteredOutfits = outfits.filter((outfit) => {
    const nameMatch = outfit.name.toLowerCase().includes(searchQuery.toLowerCase());
    const garmentMatch = Object.values(outfit.items).some((gar) => {
      const item = gar as Garment | undefined;
      return item && item.name.toLowerCase().includes(searchQuery.toLowerCase());
    });
    return nameMatch || garmentMatch;
  });

  return (
    <div className="p-4 space-y-6 animate-in fade-in duration-300" id="outfits-view">
      {/* View Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-sans font-bold text-[#2F2A2E] tracking-wide">My Saved Lookbooks</h2>
          <p className="text-sm text-[#6D6670] mt-1">
            Browse through your saved ensembles, wear them instantly, or compare them
          </p>
        </div>
        <button
          onClick={onNavigateToBuilder}
          className="bg-[#E97A9A] hover:bg-[#E5678C] text-white px-5 py-3 rounded-2xl font-bold text-sm transition-all duration-200 flex items-center gap-2 cursor-pointer shadow-md active:scale-[0.98]"
        >
          <Sparkles className="w-4 h-4 fill-white text-white" />
          Create New Outfit
        </button>
      </div>

      {/* Outfits Grid */}
      {filteredOutfits.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredOutfits.map((outfit) => {
            const dateStr = new Date(outfit.createdAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            });
 
            // Count equipped garments in this outfit
            const totalItems = Object.values(outfit.items).filter(Boolean).length;
 
            return (
              <div
                key={outfit.id}
                className="group relative bg-[#FFFFFF] border border-[#F3D3DB] rounded-2xl overflow-hidden hover:shadow-md hover:border-[#E97A9A]/40 transition-all duration-300 flex flex-col p-5 gap-4 shadow-sm"
              >
                {/* Card Title & Meta */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-sans font-bold text-base text-[#2F2A2E] group-hover:text-[#E97A9A] transition-colors truncate max-w-[180px]">
                      {outfit.name}
                    </h3>
                    <p className="text-[10px] text-[#6D6670] font-mono mt-0.5">{dateStr}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#F6C9D5] border border-[#F3D3DB] text-[#E97A9A] flex items-center gap-1 shadow-sm">
                    <Heart className="w-3 h-3 fill-[#E97A9A]/20" /> {totalItems} items
                  </span>
                </div>
 
                {/* Collage preview of equipped items */}
                <div className="grid grid-cols-5 gap-2 bg-[#FFF8FA] p-3 rounded-xl border border-[#F3D3DB]">
                  {(['top', 'bottom', 'shoes', 'bag', 'accessories'] as const).map((cat) => {
                    const item = outfit.items[cat];
                    return (
                      <div
                        key={cat}
                        className="flex flex-col items-center justify-center gap-1.5 p-1 bg-[#FFFFFF] rounded-lg border border-[#F3D3DB]/60 shadow-sm relative group/item"
                      >
                        {/* Little color circle representing the category item */}
                        {item ? (
                          <>
                            <div
                              className="w-8 h-8 rounded-full border border-[#F3D3DB] flex items-center justify-center text-sm shadow-sm group-hover/item:scale-105 transition-transform"
                              style={{ backgroundColor: `${item.color}20` }}
                            >
                              <span style={{ color: item.color }}>
                                {cat === 'top' && '👚'}
                                {cat === 'bottom' && '👗'}
                                {cat === 'shoes' && '👟'}
                                {cat === 'bag' && '👜'}
                                {cat === 'accessories' && '🎀'}
                              </span>
                            </div>
                            <span className="text-[8px] font-sans text-[#2F2A2E] text-center font-medium truncate w-full px-0.5">
                              {item.name}
                            </span>
                          </>
                        ) : (
                          <>
                            <div className="w-8 h-8 rounded-full border border-dashed border-[#F3D3DB] bg-[#FFF8FA] flex items-center justify-center text-[10px] text-[#6D6670]/40">
                              -
                            </div>
                            <span className="text-[8px] font-sans text-[#6D6670] font-medium capitalize">
                              {cat === 'accessories' ? 'Acc.' : cat}
                            </span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
 
                {/* Bottom Interactive Toolbar */}
                <div className="flex items-center gap-2.5 mt-2">
                  <button
                    onClick={() => onLoadOutfit(outfit)}
                    className="flex-1 bg-[#E97A9A] hover:bg-[#E5678C] text-white py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-white" /> Wear Outfit
                  </button>
 
                  <button
                    onClick={() => onCompareOutfit(outfit)}
                    className="p-2.5 bg-[#FFF8FA] hover:bg-[#F6C9D5] text-[#2F2A2E] border border-[#F3D3DB] rounded-xl transition-all cursor-pointer"
                    title="Load into side-by-side comparison"
                  >
                    <Columns className="w-4 h-4" />
                  </button>
 
                  <button
                    onClick={() => onDeleteOutfit(outfit.id)}
                    className="p-2.5 bg-red-50 border border-red-100 hover:bg-red-100 text-red-600 rounded-xl transition-all cursor-pointer"
                    title="Delete saved lookbook"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-20 border border-dashed border-[#F3D3DB] rounded-3xl flex flex-col items-center justify-center text-center bg-[#FFFFFF]">
          <div className="w-16 h-16 rounded-full bg-[#F6C9D5] border border-[#F3D3DB] text-[#E97A9A] flex items-center justify-center text-xl mb-4 shadow-sm">
            ✨
          </div>
          <h3 className="text-base font-semibold text-[#2F2A2E]">Your wardrobe lookbook is empty</h3>
          <p className="text-xs text-[#6D6670] mt-1.5 max-w-xs leading-relaxed">
            Drag, style, and combine garments on the mannequin home page, then click &quot;Save Outfit&quot; to build your personalized style catalog!
          </p>
          <button
            onClick={onNavigateToBuilder}
            className="mt-5 text-xs text-[#E97A9A] font-mono font-bold hover:text-[#E5678C]"
          >
            Go to Outfit Builder &rarr;
          </button>
        </div>
      )}
    </div>
  );
};
