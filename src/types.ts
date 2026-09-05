export type StrapType =
  | 'thin_double_straps'
  | 'halter_neck'
  | 'wide_straps'
  | 'crossed_straps'
  | 'strapless'
  | 'unknown';

export type BackStyleType =
  | 'open_back'
  | 'tie_back'
  | 'covered_back'
  | 'crossed_back'
  | 'undetermined';

export type BackDeterminationStatus =
  | 'determined'
  | 'insufficient_straps'
  | 'ambiguous'
  | 'low_confidence';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type StrapOrientation =
  | 'vertical_parallel'
  | 'convergent_neck'
  | 'wide_bodice'
  | 'crossed'
  | 'none_or_obscured'
  | 'ambiguous';

export type NecklineType =
  | 'scoop_square'
  | 'halter_v'
  | 'horizontal_bandeau'
  | 'sweetheart'
  | 'ambiguous';

export type NecklineShapeType =
  | 'square'
  | 'scoop'
  | 'sweetheart'
  | 'v_neck'
  | 'halter'
  | 'strapless_bandeau'
  | 'asymmetric'
  | 'ambiguous';

export type ShoulderAreaVisibility =
  | 'fully_visible'
  | 'partially_visible'
  | 'occluded_or_cropped';

export interface Spline3DPoint {
  x: number;
  y: number;
  z: number;
}

export interface StrapAttachmentPoints {
  frontLeft: Spline3DPoint;
  frontRight: Spline3DPoint;
  backLeft: Spline3DPoint;
  backRight: Spline3DPoint;
  napeCenter?: Spline3DPoint;
}

export interface AnalysisResult {
  strapType: StrapType;
  strapTypeLabel: string;
  backStyle: BackStyleType;
  backStyleLabel: string;
  backDeterminationStatus: BackDeterminationStatus;
  backDeterminationMessage: string;
  isBackDetermined: boolean;
  confidence: number;
  strapConfidence?: number;
  necklineConfidence?: number;
  backConfidence?: number;
  confidenceLevel: ConfidenceLevel;
  strapCount: number;
  averageStrapWidthRatio: number;
  strapWidthPx?: number;
  strapThickness?: number;
  shoulderSpanRatio: number;
  strapOrientation: StrapOrientation;
  necklineType: NecklineType;
  necklineShape?: NecklineShapeType;
  shoulderAreaVisibility: ShoulderAreaVisibility;
  strapAttachmentPoints?: StrapAttachmentPoints;
  garmentColor: string;
  backgroundColor: string;
  colorSeparationDistance?: number;
  detectedFeatures: string[];
  explanation: string;
  hasSleeves?: boolean;
  isStrapless?: boolean;
  antiHallucinationWarnings?: string[];
  debugMaskDataUrl?: string;
}

export type SilhouetteType =
  | 'a_line_dress'
  | 'slip_dress'
  | 'bodycon_midi'
  | 'halter_maxi'
  | 'fit_and_flare'
  | 'peplum_top'
  | 'flared_skirt';

export type MannequinMaterialType =
  | 'matte_porcelain'
  | 'slate_graphite'
  | 'birch_wood'
  | 'obsidian_chrome'
  | 'linen_dressform';

export type FabricFinishType =
  | 'silk_satin'
  | 'cotton_matte'
  | 'velvet_sheen'
  | 'linen_weave'
  | 'ribbed_knit'
  | 'metallic_lurex';

export type LightingPresetType =
  | 'studio_clean'
  | 'runway_warm'
  | 'editorial_moody'
  | 'golden_hour'
  | 'cyber_atelier';

export interface ViewerSettings {
  autoRotate: boolean;
  autoRotateSpeed: number;
  wrapRepeatX: number;
  wrapRepeatY: number;
  textureOffsetX: number;
  textureOffsetY: number;
  textureRotation: number;
  silhouette: SilhouetteType;
  mannequinMaterial: MannequinMaterialType;
  fabricFinish: FabricFinishType;
  lightingPreset: LightingPresetType;
  showMannequin: boolean;
  showPedestal: boolean;
  showWireframe: boolean;
  roughness: number;
  metalness: number;
  bumpScale: number;
  liningColor: string;
  hemLength: number;
  flareWidth: number;
}

export interface GarmentItem {
  id: string;
  name: string;
  category: string;
  imageUrl: string;
  textureUrl?: string;
  strapType: StrapType;
  backStyle: BackStyleType;
  silhouette: SilhouetteType;
  fabricFinish: FabricFinishType;
  recommendedWrap: number;
  backDeterminationStatus: BackDeterminationStatus;
  testCaseDescription?: string;
}

export interface StableDiffusionConfig {
  prompt: string;
  negativePrompt: string;
  sampler: 'Euler a' | 'DPM++ 2M Karras' | 'DDIM' | 'UniPC';
  steps: number;
  cfgScale: number;
  seed: number;
  denoiseStrength: number;
  controlNetType: string;
  backViewConditioning: boolean;
  generateSeamlessTile: boolean;
  apiEndpointUrl?: string;
  apiKey?: string;
  useCustomApi?: boolean;
}

// -------------------------------------------------------------
// TryOn 2D Wardrobe & Stylist Types
// -------------------------------------------------------------
export type Category =
  | 'top'
  | 'bottom'
  | 'dress'
  | 'jacket'
  | 'shoes'
  | 'bag'
  | 'jewellery'
  | 'accessories';

export interface Placement {
  x: number;
  y: number;
  scale: number;
  rotation?: number;
  flipX?: boolean;
  zIndex?: number;
}

export interface Garment {
  id: string;
  name: string;
  category: Category;
  imageUrl?: string;
  image_url?: string;
  cutoutUrl?: string;
  cutout_url?: string;
  warpedUrl?: string;
  warped_url?: string;
  canonicalAsset?: CanonicalGarmentAsset;
  canonical_asset?: CanonicalGarmentAsset;
  style?: string;
  color?: string;
  fabric?: string;
  strapType?: StrapType;
  backStyle?: BackStyleType;
  analysis?: { strapType?: StrapType };
  isCustom?: boolean;
  is_custom?: boolean;
  tags?: string[];
  notes?: string;
  createdAt?: string;
  created_at?: string;
}

export interface CanonicalGarmentAsset {
  url: string;
  alphaMaskUrl?: string;
  alpha_mask_url?: string;
  category: Category;
  boundingBox: { x: number; y: number; width: number; height: number };
  bounding_box?: { x: number; y: number; width: number; height: number };
  contours: number[][][];
  extractionConfidence: number;
  extraction_confidence?: number;
  extractionWarnings: string[];
  extraction_warnings?: string[];
}

export interface UploadResult {
  url: string;
  cutoutUrl?: string;
  cutout_url?: string;
  warpedUrl?: string;
  warped_url?: string;
  canonicalAsset?: CanonicalGarmentAsset;
  canonical_asset?: CanonicalGarmentAsset;
  filename: string;
  contentType: string;
  width: number;
  height: number;
  suggestedCategory: Category;
  suggested_category?: string;
  suggestionConfidence: number;
  suggestedColorHex: string;
  suggested_color_hex?: string;
  suggestedColorName: string;
  suggested_color_name?: string;
  suggestedFabric?: string;
  suggested_fabric?: string;
  suggestedName: string;
  suggested_name?: string;
}

export interface Outfit {
  id: string;
  name: string;
  items: Partial<Record<Category, Garment>>;
  placements?: Partial<Record<Category, Placement>>;
  avatar?: AvatarType;
  notes?: string;
  createdAt?: string;
}

export type AvatarType = 'feminine' | 'masculine' | 'neutral';

export interface OutfitBuilderState {
  avatar?: AvatarType;
  top?: Garment;
  bottom?: Garment;
  dress?: Garment;
  jacket?: Garment;
  shoes?: Garment;
  bag?: Garment;
  jewellery?: Garment;
  accessories?: Garment;
  placements?: Partial<Record<Category, Placement>>;
}

export interface StylistStats {
  level: number;
  xp: number;
  completedQuestIds: string[];
}

export interface StylistQuest {
  id: string;
  title: string;
  description: string;
  icon: string;
  xpReward: number;
  unlocked: boolean;
}

export type TabType =
  | 'home'
  | '3d_viewer'
  | 'upload'
  | 'garments'
  | 'outfits'
  | 'compare';
