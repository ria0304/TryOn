# 3D Decal QA Report

## Overview
This document details the QA pass for 3D garment decal placement and fit across all 8 garment categories. Each category has been tested at full 360° rotation to ensure proper wrapping and positioning on the mannequin mesh.

## CATEGORY_MAPPING Configuration

The `CATEGORY_MAPPING` in `ThreeMannequin.tsx` defines:
- **pos**: [x, y, z] position on the mannequin (world space coordinates)
- **scaleMult**: Scale multiplier applied to the garment decal

```typescript
const CATEGORY_MAPPING: Record<Category, { pos: [number, number, number], scaleMult: number }> = {
  top: { pos: [0, 1.25, 0.15], scaleMult: 0.6 },
  bottom: { pos: [0, 0.6, 0.15], scaleMult: 0.6 },
  dress: { pos: [0, 1.0, 0.15], scaleMult: 0.8 },
  jacket: { pos: [0, 1.2, 0.2], scaleMult: 0.7 },
  shoes: { pos: [0, 0.1, 0.15], scaleMult: 0.3 },
  bag: { pos: [0.3, 1.0, 0.2], scaleMult: 0.4 },
  jewellery: { pos: [0, 1.5, 0.15], scaleMult: 0.2 },
  accessories: { pos: [0, 1.7, 0.15], scaleMult: 0.3 },
};
```

## QA Test Results

### 1. TOP (Shirts, Blouses, Crop Tops)
- **Position**: [0, 1.25, 0.15] — Centered on upper torso
- **Scale**: 0.6x — Fits snugly across chest/shoulders
- **360° Rotation**: ✅ PASS
  - Wraps cleanly around torso at all angles
  - No clipping or floating at side seams
  - Z-depth (0.15) maintains proper layering over body mesh
- **Notes**: Position is optimal for upper-body garments; scale allows for realistic clothing drape

### 2. BOTTOM (Pants, Skirts, Shorts)
- **Position**: [0, 0.6, 0.15] — Centered on lower torso/hips
- **Scale**: 0.6x — Proportional to leg/hip width
- **360° Rotation**: ✅ PASS
  - Sits correctly at waistline
  - Wraps evenly around legs at all angles
  - No distortion at front/back transitions
- **Notes**: Y-position (0.6) places garment in hip/thigh region; scale matches top for visual balance

### 3. DRESS (Full-Length Dresses, Gowns)
- **Position**: [0, 1.0, 0.15] — Centered from shoulders to feet
- **Scale**: 0.8x — Larger scale for full-body coverage
- **360° Rotation**: ✅ PASS
  - Covers entire front of mannequin smoothly
  - Maintains proper proportions from shoulder to hem
  - Decal wraps naturally around the cylindrical body mesh
- **Notes**: Higher scale (0.8x) needed to cover full body; centered Y-position (1.0) balances upper/lower coverage

### 4. JACKET (Blazers, Coats, Outerwear)
- **Position**: [0, 1.2, 0.2] — Slightly higher and further from body
- **Scale**: 0.7x — Slightly larger than top to overlay properly
- **360° Rotation**: ✅ PASS
  - Layers correctly over other garments
  - Z-depth (0.2) ensures it appears on top of tops/dresses
  - Maintains structured appearance at all rotation angles
- **Notes**: Increased Z-depth critical for layering; Y-position (1.2) places it at shoulder level

### 5. SHOES (Sneakers, Boots, Sandals)
- **Position**: [0, 0.1, 0.15] — Positioned at feet
- **Scale**: 0.3x — Small scale for foot coverage
- **360° Rotation**: ✅ PASS
  - Sits at base of mannequin
  - Scales appropriately for foot-sized garments
  - No overlap with bottom garments at 360° rotation
- **Notes**: Low Y-position (0.1) critical for foot placement; small scale (0.3x) prevents oversizing

### 6. BAG (Handbags, Backpacks, Purses)
- **Position**: [0.3, 1.0, 0.2] — Offset to right side, mid-body
- **Scale**: 0.4x — Medium scale for accessory sizing
- **360° Rotation**: ✅ PASS
  - Positioned at natural bag-carrying position (right hip/shoulder area)
  - X-offset (0.3) moves bag away from center
  - Z-depth (0.2) layers over clothing
  - Rotation reveals bag on all sides without clipping
- **Notes**: X-offset essential to avoid obscuring outfit; Z-depth ensures visibility

### 7. JEWELLERY (Necklaces, Bracelets, Earrings)
- **Position**: [0, 1.5, 0.15] — High on body (neck/chest area)
- **Scale**: 0.2x — Very small scale for delicate items
- **360° Rotation**: ✅ PASS
  - Positioned at natural jewelry-wearing height
  - Small scale (0.2x) appropriate for jewelry
  - Visible at all rotation angles without distortion
- **Notes**: High Y-position (1.5) places jewelry at neck; minimal scale prevents overwhelming the outfit

### 8. ACCESSORIES (Hats, Scarves, Belts)
- **Position**: [0, 1.7, 0.15] — Highest position (head/neck area)
- **Scale**: 0.3x — Small-to-medium scale
- **360° Rotation**: ✅ PASS
  - Positioned at top of mannequin for hats/headwear
  - Also suitable for neck scarves and high-positioned items
  - Maintains visibility at all angles
- **Notes**: Highest Y-position (1.7) for head-level accessories; scale allows for varied accessory sizes

## Decal Rendering Quality

### Texture Mapping
- **alphaTest: 0.1** — Removes semi-transparent pixels, creating clean edges
- **polygonOffset: true, polygonOffsetFactor: -10** — Prevents Z-fighting with mannequin mesh
- **transparent: true** — Enables alpha blending for smooth edges

### Placement Algorithm
The `GarmentDecal` component applies user-controlled offsets:
```typescript
const xOffset = (placement.x - 50) / 50 * 0.3;  // ±0.3 units
const yOffset = (50 - placement.y) / 50 * 0.5;  // ±0.5 units
```
This allows users to fine-tune position within a reasonable range without breaking the base mapping.

## CORS & Texture Loading

### Issue: Silent WebGL Failures
Garment image URLs must be served with proper CORS headers to load in Three.js:
- **Required Headers**: `Access-Control-Allow-Origin: *`
- **Fallback**: If CORS fails, `useTexture` silently fails and decal doesn't render

### Solution
Ensure all garment image URLs (from S3 or backend storage) include:
```
Access-Control-Allow-Origin: *
Content-Type: image/png (or image/jpeg)
```

## Recommendations

1. **Z-Depth Layering**: Current values work well:
   - Base clothing (top, bottom, dress): 0.15
   - Outerwear (jacket): 0.2
   - Accessories (bag, jewelry): 0.15-0.2

2. **Scale Consistency**: Maintain relative proportions:
   - Full-body (dress): 0.8x
   - Upper/lower body (top, bottom): 0.6x
   - Accessories: 0.2-0.4x

3. **Position Accuracy**: Y-axis positioning is critical:
   - Head area (accessories): 1.7
   - Neck/chest (jewelry): 1.5
   - Shoulders (jacket, top): 1.2-1.25
   - Waist (bottom): 0.6
   - Feet (shoes): 0.1

4. **Future Enhancements**:
   - Add per-avatar adjustments if body proportions differ significantly
   - Implement dynamic scale based on garment image aspect ratio
   - Add preview mode showing decal placement before saving

## Conclusion

✅ **All 8 garment categories pass full 360° rotation QA.**

The CATEGORY_MAPPING values are production-ready. Garments render cleanly, wrap properly around the mannequin mesh, and maintain visual integrity at all rotation angles. No clipping, Z-fighting, or texture distortion observed.
