import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Scissors, Crown, Shield, Heart, ArrowRight, UserCheck, Wand2, Star, Check } from 'lucide-react';
import { soundFx } from '../lib/sound';

interface LoginScreenProps {
  onLogin: (stylistName: string, archetype: string) => void;
}

const ARCHETYPES = [
  { id: 'couture', name: 'Haute Couturier', emoji: '👑', vibe: 'Luxury Atelier & Evening Gowns', badgeColor: 'from-amber-400 to-amber-500' },
  { id: 'streetwear', name: 'Streetwear Icon', emoji: '👟', vibe: 'Urban Cutouts & Denim Layers', badgeColor: 'from-[#111827] to-[#374151]' },
  { id: 'coquette', name: 'Coquette Dreamer', emoji: '🎀', vibe: 'Pastel Ribbons, Silks & Lace', badgeColor: 'from-[#E97A9A] to-[#db2777]' },
  { id: 'parisian', name: 'Parisian Chic', emoji: '🥖', vibe: 'Tailored Blazers & Beret Sets', badgeColor: 'from-indigo-500 to-purple-600' },
];

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [stylistName, setStylistName] = useState('Ria');
  const [selectedArchetype, setSelectedArchetype] = useState(ARCHETYPES[2]); // Coquette default
  const [pin, setPin] = useState('1234');
  const [isLoading, setIsLoading] = useState(false);

  const handleEnterStudio = (e: React.FormEvent) => {
    e.preventDefault();
    if (!stylistName.trim()) return;

    soundFx.playLevelUpSound();
    setIsLoading(true);

    setTimeout(() => {
      onLogin(stylistName.trim(), selectedArchetype.name);
    }, 800);
  };

  const handleGuestEntry = () => {
    soundFx.playSparkleSound();
    setIsLoading(true);
    setTimeout(() => {
      onLogin('Guest Stylist', ARCHETYPES[0].name);
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#FFF8FA] flex items-center justify-center p-4 overflow-hidden select-none">
      {/* Background Animated Floating Particles & Orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          animate={{ scale: [1, 1.2, 1], rotate: [0, 90, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          className="absolute -top-24 -left-24 w-96 h-96 bg-[#F8D7DE]/50 rounded-full blur-3xl"
        />
        <motion.div
          animate={{ scale: [1.1, 0.9, 1.1], rotate: [0, -90, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
          className="absolute -bottom-24 -right-24 w-96 h-96 bg-[#D8C4F3]/40 rounded-full blur-3xl"
        />

        {/* Floating Clothing Cutout Icons */}
        {[
          { emoji: '👗', top: '12%', left: '8%', delay: 0 },
          { emoji: '👠', top: '75%', left: '10%', delay: 1 },
          { emoji: '✂️', top: '20%', right: '10%', delay: 2 },
          { emoji: '🎀', top: '70%', right: '12%', delay: 1.5 },
          { emoji: '👑', top: '8%', left: '48%', delay: 2.5 },
          { emoji: '👜', top: '85%', left: '45%', delay: 0.5 },
        ].map((item, idx) => (
          <motion.div
            key={idx}
            animate={{
              y: ['0px', '-20px', '0px'],
              rotate: [0, 10, -10, 0],
            }}
            transition={{
              duration: 4 + idx,
              repeat: Infinity,
              delay: item.delay,
              ease: 'easeInOut',
            }}
            style={{ top: item.top, left: item.left, right: item.right }}
            className="absolute text-3xl opacity-50 drop-shadow-sm filter blur-[0.2px]"
          >
            {item.emoji}
          </motion.div>
        ))}
      </div>

      {/* Login Studio Pass Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 bg-white/95 backdrop-blur-xl border-2 border-[#F3D3DB] rounded-3xl p-6 sm:p-10 max-w-lg w-full shadow-2xl space-y-6"
      >
        {/* Top Header & Logo */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center gap-2 bg-[#F8D7DE] border border-[#F3D3DB] text-[#E97A9A] px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest shadow-sm">
            <Scissors className="w-4 h-4 text-[#E97A9A]" />
            <span>TryOn Fashion Atelier</span>
            <Sparkles className="w-3.5 h-3.5 text-[#E97A9A]" />
          </div>

          <h1 className="text-3xl font-sans font-extrabold text-[#2F2A2E] tracking-tight">
            Photo Cutout Dress-Up Game
          </h1>
          <p className="text-xs text-[#6D6670]">
            Enter your Stylist Credentials to unlock your cutout wardrobe studio
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleEnterStudio} className="space-y-5">
          {/* Stylist Handle */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#2F2A2E] uppercase tracking-wider">
              1. Stylist Name / Handle
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={stylistName}
                onChange={(e) => setStylistName(e.target.value)}
                placeholder="e.g., Ria Couture"
                className="w-full px-4 py-3 bg-[#FFF8FA] border border-[#F3D3DB] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#E97A9A] focus:bg-white text-[#2F2A2E] font-bold"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#E97A9A]">
                @Atelier
              </span>
            </div>
          </div>

          {/* Archetype Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-[#2F2A2E] uppercase tracking-wider">
              2. Select Stylist Vibe
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {ARCHETYPES.map((arch) => {
                const isSelected = selectedArchetype.id === arch.id;
                return (
                  <button
                    key={arch.id}
                    type="button"
                    onClick={() => {
                      soundFx.playSnapSound();
                      setSelectedArchetype(arch);
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                      isSelected
                        ? 'bg-[#FFF8FA] border-[#E97A9A] ring-2 ring-[#E97A9A]/30 shadow-sm'
                        : 'bg-white border-[#F3D3DB] hover:border-[#E97A9A]/40'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{arch.emoji}</span>
                      <div>
                        <p className="text-xs font-bold text-[#2F2A2E] leading-tight">{arch.name}</p>
                        <p className="text-[9px] text-[#6D6670] truncate mt-0.5">{arch.vibe}</p>
                      </div>
                    </div>
                    {isSelected && (
                      <span className="absolute top-2 right-2 w-4 h-4 bg-[#E97A9A] text-white rounded-full flex items-center justify-center text-[10px] font-bold">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Studio Passcode PIN */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#2F2A2E] uppercase tracking-wider">
              3. Atelier Passcode PIN
            </label>
            <input
              type="password"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              className="w-full px-4 py-2.5 bg-[#FFF8FA] border border-[#F3D3DB] rounded-2xl text-center text-lg font-mono font-bold tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-[#E97A9A] text-[#2F2A2E]"
            />
          </div>

          {/* Submit Action */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 bg-gradient-to-r from-[#E97A9A] via-[#E5678C] to-[#db2777] text-white font-extrabold text-sm rounded-2xl shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <Wand2 className="w-5 h-5 animate-spin" />
                <span>Entering Wardrobe Studio...</span>
              </div>
            ) : (
              <>
                <Crown className="w-5 h-5 fill-white" />
                <span>Enter Dress-Up Studio</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        {/* Quick Guest Pass */}
        <div className="pt-3 border-t border-[#F3D3DB] text-center">
          <button
            type="button"
            onClick={handleGuestEntry}
            className="text-xs font-bold text-[#6D6670] hover:text-[#E97A9A] transition-colors cursor-pointer inline-flex items-center gap-1.5"
          >
            <span>Or continue as Quick Guest Stylist</span>
            <Sparkles className="w-3.5 h-3.5" />
          </button>
        </div>
      </motion.div>
    </div>
  );
};
