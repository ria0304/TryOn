import React from 'react';
import { TabType } from '../types';
import { Sparkles, Shirt, Heart, Columns, Upload, Box, LogOut } from 'lucide-react';

interface SidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onLogout?: () => void;
  userName?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, onLogout, userName }) => {
  const navItems = [
    { id: 'home', label: 'Outfit Builder', icon: Sparkles },
    { id: 'garments', label: 'My Garments', icon: Shirt },
    { id: 'outfits', label: 'My Outfits', icon: Heart },
    { id: 'compare', label: 'Compare Looks', icon: Columns },
    { id: 'upload', label: 'Upload Garment', icon: Upload },
    { id: '3d_viewer', label: '3D Mannequin Studio', icon: Box },
  ] as const;

  return (
    <aside className="w-64 bg-[#FFFFFF]/90 backdrop-blur-md border-r border-[#F3D3DB] flex flex-col h-screen fixed left-0 top-0 z-20 text-[#2F2A2E] shadow-sm">
      {/* Brand Logo & Tagline */}
      <div className="p-6 pb-5 border-b border-[#F3D3DB]/60">
        <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => onTabChange('home')}>
          <div className="w-9 h-9 bg-gradient-to-tr from-[#E97A9A] to-[#F6C9D5] rounded-xl flex items-center justify-center shadow-md shadow-[#E97A9A]/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#2F2A2E] leading-none">
              TRY<span className="font-light text-[#E97A9A]">ON</span>
            </h1>
            <p className="text-[10px] font-semibold text-[#E97A9A] tracking-wider uppercase mt-1">
              Virtual Styling Studio
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-5 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-200 cursor-pointer ${
                isActive
                  ? 'bg-gradient-to-r from-[#FFF0F4] to-[#FFF8FA] text-[#E97A9A] shadow-sm border border-[#F3D3DB]'
                  : 'text-[#6D6670] hover:bg-[#FFF8FA] hover:text-[#2F2A2E]'
              }`}
              id={`sidebar-nav-${item.id}`}
            >
              <Icon className={`w-4.5 h-4.5 ${isActive ? 'stroke-[2.2px] text-[#E97A9A]' : 'stroke-[1.8px] text-[#6D6670]'}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Stylist Atelier Info Card */}
      <div className="p-4 m-3 rounded-2xl bg-gradient-to-br from-[#FFF5F8] to-[#FFF0F4] border border-[#F3D3DB] text-center shadow-sm">
        <div className="w-8 h-8 rounded-full bg-[#FFFFFF] border border-[#F3D3DB] flex items-center justify-center text-[#E97A9A] mx-auto mb-2 shadow-xs">
          <Sparkles className="w-4 h-4" />
        </div>
        <h3 className="text-xs font-bold text-[#2F2A2E]">
          Virtual Fitting Room
        </h3>
        <p className="text-[11px] text-[#6D6670] mt-0.5 leading-relaxed">
          Mix, layer &amp; style personalized outfits
        </p>
      </div>

      {/* Session Footer */}
      {(userName || onLogout) && (
        <div className="px-4 pb-4 flex items-center justify-between gap-2 border-t border-[#F3D3DB]/60 pt-3">
          {userName && (
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-7 h-7 rounded-full bg-[#E97A9A]/15 text-[#E97A9A] font-bold text-xs flex items-center justify-center flex-shrink-0">
                {userName.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs font-bold text-[#2F2A2E] truncate">{userName}</span>
            </div>
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

