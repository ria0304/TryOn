/**
 * Phase 2: Canonical Garment Mesh Generator
 *
 * Converts uploaded garment silhouette (alpha mask) into a conforming 3D mesh.
 *
 * Approach:
 * 1. Load alpha mask from canonicalAsset.alphaMaskUrl
 * 2. Extract 2D contours/silhouette from alpha channel
 * 3. Normalize silhouette to [0,1] space
 * 4. Map normalized silhouette onto the 3D mannequin surface
 * 5. Triangulate to create a BufferGeometry
 *
 * The mesh is front-facing and conforms to the mannequin's body surface.
 * Unseen back/side regions are not synthesized.
 */

import * as THREE from 'three';
import { Category, CanonicalGarmentAsset, AvatarType } from '../types';

export interface GarmentMeshOptions {
  proportions: {
    shoulderW: number;
    shoulderD: number;
    bustW: number;
    bustD: number;
    waistW: number;
    waistD: number;
    hipW: number;
    hipD: number;
    neckR: number;
  };
  bodyLandmarks: {
    hipY: number;
    waistY: number;
    chestY: number;
    necklineSquareY: number;
    shoulderY: number;
    neckBaseY: number;
    skirtHemY: number;
  };
  category: Category;
  avatarType: AvatarType;
  scale?: number;
}

/**
 * Load image, extract alpha channel as grayscale.
 * Returns { width, height, alphaData: Uint8Array }
 */
async function loadAlphaMask(
  imageUrl: string
): Promise<{ width: number; height: number; alphaData: Uint8Array } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }

        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, img.width, img.height);
        const data = imgData.data;

        // Extract alpha channel
        const alphaData = new Uint8Array(img.width * img.height);
        for (let i = 0; i < data.length; i += 4) {
          alphaData[i / 4] = data[i + 3]; // alpha channel
        }

        resolve({
          width: img.width,
          height: img.height,
          alphaData,
        });
      } catch (e) {
        console.error('Failed to load alpha mask:', e);
        resolve(null);
      }
    };

    img.onerror = () => {
      resolve(null);
    };

    img.src = imageUrl;
  });
}

/**
 * Extract 2D contours/bounds from alpha data using a simple scanline approach.
 * Returns: { topRows, bottomRows, leftCols, rightCols } — arrays of indices
 */
interface AlphaContour {
  topRows: number[]; // for each column, the topmost row with alpha > 127
  bottomRows: number[]; // for each column, the bottommost row with alpha > 127
  leftCols: number[]; // for each row, the leftmost col with alpha > 127
  rightCols: number[]; // for each row, the rightmost col with alpha > 127
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

function extractAlphaContour(
  alphaData: Uint8Array,
  width: number,
  height: number,
  threshold: number = 127
): AlphaContour {
  const topRows = new Array(width).fill(height);
  const bottomRows = new Array(width).fill(-1);
  const leftCols = new Array(height).fill(width);
  const rightCols = new Array(height).fill(-1);

  let minX = width,
    maxX = -1,
    minY = height,
    maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = alphaData[y * width + x];
      if (alpha > threshold) {
        // Top edge
        if (y < topRows[x]) topRows[x] = y;
        // Bottom edge
        if (y > bottomRows[x]) bottomRows[x] = y;
        // Left edge
        if (x < leftCols[y]) leftCols[y] = x;
        // Right edge
        if (x > rightCols[y]) rightCols[y] = x;
        // Bounding box
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  return {
    topRows,
    bottomRows,
    leftCols,
    rightCols,
    bounds: { minX, maxX, minY, maxY },
  };
}

/**
 * Get the body radius at a specific Y height using the proportions model.
 * This is the same function used by the mannequin.
 */
function getBodyDimensionsAtY(
  y: number,
  proportions: GarmentMeshOptions['proportions'],
  landmarks: GarmentMeshOptions['bodyLandmarks']
): { rx: number; rz: number } {
  const p = proportions;
  const b = landmarks;

  if (y <= b.hipY) {
    const t = Math.max(0, (y - (b.hipY - 0.15)) / 0.15);
    return {
      rx: (1 - t) * (p.hipW * 0.44) + t * (p.hipW * 0.5),
      rz: (1 - t) * (p.hipD * 0.44) + t * (p.hipD * 0.5),
    };
  } else if (y <= b.waistY) {
    const t = (y - b.hipY) / (b.waistY - b.hipY);
    const smoothT = (1 - Math.cos(t * Math.PI)) / 2;
    return {
      rx: (1 - smoothT) * (p.hipW * 0.5) + smoothT * (p.waistW * 0.5),
      rz: (1 - smoothT) * (p.hipD * 0.5) + smoothT * (p.waistD * 0.5),
    };
  } else if (y <= b.chestY) {
    const t = (y - b.waistY) / (b.chestY - b.waistY);
    const smoothT = (1 - Math.cos(t * Math.PI)) / 2;
    return {
      rx: (1 - smoothT) * (p.waistW * 0.5) + smoothT * (p.bustW * 0.5),
      rz: (1 - smoothT) * (p.waistD * 0.5) + smoothT * (p.bustD * 0.5),
    };
  } else if (y <= b.shoulderY) {
    const t = (y - b.chestY) / (b.shoulderY - b.chestY);
    return {
      rx: (1 - t) * (p.bustW * 0.5) + t * (p.shoulderW * 0.5),
      rz: (1 - t) * (p.bustD * 0.5) + t * (p.shoulderD * 0.5),
    };
  } else if (y <= b.neckBaseY) {
    const t = (y - b.shoulderY) / (b.neckBaseY - b.shoulderY);
    return {
      rx: (1 - t) * (p.shoulderW * 0.5) + t * (p.neckR * 1.1),
      rz: (1 - t) * (p.shoulderD * 0.5) + t * (p.neckR * 1.1),
    };
  } else {
    return { rx: p.neckR, rz: p.neckR };
  }
}

/**
 * Build a front-facing garment mesh from alpha contours.
 * Maps 2D garment silhouette to 3D mannequin surface with proper wrapping.
 * 
 * The key insight for dress-up-game visual quality:
 * - The garment should wrap around the mannequin's torso following its natural curvature
 * - Each horizontal position in the garment maps to an angle around the body
 * - The body radius at each Y level determines how far the garment sits from center
 * - The full width of the garment spans an appropriate angular range for convincing wrap
 */
export async function buildCanonicalGarmentMesh(
  canonicalAsset: CanonicalGarmentAsset,
  options: GarmentMeshOptions
): Promise<THREE.BufferGeometry | null> {
  // Load alpha mask
  const alphaMaskUrl = canonicalAsset.alphaMaskUrl || canonicalAsset.alpha_mask_url;
  if (!alphaMaskUrl) {
    console.warn('No alpha mask URL in canonical asset');
    return null;
  }

  const alphaResult = await loadAlphaMask(alphaMaskUrl);
  if (!alphaResult) {
    console.warn('Failed to load alpha mask');
    return null;
  }

  const { width, height, alphaData } = alphaResult;

  // Extract contours
  const contour = extractAlphaContour(alphaData, width, height);
  const { bounds } = contour;

  // Check if we have any valid garment pixels
  if (bounds.minX >= bounds.maxX || bounds.minY >= bounds.maxY) {
    console.warn('No alpha pixels found in mask');
    return null;
  }

  const garmentW = bounds.maxX - bounds.minX + 1;
  const garmentH = bounds.maxY - bounds.minY + 1;

  // Category-specific Y range mapping to mannequin
  const landmarks = options.bodyLandmarks;
  let yTop = landmarks.necklineSquareY;
  let yBottom = landmarks.skirtHemY;

  if (options.category === 'top') {
    yTop = landmarks.necklineSquareY;
    yBottom = landmarks.waistY - 0.03;
  } else if (options.category === 'jacket') {
    yTop = landmarks.shoulderY + 0.02;
    yBottom = landmarks.hipY - 0.04;
  } else if (options.category === 'bottom') {
    yTop = landmarks.waistY + 0.02;
    yBottom = landmarks.skirtHemY;
  } else if (options.category === 'dress') {
    yTop = landmarks.necklineSquareY;
    yBottom = landmarks.skirtHemY;
  } else if (options.category === 'shoes') {
    // Shoes are typically handled as flat planes; fallback
    return null;
  }

  const scale = options.scale || 1.0;
  const totalHeight = (yTop - yBottom) * scale;
  yBottom = yTop - totalHeight;

  const airGap = 0.009; // fabric layer offset from mannequin

  // Dress-up game wrapping: The garment wraps around the front/sides of the mannequin.
  // We use an angular span that provides convincing wrap visibility from 3/4 and side views.
  // - Front center (garment middle) maps to angle 0 (pointing toward +Z viewer)
  // - Left edge maps to negative angle (wrapping toward left side)
  // - Right edge maps to positive angle (wrapping toward right side)
  // Total wrap angle: approximately 200° (-100° to +100°) for convincing side visibility
  // while avoiding visible back fabrication.
  const maxWrapAngle = Math.PI * 0.55; // ~100° from center to each side (= 200° total)

  // Build mesh: sample rows of the garment silhouette, map to 3D with wrapping
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const vSegments = Math.max(24, Math.ceil(garmentH / 8)); // vertical samples
  const uSegments = Math.max(32, Math.ceil(garmentW / 4)); // horizontal samples

  for (let vIdx = 0; vIdx <= vSegments; vIdx++) {
    const vFrac = vIdx / vSegments; // 0 (bottom) to 1 (top)
    const imgY = Math.round(bounds.maxY - vFrac * garmentH);
    const y = yBottom + vFrac * totalHeight;

    // Sample width at this row from alpha data
    let leftX = bounds.maxX,
      rightX = bounds.minX;
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      if (alphaData[imgY * width + x] > 127) {
        leftX = Math.min(leftX, x);
        rightX = Math.max(rightX, x);
      }
    }

    const rowWidth = Math.max(1, rightX - leftX + 1);

    // Get body dimensions at this Y - use full body radius, not scaled by garment width
    // This ensures the garment follows the mannequin's actual body curvature
    const bodyDims = getBodyDimensionsAtY(y, options.proportions, landmarks);
    const bodyRx = bodyDims.rx + airGap;
    const bodyRz = bodyDims.rz + airGap;

    // Sample this row horizontally with proper angular wrapping
    for (let uIdx = 0; uIdx <= uSegments; uIdx++) {
      const uFrac = uIdx / uSegments; // 0 (left edge) to 1 (right edge)
      
      // Map garment horizontal position to wrap angle
      // uFrac = 0 → angle = -maxWrapAngle (left side)
      // uFrac = 0.5 → angle = 0 (front center)
      // uFrac = 1 → angle = +maxWrapAngle (right side)
      const angle = (uFrac - 0.5) * maxWrapAngle * 2;

      // Position on cylindrical surface following body curvature
      const x = Math.sin(angle) * bodyRx;
      const z = Math.cos(angle) * bodyRz;

      positions.push(x, y, z);
      uvs.push(uFrac, vFrac);
    }
  }

  // Triangulate: simple quad fan
  for (let vIdx = 0; vIdx < vSegments; vIdx++) {
    for (let uIdx = 0; uIdx < uSegments; uIdx++) {
      const a = vIdx * (uSegments + 1) + uIdx;
      const b = a + 1;
      const c = (vIdx + 1) * (uSegments + 1) + uIdx;
      const d = c + 1;

      indices.push(a, b, d);
      indices.push(a, d, c);
    }
  }

  // Create geometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * Check if a canonical asset has valid alpha data.
 * Used to decide whether to attempt canonical mesh or fall back to generic.
 */
export function hasValidCanonicalAsset(
  canonicalAsset: CanonicalGarmentAsset | undefined
): boolean {
  if (!canonicalAsset) return false;
  const alphaMaskUrl = canonicalAsset.alphaMaskUrl || canonicalAsset.alpha_mask_url;
  return !!alphaMaskUrl;
}
