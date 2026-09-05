import { BackStyleType, Category, Garment, StrapType } from '../../types';

export type GarmentBackTemplate =
  | 'thin_double_straps'
  | 'spaghetti_straps'
  | 'halter_neck'
  | 'strapless'
  | 'racerback'
  | 'one_shoulder'
  | 'off_shoulder'
  | 'backless'
  | 'criss_cross'
  | 'covered_wide'
  | 'bottom_full'
  | 'unknown';

export interface ResolvedGarmentStyle {
  template: GarmentBackTemplate;
  strapType: StrapType;
  backStyle: BackStyleType;
  source: 'garment' | 'analysis' | 'name' | 'default' | 'unknown';
}

const NAME_RULES: { test: RegExp; template: GarmentBackTemplate }[] = [
  { test: /racer\s*back|racerback/, template: 'racerback' },
  { test: /one[-\s]?shoulder|asymmetric/, template: 'one_shoulder' },
  { test: /off[-\s]?shoulder|bardot/, template: 'off_shoulder' },
  { test: /backless/, template: 'backless' },
  { test: /spaghetti/, template: 'spaghetti_straps' },
  { test: /halter/, template: 'halter_neck' },
  { test: /criss[-\s]?cross|crossed/, template: 'criss_cross' },
  { test: /strapless|bandeau/, template: 'strapless' },
  { test: /tank/, template: 'thin_double_straps' },
  { test: /hoodie|sweater|tshirt|tee|blouse/, template: 'covered_wide' },
];

export function inferTemplateFromName(garment: Garment): GarmentBackTemplate | null {
  const hay = `${garment.name || ''} ${garment.style || ''}`.toLowerCase();
  for (const rule of NAME_RULES) {
    if (rule.test.test(hay)) return rule.template;
  }
  return null;
}

export function templateFromStrapBack(
  strapType?: StrapType | string | null,
  backStyle?: BackStyleType | string | null
): GarmentBackTemplate {
  const strap = strapType || 'unknown';
  const back = backStyle || 'undetermined';

  if (strap === 'racerback') return 'racerback';
  if (strap === 'one_shoulder') return 'one_shoulder';
  if (strap === 'off_shoulder') return 'off_shoulder';
  if (strap === 'halter_neck') return 'halter_neck';
  if (strap === 'crossed_straps' || back === 'crossed_back') return 'criss_cross';
  if (strap === 'thin_double_straps') {
    if (back === 'open_back') return 'thin_double_straps';
    return 'thin_double_straps';
  }
  if (strap === 'strapless') {
    if (back === 'open_back') return 'backless';
    return 'strapless';
  }
  if (strap === 'wide_straps') return 'covered_wide';
  if (back === 'tie_back') return 'halter_neck';
  if (back === 'open_back' && strap === 'unknown') return 'backless';
  if (back === 'covered_back') return 'covered_wide';
  return 'unknown';
}

export function resolveGarmentStyle(
  garment: Garment,
  category: Category,
  analysis?: { strapType?: StrapType; backStyle?: BackStyleType } | null
): ResolvedGarmentStyle {
  if (category === 'bottom') {
    return {
      template: 'bottom_full',
      strapType: 'strapless',
      backStyle: 'covered_back',
      source: 'default',
    };
  }

  if (category === 'jacket') {
    const named = inferTemplateFromName(garment);
    if (named && named !== 'unknown') {
      return {
        template: named,
        strapType: garment.strapType || 'wide_straps',
        backStyle: garment.backStyle || 'covered_back',
        source: 'name',
      };
    }
    return {
      template: 'covered_wide',
      strapType: garment.strapType || 'wide_straps',
      backStyle: garment.backStyle || 'covered_back',
      source: 'default',
    };
  }

  const named = inferTemplateFromName(garment);
  if (named) {
    return {
      template: named,
      strapType: garment.strapType || analysis?.strapType || 'unknown',
      backStyle: garment.backStyle || analysis?.backStyle || 'undetermined',
      source: 'name',
    };
  }

  const garmentTemplate = templateFromStrapBack(garment.strapType, garment.backStyle);
  if (garmentTemplate !== 'unknown') {
    return {
      template: garmentTemplate,
      strapType: garment.strapType || 'unknown',
      backStyle: garment.backStyle || 'undetermined',
      source: 'garment',
    };
  }

  const analysisTemplate = templateFromStrapBack(
    analysis?.strapType || garment.analysis?.strapType,
    analysis?.backStyle || garment.backStyle
  );
  if (analysisTemplate !== 'unknown') {
    return {
      template: analysisTemplate,
      strapType: analysis?.strapType || garment.analysis?.strapType || 'unknown',
      backStyle: analysis?.backStyle || garment.backStyle || 'undetermined',
      source: 'analysis',
    };
  }

  return {
    template: 'unknown',
    strapType: 'unknown',
    backStyle: 'undetermined',
    source: 'unknown',
  };
}

export function isOpenBackTemplate(template: GarmentBackTemplate): boolean {
  return (
    template === 'thin_double_straps' ||
    template === 'spaghetti_straps' ||
    template === 'halter_neck' ||
    template === 'racerback' ||
    template === 'backless' ||
    template === 'criss_cross'
  );
}
