import { GarmentItem } from '../types';

// SVG Data URLs for built-in, beautifully textured test garments
function createFloralPatternSvg(bg: string, petal: string, center: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bg}" />
        <stop offset="100%" stop-color="${bg}" stop-opacity="0.9" />
      </linearGradient>
      <pattern id="flowers" width="80" height="80" patternUnits="userSpaceOnUse">
        <circle cx="40" cy="40" r="16" fill="${petal}" opacity="0.85" />
        <circle cx="28" cy="40" r="12" fill="${petal}" opacity="0.9" />
        <circle cx="52" cy="40" r="12" fill="${petal}" opacity="0.9" />
        <circle cx="40" cy="28" r="12" fill="${petal}" opacity="0.9" />
        <circle cx="40" cy="52" r="12" fill="${petal}" opacity="0.9" />
        <circle cx="40" cy="40" r="8" fill="${center}" />
        <circle cx="0" cy="0" r="6" fill="${center}" opacity="0.6" />
        <circle cx="80" cy="0" r="6" fill="${center}" opacity="0.6" />
        <circle cx="0" cy="80" r="6" fill="${center}" opacity="0.6" />
        <circle cx="80" cy="80" r="6" fill="${center}" opacity="0.6" />
      </pattern>
    </defs>
    <rect width="400" height="600" fill="url(#bg)" />
    <rect width="400" height="600" fill="url(#flowers)" />
    <!-- Bodice accent lines -->
    <path d="M 120,50 Q 200,80 280,50 L 290,260 Q 200,280 110,260 Z" fill="none" stroke="${center}" stroke-width="2" opacity="0.4" />
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function createBotanicalPalmSvg(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#1e3a8a" />
        <stop offset="50%" stop-color="#172554" />
        <stop offset="100%" stop-color="#0f172a" />
      </linearGradient>
      <pattern id="palm" width="100" height="120" patternUnits="userSpaceOnUse">
        <path d="M 50,110 Q 30,70 10,40 Q 50,60 50,10 Q 50,60 90,40 Q 70,70 50,110 Z" fill="#60a5fa" opacity="0.6" />
        <path d="M 50,110 Q 40,80 25,60 Q 50,75 50,30 Q 50,75 75,60 Q 60,80 50,110 Z" fill="#93c5fd" opacity="0.8" />
        <path d="M 0,50 Q 20,40 40,20 Q 25,45 0,50 Z" fill="#3b82f6" opacity="0.5" />
        <path d="M 100,50 Q 80,40 60,20 Q 75,45 100,50 Z" fill="#3b82f6" opacity="0.5" />
      </pattern>
    </defs>
    <rect width="400" height="600" fill="url(#bg)" />
    <rect width="400" height="600" fill="url(#palm)" />
    <!-- Square neckline & wide straps graphic hint -->
    <rect x="110" y="30" width="180" height="160" rx="10" fill="none" stroke="#93c5fd" stroke-width="3" opacity="0.35" />
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function createSilkSatinSvg(colorHex: string, shimmerHex: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
    <defs>
      <linearGradient id="silk" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${colorHex}" />
        <stop offset="35%" stop-color="${shimmerHex}" />
        <stop offset="50%" stop-color="${colorHex}" />
        <stop offset="75%" stop-color="${shimmerHex}" />
        <stop offset="100%" stop-color="${colorHex}" />
      </linearGradient>
    </defs>
    <rect width="400" height="600" fill="url(#silk)" />
    <g opacity="0.15">
      <path d="M 0,0 Q 200,300 400,100" stroke="#ffffff" stroke-width="40" fill="none" />
      <path d="M 0,300 Q 200,500 400,400" stroke="#ffffff" stroke-width="30" fill="none" />
    </g>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function createGeometricKnitSvg(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
    <defs>
      <pattern id="knit" width="40" height="40" patternUnits="userSpaceOnUse">
        <rect width="40" height="40" fill="#18181b" />
        <path d="M 0,20 L 20,0 L 40,20 L 20,40 Z" fill="#27272a" />
        <circle cx="20" cy="20" r="4" fill="#f59e0b" opacity="0.8" />
      </pattern>
    </defs>
    <rect width="400" height="600" fill="url(#knit)" />
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const SAMPLE_GARMENTS: GarmentItem[] = [
  {
    id: 'blue-palm-sundress-test',
    name: 'Botanical Palm Sundress',
    category: 'Midi A-Line Sundress',
    imageUrl: createBotanicalPalmSvg(),
    textureUrl: createBotanicalPalmSvg(),
    strapType: 'wide_straps',
    backStyle: 'covered_back',
    silhouette: 'a_line_dress',
    fabricFinish: 'cotton_matte',
    recommendedWrap: 1.5,
    backDeterminationStatus: 'determined',
    testCaseDescription: 'Wide shoulder straps with square neckline and structured covered back construction.',
  },
  {
    id: 'emerald-silk-slip',
    name: 'Emerald Silk Sweetheart',
    category: 'Liquid Silk Slip Dress',
    imageUrl: createSilkSatinSvg('#064e3b', '#34d399'),
    textureUrl: createSilkSatinSvg('#064e3b', '#34d399'),
    strapType: 'thin_double_straps',
    backStyle: 'open_back',
    silhouette: 'slip_dress',
    fabricFinish: 'silk_satin',
    recommendedWrap: 1.0,
    backDeterminationStatus: 'determined',
    testCaseDescription: 'Dual thin spaghetti straps extending over shoulders into a low open-back slip silhouette.',
  },
  {
    id: 'parisian-rose-crepe',
    name: 'Parisian Rose Floral',
    category: 'Vintage Crepe Sundress',
    imageUrl: createFloralPatternSvg('#fff1f2', '#fda4af', '#f43f5e'),
    textureUrl: createFloralPatternSvg('#fff1f2', '#fda4af', '#f43f5e'),
    strapType: 'thin_double_straps',
    backStyle: 'open_back',
    silhouette: 'fit_and_flare',
    fabricFinish: 'linen_weave',
    recommendedWrap: 2.0,
    backDeterminationStatus: 'determined',
    testCaseDescription: 'Double thin straps with delicate floral crepe drape and open-back cutout.',
  },
  {
    id: 'riviera-navy-halter',
    name: 'Riviera Navy Halter Gown',
    category: 'High Collar Halter Maxi',
    imageUrl: createSilkSatinSvg('#1e1b4b', '#818cf8'),
    textureUrl: createSilkSatinSvg('#1e1b4b', '#818cf8'),
    strapType: 'halter_neck',
    backStyle: 'tie_back',
    silhouette: 'halter_maxi',
    fabricFinish: 'silk_satin',
    recommendedWrap: 1.5,
    backDeterminationStatus: 'determined',
    testCaseDescription: 'High neckline converging to a central neck collar loop with tie-back keyhole knot.',
  },
  {
    id: 'bauhaus-knit-midi',
    name: 'Bauhaus Knit Geometric',
    category: 'Ribbed Knit Midi',
    imageUrl: createGeometricKnitSvg(),
    textureUrl: createGeometricKnitSvg(),
    strapType: 'crossed_straps',
    backStyle: 'crossed_back',
    silhouette: 'bodycon_midi',
    fabricFinish: 'ribbed_knit',
    recommendedWrap: 2.0,
    backDeterminationStatus: 'determined',
    testCaseDescription: 'Criss-cross diagonal strap geometry mapped across the shoulder blades.',
  },
  {
    id: 'cropped-test-garment',
    name: 'Ambiguous Cropped Top',
    category: 'Cropped Neckline Test',
    imageUrl: createSilkSatinSvg('#3f3f46', '#71717a'),
    textureUrl: createSilkSatinSvg('#3f3f46', '#71717a'),
    strapType: 'unknown',
    backStyle: 'undetermined',
    silhouette: 'peplum_top',
    fabricFinish: 'cotton_matte',
    recommendedWrap: 1.0,
    backDeterminationStatus: 'insufficient_straps',
    testCaseDescription: 'Anti-hallucination benchmark: Cropped shoulder region causes back to remain safely undetermined.',
  },
];
