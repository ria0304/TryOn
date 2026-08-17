import React, { useState } from 'react';
import { Category, Garment } from '../types';
import { Plus, Sparkles, FolderOpen, AlertCircle, ArrowUpRight } from 'lucide-react';

interface WardrobePanelProps {
  category: Category;
  garments: Garment[];
  onSelectGarment: (garment: Garment) => void;
  equippedGarmentId?: string;
  onNavigateToUpload: () => void;
  onFileDrop: (file: File) => void;
}

// All categories matching backend
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

// Naively appending "s" to CATEGORY_LABELS breaks for categories that are
// already plural/uncountable (e.g. "Dress" + "s" = "Dresss", "Shoes" + "s" =
// "Shoess"), so headers get their own explicit plural form.
const CATEGORY_LABELS_PLURAL: Record<Category, string> = {
  top: 'Tops',
  bottom: 'Bottoms',
  dress: 'Dresses',
  jacket: 'Jackets',
  shoes: 'Shoes',
  bag: 'Bags',
  jewellery: 'Jewellery',
  accessories: 'Accessories',
};

const CATEGORY_ICONS: Record<Category, string> = {
  top: '👚',
  bottom: '👗',
  dress: '👗',
  jacket: '🧥',
  shoes: '👟',
  bag: '👜',
  jewellery: '💍',
  accessories: '🎀',
};

export const WardrobePanel: React.FC<WardrobePanelProps> = ({
  category,
  garments,
  onSelectGarment,
  equippedGarmentId,
  onNavigateToUpload,
  onFileDrop,
}) => {
  const [dragActive, setDragActive] = useState(false);

  // Filter garments for the active category in the builder
  const filteredItems = garments.filter((g) => g.category === category);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileDrop(e.dataTransfer.files[0]);
    }
  };

  // Get icon for category
  const getCategoryIcon = (cat: Category): string => {
    return CATEGORY_ICONS[cat] || '👗';
  };

  // Get display name for category
  const getCategoryDisplay = (cat: Category): string => {
    if (cat === 'accessories') return 'Accessory';
    if (cat === 'jewellery') return 'Jewellery';
    return CATEGORY_LABELS[cat];
  };

  // Get plural display name for category (used in headers like "Available Dresses")
  const getCategoryDisplayPlural = (cat: Category): string => {
    return CATEGORY_LABELS_PLURAL[cat];
  };

  return (
    <div
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      className={`h-full border-2 border-dashed rounded-3xl p-5 flex flex-col justify-between transition-all duration-300 relative ${
        dragActive
          ? 'border-[#E97A9A] bg-[#F6C9D5]'
          : 'border-[#F3D3DB] bg-[#FFFFFF] hover:border-[#E97A9A]/40 shadow-sm'
      }`}
      id="wardrobe-builder-panel"
    >
      {/* 1. Header with Category Label */}
      <div className="space-y-1">
        <h3 className="text-sm font-bold text-[#2F2A2E] capitalize flex items-center justify-between font-sans">
          <span className="flex items-center gap-2">
            <span>{getCategoryIcon(category)}</span>
            <span>Available {getCategoryDisplayPlural(category)}</span>
          </span>
          <span className="text-[10px] font-mono text-[#2F2A2E] font-semibold bg-[#FFF8FA] px-2 py-0.5 rounded-md border border-[#F3D3DB]">
            {filteredItems.length} items
          </span>
        </h3>
        <p className="text-[11px] text-[#6D6670]">
          Click to dress mannequin, or drag new files here
        </p>
      </div>

      {/* 2. Items Grid list */}
      <div className="flex-1 my-4 overflow-y-auto pr-1 space-y-2.5 max-h-[220px]">
        {filteredItems.length > 0 ? (
          <div className="grid grid-cols-2 gap-2.5">
            {filteredItems.map((item) => {
              const isEquipped = item.id === equippedGarmentId;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectGarment(item)}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', item.id);
                  }}
                  className={`group relative p-2.5 rounded-xl border text-left transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer select-none active:scale-[0.97] ${
                    isEquipped
                      ? 'bg-[#F6C9D5] border-[#E97A9A] text-[#2F2A2E] font-semibold'
                      : 'bg-[#FFF8FA] border-[#F3D3DB] hover:bg-[#F6C9D5] hover:border-[#E97A9A]/40'
                  }`}
                >
                  {/* Little round preview inside builder card */}
                  <div
                    className="w-11 h-11 rounded-full border border-[#F3D3DB] flex items-center justify-center relative shadow-sm bg-[#FFFFFF]"
                    style={{ backgroundColor: `${item.color}20` }}
                  >
                    <span className="text-xl">
                      {getCategoryIcon(item.category)}
                    </span>
                    {/* Visual active pin */}
                    {isEquipped && (
                      <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-[#E97A9A] rounded-full border border-white shadow-sm" />
                    )}
                  </div>

                  <span className={`text-[10px] font-medium text-center truncate w-full ${isEquipped ? 'text-[#E97A9A]' : 'text-[#6D6670] group-hover:text-[#E97A9A]'}`}>
                    {item.name}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-4 text-center border border-dashed border-[#F3D3DB] rounded-2xl bg-[#FFF8FA]">
            <AlertCircle className="w-5 h-5 text-[#6D6670]" />
            <p className="text-[10px] text-[#6D6670] font-medium mt-1">
              No pieces in this category yet
            </p>
            <button
              onClick={onNavigateToUpload}
              className="mt-2 text-[10px] text-[#E97A9A] font-semibold hover:underline cursor-pointer"
            >
              Upload your first {getCategoryDisplay(category).toLowerCase()}
            </button>
          </div>
        )}
      </div>

      {/* 3. Bottom Drag Zone Graphic & Quick Upload Link */}
      <div className="pt-2 border-t border-[#F3D3DB] flex flex-col gap-2.5">
        <div className="flex items-center justify-center gap-1 bg-[#FFF8FA] border border-[#F3D3DB] rounded-xl p-2.5 text-center">
          <div className="text-left">
            <p className="text-[10px] font-bold text-[#2F2A2E] flex items-center gap-1">
              <span>Drag &amp; Drop photos</span>
              <ArrowUpRight className="w-3 h-3 text-[#E97A9A]" />
            </p>
            <p className="text-[9px] text-[#6D6670]">to instantly upload garments</p>
          </div>
        </div>

        <button
          onClick={onNavigateToUpload}
          className="w-full py-2.5 px-4 bg-[#D8C4F3]/40 hover:bg-[#D8C4F3]/60 border border-[#D8C4F3]/60 text-[#2F2A2E] font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Upload New {getCategoryDisplay(category)}
        </button>
      </div>
    </div>
  );
};
