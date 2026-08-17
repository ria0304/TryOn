import React, { useState } from 'react';
import { Search, Bell, ChevronDown, LogOut, User, Crown } from 'lucide-react';
import { StylistLevelBadge } from './StylistLevelBadge';
import { StylistStats } from '../types';
import { soundFx } from '../lib/sound';

interface HeaderProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onNotificationClick?: () => void;
  stats: StylistStats;
  onOpenQuests: () => void;
  stylistUser?: { name: string; archetype: string } | null;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  setSearchQuery,
  onNotificationClick,
  stats,
  onOpenQuests,
  stylistUser,
  onLogout,
}) => {
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const initialLetter = stylistUser?.name ? stylistUser.name.charAt(0).toUpperCase() : 'R';
  const displayName = stylistUser?.name || 'Ria';

  return (
    <header className="h-16 border-b border-[#F3D3DB] bg-[#FFFFFF]/90 backdrop-blur-md flex items-center justify-between px-8 fixed top-0 right-0 left-64 z-10">
      {/* Search Bar */}
      <div className="relative w-80">
        <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-[#6D6670]">
          <Search className="w-4 h-4" />
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search garments, outfits..."
          className="w-full pl-9 pr-4 py-2 text-sm bg-[#FFF8FA] border border-[#F3D3DB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#E97A9A] focus:border-transparent focus:bg-[#FFFFFF] transition-all text-[#2F2A2E] placeholder-[#6D6670]"
          id="global-search-input"
        />
      </div>

      {/* Action Buttons, Stylist Level Badge & Profile */}
      <div className="flex items-center gap-4">
        {/* Stylist Level Badge */}
        <StylistLevelBadge stats={stats} onOpenQuests={onOpenQuests} />

        {/* Notifications Icon with Indicator */}
        <button
          onClick={() => {
            soundFx.playSnapSound();
            if (onNotificationClick) onNotificationClick();
          }}
          className="relative p-2 text-[#6D6670] hover:text-[#2F2A2E] hover:bg-[#FFF8FA] rounded-xl transition-colors cursor-pointer"
          id="notification-bell-btn"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#E97A9A] rounded-full ring-2 ring-[#FFFFFF] shadow-sm" />
        </button>

        {/* Vertical Divider */}
        <div className="w-px h-6 bg-[#F3D3DB]" />

        {/* User Profile */}
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2.5 p-1.5 hover:bg-[#FFF8FA] rounded-xl transition-colors cursor-pointer"
            id="profile-dropdown-btn"
          >
            <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-b from-[#F6C9D5] to-[#E97A9A] border border-[#F3D3DB] flex items-center justify-center text-white font-bold text-sm shadow-sm">
              {initialLetter}
            </div>
            <div className="text-left hidden md:block">
              <span className="text-sm font-bold text-[#2F2A2E] block leading-tight">{displayName}</span>
              <span className="text-[10px] text-[#E97A9A] font-semibold block">{stylistUser?.archetype || 'Haute Couturier'}</span>
            </div>
            <ChevronDown className="w-4 h-4 text-[#6D6670]" />
          </button>

          {/* Mini Dropdown Menu */}
          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-52 bg-[#FFFFFF] border border-[#F3D3DB] rounded-2xl shadow-xl py-2 z-30 backdrop-blur-xl animate-in fade-in slide-in-from-top-2">
              <div className="px-4 py-2 border-b border-[#F3D3DB]/60">
                <p className="text-[10px] font-bold text-[#6D6670] uppercase tracking-wider">Stylist Session</p>
                <p className="text-xs font-bold text-[#2F2A2E] truncate">{displayName} @ Atelier</p>
                <p className="text-[10px] text-[#E97A9A] mt-0.5">{stylistUser?.archetype}</p>
              </div>

              <button
                onClick={() => {
                  soundFx.playSnapSound();
                  onOpenQuests();
                  setShowProfileMenu(false);
                }}
                className="w-full text-left px-4 py-2.5 text-xs text-[#2F2A2E] hover:bg-[#FFF8FA] flex items-center gap-2 cursor-pointer font-medium"
              >
                <Crown className="w-3.5 h-3.5 text-[#E97A9A]" />
                <span>View Stylist Quests</span>
              </button>

              {onLogout && (
                <button
                  onClick={() => {
                    soundFx.playSnapSound();
                    setShowProfileMenu(false);
                    onLogout();
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer font-bold border-t border-[#F3D3DB]/60 mt-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Switch Stylist Passcode</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
