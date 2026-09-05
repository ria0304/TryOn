import React, { useEffect, useMemo, useState } from 'react';
import { ThreeMannequin } from './ThreeMannequin';
import { Garment, OutfitBuilderState } from '../types';
import { segmentGarmentFromImage } from '../lib/garmentSegmentation';

const SOURCE = '/try-outfit.webp';

export const CaptureViews: React.FC = () => {
  const [cutoutUrl, setCutoutUrl] = useState<string>(SOURCE);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const result = segmentGarmentFromImage(img);
        setCutoutUrl(result.cutoutUrl || SOURCE);
      } catch {
        setCutoutUrl(SOURCE);
      }
    };
    img.src = SOURCE;
  }, []);

  const garment: Garment = useMemo(
    () => ({
      id: 'try-sunflower-dress',
      name: 'Sunflower Spaghetti Strap Dress',
      category: 'dress',
      imageUrl: SOURCE,
      cutoutUrl,
      color: '#f3e6c8',
      style: 'spaghetti',
      strapType: 'thin_double_straps',
      backStyle: 'open_back',
    }),
    [cutoutUrl]
  );

  const state: OutfitBuilderState = useMemo(
    () => ({
      avatar: 'feminine',
      dress: garment,
    }),
    [garment]
  );

  return (
    <div className="min-h-screen bg-[#1a1418] text-white p-4">
      <h1 className="text-center text-sm font-bold tracking-widest uppercase mb-4 text-[#F3D3DB]">
        Sunflower Dress — Front / Side / Back
      </h1>
      <div className="grid grid-cols-3 gap-3 h-[88vh]">
        {(['front', 'side', 'back'] as const).map((view) => (
          <div key={view} className="flex flex-col rounded-2xl overflow-hidden border border-[#F3D3DB]/30">
            <div className="text-center text-[11px] font-bold uppercase tracking-wider py-2 bg-black/40">
              {view}
            </div>
            <div className="flex-1 min-h-0">
              <ThreeMannequin state={state} initialView={view} enableAutoRotate={false} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CaptureViews;
