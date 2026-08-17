import React from 'react';
import { TabType } from '../types';
import { Home, Upload, Shirt, Heart, Columns, Sparkles, LogOut } from 'lucide-react';

interface SidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onLogout?: () => void;
  userName?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, onLogout, userName }) => {
  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'upload', label: 'Upload Garment', icon: Upload },
    { id: 'garments', label: 'My Garments', icon: Shirt },
    { id: 'outfits', label: 'My Outfits', icon: Heart },
    { id: 'compare', label: 'Compare', icon: Columns },
  ] as const;

  return (
    <aside className="w-64 bg-[#FFFFFF] border-r border-[#F3D3DB] flex flex-col h-screen fixed left-0 top-0 z-20">
      {/* Brand Logo & Tagline */}
      <div className="p-6 pb-2 border-b border-[#F3D3DB]">
        <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => onTabChange('home')}>
          <div className="w-8 h-8 bg-gradient-to-tr from-[#E97A9A] to-[#F6C9D5] rounded-lg flex items-center justify-center shadow-md">
            <Sparkles className="w-4.5 h-4.5 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#2F2A2E] ml-1.5">
            TRY<span className="font-light opacity-50">ON</span>
          </h1>
        </div>
        <p className="text-[9px] font-mono font-semibold text-[#E97A9A] tracking-widest uppercase mt-2.5">
          Outfits from Inspiration
        </p>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-4 py-6 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer ${
                isActive
                  ? 'bg-[#F6C9D5] text-[#2F2A2E] border-l-2 border-[#E97A9A] font-semibold'
                  : 'text-[#6D6670] hover:bg-[#FFF8FA] hover:text-[#2F2A2E]'
              }`}
              id={`sidebar-nav-${item.id}`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5px] text-[#E97A9A]' : 'stroke-[1.8px]'}`} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Aesthetic Promo Card at the Bottom */}
      <div className="p-4 m-4 rounded-2xl bg-[#FFF8FA] border border-[#F3D3DB] flex flex-col items-center text-center relative overflow-hidden shadow-sm">
        {/* Soft Background Cloud Details */}
        <div className="absolute -bottom-8 -right-8 w-24 h-24 bg-[#F6C9D5]/30 rounded-full blur-xl" />
        <div className="absolute -top-4 -left-4 w-16 h-16 bg-[#D8C4F3]/30 rounded-full blur-lg" />
        
        <div className="w-8 h-8 rounded-full bg-[#F6C9D5] border border-[#F3D3DB] flex items-center justify-center text-[#2F2A2E] mb-3 z-10 animate-pulse">
          <Heart className="w-4 h-4 fill-[#E97A9A]/20 text-[#E97A9A]" />
        </div>
        <h3 className="text-xs font-sans font-bold text-[#2F2A2E] uppercase tracking-wider z-10">
          Create &amp; Compose
        </h3>
        <p className="text-[11px] text-[#6D6670] mt-1 z-10">
          Save what you like
        </p>
      </div>

      {/* Session Footer */}
      {(userName || onLogout) && (
        <div className="px-4 pb-4 flex items-center justify-between gap-2">
          {userName && (
            <span className="text-xs font-semibold text-[#2F2A2E] truncate">{userName}</span>
          )}
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="p-2 text-[#6D6670] hover:text-[#E97A9A] hover:bg-[#FFF8FA] rounded-xl transition-colors cursor-pointer"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </aside>
  );
};
