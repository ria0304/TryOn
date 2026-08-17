import React from 'react';
import { motion } from 'motion/react';

// Floating fashion cutout icons and shapes for the background canvas
const FLOATING_ITEMS = [
  { emoji: '👗', x: '10%', y: '15%', delay: 0, duration: 18, size: 'text-3xl' },
  { emoji: '✂️', x: '85%', y: '20%', delay: 2, duration: 22, size: 'text-2xl' },
  { emoji: '👠', x: '80%', y: '75%', delay: 4, duration: 20, size: 'text-3xl' },
  { emoji: '🎀', x: '15%', y: '70%', delay: 1, duration: 16, size: 'text-2xl' },
  { emoji: '✨', x: '25%', y: '35%', delay: 3, duration: 14, size: 'text-xl' },
  { emoji: '👜', x: '70%', y: '45%', delay: 5, duration: 19, size: 'text-2xl' },
  { emoji: '👑', x: '50%', y: '10%', delay: 2.5, duration: 21, size: 'text-3xl' },
  { emoji: '💍', x: '90%', y: '50%', delay: 3.5, duration: 17, size: 'text-2xl' },
  { emoji: '🌸', x: '5%', y: '45%', delay: 1.5, duration: 23, size: 'text-2xl' },
  { emoji: '💖', x: '40%', y: '85%', delay: 4.5, duration: 15, size: 'text-2xl' },
];

export const AnimatedBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none">
      {/* 1. Pulsing Ambient Color Orbs */}
      <motion.div
        animate={{
          scale: [1, 1.25, 1],
          opacity: [0.35, 0.55, 0.35],
          x: [0, 40, 0],
          y: [0, -30, 0],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute -top-32 -left-32 w-96 h-96 bg-gradient-to-br from-[#F8D7DE] via-[#E97A9A]/30 to-[#F6C9D5] rounded-full blur-[100px]"
      />

      <motion.div
        animate={{
          scale: [1.1, 0.9, 1.1],
          opacity: [0.3, 0.5, 0.3],
          x: [0, -50, 0],
          y: [0, 40, 0],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute -bottom-32 -right-32 w-96 h-96 bg-gradient-to-tl from-[#D8C4F3]/40 via-[#F8D7DE]/40 to-[#E97A9A]/20 rounded-full blur-[110px]"
      />

      <motion.div
        animate={{
          scale: [0.9, 1.2, 0.9],
          opacity: [0.2, 0.4, 0.2],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#F9DDD8]/20 rounded-full blur-[130px]"
      />

      {/* 2. Grid Pattern Overlay */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'radial-gradient(#E97A9A 1.2px, transparent 1.2px)',
          backgroundSize: '28px 28px',
        }}
      />

      {/* 3. Floating Fashion Cutouts Drift */}
      {FLOATING_ITEMS.map((item, idx) => (
        <motion.div
          key={idx}
          initial={{ x: item.x, y: item.y, opacity: 0.2, rotate: 0 }}
          animate={{
            y: ['0px', '-25px', '15px', '0px'],
            x: ['0px', '15px', '-15px', '0px'],
            rotate: [0, 12, -12, 0],
            opacity: [0.25, 0.6, 0.3, 0.25],
          }}
          transition={{
            duration: item.duration,
            repeat: Infinity,
            delay: item.delay,
            ease: 'easeInOut',
          }}
          style={{ left: item.x, top: item.y }}
          className={`absolute ${item.size} drop-shadow-sm filter blur-[0.3px] opacity-40`}
        >
          {item.emoji}
        </motion.div>
      ))}

      {/* 4. Rising Sparkle Particles */}
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={`sparkle-${i}`}
          initial={{
            x: `${15 + i * 15}%`,
            y: '105%',
            opacity: 0,
            scale: 0.5,
          }}
          animate={{
            y: '-5%',
            opacity: [0, 0.8, 0],
            scale: [0.5, 1.2, 0.5],
          }}
          transition={{
            duration: 10 + i * 2,
            repeat: Infinity,
            delay: i * 1.8,
            ease: 'linear',
          }}
          className="absolute text-[#E97A9A] text-lg font-bold"
        >
          ✦
        </motion.div>
      ))}
    </div>
  );
};
