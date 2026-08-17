import React, { useState, useRef } from 'react';
import { OutfitBuilderState } from '../types';
import { ThreeMannequin } from './ThreeMannequin';
import { Camera, Sparkles, X } from 'lucide-react';
import { soundFx } from '../lib/sound';

interface RunwayPhotoboothModalProps {
  state: OutfitBuilderState;
  onClose: () => void;
}

const MAGAZINE_FRAMES = [
  { id: 'vogue', title: 'VOGUE', subtitle: 'AUTUMN / WINTER COUTURE ISSUE', tagline: 'The Art of Photo Cutout Dress-Up' },
  { id: 'glamour', title: 'GLAMOUR', subtitle: 'STREETSTYLE & CUTOUT LOOKS', tagline: '100% S-Rank Personal Style' },
  { id: 'tryon', title: 'TRYON WEEKLY', subtitle: 'LOOKBOOK MAGAZINE ISSUE #42', tagline: 'Dressed with Transparent Cutouts' },
  { id: 'minimal', title: 'HAUTE', subtitle: 'PARIS FASHION WEEK EDITION', tagline: 'Aesthetic Silhouette Collection' },
];

const BACKGROUND_SCENES = [
  {
    id: 'studio',
    label: 'Atelier Studio',
    gradient: 'from-[#FFF8FA] via-[#F8D7DE]/40 to-[#FFF8FA]',
    border: 'border-[#F3D3DB]',
    canvasColors: ['#FFF8FA', '#F8D7DE', '#FFF8FA'],
    textColor: '#2F2A2E',
  },
  {
    id: 'eiffel',
    label: 'Paris Sunset',
    gradient: 'from-amber-100 via-rose-200 to-indigo-300',
    border: 'border-rose-300',
    canvasColors: ['#FDE9C8', '#FBD0D0', '#C7CBF5'],
    textColor: '#2F2A2E',
  },
  {
    id: 'neon',
    label: 'Tokyo Neon',
    gradient: 'from-[#0e1017] via-[#1e1b4b] to-[#311042]',
    border: 'border-[#38bdf8]',
    canvasColors: ['#0e1017', '#1e1b4b', '#311042'],
    textColor: '#F8FAFC',
  },
  {
    id: 'runway',
    label: 'Fashion Week Runway',
    gradient: 'from-[#111827] via-[#374151] to-[#111827]',
    border: 'border-amber-400',
    canvasColors: ['#111827', '#374151', '#111827'],
    textColor: '#F8FAFC',
  },
  {
    id: 'pastel',
    label: 'Coquette Cloud',
    gradient: 'from-pink-100 via-[#F6C9D5] to-purple-100',
    border: 'border-pink-300',
    canvasColors: ['#fce7f3', '#F6C9D5', '#f3e8ff'],
    textColor: '#2F2A2E',
  },
];

const STICKERS = [
  { id: 'heart', emoji: '💖', label: 'Cute' },
  { id: 'fire', emoji: '🔥', label: 'Hot' },
  { id: 'crown', emoji: '👑', label: 'Queen' },
  { id: 'sparkle', emoji: '✨', label: 'Glow' },
  { id: 'star', emoji: '⭐', label: '5-Star' },
  { id: 'vip', emoji: '🏷️', label: 'VIP Pass' },
];

export const RunwayPhotoboothModal: React.FC<RunwayPhotoboothModalProps> = ({ state, onClose }) => {
  const [selectedFrame, setSelectedFrame] = useState('vogue');
  const [selectedBg, setSelectedBg] = useState('studio');
  const [activeStickers, setActiveStickers] = useState<{ id: string; emoji: string; x: number; y: number }[]>([]);
  const [flashEffect, setFlashEffect] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const mannequinCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const currentFrame = MAGAZINE_FRAMES.find((f) => f.id === selectedFrame) || MAGAZINE_FRAMES[0];
  const currentBg = BACKGROUND_SCENES.find((b) => b.id === selectedBg) || BACKGROUND_SCENES[0];

  const handleAddSticker = (emoji: string) => {
    soundFx.playSnapSound();
    const newSticker = {
      id: `sticker-${Date.now()}-${Math.random()}`,
      emoji,
      x: 30 + Math.random() * 40,
      y: 20 + Math.random() * 60,
    };
    setActiveStickers((prev) => [...prev, newSticker]);
  };

  const handleRemoveSticker = (id: string) => {
    setActiveStickers((prev) => prev.filter((s) => s.id !== id));
  };

  const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

  const composeMagazineCover = async (): Promise<string> => {
    const mannequinCanvas = mannequinCanvasRef.current;
    if (!mannequinCanvas) {
      throw new Error('The 3D mannequin view is not ready yet');
    }

    const W = 720;
    const H = 960;
    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    // Backdrop gradient
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    const [c1, c2, c3] = currentBg.canvasColors;
    grad.addColorStop(0, c1);
    grad.addColorStop(0.5, c2);
    grad.addColorStop(1, c3);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Mannequin snapshot, captured straight from the live WebGL canvas
    const mannequinDataUrl = mannequinCanvas.toDataURL('image/png');
    const mannequinImg = await loadImage(mannequinDataUrl);
    const stageTop = 180;
    const stageHeight = H - stageTop - 140;
    const scale = Math.min(W / mannequinImg.width, stageHeight / mannequinImg.height);
    const drawW = mannequinImg.width * scale;
    const drawH = mannequinImg.height * scale;
    ctx.drawImage(mannequinImg, (W - drawW) / 2, stageTop + (stageHeight - drawH) / 2, drawW, drawH);

    // Header text block
    ctx.textAlign = 'center';
    ctx.fillStyle = currentBg.textColor;
    ctx.font = '600 15px monospace';
    ctx.globalAlpha = 0.7;
    ctx.fillText(currentFrame.subtitle, W / 2, 56);
    ctx.globalAlpha = 1;

    ctx.font = '900 68px Georgia, "Times New Roman", serif';
    ctx.fillText(currentFrame.title, W / 2, 128);

    ctx.font = '700 16px sans-serif';
    ctx.fillStyle = '#E97A9A';
    ctx.fillText(currentFrame.tagline, W / 2, 158);

    // Stickers, positioned the same way they sit in the live preview
    ctx.font = '40px serif';
    activeStickers.forEach((sticker) => {
      ctx.fillText(sticker.emoji, (sticker.x / 100) * W, (sticker.y / 100) * H);
    });

    // Footer caption card
    const footerY = H - 120;
    const footerH = 96;
    const pad = 24;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.roundRect(pad, footerY, W - pad * 2, footerH, 20);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#E97A9A';
    ctx.font = '700 12px sans-serif';
    ctx.fillText('STYLING SPOTLIGHT', pad + 20, footerY + 30);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#6D6670';
    ctx.font = '400 12px monospace';
    ctx.fillText(new Date().toLocaleDateString(), W - pad - 20, footerY + 30);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#2F2A2E';
    ctx.font = '700 16px sans-serif';
    const headline = `${state.top?.name || state.dress?.name || 'Chic Look'} & Cutout Ensemble`;
    ctx.fillText(headline, pad + 20, footerY + 62);

    return out.toDataURL('image/png');
  };

  const downloadDataUrl = (dataUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSnapPhoto = async () => {
    soundFx.playShutterSound();
    setFlashEffect(true);
    setIsCapturing(true);
    setTimeout(() => setFlashEffect(false), 250);

    try {
      const dataUrl = await composeMagazineCover();
      downloadDataUrl(dataUrl, `tryon-${currentFrame.id}-${Date.now()}.png`);
      setToastMessage('📸 Snapshot Captured! Downloaded to your device.');
    } catch (err) {
      console.error('Failed to capture the 3D mannequin snapshot:', err);
      setToastMessage('⚠️ Could not capture the 3D view — let it finish loading and try again.');
    } finally {
      setIsCapturing(false);
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  const categories = ['top', 'bottom', 'dress', 'jacket', 'shoes', 'bag', 'jewellery', 'accessories'] as const;

  return (
    <div className="fixed inset-0 z-50 bg-[#111827]/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white border border-[#F3D3DB] rounded-3xl p-6 sm:p-8 max-w-4xl w-full relative shadow-2xl space-y-6 max-h-[92vh] flex flex-col">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-[#F3D3DB] pb-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#E97A9A] bg-[#F8D7DE] px-2.5 py-1 rounded-full">
              Runway Photobooth Mode
            </span>
            <h2 className="text-xl font-sans font-bold text-[#2F2A2E] mt-1 flex items-center gap-2">
              <Camera className="w-5 h-5 text-[#E97A9A]" />
              Fashion Magazine Cover Snapshot
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-[#FFF8FA] border border-[#F3D3DB] text-[#6D6670] hover:text-[#2F2A2E] flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toast Alert */}
        {toastMessage && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-[#111827] text-white text-xs px-5 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 animate-bounce">
            <Sparkles className="w-4 h-4 text-[#E97A9A]" />
            <span>{toastMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 flex-1 min-h-0 overflow-y-auto pr-1">
          {/* Left Column: Magazine Cover Preview Stage */}
          <div className="md:col-span-7 flex flex-col items-center justify-center">
            <div
              ref={canvasRef}
              className={`relative w-full max-w-[360px] aspect-[3/4] rounded-3xl border-2 ${currentBg.border} bg-gradient-to-b ${currentBg.gradient} p-6 shadow-xl overflow-hidden flex flex-col justify-between transition-all duration-300 select-none`}
            >
              {/* Camera Flash Animation Overlay */}
              {flashEffect && (
                <div className="absolute inset-0 bg-white z-50 animate-ping opacity-90" />
              )}

              {/* Top Magazine Header */}
              <div className="relative z-20 text-center space-y-0.5">
                <p className="text-[9px] font-mono font-bold uppercase tracking-[0.2em] text-[#2F2A2E]/70">
                  {currentFrame.subtitle}
                </p>
                <h1 className="text-4xl sm:text-5xl font-serif font-black tracking-tighter text-[#2F2A2E] drop-shadow-sm">
                  {currentFrame.title}
                </h1>
                <p className="text-[10px] font-semibold text-[#E97A9A] tracking-wider uppercase">
                  {currentFrame.tagline}
                </p>
              </div>

              {/* Center Stage: Mannequin & Cutout Garments */}
              <div className="absolute inset-x-0 bottom-4 top-16 flex items-center justify-center z-10 pointer-events-none">
                <div className="w-full h-full relative">
                  <ThreeMannequin state={state} onCanvasReady={(canvas) => { mannequinCanvasRef.current = canvas; }} />
                </div>
              </div>

              {/* Active Sticker Stamps */}
              {activeStickers.map((sticker) => (
                <div
                  key={sticker.id}
                  onClick={() => handleRemoveSticker(sticker.id)}
                  style={{ left: `${sticker.x}%`, top: `${sticker.y}%` }}
                  className="absolute z-30 text-2xl cursor-pointer hover:scale-125 transition-transform drop-shadow-md select-none"
                  title="Click to remove sticker"
                >
                  {sticker.emoji}
                </div>
              ))}

              {/* Bottom Magazine Headline Overlay */}
              <div className="relative z-20 bg-white/80 backdrop-blur-md border border-white/60 p-3 rounded-2xl space-y-1 text-left shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold uppercase text-[#E97A9A] tracking-widest">
                    STYLING SPOTLIGHT
                  </span>
                  <span className="text-[9px] font-mono text-[#6D6670]">
                    {new Date().toLocaleDateString()}
                  </span>
                </div>
                <h4 className="text-xs font-bold text-[#2F2A2E] leading-snug">
                  {state.top?.name || state.dress?.name || 'Chic Look'} &amp; Cutout Ensemble
                </h4>
              </div>
            </div>
          </div>

          {/* Right Column: Customization Controls */}
          <div className="md:col-span-5 space-y-5">
            {/* 1. Magazine Frame Selector */}
            <div>
              <label className="block text-xs font-bold text-[#2F2A2E] uppercase tracking-wider mb-2">
                1. Magazine Cover Title
              </label>
              <div className="grid grid-cols-2 gap-2">
                {MAGAZINE_FRAMES.map((frame) => (
                  <button
                    key={frame.id}
                    type="button"
                    onClick={() => setSelectedFrame(frame.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      selectedFrame === frame.id
                        ? 'bg-[#E97A9A] text-white border-[#E97A9A] shadow-sm'
                        : 'bg-[#FFF8FA] text-[#6D6670] border-[#F3D3DB] hover:border-[#E97A9A]/40'
                    }`}
                  >
                    <p className="font-serif font-black text-sm leading-tight">{frame.title}</p>
                    <p className="text-[9px] opacity-80 truncate mt-0.5">{frame.subtitle}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Background Theme Selector */}
            <div>
              <label className="block text-xs font-bold text-[#2F2A2E] uppercase tracking-wider mb-2">
                2. Runway Backdrop
              </label>
              <div className="grid grid-cols-3 gap-2">
                {BACKGROUND_SCENES.map((bg) => (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() => setSelectedBg(bg.id)}
                    className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                      selectedBg === bg.id
                        ? 'bg-[#111827] text-white border-[#111827] shadow-sm'
                        : 'bg-[#FFF8FA] text-[#6D6670] border-[#F3D3DB] hover:border-[#E97A9A]/40'
                    }`}
                  >
                    <p className="text-[10px] font-bold truncate">{bg.label}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Sticker Stamps */}
            <div>
              <label className="block text-xs font-bold text-[#2F2A2E] uppercase tracking-wider mb-2">
                3. Stamp Dress-Up Stickers
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {STICKERS.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => handleAddSticker(st.emoji)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-[#FFF8FA] border border-[#F3D3DB] hover:border-[#E97A9A] rounded-xl text-xs font-medium cursor-pointer transition-all"
                  >
                    <span>{st.emoji}</span>
                    <span className="text-[10px] text-[#6D6670]">{st.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Shutter Action Toolbar */}
            <div className="pt-4 border-t border-[#F3D3DB] space-y-2.5">
              <button
                type="button"
                onClick={handleSnapPhoto}
                disabled={isCapturing}
                className="w-full py-3.5 bg-[#E97A9A] hover:bg-[#E5678C] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-sm rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Camera className="w-5 h-5" />
                <span>{isCapturing ? 'Capturing…' : 'Snap Magazine Cover Photo'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
