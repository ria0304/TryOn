import React, { useEffect, useState } from 'react';
import { OutfitBuilderState, Garment, Category } from '../types';
import { fetchTryOnStatus, generatePhotorealisticTryOn } from '../lib/api';
import { Sparkles, X, AlertTriangle, Download, User } from 'lucide-react';

interface PhotorealisticTryOnModalProps {
  state: OutfitBuilderState;
  onClose: () => void;
}

// Mirrors the "Main Garment Equipped" check already used in StyleMeter —
// the local pipeline dresses one garment per call, so we use whichever one
// counts as the outfit's main piece.
function getMainGarment(state: OutfitBuilderState): { garment: Garment; category: Category } | undefined {
  if (state.dress) return { garment: state.dress, category: 'dress' };
  if (state.top) return { garment: state.top, category: 'top' };
  return undefined;
}

function garmentImageUrl(garment: Garment): string {
  return garment.cutoutUrl || garment.warpedUrl || garment.imageUrl || '';
}

const AVATAR_LABELS: Record<NonNullable<OutfitBuilderState['avatar']>, string> = {
  feminine: 'Feminine',
  masculine: 'Masculine',
  neutral: 'Neutral',
};

type PipelineStatus = 'checking' | 'not_ready' | 'ready';

export const PhotorealisticTryOnModal: React.FC<PhotorealisticTryOnModalProps> = ({ state, onClose }) => {
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>('checking');
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const avatar = state.avatar || 'feminine';
  const main = getMainGarment(state);

  useEffect(() => {
    let cancelled = false;
    fetchTryOnStatus()
      .then((res) => {
        if (!cancelled) setPipelineStatus(res.ready ? 'ready' : 'not_ready');
      })
      .catch(() => {
        if (!cancelled) setPipelineStatus('not_ready');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGenerate = async () => {
    if (!main) return;
    const garmentUrl = garmentImageUrl(main.garment);
    if (!garmentUrl) {
      setError('This garment has no image to try on — pick one that came from an uploaded photo.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setResultUrl(null);
    try {
      const result = await generatePhotorealisticTryOn(avatar, garmentUrl, main.category);
      setResultUrl(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Try-on generation failed.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#111827]/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white border border-[#F3D3DB] rounded-3xl p-6 sm:p-8 max-w-2xl w-full relative shadow-2xl space-y-6 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#F3D3DB] pb-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#E97A9A] bg-[#F8D7DE] px-2.5 py-1 rounded-full">
              Local AI Pipeline
            </span>
            <h2 className="text-xl font-sans font-bold text-[#2F2A2E] mt-1 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#E97A9A]" />
              Photorealistic Mannequin
            </h2>
            <p className="text-xs text-[#6D6670] mt-1">
              Same idea as your 3D mannequin — dressed photorealistically. No photo of you needed.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-[#FFF8FA] border border-[#F3D3DB] text-[#6D6670] hover:text-[#2F2A2E] flex items-center justify-center cursor-pointer transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-5">
          {pipelineStatus === 'not_ready' && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-sm text-[#2F2A2E]">
                <p className="font-bold">The local try-on pipeline isn't set up yet.</p>
                <p className="text-[#6D6670] mt-1">
                  This runs entirely on your own machine (no external API), which means a one-time setup step.
                  See <code className="bg-white px-1.5 py-0.5 rounded border border-amber-200 text-xs">backend/third_party/CATVTON_SETUP.md</code> and
                  restart the backend, then reopen this.
                </p>
              </div>
            </div>
          )}

          {!main && (
            <div className="flex items-start gap-3 bg-[#FFF8FA] border border-[#F3D3DB] rounded-2xl p-4 text-sm text-[#6D6670]">
              Dress the mannequin with a top or dress first — that's the piece this will try on.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Stand-in body (avatar-matched, no upload) */}
            <div>
              <label className="block text-xs font-bold text-[#2F2A2E] uppercase tracking-wider mb-2">
                Stand-In Body
              </label>
              <div className="w-full aspect-[3/4] rounded-2xl border border-[#F3D3DB] bg-[#FFF8FA] flex flex-col items-center justify-center gap-2 p-4 text-center">
                <div className="w-12 h-12 rounded-full bg-[#E97A9A]/10 border border-[#E97A9A]/20 flex items-center justify-center text-[#E97A9A]">
                  <User className="w-6 h-6" />
                </div>
                <p className="text-xs font-bold text-[#2F2A2E]">{AVATAR_LABELS[avatar]} Mannequin</p>
                <p className="text-[10px] text-[#6D6670]">
                  Matches the mannequin type set in Settings. This is a bundled stand-in photo, not a photo of you.
                </p>
              </div>
            </div>

            {/* Garment preview */}
            <div>
              <label className="block text-xs font-bold text-[#2F2A2E] uppercase tracking-wider mb-2">
                Garment
              </label>
              <div className="w-full aspect-[3/4] rounded-2xl border border-[#F3D3DB] bg-[#FFF8FA] flex items-center justify-center overflow-hidden">
                {main && garmentImageUrl(main.garment) ? (
                  <img
                    src={garmentImageUrl(main.garment)}
                    alt={main.garment.name}
                    className="w-full h-full object-contain p-4"
                  />
                ) : (
                  <span className="text-xs text-[#6D6670] px-4 text-center">No garment equipped yet</span>
                )}
              </div>
              {main && <p className="text-xs text-[#6D6670] mt-1.5 text-center">{main.garment.name}</p>}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-3 text-xs text-red-700">{error}</div>
          )}

          {resultUrl && (
            <div>
              <label className="block text-xs font-bold text-[#2F2A2E] uppercase tracking-wider mb-2">Result</label>
              <div className="rounded-2xl border border-[#F3D3DB] overflow-hidden">
                <img src={resultUrl} alt="Photorealistic try-on result" className="w-full" />
              </div>
              <a
                href={resultUrl}
                download="tryon-result.png"
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#E97A9A] hover:text-[#E5678C]"
              >
                <Download className="w-3.5 h-3.5" /> Download image
              </a>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-[#F3D3DB]">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!main || pipelineStatus !== 'ready' || isGenerating}
            className="w-full py-3.5 bg-gradient-to-r from-[#111827] to-[#1f2937] hover:from-[#1f2937] hover:to-[#111827] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-[#E97A9A]" />
            <span>
              {isGenerating
                ? 'Generating… this can take a while, especially without a GPU'
                : 'Generate Photorealistic Look'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
