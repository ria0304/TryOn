import React from 'react';
import { ViewerSettings, StrapType, BackStyleType, AnalysisResult } from '../types';

interface TechSpecModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ViewerSettings;
  strapType: StrapType;
  backStyle: BackStyleType;
  analysis: AnalysisResult | null;
  currentTextureUrl: string | null;
}

export const TechSpecModal: React.FC<TechSpecModalProps> = ({
  isOpen,
  onClose,
  settings,
  strapType,
  backStyle,
  analysis,
  currentTextureUrl,
}) => {
  if (!isOpen) return null;

  // Approximate physical dress measurements based on 3D geometry scales
  const baseBustInches = 34;
  const baseWaistInches = 26;
  const baseHemInches = Math.round(57 * (settings.flareWidth || 1));
  const totalLengthInches = Math.round(51 * (settings.hemLength || 1));
  const colorPaletteHex = analysis?.garmentColor || '#89aad1';

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-[#0C0C0E] rounded-2xl sm:rounded-3xl max-w-2xl w-full max-h-[92vh] overflow-y-auto border border-white/10 shadow-2xl p-6 sm:p-7 space-y-6 text-zinc-100 selection:bg-amber-500 selection:text-black">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <h2 className="text-base sm:text-lg font-light tracking-wider uppercase text-zinc-100">
            3D PATTERN & MEASUREMENT SHEET
          </h2>

          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer rounded-lg hover:bg-white/5"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Section 1: Garment Dimensions (Virtual Spec) */}
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2.5">
            GARMENT DIMENSIONS (VIRTUAL SPEC)
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-[#141417] p-3.5 rounded-xl border border-white/5 space-y-0.5">
              <span className="text-[10px] font-mono uppercase text-zinc-400 block tracking-wider">TOTAL LENGTH</span>
              <span className="text-2xl font-mono font-bold text-amber-400 block leading-tight">{totalLengthInches}″</span>
              <span className="text-xs font-mono text-zinc-500 block">{Math.round(totalLengthInches * 2.54)} cm</span>
            </div>
            <div className="bg-[#141417] p-3.5 rounded-xl border border-white/5 space-y-0.5">
              <span className="text-[10px] font-mono uppercase text-zinc-400 block tracking-wider">BUST GIRTH</span>
              <span className="text-2xl font-mono font-bold text-amber-400 block leading-tight">{baseBustInches}″</span>
              <span className="text-xs font-mono text-zinc-500 block">{Math.round(baseBustInches * 2.54)} cm</span>
            </div>
            <div className="bg-[#141417] p-3.5 rounded-xl border border-white/5 space-y-0.5">
              <span className="text-[10px] font-mono uppercase text-zinc-400 block tracking-wider">WAISTLINE</span>
              <span className="text-2xl font-mono font-bold text-amber-400 block leading-tight">{baseWaistInches}″</span>
              <span className="text-xs font-mono text-zinc-500 block">{Math.round(baseWaistInches * 2.54)} cm</span>
            </div>
            <div className="bg-[#141417] p-3.5 rounded-xl border border-white/5 space-y-0.5">
              <span className="text-[10px] font-mono uppercase text-zinc-400 block tracking-wider">HEM SWEEP</span>
              <span className="text-2xl font-mono font-bold text-amber-400 block leading-tight">{baseHemInches}″</span>
              <span className="text-xs font-mono text-zinc-500 block">{Math.round(baseHemInches * 2.54)} cm</span>
            </div>
          </div>
        </div>

        {/* Section 2: Pattern Attributes & UV Mapping & Lighting */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Pattern Attributes */}
          <div className="bg-[#141417] p-4 rounded-xl border border-white/5 space-y-3">
            <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-300 font-bold">
              PATTERN ATTRIBUTES
            </div>
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-white/5">
                <span className="text-zinc-400">Silhouette:</span>
                <span className="font-bold text-zinc-100 lowercase font-mono">{settings.silhouette.replace(/_/g, ' ')}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-white/5">
                <span className="text-zinc-400">Strap Structure:</span>
                <span className="font-bold text-zinc-100 lowercase font-mono">{strapType.replace(/_/g, ' ')}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-white/5">
                <span className="text-zinc-400">Back Treatment:</span>
                <span className="font-bold text-zinc-100 lowercase font-mono">{backStyle.replace(/_/g, ' ')}</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-zinc-400">Fabric Finish:</span>
                <span className="font-bold text-zinc-100 lowercase font-mono">{settings.fabricFinish.replace(/_/g, ' ')}</span>
              </div>
            </div>
          </div>

          {/* UV Mapping & Lighting */}
          <div className="bg-[#141417] p-4 rounded-xl border border-white/5 space-y-3">
            <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-300 font-bold">
              UV MAPPING & LIGHTING
            </div>
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-white/5">
                <span className="text-zinc-400">Wrap Repeat (X):</span>
                <span className="font-mono font-bold text-amber-400">{settings.wrapRepeatX}x</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-white/5">
                <span className="text-zinc-400">Wrap Repeat (Y):</span>
                <span className="font-mono font-bold text-amber-400">{settings.wrapRepeatY}x</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-white/5">
                <span className="text-zinc-400">Color Palette:</span>
                <span className="font-mono font-bold text-zinc-100 flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-xs border border-white/20 inline-block"
                    style={{ backgroundColor: colorPaletteHex }}
                  />
                  {colorPaletteHex}
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-zinc-400">Lighting Model:</span>
                <span className="font-bold text-zinc-100 lowercase font-mono">{settings.lightingPreset.replace(/_/g, ' ')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Projected 2D Texture Map */}
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2.5">
            PROJECTED 2D TEXTURE MAP
          </div>
          <div className="bg-[#141417] rounded-xl border border-white/5 p-4 flex items-center justify-center min-h-[140px]">
            {currentTextureUrl ? (
              <div className="relative rounded-lg overflow-hidden border border-white/10 bg-black/60 p-1 flex items-center justify-center shadow-md">
                <img
                  src={currentTextureUrl}
                  alt="Projected 2D Texture Map"
                  className="h-36 w-auto max-w-full object-contain rounded"
                />
              </div>
            ) : (
              <span className="text-xs font-mono text-zinc-500">No active texture map projected</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
