export type Category = 'top' | 'bottom' | 'dress' | 'jacket' | 'shoes' | 'bag' | 'jewellery' | 'accessories';

export interface Garment {
  id: string;
  name: string;
  category: Category;
  color: string;
  style: string;
  isCustom?: boolean;
  imageUrl?: string;
  cutoutUrl?: string;
  warpedUrl?: string;
  suggestedCategory?: Category;
  suggestionConfidence?: number;
  createdAt?: string;
}

export interface Placement {
  x: number;
  y: number;
  scale: number;
  locked?: boolean;
  rotation?: number;
  zIndex?: number;
  flipX?: boolean;
}

export type AvatarType = 'feminine' | 'masculine' | 'neutral';

export interface Outfit {
  id: string;
  name: string;
  items: {
    top?: Garment;
    bottom?: Garment;
    dress?: Garment;
    jacket?: Garment;
    shoes?: Garment;
    bag?: Garment;
    jewellery?: Garment;
    accessories?: Garment;
  };
  placements?: Partial<Record<Category, Placement>>;
  avatar?: AvatarType;
  createdAt: string;
}

export interface OutfitBuilderState {
  top?: Garment;
  bottom?: Garment;
  dress?: Garment;
  jacket?: Garment;
  shoes?: Garment;
  bag?: Garment;
  jewellery?: Garment;
  accessories?: Garment;
  placements?: Partial<Record<Category, Placement>>;
  avatar?: AvatarType;
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
  /** True once the real in-app condition for this quest has actually been met, independent of whether it's been claimed yet. */
  unlocked?: boolean;
}

export type TabType = 'home' | 'upload' | 'garments' | 'outfits' | 'compare';

export interface UploadResult {
  url: string;
  cutoutUrl?: string;
  warpedUrl?: string;
  filename: string;
  contentType: string;
  width?: number;
  height?: number;
  suggestedCategory?: Category;
  suggestionConfidence?: number;
  suggestedColorHex?: string;
  suggestedColorName?: string;
  suggestedName?: string;
}
