import React, { useState } from 'react';
import { Category, Garment } from '../types';
import { Plus, Trash2, Sparkles, Filter, Check } from 'lucide-react';

interface MyGarmentsViewProps {
  garments: Garment[];
  onDeleteGarment: (id: string) => void;
  onTryOnGarment: (garment: Garment) => void;
  onNavigateToUpload: () => void;
  searchQuery: string;
}

// All available categories matching backend
const ALL_CATEGORIES: Category[] = [
  'top', 'bottom', 'dress', 'jacket', 'shoes', 'bag', 'jewellery', 'accessories'
];

// Category label mappings
const CATEGORY_LABELS: Record<Category, string> = {
  top: 'Tops',
  bottom: 'Bottoms',
  dress: 'Dresses',
  jacket: 'Jackets',
  shoes: 'Shoes',
  bag: 'Bags',
  jewellery: 'Jewellery',
  accessories: 'Accessories',
};

// Category icon mappings for display
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

export const MyGarmentsView: React.FC<MyGarmentsViewProps> = ({
  garments,
  onDeleteGarment,
  onTryOnGarment,
  onNavigateToUpload,
  searchQuery,
}) => {
  const [activeFilter, setActiveFilter] = useState<Category | 'all'>('all');

  const filterTabs: { id: Category | 'all'; label: string }[] = [
    { id: 'all', label: 'All Pieces' },
    ...ALL_CATEGORIES.map((cat) => ({
      id: cat,
      label: CATEGORY_LABELS[cat],
    })),
  ];

  // Filtering garments by category and search query
  const filteredGarments = garments.filter((garment) => {
    const matchesCategory = activeFilter === 'all' || garment.category === activeFilter;
    const matchesSearch =
      garment.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      garment.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      garment.style.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Helper to get category display name
  const getCategoryDisplay = (category: Category): string => {
    if (category === 'accessories') return 'Accessory';
    if (category === 'jewellery') return 'Jewellery';
    return category.charAt(0).toUpperCase() + category.slice(1);
  };

  // Helper to get category icon
  const getCategoryIcon = (category: Category): string => {
    return CATEGORY_ICONS[category] || '👗';
  };

  return (
    <div className="p-4 space-y-6 animate-in fade-in duration-300" id="garments-view">
      {/* View Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-sans font-bold text-[#2F2A2E] tracking-wide">Wardrobe Library</h2>
          <p className="text-sm text-[#6D6670] mt-1">
            Manage your digital fashion items and try them on the model mannequin
          </p>
        </div>
        <button
          onClick={onNavigateToUpload}
          className="bg-[#E97A9A] hover:bg-[#E5678C] text-white px-5 py-3 rounded-2xl font-bold text-sm transition-all duration-200 flex items-center gap-2 cursor-pointer shadow-md active:scale-[0.98]"
          id="add-garment-library-btn"
        >
          <Plus className="w-4 h-4" />
          Add Garment
        </button>
      </div>

      {/* Categories Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#F3D3DB] pb-4">
        {/* Category Filters - Scrollable on small screens */}
        <div className="flex flex-wrap items-center gap-2 max-w-full overflow-x-auto pb-1">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={`px-4 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer whitespace-nowrap ${
                activeFilter === tab.id
                  ? 'bg-[#E97A9A] text-white shadow-md font-bold'
                  : 'bg-[#FFF8FA] border border-[#F3D3DB] text-[#6D6670] hover:bg-[#F6C9D5] hover:text-[#2F2A2E]'
              }`}
            >
              {tab.id !== 'all' && <span className="mr-1.5">{CATEGORY_ICONS[tab.id as Category]}</span>}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Info Counter */}
        <div className="flex items-center gap-2 text-xs font-mono font-semibold text-[#6D6670] shrink-0">
          <Filter className="w-3.5 h-3.5" />
          <span>Showing {filteredGarments.length} items</span>
        </div>
      </div>

      {/* Grid of Garments */}
      {filteredGarments.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {filteredGarments.map((garment) => (
            <div
              key={garment.id}
              className="group relative bg-[#FFFFFF] border border-[#F3D3DB] rounded-2xl overflow-hidden hover:shadow-md hover:border-[#E97A9A]/40 transition-all duration-300 flex flex-col h-[280px]"
            >
              {/* Card visual showcase area */}
              <div className="relative flex-1 bg-[#FFF8FA] p-4 flex items-center justify-center overflow-hidden border-b border-[#F3D3DB]">
                
                {/* Visual rendering of garment */}
                {garment.imageUrl ? (
                  <img
                    src={garment.imageUrl}
                    alt={garment.name}
                    className="max-h-36 object-contain drop-shadow-sm group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  // Custom stylized icon presentation with item color
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div
                      className="w-20 h-20 rounded-full flex items-center justify-center border-4 shadow-sm relative overflow-hidden group-hover:scale-105 transition-transform duration-300"
                      style={{
                        backgroundColor: `${garment.color}20`, // Light transparency of garment color
                        borderColor: garment.color,
                      }}
                    >
                      <span className="text-2xl" style={{ color: garment.color }}>
                        {getCategoryIcon(garment.category)}
                      </span>
                      {/* Floating glowing particle */}
                      <span className="absolute top-1 right-1 text-xs opacity-70">✦</span>
                    </div>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#6D6670]">
                      {garment.style.replace(/_/g, ' ')}
                    </span>
                  </div>
                )}

                {/* Floating Tags */}
                <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 z-10">
                  <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#FFFFFF]/95 border border-[#F3D3DB] text-[#2F2A2E] shadow-sm font-mono">
                    {garment.category === 'accessories' ? 'Acc.' : 
                     garment.category === 'jewellery' ? 'Jewel' : 
                     garment.category}
                  </span>
                  {garment.isCustom && (
                    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#D8C4F3]/40 text-[#2F2A2E] border border-[#D8C4F3]/60 shadow-sm flex items-center gap-0.5 font-mono">
                      <Sparkles className="w-2.5 h-2.5 fill-[#D8C4F3]/20 text-[#2F2A2E]" /> custom
                    </span>
                  )}
                </div>

                {/* Floating Action Overlay on Hover */}
                <div className="absolute inset-0 bg-[#FFFFFF]/90 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-250 flex flex-col items-center justify-center gap-3 p-4 z-10">
                  <button
                    onClick={() => onTryOnGarment(garment)}
                    className="w-full max-w-[120px] bg-[#E97A9A] hover:bg-[#E5678C] text-white font-bold py-2 px-3 rounded-xl text-xs transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5 text-white stroke-[2.5px]" /> Try On Now
                  </button>
                  <button
                    onClick={() => onDeleteGarment(garment.id)}
                    className="w-full max-w-[120px] bg-red-50 border border-red-100 text-red-600 hover:bg-red-100 font-semibold py-2 px-3 rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>

              {/* Card Title & color spec */}
              <div className="p-3.5 bg-[#FFFFFF] flex flex-col justify-between">
                <h3 className="font-semibold text-xs text-[#2F2A2E] truncate group-hover:text-[#E97A9A] transition-colors">
                  {garment.name}
                </h3>
                <div className="flex items-center gap-1.5 mt-1.5 justify-between">
                  {/* Visual Color Dot */}
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-3.5 h-3.5 rounded-full border border-[#F3D3DB] shadow-sm"
                      style={{ backgroundColor: garment.color }}
                    />
                    <span className="text-[10px] font-mono text-[#6D6670] font-semibold">{garment.color}</span>
                  </div>
                  <span className="text-[10px] text-[#6D6670] font-mono capitalize">
                    {getCategoryDisplay(garment.category)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-20 border border-dashed border-[#F3D3DB] rounded-3xl flex flex-col items-center justify-center text-center bg-[#FFFFFF]">
          <div className="w-16 h-16 rounded-full bg-[#F6C9D5] border border-[#F3D3DB] text-[#E97A9A] flex items-center justify-center text-xl mb-4 shadow-sm">
            🌐
          </div>
          <h3 className="text-base font-semibold text-[#2F2A2E]">No garments matched your filter</h3>
          <p className="text-xs text-[#6D6670] mt-1.5 max-w-xs leading-relaxed">
            Try adjusting your category filter, clearing your search query, or upload a brand new designer piece!
          </p>
          <button
            onClick={onNavigateToUpload}
            className="mt-5 text-xs text-[#E97A9A] font-mono font-bold hover:text-[#E5678C]"
          >
            Create first design item &rarr;
          </button>
        </div>
      )}
    </div>
  );
};
