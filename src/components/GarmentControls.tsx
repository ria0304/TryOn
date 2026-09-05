import React, { useEffect, useMemo, useState } from 'react';
import {
  ViewerSettings,
  SilhouetteType,
  MannequinMaterialType,
  FabricFinishType,
  LightingPresetType,
} from '../types';

interface GarmentControlsProps {
  settings: ViewerSettings;
  onUpdate: (newSettings: Partial<ViewerSettings>) => void;
  onOpenTechSpec: () => void;
}

// Every real 3D geometry the parametric mesh builder knows how to construct,
// plus everyday words/synonyms a user might type instead of the exact label —
// so typing "gown", "mini", "skater dress", etc. still resolves to a real shape.
const SILHOUETTE_OPTIONS: { id: SilhouetteType; label: string; keywords: string[] }[] = [
  { id: 'a_line_dress', label: 'A-Line Dress', keywords: ['a line', 'aline', 'gown', 'formal dress', 'wedding dress', 'ball gown'] },
  { id: 'slip_dress', label: 'Slip Dress', keywords: ['slip', 'cami dress', 'silk dress', 'strappy dress', 'satin dress'] },
  { id: 'bodycon_midi', label: 'Bodycon Midi', keywords: ['bodycon', 'tight dress', 'fitted dress', 'midi', 'pencil dress'] },
  { id: 'halter_maxi', label: 'Halter Maxi', keywords: ['halter', 'maxi', 'maxi dress', 'long dress', 'summer dress'] },
  { id: 'fit_and_flare', label: 'Fit & Flare', keywords: ['fit and flare', 'skater dress', 'cocktail dress', 'party dress'] },
  { id: 'peplum_top', label: 'Peplum Top', keywords: ['peplum', 'top', 'blouse', 'shirt'] },
  { id: 'flared_skirt', label: 'Flared Skirt', keywords: ['skirt', 'flared', 'circle skirt', 'mini skirt', 'pleated skirt'] },
];

function matchSilhouettes(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return SILHOUETTE_OPTIONS;
  return SILHOUETTE_OPTIONS.filter(
    (opt) =>
      opt.label.toLowerCase().includes(q) ||
      opt.id.toLowerCase().includes(q) ||
      opt.keywords.some((k) => k.includes(q) || q.includes(k))
  );
}

export const GarmentControls: React.FC<GarmentControlsProps> = ({
  settings,
  onUpdate,
  onOpenTechSpec,
}) => {
  const [garmentQuery, setGarmentQuery] = useState('');
  const [isSuggestOpen, setIsSuggestOpen] = useState(false);

  const suggestions = useMemo(() => matchSilhouettes(garmentQuery), [garmentQuery]);

  const handlePickSuggestion = (id: SilhouetteType, label: string) => {
    onUpdate({ silhouette: id });
    setGarmentQuery(label);
    setIsSuggestOpen(false);
  };

  // Keep the search box showing the current silhouette's label when it changes
  // from elsewhere (e.g. loading a preset garment), not just from this input.
  useEffect(() => {
    const current = SILHOUETTE_OPTIONS.find((sil) => sil.id === settings.silhouette);
    if (current) setGarmentQuery(current.label);
  }, [settings.silhouette]);

  return (
    <div className="bg-white rounded-3xl p-5 border border-[#F3D3DB] shadow-sm space-y-5 text-[#2F2A2E]">
      {/* Header & Quick Action */}
      <div className="flex items-center justify-between pb-3 border-b border-[#F3D3DB]">
        <div>
          <span className="text-[10px] font-mono tracking-widest uppercase text-[#E97A9A] block font-bold">
            3D Parameters & Material
          </span>
          <h3 className="text-sm sm:text-base font-bold tracking-wide uppercase text-[#2F2A2E] mt-0.5">
            Garment & Studio Settings
          </h3>
        </div>

        <button
          id="btn-open-tech-spec"
          onClick={onOpenTechSpec}
          className="px-3.5 py-1.5 rounded-xl border border-[#F3D3DB] hover:border-[#E97A9A] bg-[#FFF0F4] hover:bg-[#FFE7EE] text-[#E97A9A] text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <svg className="w-3.5 h-3.5 text-[#E97A9A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Tech Spec
        </button>
      </div>

      {/* 1. Silhouette Selector */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-[#6D6670] mb-2">3D Silhouette Model</label>

        {/* Type-to-search: type a garment type (e.g. "gown", "bodycon", "skirt") and pick the closest match */}
        <div className="relative mb-3">
          <input
            type="text"
            id="input-garment-type-search"
            value={garmentQuery}
            onChange={(e) => {
              setGarmentQuery(e.target.value);
              setIsSuggestOpen(true);
            }}
            onFocus={() => setIsSuggestOpen(true)}
            onBlur={() => setTimeout(() => setIsSuggestOpen(false), 120)}
            placeholder="Type a garment type… (e.g. gown, bodycon, skirt)"
            className="w-full px-3.5 py-2.5 text-[12px] font-semibold rounded-xl border border-[#F3D3DB] bg-[#FFF8FA] text-[#2F2A2E] placeholder:text-[#A39CA8] focus:outline-none focus:border-[#E97A9A] focus:ring-2 focus:ring-[#E97A9A]/20 transition-all"
          />
          {isSuggestOpen && (
            <div className="absolute z-30 mt-1.5 w-full max-h-56 overflow-y-auto bg-white rounded-xl border border-[#F3D3DB] shadow-lg">
              {suggestions.length > 0 ? (
                suggestions.map((sil) => (
                  <button
                    key={sil.id}
                    type="button"
                    id={`sil-suggest-${sil.id}`}
                    onMouseDown={() => handlePickSuggestion(sil.id, sil.label)}
                    className={`w-full text-left px-3.5 py-2 text-[12px] font-semibold transition-colors cursor-pointer ${
                      settings.silhouette === sil.id
                        ? 'bg-[#FFF0F4] text-[#E97A9A]'
                        : 'text-[#2F2A2E] hover:bg-[#FFF0F4] hover:text-[#E97A9A]'
                    }`}
                  >
                    {sil.label}
                  </button>
                ))
              ) : (
                <div className="px-3.5 py-2.5 text-[11px] text-[#A39CA8] font-semibold">
                  No matching silhouette — try "dress", "skirt", or "top", or pick one below.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SILHOUETTE_OPTIONS.map((sil) => (
            <button
              key={sil.id}
              id={`sil-btn-${sil.id}`}
              onClick={() => {
                onUpdate({ silhouette: sil.id });
                setGarmentQuery(sil.label);
              }}
              className={`px-2.5 py-2 text-[11px] font-semibold rounded-xl border text-center transition-all cursor-pointer ${
                settings.silhouette === sil.id
                  ? 'bg-[#E97A9A] text-white border-[#E97A9A] font-bold shadow-xs'
                  : 'bg-[#FFF8FA] text-[#6D6670] border-[#F3D3DB] hover:border-[#E97A9A] hover:bg-[#FFF0F4] hover:text-[#E97A9A]'
              }`}
            >
              {sil.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Texture Wrap & Repeat Controls */}
      <div className="bg-[#FFF8FA] rounded-2xl p-4 border border-[#F3D3DB] space-y-3">
        <div className="flex items-center justify-between text-xs font-bold text-[#2F2A2E]">
          <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[#E97A9A]">
            <svg className="w-3.5 h-3.5 text-[#E97A9A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
            Texture Wrap & UV Mapping
          </span>
          <span className="font-mono text-[#E97A9A] font-bold text-xs">{settings.wrapRepeatX}x Repeat</span>
        </div>

        <div>
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#6D6670] mb-1">
            <span>Horizontal Wrap Frequency (Repeat)</span>
            <span className="font-mono font-bold text-[#E97A9A]">{settings.wrapRepeatX}x</span>
          </div>
          <input
            id="slider-wrap-repeat-x"
            type="range"
            min="0.5"
            max="4.0"
            step="0.5"
            value={settings.wrapRepeatX}
            onChange={(e) => onUpdate({ wrapRepeatX: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-[#F3D3DB] rounded-lg appearance-none cursor-pointer accent-[#E97A9A]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#6D6670] mb-1">
              <span>Hem Length</span>
              <span className="font-mono text-[#E97A9A] font-bold">{settings.hemLength}x</span>
            </div>
            <input
              type="range"
              min="0.6"
              max="1.3"
              step="0.05"
              value={settings.hemLength}
              onChange={(e) => onUpdate({ hemLength: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-[#F3D3DB] rounded-lg appearance-none cursor-pointer accent-[#E97A9A]"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#6D6670] mb-1">
              <span>Skirt Flare Sweep</span>
              <span className="font-mono text-[#E97A9A] font-bold">{settings.flareWidth}x</span>
            </div>
            <input
              type="range"
              min="0.8"
              max="1.6"
              step="0.05"
              value={settings.flareWidth}
              onChange={(e) => onUpdate({ flareWidth: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-[#F3D3DB] rounded-lg appearance-none cursor-pointer accent-[#E97A9A]"
            />
          </div>
        </div>
      </div>

      {/* 3. Fabric Material & Sheen */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-[#6D6670] mb-1.5">Fabric Finish</label>
          <select
            id="select-fabric-finish"
            value={settings.fabricFinish}
            onChange={(e) => onUpdate({ fabricFinish: e.target.value as FabricFinishType })}
            className="w-full p-2.5 text-xs rounded-xl border border-[#F3D3DB] bg-[#FFF8FA] text-[#2F2A2E] font-semibold focus:ring-1 focus:ring-[#E97A9A] focus:border-[#E97A9A] outline-none"
          >
            <option value="silk_satin">Silk Satin (High Gloss Sheen)</option>
            <option value="cotton_matte">Cotton Poplin (Matte Weave)</option>
            <option value="velvet_sheen">Velvet Plush (Soft Sheen)</option>
            <option value="linen_weave">Linen (Textured Bump)</option>
            <option value="ribbed_knit">Ribbed Knit (Linear Weft)</option>
            <option value="metallic_lurex">Metallic Lurex (Reflective)</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-[#6D6670] mb-1.5">Mannequin Finish</label>
          <select
            id="select-mannequin-material"
            value={settings.mannequinMaterial}
            onChange={(e) => onUpdate({ mannequinMaterial: e.target.value as MannequinMaterialType })}
            className="w-full p-2.5 text-xs rounded-xl border border-[#F3D3DB] bg-[#FFF8FA] text-[#2F2A2E] font-semibold focus:ring-1 focus:ring-[#E97A9A] focus:border-[#E97A9A] outline-none"
          >
            <option value="matte_porcelain">Matte Porcelain White</option>
            <option value="slate_graphite">Slate Anodized Graphite</option>
            <option value="birch_wood">Nordic Birch Wood</option>
            <option value="obsidian_chrome">Obsidian Black Chrome</option>
            <option value="linen_dressform">Atelier Tailor Dressform</option>
          </select>
        </div>
      </div>

      {/* 4. Studio Lighting Presets */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-[#6D6670] mb-2">Studio Lighting Rig</label>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
          {[
            { id: 'studio_clean', label: 'Studio Clean' },
            { id: 'runway_warm', label: 'Runway Warm' },
            { id: 'editorial_moody', label: 'Editorial' },
            { id: 'golden_hour', label: 'Golden Hour' },
            { id: 'cyber_atelier', label: 'Cyber Atelier' },
          ].map((light) => (
            <button
              key={light.id}
              id={`light-btn-${light.id}`}
              onClick={() => onUpdate({ lightingPreset: light.id as LightingPresetType })}
              className={`px-2 py-1.5 text-[11px] font-semibold rounded-xl border text-center transition-all cursor-pointer ${
                settings.lightingPreset === light.id
                  ? 'bg-[#E97A9A] text-white border-[#E97A9A] font-bold shadow-xs'
                  : 'bg-[#FFF8FA] text-[#6D6670] border-[#F3D3DB] hover:border-[#E97A9A] hover:bg-[#FFF0F4] hover:text-[#E97A9A]'
              }`}
            >
              {light.label}
            </button>
          ))}
        </div>
      </div>

      {/* 5. Toggles & Visibility */}
      <div className="flex flex-wrap items-center justify-between pt-2 border-t border-[#F3D3DB] text-xs font-semibold text-[11px]">
        <label className="flex items-center gap-2 cursor-pointer text-[#2F2A2E]">
          <input
            type="checkbox"
            checked={settings.showMannequin}
            onChange={(e) => onUpdate({ showMannequin: e.target.checked })}
            className="rounded text-[#E97A9A] accent-[#E97A9A]"
          />
          Show Mannequin Torso
        </label>

        <label className="flex items-center gap-2 cursor-pointer text-[#2F2A2E]">
          <input
            type="checkbox"
            checked={settings.showPedestal}
            onChange={(e) => onUpdate({ showPedestal: e.target.checked })}
            className="rounded text-[#E97A9A] accent-[#E97A9A]"
          />
          Show Stand & Pedestal
        </label>

        <label className="flex items-center gap-2 cursor-pointer text-[#2F2A2E]">
          <input
            type="checkbox"
            checked={settings.showWireframe}
            onChange={(e) => onUpdate({ showWireframe: e.target.checked })}
            className="rounded text-[#E97A9A] accent-[#E97A9A]"
          />
          Wireframe Overlay
        </label>
      </div>
    </div>
  );
};
