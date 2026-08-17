import { Category, Placement } from '../types';

// Sensible starting position/scale for each category, as percentages of the
// mannequin stage (0-100, measured from the layer's own center).
// Tuned against MannequinRenderer's 400x550 viewBox body proportions.
export const DEFAULT_PLACEMENTS: Record<Category, Placement> = {
  top: { x: 50, y: 38, scale: 1, rotation: 0, zIndex: 12, flipX: false },
  bottom: { x: 50, y: 62, scale: 1, rotation: 0, zIndex: 10, flipX: false },
  dress: { x: 50, y: 48, scale: 1.05, rotation: 0, zIndex: 11, flipX: false },
  jacket: { x: 50, y: 38, scale: 1.1, rotation: 0, zIndex: 15, flipX: false },
  shoes: { x: 50, y: 90, scale: 0.7, rotation: 0, zIndex: 10, flipX: false },
  bag: { x: 72, y: 60, scale: 0.55, rotation: 0, zIndex: 14, flipX: false },
  jewellery: { x: 50, y: 25, scale: 0.5, rotation: 0, zIndex: 16, flipX: false },
  accessories: { x: 50, y: 20, scale: 0.5, rotation: 0, zIndex: 17, flipX: false },
};

export const getDefaultPlacement = (category: Category): Placement => {
  // Fallback to a sensible default if category not found
  const placement = DEFAULT_PLACEMENTS[category];
  if (!placement) {
    console.warn(`No default placement found for category: ${category}, using fallback`);
    return { x: 50, y: 50, scale: 0.8 };
  }
  return { ...placement };
};

// Helper to check if a category has a default placement
export const hasDefaultPlacement = (category: Category): boolean => {
  return category in DEFAULT_PLACEMENTS;
};

// Get all categories that have default placements
export const getCategoriesWithPlacements = (): Category[] => {
  return Object.keys(DEFAULT_PLACEMENTS) as Category[];
};
