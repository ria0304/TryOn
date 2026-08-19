import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, useGLTF } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';
import { OutfitBuilderState, Category, AvatarType, Placement, Garment } from '../types';
import { getDefaultPlacement } from '../data/defaultPlacements';

interface ThreeMannequinProps {
  state: OutfitBuilderState;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

// ---------------------------------------------------------------------------
// The avatar is a procedurally-built stylized dress-form mannequin made of
// basic primitives. The old GLB avatars were skinned meshes that rendered
// without skinning and had broken/inconsistent world bounds, which made it
// impossible to position garments reliably. A primitive mannequin has exact,
// known dimensions, so garment placement is exact too.
// ---------------------------------------------------------------------------

type Proportions = {
  shoulderW: number;
  bustW: number;
  waistW: number;
  hipW: number;
  armR: number;
  legR: number;
  headR: number;
  neckR: number;
};

const PROPORTIONS: Record<AvatarType, Proportions> = {
  feminine: { shoulderW: 0.42, bustW: 0.34, waistW: 0.27, hipW: 0.37, armR: 0.045, legR: 0.058, headR: 0.125, neckR: 0.042 },
  masculine: { shoulderW: 0.48, bustW: 0.41, waistW: 0.34, hipW: 0.35, armR: 0.055, legR: 0.075, headR: 0.135, neckR: 0.05 },
  neutral: { shoulderW: 0.45, bustW: 0.37, waistW: 0.3, hipW: 0.36, armR: 0.05, legR: 0.065, headR: 0.13, neckR: 0.046 },
};

// Key body landmarks (meters). Feet sit at y = 0, top of head ~1.77.
const BODY = {
  hipY: 0.94,
  waistY: 1.12,
  chestY: 1.28,
  shoulderY: 1.4,
  neckBaseY: 1.46,
  neckY: 1.51,
  headY: 1.62,
  headTopY: 1.77,
  legBaseY: 0.08,
  footY: 0.045,
};

const TORSO_COLOR = '#EDEAE6';
const TORSO_METAL = 0.05;
const TORSO_ROUGH = 0.75;

// Garment plane placement (absolute meters, mannequin-local space).
// x: 0 = center of body. y: garment center height. z: in front of the body.
// w: base width. maxH: max height the plane may reach.
const CATEGORY_MAPPING: Record<Category, { x: number; y: number; z: number; w: number; maxH: number; flat?: boolean }> = {
  top: { x: 0, y: BODY.shoulderY - 0.11, z: 0.25, w: 0.44, maxH: 0.46 },
  jacket: { x: 0, y: BODY.shoulderY - 0.11, z: 0.26, w: 0.52, maxH: 0.54 },
  dress: { x: 0, y: BODY.hipY + 0.02, z: 0.25, w: 0.44, maxH: 0.94 },
  bottom: { x: 0, y: BODY.hipY - 0.02, z: 0.24, w: 0.4, maxH: 0.44 },
  shoes: { x: 0, y: BODY.footY, z: 0.22, w: 0.24, maxH: 0.16 },
  bag: { x: 0.3, y: 1.0, z: 0.22, w: 0.2, maxH: 0.28 },
  jewellery: { x: 0, y: BODY.neckY + 0.01, z: 0.22, w: 0.15, maxH: 0.16 },
  accessories: { x: 0, y: BODY.headTopY + 0.02, z: 0, w: 0.32, maxH: 0.18, flat: true },
};

// Garments that wrap around the body like real clothing (a curved shell
// hugging the mannequin) instead of floating flat planes.
const WRAP_CATEGORIES: Category[] = ['top', 'dress', 'jacket', 'bottom'];

// Half-width of the mannequin body at a given height (meters), interpolated
// from the actual body landmarks so a wrapped garment follows the silhouette.
// Crucially, the torso section uses the exact same points as the rendered
// torso lathe, so garments fit the real body instead of a rough estimate.
function bodyHalfWidth(y: number, p: Proportions): number {
  const pts: Array<[number, number]> = [
    [BODY.footY, 0.07],
    [BODY.legBaseY, 0.16],
    ...torsoProfilePoints(p),
    [BODY.neckY, p.neckR],
    [BODY.headY, p.headR],
    [BODY.headTopY, 0.05],
  ];
  const yc = Math.max(pts[0][0], Math.min(y, pts[pts.length - 1][0]));
  for (let i = 0; i < pts.length - 1; i++) {
    const [y0, w0] = pts[i];
    const [y1, w1] = pts[i + 1];
    if (yc <= y1) {
      const t = (yc - y0) / Math.max(y1 - y0, 1e-4);
      return w0 + (w1 - w0) * t;
    }
  }
  return pts[pts.length - 1][1];
}

// Torso outline used by BOTH the mannequin lathe and the garment fitter, so
// a garment sized from bodyHalfWidth always sits just outside the body.
function torsoProfilePoints(p: Proportions): Array<[number, number]> {
  return [
    [p.hipW * 0.5, BODY.hipY],
    [p.hipW * 0.48, BODY.hipY + 0.06],
    [p.waistW * 0.52, BODY.waistY - 0.02],
    [p.waistW * 0.5, BODY.waistY + 0.02],
    [p.bustW * 0.54, BODY.chestY - 0.03],
    [p.bustW * 0.5, BODY.chestY + 0.04],
    [p.shoulderW * 0.5 * 0.9, BODY.shoulderY - 0.06],
    [p.shoulderW * 0.5, BODY.shoulderY - 0.01],
    [p.shoulderW * 0.5 * 0.94, BODY.shoulderY + 0.04],
    [p.neckR + 0.015, BODY.neckBaseY],
  ];
}

// ---------------------------------------------------------------------------
// Adaptive garment mesh.
//
// Instead of wrapping a plain rectangle into a cylinder, the garment texture
// is sampled so its real silhouette (alpha channel) drives the mesh:
//   1. Per-row left/right silhouette fractions are read from the cutout.
//   2. Garment landmarks (neckline, bust, waist, hem) are located on that
//      silhouette and aligned to the mannequin's landmarks (shoulders, bust,
//      waist, hips) so the garment sits where it should be worn.
//   3. Each row is sized to fit the mannequin width at that height (so a slim
//      dress hugs the body and never looks narrower than the torso) while the
//      garment's own flare (e.g. an A-line hem) is preserved below the waist.
//   4. The rows are wrapped into a 3D shell with a per-row radius, so the
//      garment curves around the body with real depth instead of a flat 2D
//      image, and the silhouette flares out in z as well as x.
// ---------------------------------------------------------------------------

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

// Sample the garment texture's alpha silhouette -> normalized left/right
// column fractions (0..1) per row. Returns null when the image can't be read
// (falls back to a plain rectangle).
function sampleSilhouette(
  texture: THREE.Texture,
  maxDim = 220
): { rows: number; left: Float32Array; right: Float32Array } | null {
  const img: any = texture?.image;
  if (!img || !img.width || !img.height) return null;
  const k = Math.min(1, maxDim / Math.max(img.width, img.height));
  const cw = Math.max(2, Math.round(img.width * k));
  const ch = Math.max(2, Math.round(img.height * k));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(img, 0, 0, cw, ch);
  } catch {
    return null;
  }
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, cw, ch).data;
  } catch {
    return null;
  }
  const left = new Float32Array(ch);
  const right = new Float32Array(ch);
  let any = false;
  for (let y = 0; y < ch; y++) {
    let l = -1;
    let r = -1;
    for (let x = 0; x < cw; x++) {
      const a = data[(y * cw + x) * 4 + 3];
      if (a > 40) {
        if (l < 0) l = x;
        r = x;
      }
    }
    left[y] = l < 0 ? 0 : l / cw;
    right[y] = r < 0 ? 0 : r / cw;
    if (l >= 0) any = true;
  }
  if (!any) return null;
  return { rows: ch, left, right };
}

// Locate garment landmarks as vertical fractions of the texture (0 = top of
// the image, 1 = bottom). topRow/hemRow bound the actual opaque silhouette.
function silhouetteFractions(
  category: Category,
  s: { rows: number; left: Float32Array; right: Float32Array } | null
): { topRow: number; hemRow: number; bustRow: number; waistRow: number } {
  if (!s) {
    if (category === 'bottom') return { topRow: 0, hemRow: 1, bustRow: 0.35, waistRow: 0.02 };
    return { topRow: 0, hemRow: 1, bustRow: 0.22, waistRow: 0.55 };
  }
  const { rows, left, right } = s;
  const widths = new Float32Array(rows);
  for (let i = 0; i < rows; i++) widths[i] = Math.max(0, right[i] - left[i]);
  let topRow = 0;
  while (topRow < rows - 1 && widths[topRow] < 0.03) topRow++;
  let hemRow = rows - 1;
  while (hemRow > 0 && widths[hemRow] < 0.03) hemRow--;
  const top = topRow / rows;
  const hem = hemRow / rows;
  const span = Math.max(hemRow - topRow, 1);

  if (category === 'bottom') {
    // Skirts/pants: the waistband is the top edge, then the hips widen.
    return { topRow: top, hemRow: hem, bustRow: (topRow + Math.floor(span * 0.35)) / rows, waistRow: top + 0.02 * (hem - top) };
  }

  let bMax = -1;
  let bI = topRow;
  const bEnd = topRow + Math.floor(span * 0.45);
  for (let i = topRow; i <= bEnd; i++) {
    if (widths[i] > bMax) {
      bMax = widths[i];
      bI = i;
    }
  }
  let wMin = Infinity;
  let wI = topRow + Math.floor(span * 0.25);
  const wEnd = topRow + Math.floor(span * 0.8);
  for (let i = wI; i <= wEnd; i++) {
    if (widths[i] < wMin) {
      wMin = widths[i];
      wI = i;
    }
  }
  return { topRow: top, hemRow: hem, bustRow: bI / rows, waistRow: wI / rows };
}

// Mannequin-local Y anchors each garment landmark should map to (feet at 0).
// The hem depends on the garment's aspect ratio: tall/narrow = long garment.
function garmentAnchors(category: Category, aspect: number): { top: number; bust: number; waist: number; hem: number } {
  switch (category) {
    case 'top':
      return {
        top: BODY.neckBaseY + 0.02,
        bust: BODY.chestY - 0.04,
        waist: BODY.waistY - 0.04,
        hem: aspect < 0.5 ? BODY.hipY + 0.06 : BODY.waistY - 0.08,
      };
    case 'jacket':
      return { top: BODY.neckBaseY + 0.02, bust: BODY.chestY - 0.03, waist: BODY.waistY + 0.02, hem: BODY.waistY + 0.1 };
    case 'dress':
      return {
        top: BODY.shoulderY - 0.02,
        bust: BODY.chestY - 0.03,
        waist: BODY.waistY - 0.04,
        hem: aspect < 0.42 ? 0.24 : aspect < 0.58 ? 0.34 : BODY.hipY - 0.12,
      };
    case 'bottom':
      return {
        top: BODY.hipY + 0.04,
        bust: BODY.hipY + 0.02,
        waist: BODY.hipY + 0.01,
        hem: aspect < 0.42 ? BODY.legBaseY + 0.06 : aspect < 0.68 ? BODY.legBaseY + 0.18 : BODY.hipY - 0.14,
      };
    default:
      return { top: BODY.waistY, bust: BODY.waistY, waist: BODY.waistY, hem: BODY.waistY };
  }
}

function mapRowToWorldY(
  bustRow: number,
  waistRow: number,
  anchors: { top: number; bust: number; waist: number; hem: number },
  r: number
): number {
  if (r <= bustRow) return lerp(anchors.top, anchors.bust, r / Math.max(bustRow, 1e-4));
  if (r <= waistRow) return lerp(anchors.bust, anchors.waist, (r - bustRow) / Math.max(waistRow - bustRow, 1e-4));
  return lerp(anchors.waist, anchors.hem, (r - waistRow) / Math.max(1 - waistRow, 1e-4));
}

// How much wider (in world units) the wrap geometry is built than the
// garment's own photographed width. The extra columns have no real texture
// data (we only ever have a front-view cutout), so they don't stretch the
// image — they sample a safe, opaque strip just inside the photo's edge
// (see EDGE_INSET below) and carry that fabric tone around the sides and
// back. Without this, the shell only spans the garment's literal photo
// width, which covers ~110-150° of the body and leaves the back bare.
const WRAP_FACTOR = 3.4;
// Fraction of the texture width kept as a no-go margin at each edge. Cutout
// PNGs fade to transparent at the silhouette edge from anti-aliasing, so
// sampling exactly at u=0/1 punches alpha-tested holes in the wrap. Instead
// anything past the real content clamps to this inset column, which is
// still solidly opaque fabric.
const EDGE_INSET = 0.05;

// Build a 3D shell from the garment's silhouette, fitted to the mannequin.
// The shell wraps almost the full 360° around the body (front, sides, and
// back) so the mannequin reads as actually wearing the garment from every
// angle, not just showing a floating front-facing cutout.
function buildGarmentGeometry(
  texture: THREE.Texture,
  w: number,
  h: number,
  centerY: number,
  category: Category,
  avatarType: AvatarType,
  cols = 72,
  rows = 32
): THREE.PlaneGeometry {
  const p = PROPORTIONS[avatarType] || PROPORTIONS.neutral;
  // Geometry is built wider than the garment photo itself (see WRAP_FACTOR)
  // so there are columns of mesh available to carry all the way around to
  // the back; only the central band actually samples the photographed
  // garment, the rest samples the clamped edge tone.
  const totalW = w * WRAP_FACTOR;
  const geo = new THREE.PlaneGeometry(totalW, h, cols, rows);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;

  const silhouette = sampleSilhouette(texture);
  const fracs = silhouetteFractions(category, silhouette);
  const spanF = Math.max(fracs.hemRow - fracs.topRow, 1e-4);
  const bustF = (fracs.bustRow - fracs.topRow) / spanF;
  const waistF = (fracs.waistRow - fracs.topRow) / spanF;
  const anchors = garmentAnchors(category, w / h);
  const gap = 0.014;
  // Leaves a small seam (~10-15°) exactly at body-center-back so the shell
  // never self-intersects; visually invisible since it sits dead center
  // behind the mannequin.
  const arcHalf = Math.PI - 0.15;
  const halfW = Math.max(w * 0.5, 1e-4);

  // Reference: fit the garment's own width at the bust/hip row to the body.
  const refWorldY = mapRowToWorldY(bustF, waistF, anchors, bustF);
  const refBodyHW = bodyHalfWidth(refWorldY, p) * 1.02;
  const refSilHW = silhouette
    ? (silhouette.right[clamp(Math.round(fracs.bustRow * (silhouette.rows - 1)), 0, silhouette.rows - 1)] -
        silhouette.left[clamp(Math.round(fracs.bustRow * (silhouette.rows - 1)), 0, silhouette.rows - 1)]) * halfW
    : halfW;
  const fitScale = Math.max(refBodyHW, 0.02) / Math.max(refSilHW, 0.02);

  const v = new THREE.Vector3();
  const uv2Arr: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Capture the plane's default (linear across the *full wide* geometry)
    // u-coordinate before we overwrite it below. This spans the whole wrap
    // including the back, so it's what the ambient-shading gradient (uv2)
    // should use — it's what makes the sides/back read as naturally shadowed
    // instead of flat.
    const wideU = uv.getX(i);
    const uy = uv.getY(i);
    // Plane UVs have v=1 at the top edge, and textures sample with flipY=true
    // by default, so v=1 already corresponds to row 0 (image top) — the same
    // convention silhouetteFractions/sampleSilhouette use. Flip here so the
    // "row fraction" we look up matches how the GPU actually samples the
    // texture (0 = image top, 1 = image bottom), instead of reading uv.y as
    // if it were the row fraction directly.
    const rowFrac = 1 - uy;
    // Fraction of the *opaque* fabric, not of the whole texture (the cutout
    // often has transparent margins above/below the actual garment).
    const fabricR = clamp01((rowFrac - fracs.topRow) / spanF);
    const worldY = mapRowToWorldY(bustF, waistF, anchors, fabricR);

    const bodyHW = bodyHalfWidth(worldY, p);
    const rowIdx = silhouette ? clamp(Math.round(rowFrac * (silhouette.rows - 1)), 0, silhouette.rows - 1) : 0;
    const silHW = silhouette ? (silhouette.right[rowIdx] - silhouette.left[rowIdx]) * halfW : halfW;
    const fittedHW = silHW * fitScale;
    // Fit the body (never narrower than the torso) but keep the garment's
    // natural flare below the waist.
    let worldHW = Math.max(bodyHW * 1.02, fittedHW);
    worldHW = Math.min(worldHW, Math.max(bodyHW * 1.02, 0.42));

    const radius = Math.max(worldHW + gap, 0.08);
    const t = clamp(v.x / radius, -arcHalf, arcHalf);
    const x3 = radius * Math.sin(t);
    const z3 = radius * Math.cos(t);
    pos.setXYZ(i, x3, worldY - centerY, z3);

    // Texture u-coordinate: mapped against the garment's *actual* photo
    // width (w), not the wider wrap geometry (totalW). Columns inside the
    // real photo get a normal 0..1 mapping; columns beyond it (the sides and
    // back, which have no photo data) clamp to a fixed inset column just
    // inside the edge — a solidly opaque strip of real fabric colour rather
    // than the antialiased, often-transparent literal edge pixel. That inset
    // tone then wraps uninterrupted around the sides and back instead of
    // leaving bare mannequin.
    let mapU = 0.5 + v.x / w;
    mapU = clamp(mapU, EDGE_INSET, 1 - EDGE_INSET);
    uv.setX(i, mapU);

    uv2Arr.push(wideU, uv.getY(i));
  }
  geo.setAttribute('uv2', new THREE.BufferAttribute(new Float32Array(uv2Arr), 2));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

// Baked shading used as the garment's ambient-occlusion map: darker at the
// sides (cylindrical depth cue), darker near the hem, faint vertical folds.
function createShadingTexture(pxW = 256, pxH = 512): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = pxW;
  canvas.height = pxH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(document.createElement('canvas'));
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pxW, pxH);
  const vGrad = ctx.createLinearGradient(0, 0, 0, pxH);
  vGrad.addColorStop(0, 'rgba(0,0,0,0)');
  vGrad.addColorStop(0.75, 'rgba(0,0,0,0.08)');
  vGrad.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = vGrad;
  ctx.fillRect(0, 0, pxW, pxH);
  const hGrad = ctx.createRadialGradient(pxW / 2, pxH / 2, 0, pxW / 2, pxH / 2, pxW * 0.62);
  hGrad.addColorStop(0, 'rgba(0,0,0,0)');
  hGrad.addColorStop(0.55, 'rgba(0,0,0,0.1)');
  hGrad.addColorStop(0.85, 'rgba(0,0,0,0.38)');
  hGrad.addColorStop(1, 'rgba(0,0,0,0.52)');
  ctx.fillStyle = hGrad;
  ctx.fillRect(0, 0, pxW, pxH);
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  for (let x = 0.12; x < 0.9; x += 0.07) {
    ctx.beginPath();
    ctx.moveTo(x * pxW, pxH * 0.3);
    ctx.quadraticCurveTo(x * pxW + 6, pxH * 0.6, x * pxW + 3, pxH * 0.95);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function useSafeTexture(url: string): { texture: THREE.Texture | null; failed: boolean } {
  const [state, setState] = useState<{ texture: THREE.Texture | null; failed: boolean }>({ texture: null, failed: false });

  useEffect(() => {
    let cancelled = false;
    if (!url) {
      setState({ texture: null, failed: true });
      return;
    }
    setState({ texture: null, failed: false });

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      url,
      (tex) => {
        if (cancelled) return;
        tex.colorSpace = THREE.SRGBColorSpace;
        setState({ texture: tex, failed: false });
      },
      undefined,
      (err) => {
        if (cancelled) return;
        console.warn(`[ThreeMannequin] Couldn't load garment texture "${url}".`, err);
        setState({ texture: null, failed: true });
      }
    );

    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}

// Fallback "fabric" texture so starter pieces (which have no uploaded image)
// still visibly dress the mannequin using their declared color.
function createFabricTexture(colorHex: string): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(document.createElement('canvas'));

  const c = new THREE.Color(colorHex || '#cccccc');
  const light = c.clone().multiplyScalar(1.15).getStyle();
  const dark = c.clone().multiplyScalar(0.7).getStyle();

  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, light);
  gradient.addColorStop(1, dark);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
  }

  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = size * 0.02;
  for (let i = -size; i < size * 2; i += size * 0.25) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function useColorTexture(colorHex: string): THREE.Texture | null {
  return useMemo(() => createFabricTexture(colorHex), [colorHex]);
}

class GarmentRenderBoundary extends React.Component<
  { garmentName?: string; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { garmentName?: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

// A garment is rendered as a textured shell draped over the mannequin.
// Clothing (top/dress/jacket/bottom) wraps around the body silhouette via a
// displaced plane; accessories/shoes/bags stay as small flat planes.
const GarmentPlane: React.FC<{
  garment: Garment;
  category: Category;
  placement: Placement;
  avatarType: AvatarType;
}> = ({ garment, category, placement, avatarType }) => {
  // Prefer the background-removed cutout over the raw photo so the garment
  // projects cleanly instead of a photo rectangle.
  const textureUrl = garment.cutoutUrl || garment.warpedUrl || garment.imageUrl || '';
  const { texture: imageTexture, failed } = useSafeTexture(textureUrl);
  const colorTexture = useColorTexture(garment.color);
  const texture = textureUrl && !failed ? imageTexture : colorTexture;

  const mapping = CATEGORY_MAPPING[category];
  const wrap = WRAP_CATEGORIES.includes(category);

  const planeSize = useMemo(() => {
    const scale = placement.scale || 1;
    const img: any = (texture as THREE.Texture | null)?.image;
    const aspect = img && img.width && img.height ? img.width / img.height : 1;
    let w = mapping.w * scale;
    let h = w / aspect;
    const maxH = mapping.maxH * scale;
    if (h > maxH) {
      h = maxH;
      w = h * aspect;
    }
    return { w: Math.max(w, 0.01), h: Math.max(h, 0.01) };
  }, [mapping, placement.scale, texture]);

  const pos = useMemo(() => {
    const xOffset = ((placement.x ?? 50) - 50) / 50 * 0.18;
    const yOffset = (50 - (placement.y ?? 50)) / 50 * 0.18;
    return new THREE.Vector3(mapping.x + xOffset, mapping.y + yOffset, wrap ? 0.015 : mapping.z);
  }, [mapping, placement.x, placement.y, wrap]);

  const rotation = useMemo(() => {
    const tilt = mapping.flat ? -Math.PI / 2 : 0;
    // Wrap categories (top/dress/jacket/bottom) already algorithmically wrap
    // the torso via buildGarmentGeometry's per-row cylindrical fit -- they
    // must stay upright. Spinning that shell on Z (a control meant for flat
    // 2D items like a rotated accessory sticker) tips the whole cone over,
    // pinning the top near the neck while the rest swings out to one side.
    // Any stray/legacy placement.rotation (e.g. from an outfit saved before
    // the cylindrical wrap existed) must be ignored here.
    const z = wrap ? 0 : (placement.rotation || 0) * Math.PI / 180;
    return new THREE.Euler(tilt, 0, z);
  }, [placement.rotation, mapping.flat, wrap]);

  const shading = useMemo(() => createShadingTexture(), []);

  const wrappedGeo = useMemo(
    () => (wrap ? buildGarmentGeometry(texture, planeSize.w, planeSize.h, pos.y, category, avatarType) : null),
    [wrap, texture, planeSize.w, planeSize.h, pos.y, category, avatarType]
  );

  if (!texture) return null;

  if (wrap && wrappedGeo) {
    return (
      <mesh name={`garment-${category}`} geometry={wrappedGeo} position={[pos.x, pos.y, pos.z]} rotation={rotation}>
        <meshStandardMaterial
          map={texture}
          aoMap={shading}
          aoMapIntensity={1.05}
          alphaTest={0.35}
          transparent={false}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-4}
        />
      </mesh>
    );
  }

  return (
    <mesh name={`garment-${category}`} position={pos} rotation={rotation}>
      <planeGeometry args={[planeSize.w, planeSize.h]} />
      <meshBasicMaterial
        map={texture}
        transparent
        alphaTest={0.1}
        side={THREE.DoubleSide}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-10}
      />
    </mesh>
  );
};

// The procedural mannequin: a torso-only dress form, like the adjustable
// forms used in tailoring/garment fitting. IMPORTANT: this group is NOT
// repositioned -- it stays in the exact same coordinate frame as before
// (feet-space y, y=0 at floor level), because GarmentPlane and this mesh are
// rendered as siblings in one shared <group> in MannequinModel with no
// relative offset between them. Every BODY.*/torsoProfilePoints landmark is
// an absolute y in that shared frame; shifting this mesh's origin without
// also shifting every CATEGORY_MAPPING/BODY constant would desync garments
// from the torso. The stand simply extends downward from BODY.hipY-ish
// through y=0 using negative-Y geometry, so it reads as "torso planted on a
// pole down to a base" without moving the torso itself.
// Deliberately has no head, arms, or legs -- a dress form is a torso on a
// stand, and every wrap-relevant category (top, dress, jacket, bottom) only
// ever needs the torso silhouette (see bodyHalfWidth/torsoProfilePoints,
// which this shares exactly), so nothing downstream depends on the limbs
// that used to be here.
const STAND_POLE_TOP_Y = torsoProfilePointsHipY();
const STAND_BASE_Y = 0.02;

function torsoProfilePointsHipY(): number {
  return BODY.hipY - 0.15;
}

const MannequinMesh: React.FC<{ avatarType: AvatarType }> = ({ avatarType }) => {
  const p = PROPORTIONS[avatarType] || PROPORTIONS.neutral;

  const torsoProfile = useMemo(
    () => torsoProfilePoints(p).map(([r, y]) => new THREE.Vector2(r, y)),
    [p]
  );

  const torsoGeo = useMemo(() => new THREE.LatheGeometry(torsoProfile, 48), [torsoProfile]);

  const poleLength = Math.max(0.1, STAND_POLE_TOP_Y - STAND_BASE_Y);
  const poleY = (STAND_POLE_TOP_Y + STAND_BASE_Y) / 2;

  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: TORSO_COLOR, metalness: TORSO_METAL, roughness: TORSO_ROUGH }),
    []
  );
  const standMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#3A3A38', metalness: 0.15, roughness: 0.55 }),
    []
  );

  return (
    <group>
      {/* Torso -- exact same geometry/position as the original mannequin */}
      <mesh name="mannequin-torso" geometry={torsoGeo} material={material} />
      {/* Neck cap -- dress forms end at the neckline, no head */}
      <mesh position={[0, BODY.neckBaseY, 0]} material={material}>
        <cylinderGeometry args={[p.neckR + 0.015, p.neckR + 0.02, 0.03, 24]} />
      </mesh>
      {/* Stand pole, from the base up to just inside the torso's hip line */}
      <mesh position={[0, poleY, 0]} material={standMaterial}>
        <cylinderGeometry args={[0.028, 0.028, poleLength, 20]} />
      </mesh>
      {/* Pedestal base -- wider and flatter than the old one, since there
          are no legs to visually ground the form */}
      <mesh position={[0, STAND_BASE_Y - 0.02, 0]} material={standMaterial}>
        <cylinderGeometry args={[0.24, 0.29, 0.04, 48]} />
      </mesh>
    </group>
  );
};

// ---------------------------------------------------------------------------
// GLB-based realistic mannequin.
//
// The procedural primitive mannequin above is only a fallback. The preferred
// look is the rigged GLB avatar (mannequin_feminine / masculine / neutral),
// loaded with three's GLTFLoader so skinning actually renders. Each model is
// normalized at runtime to the same coordinate system the garment fitter uses
// (feet at y = 0, top of head ~1.77m, centered on x/z), so garment placement
// stays exact even though a GLB's own scale/origin are unknown until loaded.
// ---------------------------------------------------------------------------

const MANNEQUIN_HEIGHT = 1.77;

const GLB_PATH: Record<AvatarType, string> = {
  feminine: '/models/mannequin_feminine.glb',
  masculine: '/models/mannequin_masculine.glb',
  neutral: '/models/mannequin_neutral.glb',
};

// Exact rendered bounds of a (possibly skinned) model. Skinned models like
// the mixamo-style avatars keep their vertices in tiny bone-local space, so
// `Box3.setFromObject` returns a meaningless box; the real figure extent only
// appears after the skinning transform (bone matrix * inverse bind * vertex).
// This evaluates that exactly so the mannequin is scaled/framed correctly.
function skinnedBounds(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  const tmp = new THREE.Vector3();
  const v = new THREE.Vector3();
  const tmpM = new THREE.Matrix4();
  root.updateMatrixWorld(true);
  root.traverse((child) => {
    if (!(child as THREE.SkinnedMesh).isSkinnedMesh) return;
    const mesh = child as THREE.SkinnedMesh;
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const idx = geo.attributes.skinIndex;
    const wgt = geo.attributes.skinWeight;
    if (!pos || !idx || !wgt || !mesh.skeleton) {
      if (geo.boundingBox === null) geo.computeBoundingBox();
      if (geo.boundingBox) box.union(geo.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
      return;
    }
    const bones = mesh.skeleton.bones;
    const inv = mesh.skeleton.boneInverses;
    const n = pos.count;
    for (let i = 0; i < n; i++) {
      const ax = pos.getX(i);
      const ay = pos.getY(i);
      const az = pos.getZ(i);
      const joints = [idx.getX(i), idx.getY(i), idx.getZ(i), idx.getW(i)];
      const weights = [wgt.getX(i), wgt.getY(i), wgt.getZ(i), wgt.getW(i)];
      tmp.set(0, 0, 0);
      for (let j = 0; j < 4; j++) {
        const wj = weights[j];
        if (wj < 1e-4) continue;
        const bi = joints[j];
        if (bi >= bones.length) continue;
        tmpM.copy(bones[bi].matrixWorld).multiply(inv[bi]);
        v.set(ax, ay, az).applyMatrix4(tmpM).multiplyScalar(wj);
        tmp.add(v);
      }
      box.expandByPoint(tmp);
    }
  });
  return box;
}

function normalizeMannequin(scene: THREE.Object3D): THREE.Object3D {
  let box = skinnedBounds(scene);
  const size = box.getSize(new THREE.Vector3());
  if (size.y < 1e-4) return scene;
  // Scale to a known height, then re-ground on the feet and center on x/z.
  scene.scale.multiplyScalar(MANNEQUIN_HEIGHT / size.y);
  scene.updateMatrixWorld(true);
  box = skinnedBounds(scene);
  scene.position.x -= (box.min.x + box.max.x) / 2;
  scene.position.z -= (box.min.z + box.max.z) / 2;
  scene.position.y -= box.min.y;
  scene.updateMatrixWorld(true);
  return scene;
}

const GlbMannequin: React.FC<{ avatarType: AvatarType }> = ({ avatarType }) => {
  const url = GLB_PATH[avatarType] || GLB_PATH.neutral;
  const gltf: any = useGLTF(url);
  // Clone so each mount gets its own skinned scene (the GLTF is cached by
  // URL and shared across mounts -- CompareView renders two at once). The
  // clone carries its own skeleton, so normalizing it never mutates shared
  // state.
  const scene = useMemo(() => normalizeMannequin(cloneSkeleton(gltf.scene)), [gltf]);
  return <primitive object={scene} />;
};

class GlbBoundary extends React.Component<
  { avatarType: AvatarType; children: React.ReactNode },
  { failed: boolean }
> {
  constructor(props: { avatarType: AvatarType; children: React.ReactNode }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <MannequinMesh avatarType={this.props.avatarType} />;
    return this.props.children;
  }
}

// Always the torso-only dress form -- the rigged GLB avatars are no longer
// attempted. Garment wrapping (bodyHalfWidth, silhouetteFractions, the whole
// WRAP_CATEGORIES shell-building path) is tuned against MannequinMesh's
// exact torso lathe geometry; the GLB path's skinned bounds don't
// necessarily agree with those landmarks even when the file loads without
// throwing, which is what was producing garments that don't actually wrap.
// GlbMannequin/GlbBoundary/skinnedBounds/normalizeMannequin are kept in this
// file (unused) rather than deleted, in case GLB avatars come back later
// with landmark-accurate normalization.
const MannequinAvatar: React.FC<{ avatarType: AvatarType }> = ({ avatarType }) => (
  <MannequinMesh avatarType={avatarType} />
);

const MannequinModel: React.FC<{ state: OutfitBuilderState }> = ({ state }) => {
  const avatarType = state.avatar || 'neutral';
  const categories: Category[] = ['top', 'bottom', 'dress', 'jacket', 'shoes', 'bag', 'jewellery', 'accessories'];

  // Torso-only dress forms span roughly -0.02 (stand base) to 1.46
  // (neckBaseY), vertical center ~0.72 -- vs. the old feet-to-head figure's
  // center ~0.885 (which used -0.9). Recentered the same way for the new
  // extent so the form sits mid-frame instead of low.
  return (
    <group position={[0, -0.72, 0]}>
      <MannequinAvatar avatarType={avatarType} />
      {categories.map((cat) => {
        const garment = state[cat];
        if (!garment) return null;
        const placement = state.placements?.[cat] || getDefaultPlacement(cat);
        return (
          <GarmentRenderBoundary key={cat} garmentName={garment.name}>
            <GarmentPlane garment={garment} category={cat} placement={placement} avatarType={avatarType} />
          </GarmentRenderBoundary>
        );
      })}
    </group>
  );
};

export const ThreeMannequin: React.FC<ThreeMannequinProps> = ({ state, onCanvasReady }) => {
  const avatarType = state.avatar || 'neutral';

  const onSceneCreated = (state: any) => {
    onCanvasReady?.(state.gl.domElement);
  };

  return (
    <div className="w-full h-full bg-[#FFF8FA] rounded-3xl overflow-hidden shadow-inner relative">
      <Canvas
        shadows
        dpr={[1, 2]}
        key={avatarType}
        gl={{ preserveDrawingBuffer: true }}
        onCreated={onSceneCreated}
      >
        {/* Pulled in from 3.2 -- the torso-only form is ~84% the vertical
            span of the old full-height figure, so the default view sat too
            far back and left it looking small. Still well inside the
            existing OrbitControls minDistance/maxDistance (1.5 / 5) below. */}
        <PerspectiveCamera makeDefault position={[0, 0.1, 2.6]} fov={40} />
        <ambientLight intensity={0.65} />
        <directionalLight position={[3, 4, 4]} intensity={1.4} />
        <directionalLight position={[-3, 2, -3]} intensity={0.35} />
        <Suspense fallback={null}>
          <MannequinModel state={state} />
        </Suspense>
        <OrbitControls
          enablePan={false}
          minDistance={1.5}
          maxDistance={5}
          minPolarAngle={0}
          maxPolarAngle={Math.PI}
        />
      </Canvas>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] font-bold text-[#E97A9A] bg-white/80 px-3 py-1 rounded-full shadow-sm pointer-events-none uppercase tracking-widest">
        Drag to Rotate • Scroll to Zoom
      </div>
    </div>
  );
};
