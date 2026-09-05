import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { RotateCw, Camera } from 'lucide-react';
import { OutfitBuilderState, Category, AvatarType, Placement, Garment, StrapType } from '../types';
import { getDefaultPlacement } from '../data/defaultPlacements';
import { buildCanonicalGarmentMesh, hasValidCanonicalAsset } from '../lib/canonicalGarmentMesh';
import {
  buildVolumetricGarment,
  useFrontGarmentTexture,
  useResolvedGarmentStyle,
} from '../lib/garment3d';

interface ThreeMannequinProps {
  state: OutfitBuilderState;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
  initialView?: 'front' | 'back' | 'side' | 'closeup' | 'full';
  enableAutoRotate?: boolean;
}

// ---------------------------------------------------------------------------
// Sculpted Couture Dressform Anatomical Dimensions
// ---------------------------------------------------------------------------
type Proportions = {
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

const PROPORTIONS: Record<AvatarType, Proportions> = {
  feminine: {
    shoulderW: 0.40,
    shoulderD: 0.17,
    bustW: 0.36,
    bustD: 0.22,
    waistW: 0.26,
    waistD: 0.17,
    hipW: 0.38,
    hipD: 0.23,
    neckR: 0.052,
  },
  masculine: {
    shoulderW: 0.46,
    shoulderD: 0.20,
    bustW: 0.42,
    bustD: 0.23,
    waistW: 0.33,
    waistD: 0.20,
    hipW: 0.36,
    hipD: 0.22,
    neckR: 0.062,
  },
  neutral: {
    shoulderW: 0.43,
    shoulderD: 0.18,
    bustW: 0.38,
    bustD: 0.21,
    waistW: 0.29,
    waistD: 0.18,
    hipW: 0.37,
    hipD: 0.22,
    neckR: 0.056,
  },
};

const BODY = {
  standBaseY: 0.03,
  standPoleTopY: 0.75,
  skirtHemY: 0.36,       // Mid-calf maxi/midi dress hem
  kneeY: 0.55,
  hipY: 0.82,            // Hip fullness apex
  waistY: 1.05,          // Natural narrow waist
  chestY: 1.24,          // Bust apex
  necklineSquareY: 1.34, // Full coverage upper chest bodice edge
  shoulderY: 1.38,       // Shoulder base
  shoulderSeamY: 1.40,   // Shoulder apex for strap wraps
  neckBaseY: 1.45,
  neckTopY: 1.54,
  finialTopY: 1.58,
};

const WRAP_CATEGORIES: Category[] = ['top', 'jacket', 'bottom', 'dress'];

// Garment plane placement for non-wrapping items (shoes, accessories, etc.)
const CATEGORY_MAPPING: Record<Category, { x: number; y: number; z: number; w: number; maxH: number; flat?: boolean }> = {
  top: { x: 0, y: (BODY.necklineSquareY + BODY.waistY) / 2, z: 0.12, w: 0.38, maxH: 0.30 },
  jacket: { x: 0, y: BODY.chestY, z: 0.14, w: 0.44, maxH: 0.52 },
  dress: { x: 0, y: (BODY.necklineSquareY + BODY.skirtHemY) / 2, z: 0.13, w: 0.44, maxH: BODY.necklineSquareY - BODY.skirtHemY },
  bottom: { x: 0, y: (BODY.waistY + BODY.skirtHemY) / 2, z: 0.13, w: 0.38, maxH: BODY.waistY - BODY.skirtHemY },
  shoes: { x: 0, y: BODY.standBaseY + 0.05, z: 0.10, w: 0.24, maxH: 0.14 },
  bag: { x: 0.24, y: BODY.waistY - 0.08, z: 0.12, w: 0.20, maxH: 0.24 },
  jewellery: { x: 0, y: BODY.neckBaseY - 0.02, z: 0.10, w: 0.16, maxH: 0.16 },
  accessories: { x: 0, y: BODY.neckTopY + 0.04, z: 0.02, w: 0.24, maxH: 0.14, flat: true },
};

// Procedural high-res French linen weave with authentic tailor guidelines
function createDressformTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // Warm cream linen base
  ctx.fillStyle = '#F3EFEA';
  ctx.fillRect(0, 0, 1024, 1024);

  // Micro linen cross-hatch fibers
  ctx.fillStyle = 'rgba(160, 145, 130, 0.04)';
  for (let x = 0; x < 1024; x += 4) {
    ctx.fillRect(x, 0, 1.5, 1024);
  }
  for (let y = 0; y < 1024; y += 4) {
    ctx.fillRect(0, y, 1024, 1.5);
  }

  // Seam lines & guide ribbons
  ctx.strokeStyle = 'rgba(120, 105, 90, 0.22)';
  ctx.lineWidth = 3;

  // Center front line
  ctx.beginPath();
  ctx.moveTo(512, 0);
  ctx.lineTo(512, 1024);
  ctx.stroke();

  // Princess seams
  ctx.strokeStyle = 'rgba(130, 115, 100, 0.16)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(340, 0);
  ctx.lineTo(340, 1024);
  ctx.moveTo(684, 0);
  ctx.lineTo(684, 1024);
  ctx.stroke();

  // Bust, waist & hip horizontal marking ribbons
  ctx.strokeStyle = 'rgba(140, 120, 100, 0.15)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 360);
  ctx.lineTo(1024, 360);
  ctx.moveTo(0, 560);
  ctx.lineTo(1024, 560);
  ctx.moveTo(0, 760);
  ctx.lineTo(1024, 760);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(1, 1);
  texture.needsUpdate = true;
  return texture;
}

// Elliptical radius calculation at specific vertical heights
function getBodyDimensions(y: number, p: Proportions): { rx: number; rz: number } {
  if (y <= BODY.hipY) {
    const t = Math.max(0, (y - (BODY.hipY - 0.15)) / 0.15);
    return {
      rx: THREE.MathUtils.lerp(p.hipW * 0.44, p.hipW * 0.50, t),
      rz: THREE.MathUtils.lerp(p.hipD * 0.44, p.hipD * 0.50, t),
    };
  } else if (y <= BODY.waistY) {
    const t = (y - BODY.hipY) / (BODY.waistY - BODY.hipY);
    const smoothT = (1 - Math.cos(t * Math.PI)) / 2;
    return {
      rx: THREE.MathUtils.lerp(p.hipW * 0.50, p.waistW * 0.50, smoothT),
      rz: THREE.MathUtils.lerp(p.hipD * 0.50, p.waistD * 0.50, smoothT),
    };
  } else if (y <= BODY.chestY) {
    const t = (y - BODY.waistY) / (BODY.chestY - BODY.waistY);
    const smoothT = (1 - Math.cos(t * Math.PI)) / 2;
    return {
      rx: THREE.MathUtils.lerp(p.waistW * 0.50, p.bustW * 0.50, smoothT),
      rz: THREE.MathUtils.lerp(p.waistD * 0.50, p.bustD * 0.50, smoothT),
    };
  } else if (y <= BODY.shoulderY) {
    const t = (y - BODY.chestY) / (BODY.shoulderY - BODY.chestY);
    return {
      rx: THREE.MathUtils.lerp(p.bustW * 0.50, p.shoulderW * 0.50, t),
      rz: THREE.MathUtils.lerp(p.bustD * 0.50, p.shoulderD * 0.50, t),
    };
  } else if (y <= BODY.neckBaseY) {
    const t = (y - BODY.shoulderY) / (BODY.neckBaseY - BODY.shoulderY);
    return {
      rx: THREE.MathUtils.lerp(p.shoulderW * 0.50, p.neckR * 1.1, t),
      rz: THREE.MathUtils.lerp(p.shoulderD * 0.50, p.neckR * 1.1, t),
    };
  } else {
    return {
      rx: p.neckR,
      rz: p.neckR,
    };
  }
}

// Build a smoothly contoured parametric 3D mannequin torso
function createCoutureMannequinGeometry(p: Proportions): THREE.BufferGeometry {
  const vSegments = 44;
  const uSegments = 64;
  const yBottom = BODY.hipY - 0.12;
  const yTop = BODY.neckBaseY;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= vSegments; j++) {
    const v = j / vSegments;
    const y = yBottom + v * (yTop - yBottom);
    const { rx, rz } = getBodyDimensions(y, p);

    for (let i = 0; i <= uSegments; i++) {
      const u = i / uSegments;
      const angle = u * Math.PI * 2;

      const x = Math.sin(angle) * rx;
      const z = Math.cos(angle) * rz;

      positions.push(x, y, z);
      uvs.push(u, v);
    }
  }

  for (let j = 0; j < vSegments; j++) {
    for (let i = 0; i < uSegments; i++) {
      const a = j * (uSegments + 1) + i;
      const b = a + 1;
      const c = (j + 1) * (uSegments + 1) + i;
      const d = c + 1;

      indices.push(a, b, d);
      indices.push(a, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// ---------------------------------------------------------------------------
// 3D Garment Geometry Construction Engine (Gemini-Grade Tailored Wrapping)
// ---------------------------------------------------------------------------

/**
 * Builds a seamless, full 360-degree tailored garment geometry with:
 * 1. Square neckline bodice contouring perfectly over bust, waist, and hips
 * 2. Flared A-line midi skirt with soft vertical cloth flutes/drape folds
 * 3. 360° cylindrical wrap so it looks pristine from all viewing angles
 * 4. High-fidelity UV alignment
 */
function buildTailoredGarmentGeometry(
  category: Category,
  avatarType: AvatarType,
  scale = 1.0,
  uSegments = 64,
  vSegments = 48
): THREE.BufferGeometry {
  const p = PROPORTIONS[avatarType] || PROPORTIONS.feminine;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  let yTop = BODY.necklineSquareY;
  let yBottom = BODY.skirtHemY;
  let isFlaredSkirt = false;
  let skirtStartFraction = 0.5; // fraction of height where waist transitions to skirt

  const airGap = 0.009; // 9mm fabric layer above mannequin skin

  if (category === 'dress') {
    yTop = BODY.necklineSquareY; // 1.28 (top of square neckline bodice)
    yBottom = BODY.skirtHemY;    // 0.36 (mid-calf A-line hem)
    isFlaredSkirt = true;
    skirtStartFraction = (BODY.waistY - yBottom) / (yTop - yBottom);
  } else if (category === 'top') {
    yTop = BODY.necklineSquareY;
    yBottom = BODY.waistY - 0.03;
    isFlaredSkirt = false;
  } else if (category === 'bottom') {
    yTop = BODY.waistY + 0.02;
    yBottom = BODY.skirtHemY;
    isFlaredSkirt = true;
    skirtStartFraction = 1.0;
  } else if (category === 'jacket') {
    yTop = BODY.shoulderY + 0.02;
    yBottom = BODY.hipY - 0.04;
    isFlaredSkirt = false;
  }

  // Adjust for user placement scale if customized
  if (scale !== 1.0) {
    const height = (yTop - yBottom) * scale;
    yBottom = yTop - height;
  }

  const totalHeight = yTop - yBottom;

  for (let j = 0; j <= vSegments; j++) {
    const vFrac = j / vSegments; // 0 (hem) to 1 (neckline)
    const y = yBottom + vFrac * totalHeight;

    let rx: number;
    let rz: number;

    if (category === 'dress') {
      if (y >= BODY.waistY) {
        // Bodice section: conforms closely to the torso
        const dims = getBodyDimensions(y, p);
        rx = dims.rx + airGap;
        rz = dims.rz + airGap;
      } else {
        // Skirt section: smooth A-line flare extending from waist down past hips to hem
        const flareT = Math.max(0, (BODY.waistY - y) / Math.max(BODY.waistY - yBottom, 0.01));
        const waistDims = getBodyDimensions(BODY.waistY, p);
        const hipDims = getBodyDimensions(BODY.hipY, p);

        // A-line expansion profile
        const baseRx = THREE.MathUtils.lerp(waistDims.rx, hipDims.rx * 1.55, flareT);
        const baseRz = THREE.MathUtils.lerp(waistDims.rz, hipDims.rz * 1.50, flareT);

        rx = baseRx + airGap;
        rz = baseRz + airGap;

        // Subtle organic cloth fluting / drape waves
        const drapeWave = Math.sin(flareT * Math.PI) * 0.008;
        rx += drapeWave;
        rz += drapeWave;
      }
    } else if (category === 'bottom') {
      const flareT = Math.max(0, (BODY.waistY - y) / Math.max(BODY.waistY - yBottom, 0.01));
      const waistDims = getBodyDimensions(BODY.waistY, p);
      const hipDims = getBodyDimensions(BODY.hipY, p);

      const baseRx = THREE.MathUtils.lerp(waistDims.rx, hipDims.rx * 1.50, flareT);
      const baseRz = THREE.MathUtils.lerp(waistDims.rz, hipDims.rz * 1.45, flareT);

      rx = baseRx + airGap;
      rz = baseRz + airGap;
    } else if (category === 'jacket') {
      const dims = getBodyDimensions(y, p);
      rx = dims.rx + airGap * 2.2;
      rz = dims.rz + airGap * 2.2;
    } else {
      // Tops
      const dims = getBodyDimensions(y, p);
      rx = dims.rx + airGap;
      rz = dims.rz + airGap;
    }

    for (let i = 0; i <= uSegments; i++) {
      const uFrac = i / uSegments; // 0 to 1 around circumference
      // Map angle such that uFrac = 0.5 is front center (+Z), 0.0 and 1.0 are back center (-Z)
      const angle = (uFrac - 0.5) * Math.PI * 2;

      let currentRx = rx;
      let currentRz = rz;

      // Add gentle vertical drape folds on skirts
      if (isFlaredSkirt && y < BODY.waistY) {
        const flareT = (BODY.waistY - y) / (BODY.waistY - yBottom);
        const fold = Math.sin(angle * 10) * 0.010 * flareT;
        currentRx += Math.cos(angle) * fold;
        currentRz += Math.sin(angle) * fold;
      }

      const x = Math.sin(angle) * currentRx;
      const z = Math.cos(angle) * currentRz;

      positions.push(x, y, z);

      // Seamless 360° Cylindrical UV Coordinates:
      // uFrac: 0.0 (Back-Center) -> 0.25 (Left-Flank) -> 0.50 (Front-Center) -> 0.75 (Right-Flank) -> 1.0 (Back-Center)
      // vFrac: 0.0 (Hem) -> 1.0 (Top Neckline / Bodice Apex)
      uvs.push(uFrac, vFrac);
    }
  }

  for (let j = 0; j < vSegments; j++) {
    for (let i = 0; i < uSegments; i++) {
      const a = j * (uSegments + 1) + i;
      const b = a + 1;
      const c = (j + 1) * (uSegments + 1) + i;
      const d = c + 1;

      // Double-sided index winding for pristine rendering
      indices.push(a, b, d);
      indices.push(a, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Builds 3D shoulder straps and neckline piping for dresses and tops
 */
function build3DStrapGeometries(
  strapType: StrapType = 'wide_straps',
  avatarType: AvatarType
): THREE.BufferGeometry[] {
  if (strapType === 'strapless' || strapType === 'unknown') {
    return [];
  }

  const p = PROPORTIONS[avatarType] || PROPORTIONS.feminine;
  const geometries: THREE.BufferGeometry[] = [];
  const strapAirGap = 0.012;

  if (strapType === 'wide_straps') {
    // Left Wide Shoulder Strap Ribbon (starts at front chest, loops over shoulder, down to back bodice)
    const leftCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-p.bustW * 0.32, BODY.necklineSquareY, p.bustD * 0.48 + strapAirGap),
      new THREE.Vector3(-p.shoulderW * 0.36, BODY.shoulderY + 0.01, p.shoulderD * 0.30 + strapAirGap),
      new THREE.Vector3(-p.shoulderW * 0.38, BODY.shoulderSeamY, 0.01),
      new THREE.Vector3(-p.shoulderW * 0.36, BODY.shoulderY + 0.01, -p.shoulderD * 0.30 - strapAirGap),
      new THREE.Vector3(-p.bustW * 0.32, BODY.necklineSquareY, -p.bustD * 0.48 - strapAirGap),
    ]);

    // Right Wide Shoulder Strap Ribbon
    const rightCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(p.bustW * 0.32, BODY.necklineSquareY, p.bustD * 0.48 + strapAirGap),
      new THREE.Vector3(p.shoulderW * 0.36, BODY.shoulderY + 0.01, p.shoulderD * 0.30 + strapAirGap),
      new THREE.Vector3(p.shoulderW * 0.38, BODY.shoulderSeamY, 0.01),
      new THREE.Vector3(p.shoulderW * 0.36, BODY.shoulderY + 0.01, -p.shoulderD * 0.30 - strapAirGap),
      new THREE.Vector3(p.bustW * 0.32, BODY.necklineSquareY, -p.bustD * 0.48 - strapAirGap),
    ]);

    // Build extruded flat ribbon tubes for both straps
    const leftGeo = new THREE.TubeGeometry(leftCurve, 32, 0.019, 10, false);
    const rightGeo = new THREE.TubeGeometry(rightCurve, 32, 0.019, 10, false);

    geometries.push(leftGeo, rightGeo);

    // Square neckline edge trim piping across front
    const necklineCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-p.bustW * 0.32, BODY.necklineSquareY, p.bustD * 0.48 + strapAirGap),
      new THREE.Vector3(0, BODY.necklineSquareY - 0.005, p.bustD * 0.50 + strapAirGap),
      new THREE.Vector3(p.bustW * 0.32, BODY.necklineSquareY, p.bustD * 0.48 + strapAirGap),
    ]);
    const necklineGeo = new THREE.TubeGeometry(necklineCurve, 24, 0.008, 8, false);
    geometries.push(necklineGeo);

  } else if (strapType === 'thin_double_straps') {
    // Spaghetti double straps
    const leftCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-p.bustW * 0.30, BODY.necklineSquareY, p.bustD * 0.48 + strapAirGap),
      new THREE.Vector3(-p.shoulderW * 0.35, BODY.shoulderSeamY, 0.01),
      new THREE.Vector3(-p.bustW * 0.28, BODY.necklineSquareY - 0.05, -p.bustD * 0.48 - strapAirGap),
    ]);
    const rightCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(p.bustW * 0.30, BODY.necklineSquareY, p.bustD * 0.48 + strapAirGap),
      new THREE.Vector3(p.shoulderW * 0.35, BODY.shoulderSeamY, 0.01),
      new THREE.Vector3(p.bustW * 0.28, BODY.necklineSquareY - 0.05, -p.bustD * 0.48 - strapAirGap),
    ]);

    geometries.push(
      new THREE.TubeGeometry(leftCurve, 32, 0.007, 8, false),
      new THREE.TubeGeometry(rightCurve, 32, 0.007, 8, false)
    );
  } else if (strapType === 'halter_neck') {
    // Halter neck loop around the base of the neck
    const halterCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-p.bustW * 0.22, BODY.necklineSquareY, p.bustD * 0.48 + strapAirGap),
      new THREE.Vector3(-p.neckR * 1.3, BODY.neckBaseY + 0.02, 0.04),
      new THREE.Vector3(0, BODY.neckBaseY + 0.03, -p.neckR * 1.25),
      new THREE.Vector3(p.neckR * 1.3, BODY.neckBaseY + 0.02, 0.04),
      new THREE.Vector3(p.bustW * 0.22, BODY.necklineSquareY, p.bustD * 0.48 + strapAirGap),
    ]);

    geometries.push(new THREE.TubeGeometry(halterCurve, 36, 0.012, 10, false));
  } else if (strapType === 'crossed_straps') {
    // Crossed straps on the back
    const leftFrontToRightBack = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-p.bustW * 0.30, BODY.necklineSquareY, p.bustD * 0.48 + strapAirGap),
      new THREE.Vector3(-p.shoulderW * 0.35, BODY.shoulderSeamY, 0.01),
      new THREE.Vector3(p.bustW * 0.25, BODY.necklineSquareY - 0.06, -p.bustD * 0.48 - strapAirGap),
    ]);
    const rightFrontToLeftBack = new THREE.CatmullRomCurve3([
      new THREE.Vector3(p.bustW * 0.30, BODY.necklineSquareY, p.bustD * 0.48 + strapAirGap),
      new THREE.Vector3(p.shoulderW * 0.35, BODY.shoulderSeamY, 0.01),
      new THREE.Vector3(-p.bustW * 0.25, BODY.necklineSquareY - 0.06, -p.bustD * 0.48 - strapAirGap),
    ]);

    geometries.push(
      new THREE.TubeGeometry(leftFrontToRightBack, 32, 0.009, 8, false),
      new THREE.TubeGeometry(rightFrontToLeftBack, 32, 0.009, 8, false)
    );
  }

  return geometries;
}

// ---------------------------------------------------------------------------
// Smart 360° Fabric & Texture Re-Imaging Engine
// ---------------------------------------------------------------------------
function useSmartGarmentTexture(
  url: string | undefined,
  garmentColor: string | undefined,
  category: Category
): {
  texture: THREE.Texture | null;
  dominantColor: string;
  strapColor: string;
  failed: boolean;
} {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [dominantColor, setDominantColor] = useState<string>(garmentColor || '#f8fafc');
  const [strapColor, setStrapColor] = useState<string>(garmentColor || '#3b82f6');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!url) {
      setTexture(null);
      setFailed(false);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      if (cancelled) return;
      try {
        const srcW = img.naturalWidth || img.width || 512;
        const srcH = img.naturalHeight || img.height || 512;

        // 1. Scan source image to find tight garment bounding box
        const scanCanvas = document.createElement('canvas');
        scanCanvas.width = srcW;
        scanCanvas.height = srcH;
        const scanCtx = scanCanvas.getContext('2d');
        if (!scanCtx) return;

        scanCtx.drawImage(img, 0, 0, srcW, srcH);
        const imgData = scanCtx.getImageData(0, 0, srcW, srcH).data;

        let minX = srcW, maxX = 0, minY = srcH, maxY = 0;
        let totalR = 0, totalG = 0, totalB = 0, sampleCount = 0;
        let strapR = 0, strapG = 0, strapB = 0, strapCount = 0;

        for (let y = 0; y < srcH; y++) {
          for (let x = 0; x < srcW; x++) {
            const idx = (y * srcW + x) * 4;
            const a = imgData[idx + 3];
            const r = imgData[idx];
            const g = imgData[idx + 1];
            const b = imgData[idx + 2];

            // Filter out transparent pixels, pure white studio backgrounds, and pure black borders
            const isWhite = r > 246 && g > 246 && b > 246;
            const isBlack = r < 12 && g < 12 && b < 12;
            const isValid = a > 40 && !isWhite && !isBlack;

            if (isValid) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;

              totalR += r;
              totalG += g;
              totalB += b;
              sampleCount++;
            }
          }
        }

        // If no bounding box found, fall back to full image
        if (minX >= maxX || minY >= maxY || sampleCount < 100) {
          minX = 0;
          maxX = srcW;
          minY = 0;
          maxY = srcH;
        }

        const cropW = Math.max(1, maxX - minX);
        const cropH = Math.max(1, maxY - minY);

        // Compute dominant garment color
        const avgR = sampleCount > 0 ? Math.round(totalR / sampleCount) : 220;
        const avgG = sampleCount > 0 ? Math.round(totalG / sampleCount) : 220;
        const avgB = sampleCount > 0 ? Math.round(totalB / sampleCount) : 220;
        const toHex = (n: number) => n.toString(16).padStart(2, '0');
        const computedDomHex = `#${toHex(avgR)}${toHex(avgG)}${toHex(avgB)}`;
        setDominantColor(computedDomHex);

        // Sample top strap / neckline color near minY
        const strapRegionMaxY = Math.min(srcH, minY + Math.round(cropH * 0.15));
        for (let y = minY; y < strapRegionMaxY; y++) {
          for (let x = minX; x < maxX; x++) {
            const idx = (y * srcW + x) * 4;
            const a = imgData[idx + 3];
            const r = imgData[idx];
            const g = imgData[idx + 1];
            const b = imgData[idx + 2];
            if (a > 50 && !(r > 246 && g > 246 && b > 246) && !(r < 12 && g < 12 && b < 12)) {
              strapR += r;
              strapG += g;
              strapB += b;
              strapCount++;
            }
          }
        }
        const sR = strapCount > 0 ? Math.round(strapR / strapCount) : avgR;
        const sG = strapCount > 0 ? Math.round(strapG / strapCount) : avgG;
        const sB = strapCount > 0 ? Math.round(strapB / strapCount) : avgB;
        setStrapColor(`#${toHex(sR)}${toHex(sG)}${toHex(sB)}`);

        // 2. Synthesize a 360-Degree Panoramic Cylindrical Texture (1024 x 1024)
        // Canvas Layout:
        // [0.0 - 0.25]: Left Back / Flank (Seamless mirrored fabric wrap)
        // [0.25 - 0.75]: Front Center (512px width - Full High-Res Front Bodice & Skirt)
        // [0.75 - 1.0]: Right Back / Flank (Seamless mirrored fabric wrap)
        const targetCanvas = document.createElement('canvas');
        targetCanvas.width = 1024;
        targetCanvas.height = 1024;
        const ctx = targetCanvas.getContext('2d');
        if (!ctx) return;

        // Infill background with dominant fabric base so there are NEVER black or transparent pixels
        ctx.fillStyle = computedDomHex;
        ctx.fillRect(0, 0, 1024, 1024);

        // A. Draw Front Center (X: 256 to 768, Y: 0 to 1024)
        // Top of crop (minY = neckline/shoulders) maps to Y=0 (v=1.0)
        // Bottom of crop (maxY = hem) maps to Y=1024 (v=0.0 in WebGL coordinate orientation)
        ctx.drawImage(
          img,
          minX, minY, cropW, cropH,
          256, 0, 512, 1024
        );

        // B. Re-image Left Flank & Back (X: 0 to 256):
        // Mirror the left portion of the garment fabric horizontally from X=256 towards X=0
        ctx.save();
        ctx.translate(256, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(
          img,
          minX, minY, Math.max(1, cropW * 0.5), cropH,
          0, 0, 256, 1024
        );
        ctx.restore();

        // C. Re-image Right Flank & Back (X: 768 to 1024):
        // Mirror the right portion of the garment fabric horizontally from X=768 towards X=1024
        ctx.save();
        ctx.translate(768 + 256, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(
          img,
          minX + cropW * 0.5, minY, Math.max(1, cropW * 0.5), cropH,
          0, 0, 256, 1024
        );
        ctx.restore();

        // D. Subtle couture side & back seam shading for depth
        ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
        ctx.fillRect(254, 0, 4, 1024); // Left side seam
        ctx.fillRect(766, 0, 4, 1024); // Right side seam
        ctx.fillRect(0, 0, 3, 1024);   // Center back seam
        ctx.fillRect(1021, 0, 3, 1024);

        const tex = new THREE.CanvasTexture(targetCanvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;

        setTexture(tex);
        setFailed(false);
      } catch (e) {
        console.error('Smart texture generation error:', e);
        setFailed(true);
      }
    };

    img.onerror = () => {
      if (cancelled) return;
      setFailed(true);
    };

    img.src = url;

    return () => {
      cancelled = true;
    };
  }, [url, garmentColor, category]);

  return { texture, dominantColor, strapColor, failed };
}

function useColorTexture(color: string | undefined): THREE.Texture {
  return useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = color || '#E97A9A';
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [color]);
}

/**
 * Hook to load canonical garment mesh from alpha silhouette.
 * Returns the geometry if successful, null otherwise.
 */
function useCanonicalGarmentMesh(
  canonicalAsset: any,
  category: Category,
  avatarType: AvatarType,
  scale: number
): THREE.BufferGeometry | null {
  const [mesh, setMesh] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    if (!hasValidCanonicalAsset(canonicalAsset)) {
      setMesh(null);
      return;
    }

    let isMounted = true;

    // Build options object for the mesh builder
    const meshOptions = {
      proportions: PROPORTIONS[avatarType],
      bodyLandmarks: {
        hipY: BODY.hipY,
        waistY: BODY.waistY,
        chestY: BODY.chestY,
        necklineSquareY: BODY.necklineSquareY,
        shoulderY: BODY.shoulderY,
        neckBaseY: BODY.neckBaseY,
        skirtHemY: BODY.skirtHemY,
      },
      category,
      avatarType,
      scale,
    };

    buildCanonicalGarmentMesh(canonicalAsset, meshOptions)
      .then((geometry) => {
        if (isMounted) {
          setMesh(geometry);
        }
      })
      .catch((err) => {
        console.warn('Failed to build canonical garment mesh:', err);
        if (isMounted) {
          setMesh(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [canonicalAsset, category, avatarType, scale]);

  return mesh;
}

// ---------------------------------------------------------------------------
// Garment Piece Component with 3D Straps and Tailored Draping
// ---------------------------------------------------------------------------
function fabricFinish(garment: Garment): { roughness: number; metalness: number } {
  let roughness = 0.45;
  let metalness = 0.04;
  const styleName = `${garment.style || ''} ${garment.name || ''}`.toLowerCase();

  if (styleName.includes('silk') || styleName.includes('satin') || garment.style === 'silk_satin') {
    roughness = 0.24;
    metalness = 0.08;
  } else if (styleName.includes('cotton') || garment.style === 'cotton_matte') {
    roughness = 0.72;
    metalness = 0.01;
  } else if (styleName.includes('linen') || garment.style === 'linen_weave') {
    roughness = 0.84;
    metalness = 0.01;
  } else if (styleName.includes('velvet') || garment.style === 'velvet_sheen') {
    roughness = 0.80;
    metalness = 0.12;
  } else if (styleName.includes('knit') || garment.style === 'ribbed_knit') {
    roughness = 0.88;
    metalness = 0.01;
  } else if (styleName.includes('metallic') || styleName.includes('sequin') || styleName.includes('lurex') || garment.style === 'metallic_lurex') {
    roughness = 0.28;
    metalness = 0.60;
  } else if (styleName.includes('leather')) {
    roughness = 0.35;
    metalness = 0.18;
  }

  return { roughness, metalness };
}

const GarmentPiece: React.FC<{
  garment: Garment;
  category: Category;
  placement: Placement;
  avatarType: AvatarType;
}> = ({ garment, category, placement, avatarType }) => {
  const textureUrl = garment.canonicalAsset?.url || garment.cutoutUrl || garment.warpedUrl || garment.imageUrl || '';
  const mapping = CATEGORY_MAPPING[category];
  const isWrapCategory = WRAP_CATEGORIES.includes(category);
  const scale = placement.scale || 1.0;

  const resolved = useResolvedGarmentStyle(garment, category);
  const useVolumetric = isWrapCategory && resolved.template !== 'unknown';

  const { texture: frontPhoto, fabricTexture, dominantColor: frontColor, failed: frontFailed } = useFrontGarmentTexture(
    useVolumetric ? textureUrl : undefined,
    garment.color
  );
  const { texture: imageTexture, dominantColor: wrapColor, strapColor, failed: wrapFailed } = useSmartGarmentTexture(
    useVolumetric ? undefined : textureUrl,
    garment.color,
    category
  );

  const dominantColor = useVolumetric ? frontColor : wrapColor;
  const colorTexture = useColorTexture(garment.color || dominantColor);
  const texture = useVolumetric
    ? (textureUrl && !frontFailed ? frontPhoto : colorTexture)
    : (textureUrl && !wrapFailed ? imageTexture : colorTexture);

  const effectiveStrapType: StrapType = useMemo(() => {
    if (resolved.strapType && resolved.strapType !== 'unknown') return resolved.strapType;
    if (garment.strapType) return garment.strapType;
    if (garment.analysis?.strapType) return garment.analysis.strapType;
    if (category === 'dress' || category === 'top') return 'wide_straps';
    return 'strapless';
  }, [resolved.strapType, garment.strapType, garment.analysis, category]);

  const isCanonicalGarment = !useVolumetric && hasValidCanonicalAsset(garment.canonicalAsset);
  const shellSide = isCanonicalGarment ? THREE.FrontSide : THREE.DoubleSide;
  const { roughness, metalness } = fabricFinish(garment);

  const volumetricMeshes = useMemo(() => {
    if (!useVolumetric) return null;
    return buildVolumetricGarment(
      category,
      avatarType,
      resolved.template,
      scale,
      `${garment.style || ''} ${garment.name || ''}`
    );
  }, [useVolumetric, category, avatarType, resolved.template, scale, garment.style, garment.name]);

  const backColor = useMemo(() => {
    const hex = garment.color || dominantColor || '#f8fafc';
    const c = new THREE.Color(hex);
    c.multiplyScalar(0.88);
    return c;
  }, [garment.color, dominantColor]);

  const frontMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: texture,
      color: texture ? 0xffffff : (garment.color ? new THREE.Color(garment.color) : 0xffffff),
      roughness,
      metalness,
      side: THREE.FrontSide,
      shadowSide: THREE.FrontSide,
      transparent: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
  }, [texture, garment.color, roughness, metalness]);

  const backMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: fabricTexture,
      color: fabricTexture ? 0xffffff : backColor,
      roughness: Math.min(0.92, roughness + 0.12),
      metalness: metalness * 0.5,
      side: THREE.FrontSide,
      shadowSide: THREE.FrontSide,
    });
  }, [fabricTexture, backColor, roughness, metalness]);

  const volumetricStrapMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: fabricTexture,
      color: fabricTexture ? 0xffffff : backColor,
      roughness: 0.38,
      metalness: 0.06,
      side: THREE.DoubleSide,
    });
  }, [fabricTexture, backColor]);

  const baseLiningMaterial = useMemo(() => {
    const baseCol = dominantColor ? new THREE.Color(dominantColor) : new THREE.Color('#f8fafc');
    return new THREE.MeshStandardMaterial({
      color: baseCol,
      roughness: 0.55,
      metalness: 0.02,
      side: shellSide,
    });
  }, [dominantColor, shellSide]);

  const strapMaterial = useMemo(() => {
    const strapCol = strapColor ? new THREE.Color(strapColor) : (garment.color ? new THREE.Color(garment.color) : new THREE.Color('#3b82f6'));
    return new THREE.MeshStandardMaterial({
      color: strapCol,
      roughness: 0.35,
      metalness: 0.08,
      side: shellSide,
    });
  }, [strapColor, garment.color, shellSide]);

  const material = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: texture,
      color: texture ? 0xffffff : (garment.color ? new THREE.Color(garment.color) : 0xffffff),
      roughness,
      metalness,
      side: shellSide,
      shadowSide: shellSide,
      transparent: false,
    });
  }, [texture, garment.color, roughness, metalness, shellSide]);

  const canonicalMesh = useCanonicalGarmentMesh(
    useVolumetric ? undefined : garment.canonicalAsset,
    category,
    avatarType,
    scale
  );

  const tailoredGeometry = useMemo(() => {
    if (!isWrapCategory || useVolumetric) return null;
    if (canonicalMesh) return canonicalMesh;
    return buildTailoredGarmentGeometry(category, avatarType, scale);
  }, [isWrapCategory, useVolumetric, category, avatarType, scale, canonicalMesh]);

  const strapGeometries = useMemo(() => {
    if (useVolumetric || canonicalMesh) return [];
    if (category !== 'dress' && category !== 'top') return [];
    return build3DStrapGeometries(effectiveStrapType, avatarType);
  }, [useVolumetric, category, effectiveStrapType, avatarType, canonicalMesh]);

  const flatPosition = useMemo(() => {
    const xOffset = (((placement.x ?? 50) - 50) / 50) * 0.16;
    const yOffsetM = ((50 - (placement.y ?? 50)) / 50) * 0.14;
    return new THREE.Vector3(mapping.x + xOffset, mapping.y + yOffsetM, mapping.z);
  }, [mapping, placement.x, placement.y]);

  if (!texture && !garment.color) return null;

  if (useVolumetric && volumetricMeshes) {
    return (
      <group>
        <mesh geometry={volumetricMeshes.front} material={frontMaterial} castShadow receiveShadow />
        {volumetricMeshes.backPanels.map((geo, index) => (
          <mesh key={`back-${index}`} geometry={geo} material={backMaterial} castShadow receiveShadow />
        ))}
        {volumetricMeshes.straps.map((geo, index) => (
          <mesh key={`strap-${index}`} geometry={geo} material={volumetricStrapMaterial} castShadow receiveShadow />
        ))}
      </group>
    );
  }

  if (isWrapCategory && tailoredGeometry) {
    return (
      <group>
        <mesh geometry={tailoredGeometry} material={baseLiningMaterial} />
        <mesh geometry={tailoredGeometry} material={material} castShadow receiveShadow />
        {strapGeometries.map((geo, index) => (
          <mesh key={index} geometry={geo} material={strapMaterial} castShadow receiveShadow />
        ))}
      </group>
    );
  }

  return (
    <mesh position={flatPosition} material={material} castShadow receiveShadow>
      <planeGeometry args={[mapping.w * scale, mapping.maxH * scale]} />
    </mesh>
  );
};

// ---------------------------------------------------------------------------
// Stand & Dressform Mesh Component
// ---------------------------------------------------------------------------
const StandAndDressform: React.FC<{ avatarType: AvatarType }> = ({ avatarType }) => {
  const p = PROPORTIONS[avatarType] || PROPORTIONS.feminine;

  const torsoGeometry = useMemo(() => createCoutureMannequinGeometry(p), [p]);
  const dressformTex = useMemo(() => createDressformTexture(), []);

  const torsoMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: dressformTex,
        color: '#FAF6F0',
        metalness: 0.02,
        roughness: 0.85,
      }),
    [dressformTex]
  );

  const metalMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#27272a',
        metalness: 0.85,
        roughness: 0.25,
      }),
    []
  );

  const goldAccentMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#D4AF37',
        metalness: 0.8,
        roughness: 0.3,
      }),
    []
  );

  return (
    <group>
      {/* 1. Main Sculpted Torso */}
      <mesh geometry={torsoGeometry} material={torsoMaterial} castShadow receiveShadow />

      {/* 2. Neck Cap & Finial Accent */}
      <mesh position={[0, BODY.neckBaseY + 0.035, 0]} material={torsoMaterial} castShadow>
        <cylinderGeometry args={[p.neckR, p.neckR * 1.08, 0.07, 32]} />
      </mesh>
      <mesh position={[0, BODY.neckTopY, 0]} material={goldAccentMaterial} castShadow>
        <cylinderGeometry args={[p.neckR * 0.9, p.neckR * 1.02, 0.025, 32]} />
      </mesh>
      <mesh position={[0, BODY.finialTopY, 0]} material={metalMaterial} castShadow>
        <sphereGeometry args={[0.032, 24, 24]} />
      </mesh>

      {/* 3. Under-Torso Mounting Hub */}
      <mesh position={[0, BODY.hipY - 0.12, 0]} material={metalMaterial}>
        <cylinderGeometry args={[0.07, 0.04, 0.04, 24]} />
      </mesh>

      {/* 4. Center Stand Pole */}
      <mesh position={[0, (BODY.hipY - 0.12 + BODY.standBaseY) / 2, 0]} material={metalMaterial} castShadow>
        <cylinderGeometry args={[0.016, 0.016, BODY.hipY - 0.12 - BODY.standBaseY, 24]} />
      </mesh>

      {/* 5. Heavy Cast Round Base */}
      <mesh position={[0, BODY.standBaseY + 0.015, 0]} material={metalMaterial} receiveShadow>
        <cylinderGeometry args={[0.22, 0.25, 0.03, 36]} />
      </mesh>
      <mesh position={[0, BODY.standBaseY + 0.032, 0]} material={goldAccentMaterial}>
        <cylinderGeometry args={[0.06, 0.09, 0.02, 24]} />
      </mesh>

      {/* 6. Soft Ambient Occlusion Contact Shadow Disc */}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[0.42, 32]} />
        <meshBasicMaterial
          color="#2F2A2E"
          transparent
          opacity={0.18}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

// ---------------------------------------------------------------------------
// InitialViewSync
// Applies the requested initial camera view exactly once, but only after the
// camera/controls refs are actually populated by react-three-fiber. Runs
// inside <Canvas> so useFrame guarantees the render loop (and therefore the
// refs) already exists.
// ---------------------------------------------------------------------------
const InitialViewSync: React.FC<{
  view: 'front' | 'back' | 'side' | 'closeup' | 'full';
  controlsRef: React.MutableRefObject<any>;
  setCameraView: (view: 'front' | 'back' | 'side' | 'closeup' | 'full') => void;
}> = ({ view, controlsRef, setCameraView }) => {
  const appliedRef = useRef<string | null>(null);

  useFrame(() => {
    if (appliedRef.current === view) return;
    if (!controlsRef.current) return;
    setCameraView(view);
    appliedRef.current = view;
  });

  // Re-arm if the requested view changes after the initial application
  // (e.g. a parent swaps `initialView` for a freshly mounted capture panel).
  useEffect(() => {
    appliedRef.current = null;
  }, [view]);

  return null;
};

// ---------------------------------------------------------------------------
// Main ThreeMannequin Component
// ---------------------------------------------------------------------------
export const ThreeMannequin: React.FC<ThreeMannequinProps> = ({
  state,
  onCanvasReady,
  initialView = 'front',
  enableAutoRotate = true,
}) => {
  const avatarType = state.avatar || 'feminine';

  const equippedGarments = useMemo(() => {
    const list: { garment: Garment; category: Category }[] = [];
    const categories: Category[] = ['shoes', 'bottom', 'dress', 'top', 'jacket', 'jewellery', 'accessories', 'bag'];
    for (const cat of categories) {
      const g = state[cat];
      if (g) list.push({ garment: g, category: cat });
    }
    return list;
  }, [state]);

  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<any>(null);
  const [autoRotate, setAutoRotate] = useState(enableAutoRotate);
  const [activeView, setActiveView] = useState<'front' | 'back' | 'side' | 'closeup' | 'full'>(initialView);

  const setCameraView = useCallback((view: 'front' | 'back' | 'side' | 'closeup' | 'full') => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const target = new THREE.Vector3(0, 0.95, 0);
    let position = new THREE.Vector3(0, 1.05, 2.5);

    switch (view) {
      case 'back':
        position = new THREE.Vector3(0, 1.05, -2.5);
        break;
      case 'side':
        position = new THREE.Vector3(2.5, 1.05, 0);
        break;
      case 'closeup':
        position = new THREE.Vector3(0, 1.25, 1.4);
        target.set(0, 1.20, 0);
        break;
      case 'full':
        position = new THREE.Vector3(0, 0.85, 3.1);
        target.set(0, 0.75, 0);
        break;
      default:
        break;
    }

    camera.position.copy(position);
    camera.lookAt(target);
    controls.target.copy(target);
    controls.update();
    setActiveView(view);
  }, []);

  // NOTE: We intentionally do NOT apply the initial camera view from a plain
  // useEffect here. react-three-fiber mounts the <PerspectiveCamera> and
  // <OrbitControls> refs asynchronously inside <Canvas>, so a useEffect in
  // this outer component fires before cameraRef/controlsRef are populated
  // and setCameraView() silently no-ops. That bug is what made front/side/
  // back captures render identically. Instead, <InitialViewSync> below runs
  // inside the Canvas via useFrame, which is guaranteed to fire only once
  // the camera and controls actually exist.

  return (
    <div className="relative w-full h-full min-h-[520px] bg-gradient-to-b from-[#FFF5F8] via-[#FFEBF1] to-[#FFDFE9] overflow-hidden select-none">
      <Canvas
        gl={{ preserveDrawingBuffer: true, antialias: true, alpha: true }}
        dpr={[1, 2]}
        shadows
        onCreated={({ gl }) => onCanvasReady?.(gl.domElement)}
      >
        <PerspectiveCamera ref={cameraRef} makeDefault position={[0, 1.05, 2.5]} fov={38} />
        <InitialViewSync view={initialView} controlsRef={controlsRef} setCameraView={setCameraView} />
        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          minDistance={0.9}
          maxDistance={4.5}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 1.75}
          target={[0, 0.95, 0]}
          enableDamping
          dampingFactor={0.06}
          autoRotate={autoRotate}
          autoRotateSpeed={1.8}
        />

        {/* Soft, Flattering Runway & Showroom Illumination */}
        <ambientLight intensity={1.2} color="#FFF0F5" />
        <directionalLight position={[2.5, 3.8, 3.0]} intensity={1.7} color="#FFFFFF" castShadow shadow-mapSize={1024} />
        <directionalLight position={[-2.5, 2.0, 2.0]} intensity={1.0} color="#FCE7F3" />
        <directionalLight position={[0, 2.5, -3.0]} intensity={1.3} color="#FFFFFF" />
        <hemisphereLight groundColor="#FBCFE8" color="#FFFFFF" intensity={0.4} />

        <Suspense fallback={null}>
          <StandAndDressform avatarType={avatarType} />
          {equippedGarments.map(({ garment, category }) => (
            <GarmentPiece
              key={garment.id || category}
              garment={garment}
              category={category}
              placement={state.placements?.[category] || getDefaultPlacement(category)}
              avatarType={avatarType}
            />
          ))}
        </Suspense>
      </Canvas>

      {/* Floating View Angle Selector - Elevated to prevent collision with disappearing bottom toolbar */}
      <div className="absolute bottom-18 sm:bottom-20 left-4 z-20 flex items-center gap-1 bg-white/95 backdrop-blur-md p-1.5 rounded-2xl border border-[#F3D3DB] shadow-lg">
        {(['front', 'back', 'side', 'closeup', 'full'] as const).map((view) => (
          <button
            key={view}
            type="button"
            onClick={() => setCameraView(view)}
            className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-xl transition-all cursor-pointer ${
              activeView === view
                ? 'bg-[#E97A9A] text-white shadow-xs'
                : 'text-[#6D6670] hover:text-[#E97A9A] hover:bg-[#FFF0F4]'
            }`}
          >
            {view}
          </button>
        ))}
      </div>

      {/* 360° Spin Toggle - Elevated to match toolbar */}
      <div className="absolute bottom-18 sm:bottom-20 right-4 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setAutoRotate((prev) => !prev)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-[10px] font-bold uppercase tracking-wider border backdrop-blur-md shadow-lg transition-all cursor-pointer ${
            autoRotate
              ? 'bg-[#E97A9A] text-white border-[#E97A9A]'
              : 'bg-white/95 text-[#6D6670] border-[#F3D3DB] hover:text-[#E97A9A] hover:bg-[#FFF0F4]'
          }`}
          title="Toggle 360° Turntable Rotation"
        >
          <RotateCw className={`w-3 h-3 ${autoRotate ? 'animate-spin' : ''}`} />
          <span>360° {autoRotate ? 'ON' : 'OFF'}</span>
        </button>
      </div>
    </div>
  );
};

export default ThreeMannequin;
