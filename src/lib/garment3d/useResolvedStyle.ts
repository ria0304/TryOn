import { useEffect, useMemo, useState } from 'react';
import { AnalysisResult, BackStyleType, Category, Garment, StrapType } from '../../types';
import { ApiClient } from '../../services/apiClient';
import { resolveGarmentStyle, ResolvedGarmentStyle } from './styles';

interface AnalysisHint {
  strapType?: StrapType;
  backStyle?: BackStyleType;
}

export function useResolvedGarmentStyle(
  garment: Garment,
  category: Category
): ResolvedGarmentStyle {
  const [analysis, setAnalysis] = useState<AnalysisHint | null>(null);

  const imageUrl =
    garment.canonicalAsset?.url ||
    garment.cutoutUrl ||
    garment.imageUrl ||
    garment.warpedUrl ||
    '';

  const base = useMemo(
    () => resolveGarmentStyle(garment, category, analysis),
    [garment, category, analysis]
  );

  useEffect(() => {
    setAnalysis(null);
  }, [garment.id, imageUrl, category]);

  useEffect(() => {
    if (category === 'bottom' || category === 'shoes' || category === 'bag' || category === 'jewellery' || category === 'accessories') {
      return;
    }
    if (base.template !== 'unknown') return;
    if (!imageUrl) return;

    let cancelled = false;
    ApiClient.analyzeGarment(imageUrl)
      .then((result: AnalysisResult) => {
        if (cancelled) return;
        if (!result.isBackDetermined || result.strapType === 'unknown' || result.backStyle === 'undetermined') {
          return;
        }
        setAnalysis({
          strapType: result.strapType,
          backStyle: result.backStyle,
        });
      })
      .catch(() => {
        /* keep unknown → existing color-fill fallback */
      });

    return () => {
      cancelled = true;
    };
  }, [base.template, imageUrl, category]);

  return base;
}
