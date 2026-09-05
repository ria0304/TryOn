import React, { useState } from 'react';
import { StableDiffusionConfig, StrapType, BackStyleType } from '../types';
import { StableDiffusionService, DiffusionProgress } from '../services/stableDiffusionService';

interface StableDiffusionPanelProps {
  currentFrontImageUrl: string | null;
  currentStrapType: StrapType;
  currentBackStyle: BackStyleType;
  garmentColorHex: string;
  onGeneratedImage: (imageUrl: string, isBackView?: boolean) => void;
}

export const StableDiffusionPanel: React.FC<StableDiffusionPanelProps> = ({
  currentFrontImageUrl,
  currentStrapType,
  currentBackStyle,
  garmentColorHex,
  onGeneratedImage,
}) => {
  const [activeTab, setActiveTab] = useState<'generate' | 'synthesize_back' | 'settings'>('generate');

  const [config, setConfig] = useState<StableDiffusionConfig>({
    prompt: 'Emerald green silk satin slip dress, liquid drape, delicate spaghetti straps, studio fashion photography, 8k',
    negativePrompt: 'blurry, low quality, distorted anatomy, extra straps, watermark, artifacts',
    sampler: 'Euler a',
    steps: 20,
    cfgScale: 7.5,
    seed: 42891,
    denoiseStrength: 0.75,
    controlNetType: 'Canny Lineart',
    backViewConditioning: true,
    generateSeamlessTile: false,
    apiEndpointUrl: 'http://127.0.0.1:7860/sdapi/v1/txt2img',
    apiKey: '',
    useCustomApi: false,
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<DiffusionProgress | null>(null);

  const promptPresets = [
    {
      name: 'Emerald Silk Slip',
      prompt: 'Emerald green liquid silk satin slip dress with golden lace trims, high fashion runway look, studio lighting',
    },
    {
      name: 'Parisian Rose Floral',
      prompt: 'Romantic watercolor blooming roses floral print sundress on vintage blush crepe fabric, delicate straps',
    },
    {
      name: 'Riviera Navy Halter',
      prompt: 'Sculptural navy blue chiffon halter gown with high collar drape, resort gala evening look',
    },
    {
      name: 'Burgundy Velvet Bodice',
      prompt: 'Opulent crimson royal velvet cocktail dress with structured square bodice and golden embroidery',
    },
    {
      name: 'Bauhaus Knit Midi',
      prompt: 'Modernist monochromatic geometric colorblock knit dress, high contrast sharp architectural contours',
    },
  ];

  const handleGenerateGarment = async () => {
    setIsGenerating(true);
    setProgress({
      step: 0,
      totalSteps: config.steps,
      latentPreviewUrl: '',
      status: 'Initializing Stable Diffusion latent space...',
    });

    try {
      const result = await StableDiffusionService.generateGarment(config, (prog) => {
        setProgress(prog);
      });
      onGeneratedImage(result.imageUrl, false);
    } catch (err) {
      console.error('Stable Diffusion generation failed:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSynthesizeBackView = async () => {
    if (!currentFrontImageUrl) return;

    setIsGenerating(true);
    setProgress({
      step: 0,
      totalSteps: 16,
      latentPreviewUrl: '',
      status: 'Extracting front garment color harmonics & conditioning ControlNet backline...',
    });

    try {
      const backImageUrl = await StableDiffusionService.synthesizeBackView(
        currentFrontImageUrl,
        currentStrapType,
        currentBackStyle,
        garmentColorHex,
        (prog) => {
          setProgress(prog);
        }
      );
      onGeneratedImage(backImageUrl, true);
    } catch (err) {
      console.error('Back view synthesis failed:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-5 border border-[#F3D3DB] shadow-sm space-y-4 text-[#2F2A2E]">
      {/* Header & Mode Tabs */}
      <div className="flex items-center justify-between pb-3 border-b border-[#F3D3DB]">
        <div>
          <span className="text-[10px] font-mono tracking-widest uppercase text-[#E97A9A] block font-bold">
            Stable Diffusion Studio
          </span>
          <h3 className="text-sm sm:text-base font-bold tracking-wide uppercase text-[#2F2A2E] mt-0.5">
            Neural Generative Pipeline
          </h3>
        </div>

        <div className="flex items-center gap-1 bg-[#FFF0F4] border border-[#F3D3DB] p-1 rounded-2xl">
          <button
            id="tab-sd-generate"
            onClick={() => setActiveTab('generate')}
            className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
              activeTab === 'generate'
                ? 'bg-[#E97A9A] text-white shadow-xs'
                : 'text-[#6D6670] hover:text-[#E97A9A]'
            }`}
          >
            Prompt Gen
          </button>
          <button
            id="tab-sd-back"
            onClick={() => setActiveTab('synthesize_back')}
            className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
              activeTab === 'synthesize_back'
                ? 'bg-[#E97A9A] text-white shadow-xs'
                : 'text-[#6D6670] hover:text-[#E97A9A]'
            }`}
          >
            Back-View
          </button>
          <button
            id="tab-sd-settings"
            onClick={() => setActiveTab('settings')}
            className={`p-1 text-xs rounded-xl transition-all cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-[#E97A9A] text-white shadow-xs'
                : 'text-[#6D6670] hover:text-[#E97A9A]'
            }`}
            title="SD Model / API Endpoint Settings"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Latent Diffusion Progress Overlay */}
      {isGenerating && progress && (
        <div className="bg-[#FFF0F4] text-[#2F2A2E] rounded-2xl p-4 border border-[#F3D3DB] space-y-3 shadow-md">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="font-bold text-[#E97A9A] uppercase tracking-wider text-[11px]">Stable Diffusion Denoising</span>
            <span className="text-[#6D6670] font-mono">
              Step {progress.step} / {progress.totalSteps}
            </span>
          </div>

          <div className="w-full bg-[#F3D3DB] rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-[#E97A9A] h-1.5 rounded-full transition-all duration-100 shadow-[0_0_10px_rgba(233,122,154,0.5)]"
              style={{ width: `${(progress.step / progress.totalSteps) * 100}%` }}
            ></div>
          </div>

          <div className="text-[10px] text-[#6D6670] truncate font-mono">{progress.status}</div>

          {progress.latentPreviewUrl && (
            <div className="relative rounded-xl overflow-hidden border border-[#F3D3DB] bg-white h-32 flex items-center justify-center p-1">
              <img
                src={progress.latentPreviewUrl}
                alt="Latent Diffusion Preview"
                className="h-full w-auto object-contain rounded-lg"
              />
              <span className="absolute bottom-1 right-1.5 text-[9px] bg-[#FFF0F4] px-1.5 py-0.5 rounded text-[#E97A9A] font-bold border border-[#F3D3DB]">
                Latent Frame
              </span>
            </div>
          )}
        </div>
      )}

      {/* Tab 1: Text Prompt Generation */}
      {activeTab === 'generate' && (
        <div className="space-y-3">
          {/* Quick Style Presets */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#6D6670] mb-1.5">Style Presets</div>
            <div className="flex flex-wrap gap-1.5">
              {promptPresets.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => setConfig({ ...config, prompt: p.prompt })}
                  className="px-2.5 py-1 text-[10px] font-semibold bg-[#FFF8FA] hover:bg-[#FFF0F4] hover:text-[#E97A9A] hover:border-[#E97A9A] border border-[#F3D3DB] rounded-xl text-[#6D6670] transition-colors cursor-pointer"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt Box */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-[#6D6670] mb-1">
              Garment / Fabric Prompt
            </label>
            <textarea
              id="input-sd-prompt"
              rows={3}
              value={config.prompt}
              onChange={(e) => setConfig({ ...config, prompt: e.target.value })}
              className="w-full text-xs p-3 rounded-2xl border border-[#F3D3DB] bg-[#FFF8FA] text-[#2F2A2E] placeholder:text-[#A39CA8] focus:outline-hidden focus:ring-1 focus:ring-[#E97A9A] focus:border-[#E97A9A] font-sans"
              placeholder="Describe garment cut, fabric, color, patterns, and lighting..."
            />
          </div>

          {/* Sampling & Parameter Controls */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#6D6670] mb-1">
                <span>Sampling Steps</span>
                <span className="font-mono font-bold text-[#E97A9A]">{config.steps}</span>
              </div>
              <input
                type="range"
                min="8"
                max="30"
                step="2"
                value={config.steps}
                onChange={(e) => setConfig({ ...config, steps: parseInt(e.target.value) })}
                className="w-full h-1.5 bg-[#F3D3DB] rounded-lg appearance-none cursor-pointer accent-[#E97A9A]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#6D6670] mb-1">
                <span>CFG Guidance</span>
                <span className="font-mono font-bold text-[#E97A9A]">{config.cfgScale}</span>
              </div>
              <input
                type="range"
                min="3.0"
                max="15.0"
                step="0.5"
                value={config.cfgScale}
                onChange={(e) => setConfig({ ...config, cfgScale: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-[#F3D3DB] rounded-lg appearance-none cursor-pointer accent-[#E97A9A]"
              />
            </div>
          </div>

          {/* Seamless & Sampler Row */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-[#6D6670] mb-1">Sampler</label>
              <select
                value={config.sampler}
                onChange={(e) => setConfig({ ...config, sampler: e.target.value as any })}
                className="w-full p-2 text-xs rounded-xl border border-[#F3D3DB] bg-[#FFF8FA] text-[#2F2A2E] focus:outline-hidden focus:border-[#E97A9A]"
              >
                <option value="Euler a">Euler a</option>
                <option value="DPM++ 2M Karras">DPM++ 2M Karras</option>
                <option value="DDIM">DDIM</option>
                <option value="UniPC">UniPC</option>
              </select>
            </div>

            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 text-xs text-[#2F2A2E] cursor-pointer pb-2 font-semibold text-[11px]">
                <input
                  type="checkbox"
                  checked={config.generateSeamlessTile}
                  onChange={(e) => setConfig({ ...config, generateSeamlessTile: e.target.checked })}
                  className="rounded text-[#E97A9A] accent-[#E97A9A]"
                />
                Seamless 3D Tile Mode
              </label>
            </div>
          </div>

          {/* Action Button */}
          <button
            id="btn-sd-generate"
            onClick={handleGenerateGarment}
            disabled={isGenerating}
            className="w-full py-3 px-4 rounded-2xl bg-[#E97A9A] hover:bg-[#D9698A] active:scale-[0.99] text-white font-bold uppercase tracking-wider text-xs shadow-md shadow-[#E97A9A]/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            Run Stable Diffusion Garment Synthesis
          </button>
        </div>
      )}

      {/* Tab 2: Back-View Synthesis */}
      {activeTab === 'synthesize_back' && (
        <div className="space-y-3 text-xs">
          <div className="bg-[#FFF8FA] p-3.5 rounded-2xl border border-[#F3D3DB]">
            <p className="uppercase tracking-wider font-bold text-[#E97A9A] mb-1 text-[11px]">ControlNet Backline Synthesis</p>
            <p className="text-[#6D6670] text-xs">
              Conditioned on detected strap style: <strong className="text-[#2F2A2E]">{currentStrapType.replace(/_/g, ' ')}</strong>.
              Synthesizes an anatomically matching back texture with harmonious fabric and lighting.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-[#FFF8FA] p-2.5 rounded-xl border border-[#F3D3DB]">
              <span className="text-[#6D6670] block mb-0.5 font-bold text-[9px] uppercase tracking-wider">Target Back Style</span>
              <span className="font-bold text-[#2F2A2E] uppercase">{currentBackStyle.replace(/_/g, ' ')}</span>
            </div>
            <div className="bg-[#FFF8FA] p-2.5 rounded-xl border border-[#F3D3DB]">
              <span className="text-[#6D6670] block mb-0.5 font-bold text-[9px] uppercase tracking-wider">ControlNet Model</span>
              <span className="font-bold text-[#2F2A2E]">Canny + OpenPose</span>
            </div>
          </div>

          <button
            id="btn-sd-synthesize-back"
            onClick={handleSynthesizeBackView}
            disabled={isGenerating || !currentFrontImageUrl}
            className="w-full py-3 px-4 rounded-2xl bg-[#E97A9A] hover:bg-[#D9698A] active:scale-[0.99] text-white font-bold uppercase tracking-wider text-xs shadow-md shadow-[#E97A9A]/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Synthesize Matching Back-View Texture
          </button>
        </div>
      )}

      {/* Tab 3: External SD API Endpoint Settings */}
      {activeTab === 'settings' && (
        <div className="space-y-3 text-xs">
          <div className="flex items-center justify-between pb-1 border-b border-[#F3D3DB]">
            <span className="uppercase tracking-wider font-bold text-[#2F2A2E] text-[11px]">Custom Stable Diffusion API</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={config.useCustomApi}
                onChange={(e) => setConfig({ ...config, useCustomApi: e.target.checked })}
                className="rounded text-[#E97A9A] accent-[#E97A9A]"
              />
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6D6670]">Enable API</span>
            </label>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-[#6D6670] mb-1">
              API Endpoint URL (Automatic1111 / ComfyUI / Diffusers)
            </label>
            <input
              type="text"
              value={config.apiEndpointUrl || ''}
              onChange={(e) => setConfig({ ...config, apiEndpointUrl: e.target.value })}
              className="w-full p-2.5 text-xs rounded-xl border border-[#F3D3DB] bg-[#FFF8FA] text-[#2F2A2E]"
              placeholder="http://127.0.0.1:7860/sdapi/v1/txt2img"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-[#6D6670] mb-1">
              API Key (Optional / Replicate / Cloud)
            </label>
            <input
              type="password"
              value={config.apiKey || ''}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              className="w-full p-2.5 text-xs rounded-xl border border-[#F3D3DB] bg-[#FFF8FA] text-[#2F2A2E]"
              placeholder="Bearer Token or Key"
            />
          </div>

          <p className="text-[10px] text-[#6D6670]">
            When disabled, the built-in procedural neural latent diffusion synthesizer runs client-side with zero external latency.
          </p>
        </div>
      )}
    </div>
  );
};
