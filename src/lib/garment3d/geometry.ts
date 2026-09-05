import * as THREE from 'three';
import { AvatarType, Category } from '../../types';
import { BODY, PROPORTIONS, getBodyDimensions, Proportions } from './body';
import { GarmentBackTemplate } from './styles';

export interface VolumetricGarmentMeshes {
  front: THREE.BufferGeometry;
  backPanels: THREE.BufferGeometry[];
  straps: THREE.BufferGeometry[];
}

const AIR_GAP = 0.014;
const FRONT_HALF = Math.PI * 0.62;
const SEAM_OVERLAP = 0.04;
const U_FRONT = 40;
const U_BACK = 32;
const V_SEGS = 42;

type BackPlan = {
  yTop: number;
  yBottom: number;
  start: number;
  end: number;
};

function categoryRange(
  category: Category,
  template: GarmentBackTemplate,
  scale: number
): { yTop: number; yBottom: number; flared: boolean } {
  let yTop = BODY.necklineSquareY;
  let yBottom = BODY.skirtHemY;
  let flared = false;

  if (category === 'dress') {
    yTop = template === 'off_shoulder' ? BODY.chestY + 0.04 : BODY.necklineSquareY;
    yBottom = BODY.skirtHemY;
    flared = true;
  } else if (category === 'top') {
    yTop = template === 'off_shoulder' ? BODY.chestY + 0.04 : BODY.necklineSquareY;
    yBottom = BODY.waistY - 0.03;
  } else if (category === 'bottom') {
    yTop = BODY.waistY + 0.02;
    yBottom = BODY.skirtHemY;
    flared = true;
  } else if (category === 'jacket') {
    yTop = BODY.shoulderY + 0.02;
    yBottom = BODY.hipY - 0.04;
  }

  if (scale !== 1.0) {
    const height = (yTop - yBottom) * scale;
    yBottom = yTop - height;
  }

  return { yTop, yBottom, flared };
}

function radiiAt(
  y: number,
  p: Proportions,
  category: Category,
  flared: boolean,
  yBottom: number
): { rx: number; rz: number } {
  const extra = category === 'jacket' ? AIR_GAP * 2.4 : AIR_GAP;

  if (flared && y < BODY.waistY) {
    const flareT = Math.max(0, (BODY.waistY - y) / Math.max(BODY.waistY - yBottom, 0.01));
    const waistDims = getBodyDimensions(BODY.waistY, p);
    const hipDims = getBodyDimensions(BODY.hipY, p);
    const hipMul = category === 'dress' ? 1.62 : category === 'bottom' ? 1.28 : 1.50;
    const rx = THREE.MathUtils.lerp(waistDims.rx, hipDims.rx * hipMul, flareT) + extra;
    const rz = THREE.MathUtils.lerp(waistDims.rz, hipDims.rz * (hipMul - 0.05), flareT) + extra;
    const wave = Math.sin(flareT * Math.PI) * 0.01;
    return { rx: rx + wave, rz: rz + wave };
  }

  const dims = getBodyDimensions(y, p);
  return { rx: dims.rx + extra, rz: dims.rz + extra };
}

function buildSectorGeometry(
  yTop: number,
  yBottom: number,
  angleStart: number,
  angleEnd: number,
  p: Proportions,
  category: Category,
  flared: boolean,
  uSegments: number,
  uvMode: 'front' | 'back'
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const totalHeight = Math.max(0.02, yTop - yBottom);

  for (let j = 0; j <= V_SEGS; j++) {
    const vFrac = j / V_SEGS;
    const y = yBottom + vFrac * totalHeight;
    const { rx, rz } = radiiAt(y, p, category, flared, yBottom);

    for (let i = 0; i <= uSegments; i++) {
      const uFrac = i / uSegments;
      const angle = angleStart + uFrac * (angleEnd - angleStart);
      let currentRx = rx;
      let currentRz = rz;
      if (flared && y < BODY.waistY) {
        const flareT = (BODY.waistY - y) / Math.max(BODY.waistY - yBottom, 0.01);
        const fold = Math.sin(angle * 10) * 0.010 * flareT;
        currentRx += Math.cos(angle) * fold;
        currentRz += Math.sin(angle) * fold;
      }
      positions.push(Math.sin(angle) * currentRx, y, Math.cos(angle) * currentRz);
      if (uvMode === 'front') {
        uvs.push(uFrac, vFrac);
      } else {
        uvs.push(0.15 + uFrac * 0.2, vFrac);
      }
    }
  }

  for (let j = 0; j < V_SEGS; j++) {
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

function planBack(
  template: GarmentBackTemplate,
  yTop: number,
  yBottom: number
): BackPlan | null {
  const full: BackPlan = {
    yTop,
    yBottom,
    start: FRONT_HALF - SEAM_OVERLAP,
    end: Math.PI * 2 - FRONT_HALF + SEAM_OVERLAP,
  };

  if (
    template === 'bottom_full' ||
    template === 'covered_wide' ||
    template === 'off_shoulder' ||
    template === 'strapless' ||
    template === 'one_shoulder'
  ) {
    return full;
  }

  if (template === 'backless') {
    const bandTop = Math.min(yTop, BODY.waistY + 0.03);
    if (bandTop <= yBottom + 0.04) return null;
    return {
      yTop: bandTop,
      yBottom,
      start: Math.PI - 0.55,
      end: Math.PI + 0.55,
    };
  }

  if (template === 'racerback') {
    return {
      yTop: Math.min(yTop, BODY.chestY - 0.02),
      yBottom,
      start: Math.PI - 0.42,
      end: Math.PI + 0.42,
    };
  }

  if (
    template === 'thin_double_straps' ||
    template === 'spaghetti_straps' ||
    template === 'halter_neck' ||
    template === 'criss_cross'
  ) {
    return {
      yTop: Math.min(yTop, BODY.chestY - 0.04),
      yBottom,
      start: Math.PI - 0.7,
      end: Math.PI + 0.7,
    };
  }

  return full;
}

function tube(points: THREE.Vector3[], radius: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.TubeGeometry(curve, 32, radius, 8, false);
}

function buildStraps(
  template: GarmentBackTemplate,
  p: Proportions,
  category: Category
): THREE.BufferGeometry[] {
  if (category === 'bottom' || category === 'jacket') return [];
  if (
    template === 'strapless' ||
    template === 'off_shoulder' ||
    template === 'backless' ||
    template === 'unknown' ||
    template === 'bottom_full'
  ) {
    return [];
  }

  const gap = 0.015;
  const frontZ = p.bustD * 0.52 + gap;
  const backZ = -(p.bustD * 0.52 + gap);
  const yFront = BODY.necklineSquareY;
  const ySeam = BODY.shoulderSeamY;
  const geos: THREE.BufferGeometry[] = [];

  if (template === 'thin_double_straps' || template === 'spaghetti_straps') {
    const r = template === 'spaghetti_straps' ? 0.005 : 0.0075;
    const x = p.bustW * 0.30;
    geos.push(
      tube(
        [
          new THREE.Vector3(-x, yFront, frontZ),
          new THREE.Vector3(-p.shoulderW * 0.35, ySeam, 0.01),
          new THREE.Vector3(-x * 0.92, yFront - 0.04, backZ),
        ],
        r
      ),
      tube(
        [
          new THREE.Vector3(x, yFront, frontZ),
          new THREE.Vector3(p.shoulderW * 0.35, ySeam, 0.01),
          new THREE.Vector3(x * 0.92, yFront - 0.04, backZ),
        ],
        r
      )
    );
  } else if (template === 'covered_wide') {
    const x = p.bustW * 0.32;
    geos.push(
      tube(
        [
          new THREE.Vector3(-x, yFront, frontZ),
          new THREE.Vector3(-p.shoulderW * 0.36, BODY.shoulderY + 0.01, p.shoulderD * 0.30 + gap),
          new THREE.Vector3(-p.shoulderW * 0.38, ySeam, 0.01),
          new THREE.Vector3(-p.shoulderW * 0.36, BODY.shoulderY + 0.01, -p.shoulderD * 0.30 - gap),
          new THREE.Vector3(-x, yFront, backZ),
        ],
        0.018
      ),
      tube(
        [
          new THREE.Vector3(x, yFront, frontZ),
          new THREE.Vector3(p.shoulderW * 0.36, BODY.shoulderY + 0.01, p.shoulderD * 0.30 + gap),
          new THREE.Vector3(p.shoulderW * 0.38, ySeam, 0.01),
          new THREE.Vector3(p.shoulderW * 0.36, BODY.shoulderY + 0.01, -p.shoulderD * 0.30 - gap),
          new THREE.Vector3(x, yFront, backZ),
        ],
        0.018
      )
    );
  } else if (template === 'halter_neck') {
    geos.push(
      tube(
        [
          new THREE.Vector3(-p.bustW * 0.22, yFront, frontZ),
          new THREE.Vector3(-p.neckR * 1.4, BODY.neckBaseY + 0.02, 0.05),
          new THREE.Vector3(0, BODY.neckBaseY + 0.045, -p.neckR * 1.55),
          new THREE.Vector3(p.neckR * 1.4, BODY.neckBaseY + 0.02, 0.05),
          new THREE.Vector3(p.bustW * 0.22, yFront, frontZ),
        ],
        0.012
      )
    );
  } else if (template === 'criss_cross') {
    geos.push(
      tube(
        [
          new THREE.Vector3(-p.bustW * 0.30, yFront, frontZ),
          new THREE.Vector3(-p.shoulderW * 0.34, ySeam, 0.02),
          new THREE.Vector3(0.02, BODY.chestY + 0.02, backZ * 0.72),
          new THREE.Vector3(p.bustW * 0.26, yFront - 0.08, backZ),
        ],
        0.009
      ),
      tube(
        [
          new THREE.Vector3(p.bustW * 0.30, yFront, frontZ),
          new THREE.Vector3(p.shoulderW * 0.34, ySeam, 0.02),
          new THREE.Vector3(-0.02, BODY.chestY + 0.02, backZ * 0.72),
          new THREE.Vector3(-p.bustW * 0.26, yFront - 0.08, backZ),
        ],
        0.009
      )
    );
  } else if (template === 'racerback') {
    geos.push(
      tube(
        [
          new THREE.Vector3(-p.bustW * 0.28, yFront, frontZ),
          new THREE.Vector3(-p.shoulderW * 0.32, ySeam, 0.02),
          new THREE.Vector3(-0.015, BODY.chestY + 0.06, backZ * 0.5),
          new THREE.Vector3(0, BODY.chestY - 0.04, backZ * 0.9),
        ],
        0.011
      ),
      tube(
        [
          new THREE.Vector3(p.bustW * 0.28, yFront, frontZ),
          new THREE.Vector3(p.shoulderW * 0.32, ySeam, 0.02),
          new THREE.Vector3(0.015, BODY.chestY + 0.06, backZ * 0.5),
          new THREE.Vector3(0, BODY.chestY - 0.04, backZ * 0.9),
        ],
        0.011
      ),
      tube(
        [
          new THREE.Vector3(0, BODY.chestY - 0.04, backZ * 0.9),
          new THREE.Vector3(0, BODY.waistY + 0.1, backZ),
        ],
        0.013
      )
    );
  } else if (template === 'one_shoulder') {
    geos.push(
      tube(
        [
          new THREE.Vector3(-p.bustW * 0.1, yFront + 0.02, frontZ),
          new THREE.Vector3(-p.shoulderW * 0.4, ySeam + 0.015, 0.02),
          new THREE.Vector3(-p.bustW * 0.2, yFront - 0.05, backZ),
        ],
        0.016
      )
    );
  }

  return geos;
}

export function buildVolumetricGarment(
  category: Category,
  avatarType: AvatarType,
  template: GarmentBackTemplate,
  scale = 1.0,
  styleHint = ''
): VolumetricGarmentMeshes | null {
  if (template === 'unknown') return null;

  const p = PROPORTIONS[avatarType] || PROPORTIONS.feminine;
  const { yTop, yBottom, flared } = categoryRange(category, template, scale);
  const fittedBottom = /jean|denim|trouser|pant|short|legging/.test(styleHint.toLowerCase());
  const useFlare = flared && !(category === 'bottom' && fittedBottom);

  const front = buildSectorGeometry(
    yTop,
    yBottom,
    -FRONT_HALF,
    FRONT_HALF,
    p,
    category,
    useFlare,
    U_FRONT,
    'front'
  );

  const backPanels: THREE.BufferGeometry[] = [];
  const openBodice =
    template === 'thin_double_straps' ||
    template === 'spaghetti_straps' ||
    template === 'halter_neck' ||
    template === 'criss_cross' ||
    template === 'racerback' ||
    template === 'backless';

  const backPlan = planBack(template, yTop, yBottom);
  if (backPlan) {
    const panelBottom =
      category === 'dress' && openBodice
        ? Math.max(backPlan.yBottom, BODY.waistY)
        : backPlan.yBottom;
    if (backPlan.yTop > panelBottom + 0.03) {
      backPanels.push(
        buildSectorGeometry(
          backPlan.yTop,
          panelBottom,
          backPlan.start,
          backPlan.end,
          p,
          category,
          useFlare,
          U_BACK,
          'back'
        )
      );
    }
  }

  if (category === 'dress' && openBodice) {
    const skirtTop = Math.min(BODY.waistY + 0.02, yTop);
    if (skirtTop > yBottom + 0.05) {
      backPanels.push(
        buildSectorGeometry(
          skirtTop,
          yBottom,
          FRONT_HALF,
          Math.PI * 2 - FRONT_HALF,
          p,
          category,
          useFlare,
          U_BACK,
          'back'
        )
      );
    }
  }

  const straps = buildStraps(template, p, category);
  return { front, backPanels, straps };
}
