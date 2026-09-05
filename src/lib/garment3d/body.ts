import * as THREE from 'three';
import { AvatarType } from '../../types';

export type Proportions = {
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

export const PROPORTIONS: Record<AvatarType, Proportions> = {
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

export const BODY = {
  standBaseY: 0.03,
  standPoleTopY: 0.75,
  skirtHemY: 0.36,
  kneeY: 0.55,
  hipY: 0.82,
  waistY: 1.05,
  chestY: 1.24,
  necklineSquareY: 1.34,
  shoulderY: 1.38,
  shoulderSeamY: 1.40,
  neckBaseY: 1.45,
  neckTopY: 1.54,
  finialTopY: 1.58,
};

export function getBodyDimensions(y: number, p: Proportions): { rx: number; rz: number } {
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
  }
  return { rx: p.neckR, rz: p.neckR };
}
