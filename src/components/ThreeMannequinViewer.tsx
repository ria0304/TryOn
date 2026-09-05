import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RotateCw, Sun, Moon, Play, Pause, Camera, Grid, Info, Sparkles } from 'lucide-react';
import {
  ViewerSettings,
  SilhouetteType,
  StrapType,
  BackStyleType,
  BackDeterminationStatus,
  MannequinMaterialType,
  FabricFinishType,
  LightingPresetType,
  GarmentItem
} from '../types';
import { SAMPLE_GARMENTS } from '../data/sampleGarments';

interface ThreeMannequinViewerProps {
  frontTextureUrl: string | null;
  backTextureUrl: string | null;
  strapType: StrapType;
  backStyle: BackStyleType;
  backDeterminationStatus?: BackDeterminationStatus;
  backDeterminationMessage?: string;
  isBackDetermined?: boolean;
  settings: ViewerSettings;
  onUpdateSettings: (newSettings: Partial<ViewerSettings>) => void;
  onOpenTechSpec?: () => void;
  onSelectPresetGarment?: (garment: GarmentItem) => void;
  onUploadCustomImage?: (file: File) => void;
  isLoading?: boolean;
}

export const ThreeMannequinViewer: React.FC<ThreeMannequinViewerProps> = ({
  frontTextureUrl,
  backTextureUrl,
  strapType,
  backStyle,
  backDeterminationStatus = 'determined',
  backDeterminationMessage,
  isBackDetermined = true,
  settings,
  onUpdateSettings,
  onOpenTechSpec,
  onSelectPresetGarment,
  onUploadCustomImage,
  isLoading,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const quickUploadInputRef = useRef<HTMLInputElement>(null);

  // Three.js internal references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  // Mesh references
  const mannequinGroupRef = useRef<THREE.Group | null>(null);
  const garmentMeshRef = useRef<THREE.Mesh | null>(null);
  const strapGroupRef = useRef<THREE.Group | null>(null);
  const pedestalGroupRef = useRef<THREE.Group | null>(null);
  const lightsGroupRef = useRef<THREE.Group | null>(null);

  // Active textures
  const textureLoaderRef = useRef<THREE.TextureLoader>(new THREE.TextureLoader());
  const activeFrontTextureRef = useRef<THREE.Texture | null>(null);
  const proceduralNormalMapRef = useRef<THREE.Texture | null>(null);

  const [activeCameraView, setActiveCameraView] = useState<'front' | 'back' | 'side' | 'full' | 'closeup'>('front');
  const [isFacingBackAngle, setIsFacingBackAngle] = useState(false);
  const [studioTheme, setStudioTheme] = useState<'light_showroom' | 'dark_atelier'>('light_showroom');
  const [isPresetDrawerOpen, setIsPresetDrawerOpen] = useState(false);
  const [fps, setFps] = useState(60);

  // 1. Procedural normal map generation for realistic fabric relief
  const generateProceduralFabricNormalMap = useCallback((finish: FabricFinishType): THREE.Texture => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Neutral normal base (128, 128, 255)
    ctx.fillStyle = 'rgb(128, 128, 255)';
    ctx.fillRect(0, 0, 256, 256);

    const imgData = ctx.getImageData(0, 0, 256, 256);
    const data = imgData.data;

    if (finish === 'ribbed_knit') {
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          const idx = (y * 256 + x) * 4;
          const wave = Math.sin((x / 256) * Math.PI * 32);
          data[idx] = Math.floor(128 + wave * 50);
          data[idx + 1] = 128;
          data[idx + 2] = 240;
        }
      }
    } else if (finish === 'linen_weave') {
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          const idx = (y * 256 + x) * 4;
          const cross = Math.sin((x / 256) * Math.PI * 40) * Math.sin((y / 256) * Math.PI * 40);
          data[idx] = Math.floor(128 + cross * 40);
          data[idx + 1] = Math.floor(128 + cross * 40);
          data[idx + 2] = 230;
        }
      }
    } else if (finish === 'velvet_sheen') {
      for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 20;
        data[i] = Math.floor(128 + noise);
        data[i + 1] = Math.floor(128 + noise);
        data[i + 2] = 250;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8);
    return texture;
  }, []);

  // 2. Build Mannequin Geometry using Lathe Profile
  const buildMannequinMesh = useCallback((materialType: MannequinMaterialType): THREE.Group => {
    const group = new THREE.Group();
    group.name = 'mannequin_root';

    const points: THREE.Vector2[] = [
      new THREE.Vector2(0.01, -1.8),
      new THREE.Vector2(0.38, -1.8),
      new THREE.Vector2(0.42, -1.5),
      new THREE.Vector2(0.36, -1.0),
      new THREE.Vector2(0.28, -0.4),
      new THREE.Vector2(0.32, 0.1),
      new THREE.Vector2(0.39, 0.45),
      new THREE.Vector2(0.35, 0.75),
      new THREE.Vector2(0.44, 0.95),
      new THREE.Vector2(0.28, 1.05),
      new THREE.Vector2(0.15, 1.15),
      new THREE.Vector2(0.14, 1.45),
      new THREE.Vector2(0.15, 1.60),
      new THREE.Vector2(0.01, 1.62),
    ];

    const latheGeo = new THREE.LatheGeometry(points, 48);

    let mat: THREE.Material;
    if (materialType === 'linen_dressform') {
      const dressformCanvas = document.createElement('canvas');
      dressformCanvas.width = 512;
      dressformCanvas.height = 512;
      const dCtx = dressformCanvas.getContext('2d')!;
      
      dCtx.fillStyle = '#b8bec8';
      dCtx.fillRect(0, 0, 512, 512);

      dCtx.fillStyle = '#9da4b0';
      for (let y = 0; y < 512; y += 4) {
        dCtx.fillRect(0, y, 512, 1.5);
      }
      for (let x = 0; x < 512; x += 4) {
        dCtx.fillRect(x, 0, 1.5, 512);
      }

      dCtx.fillStyle = '#788190';
      dCtx.fillRect(128, 0, 2, 512);
      dCtx.fillRect(256, 0, 2.5, 512);
      dCtx.fillRect(384, 0, 2, 512);

      const dressformTex = new THREE.CanvasTexture(dressformCanvas);
      dressformTex.wrapS = THREE.RepeatWrapping;
      dressformTex.wrapT = THREE.RepeatWrapping;
      dressformTex.repeat.set(4, 4);

      mat = new THREE.MeshStandardMaterial({
        map: dressformTex,
        color: 0xc8ced8,
        roughness: 0.88,
        metalness: 0.02,
      });
    } else if (materialType === 'matte_porcelain') {
      mat = new THREE.MeshStandardMaterial({
        color: 0xf3f4f6,
        roughness: 0.35,
        metalness: 0.05,
      });
    } else if (materialType === 'slate_graphite') {
      mat = new THREE.MeshStandardMaterial({
        color: 0x27272a,
        roughness: 0.45,
        metalness: 0.25,
      });
    } else if (materialType === 'birch_wood') {
      mat = new THREE.MeshStandardMaterial({
        color: 0xd4a373,
        roughness: 0.65,
        metalness: 0.0,
      });
    } else {
      mat = new THREE.MeshStandardMaterial({
        color: 0x09090b,
        roughness: 0.15,
        metalness: 0.85,
      });
    }

    const torsoMesh = new THREE.Mesh(latheGeo, mat);
    torsoMesh.castShadow = true;
    torsoMesh.receiveShadow = true;
    group.add(torsoMesh);

    const capGeo = new THREE.CylinderGeometry(0.14, 0.15, 0.035, 32);
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x71717a,
      metalness: 0.6,
      roughness: 0.35,
    });
    const capMesh = new THREE.Mesh(capGeo, capMat);
    capMesh.position.set(0, 1.63, 0);
    group.add(capMesh);

    return group;
  }, []);

  // 3. Build Stand & Pedestal
  const buildPedestal = useCallback((): THREE.Group => {
    const group = new THREE.Group();
    group.name = 'pedestal_root';

    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      metalness: 0.82,
      roughness: 0.28,
    });

    const baseGeo = new THREE.CylinderGeometry(0.72, 0.76, 0.045, 64);
    const baseMesh = new THREE.Mesh(baseGeo, metalMat);
    baseMesh.position.set(0, -2.8, 0);
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    const baseBevelGeo = new THREE.CylinderGeometry(0.68, 0.72, 0.025, 64);
    const baseBevelMesh = new THREE.Mesh(baseBevelGeo, metalMat);
    baseBevelMesh.position.set(0, -2.765, 0);
    group.add(baseBevelMesh);

    const flangeGeo = new THREE.CylinderGeometry(0.065, 0.09, 0.05, 32);
    const flangeMesh = new THREE.Mesh(flangeGeo, metalMat);
    flangeMesh.position.set(0, -2.73, 0);
    group.add(flangeMesh);

    const poleGeo = new THREE.CylinderGeometry(0.028, 0.028, 1.45, 32);
    const poleMesh = new THREE.Mesh(poleGeo, metalMat);
    poleMesh.position.set(0, -2.0, 0);
    poleMesh.castShadow = true;
    group.add(poleMesh);

    const upperMountGeo = new THREE.CylinderGeometry(0.07, 0.035, 0.08, 32);
    const upperMountMesh = new THREE.Mesh(upperMountGeo, metalMat);
    upperMountMesh.position.set(0, -1.82, 0);
    group.add(upperMountMesh);

    const shadowGeo = new THREE.PlaneGeometry(2.6, 2.6);
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sCtx = shadowCanvas.getContext('2d')!;
    const radGrad = sCtx.createRadialGradient(64, 64, 10, 64, 64, 64);
    radGrad.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
    radGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.22)');
    radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    sCtx.fillStyle = radGrad;
    sCtx.fillRect(0, 0, 128, 128);

    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.set(0, -2.82, 0);
    group.add(shadowMesh);

    return group;
  }, []);

  // 4. Build Parametric Garment Mesh
  const buildGarmentGeometry = useCallback((
    silhouette: SilhouetteType,
    strap: StrapType,
    hemScale: number,
    flareScale: number
  ): THREE.BufferGeometry => {
    let points: THREE.Vector2[] = [];

    const baseFlare = flareScale || 1.0;
    const baseHem = hemScale || 1.0;

    switch (silhouette) {
      case 'a_line_dress':
        points = [
          new THREE.Vector2(0.72 * baseFlare, -2.25 * baseHem),
          new THREE.Vector2(0.68 * baseFlare, -1.9),
          new THREE.Vector2(0.60 * baseFlare, -1.4),
          new THREE.Vector2(0.52 * baseFlare, -0.95),
          new THREE.Vector2(0.44 * baseFlare, -0.58),
          new THREE.Vector2(0.36, -0.50),
          new THREE.Vector2(0.295, -0.38),
          new THREE.Vector2(0.335, 0.12),
          new THREE.Vector2(0.405, 0.46),
          new THREE.Vector2(0.375, 0.74),
        ];
        break;

      case 'slip_dress':
        points = [
          new THREE.Vector2(0.52 * baseFlare, -2.0 * baseHem),
          new THREE.Vector2(0.46, -1.4),
          new THREE.Vector2(0.40, -0.8),
          new THREE.Vector2(0.30, -0.4),
          new THREE.Vector2(0.33, 0.1),
          new THREE.Vector2(0.405, 0.45),
          new THREE.Vector2(0.365, 0.72),
        ];
        break;

      case 'bodycon_midi':
        points = [
          new THREE.Vector2(0.36 * baseFlare, -1.6 * baseHem),
          new THREE.Vector2(0.38, -1.1),
          new THREE.Vector2(0.44, -0.7),
          new THREE.Vector2(0.30, -0.4),
          new THREE.Vector2(0.33, 0.1),
          new THREE.Vector2(0.405, 0.45),
          new THREE.Vector2(0.37, 0.74),
        ];
        break;

      case 'halter_maxi':
        points = [
          new THREE.Vector2(0.85 * baseFlare, -2.5 * baseHem),
          new THREE.Vector2(0.70 * baseFlare, -1.9),
          new THREE.Vector2(0.55 * baseFlare, -1.2),
          new THREE.Vector2(0.42, -0.6),
          new THREE.Vector2(0.30, -0.4),
          new THREE.Vector2(0.34, 0.1),
          new THREE.Vector2(0.41, 0.45),
          new THREE.Vector2(0.33, 0.76),
        ];
        break;

      case 'fit_and_flare':
        points = [
          new THREE.Vector2(0.82 * baseFlare, -1.8 * baseHem),
          new THREE.Vector2(0.70 * baseFlare, -1.3),
          new THREE.Vector2(0.52 * baseFlare, -0.8),
          new THREE.Vector2(0.29, -0.4),
          new THREE.Vector2(0.34, 0.1),
          new THREE.Vector2(0.41, 0.45),
          new THREE.Vector2(0.375, 0.75),
        ];
        break;

      case 'peplum_top':
        points = [
          new THREE.Vector2(0.55 * baseFlare, -0.8),
          new THREE.Vector2(0.44, -0.6),
          new THREE.Vector2(0.30, -0.4),
          new THREE.Vector2(0.34, 0.1),
          new THREE.Vector2(0.41, 0.45),
          new THREE.Vector2(0.37, 0.74),
        ];
        break;

      case 'flared_skirt':
        points = [
          new THREE.Vector2(0.78 * baseFlare, -2.1 * baseHem),
          new THREE.Vector2(0.66 * baseFlare, -1.5),
          new THREE.Vector2(0.52 * baseFlare, -0.9),
          new THREE.Vector2(0.38, -0.5),
          new THREE.Vector2(0.30, -0.4),
        ];
        break;

      default:
        points = [
          new THREE.Vector2(0.7 * baseFlare, -2.1 * baseHem),
          new THREE.Vector2(0.55 * baseFlare, -1.3),
          new THREE.Vector2(0.42, -0.7),
          new THREE.Vector2(0.30, -0.4),
          new THREE.Vector2(0.34, 0.1),
          new THREE.Vector2(0.41, 0.45),
          new THREE.Vector2(0.375, 0.74),
        ];
    }

    return new THREE.LatheGeometry(points, 64);
  }, []);

  // Helper: Create a textured curved ribbon strap with thickness
  const createCurvedRibbonMesh = (
    curve: THREE.CatmullRomCurve3,
    width: number,
    material: THREE.Material,
    segments = 32
  ): THREE.Mesh => {
    const points = curve.getPoints(segments);
    const geometry = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= segments; i++) {
      const p = points[i];
      const t = i / segments;
      const tangent = curve.getTangent(t).normalize();
      
      const side = new THREE.Vector3(1, 0, 0).cross(tangent).normalize();
      if (side.lengthSq() < 0.01) {
        side.set(0, 0, 1).cross(tangent).normalize();
      }

      const halfW = width / 2;
      const vLeft = p.clone().addScaledVector(side, -halfW);
      const vRight = p.clone().addScaledVector(side, halfW);

      vertices.push(vLeft.x, vLeft.y, vLeft.z);
      vertices.push(vRight.x, vRight.y, vRight.z);

      uvs.push(0, t * 2);
      uvs.push(1, t * 2);

      if (i < segments) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2);
        indices.push(base + 1, base + 3, base + 2);
        indices.push(base + 2, base + 1, base);
        indices.push(base + 2, base + 3, base + 1);
      }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  // Helper: Create a contoured 3D back bodice panel
  const createContouredBackPanelMesh = (
    yBottom: number,
    yTop: number,
    material: THREE.Material,
    uSegments = 24,
    vSegments = 16
  ): THREE.Mesh => {
    const geometry = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let j = 0; j <= vSegments; j++) {
      const v = j / vSegments;
      const y = yBottom + v * (yTop - yBottom);
      
      let radius = 0.355;
      if (y < 0) {
        radius = 0.30 + (y / -1.8) * 0.08;
      } else if (y < 0.45) {
        radius = 0.30 + (y / 0.45) * 0.085;
      } else if (y < 0.75) {
        radius = 0.385 - ((y - 0.45) / 0.30) * 0.03;
      } else {
        radius = 0.355 + ((y - 0.75) / 0.25) * 0.05;
      }

      const angleStart = Math.PI * 0.58;
      const angleEnd = Math.PI * 1.42;

      for (let i = 0; i <= uSegments; i++) {
        const u = i / uSegments;
        const theta = angleStart + u * (angleEnd - angleStart);

        const x = Math.cos(theta) * radius * 0.96;
        const z = Math.sin(theta) * radius * 0.98;

        vertices.push(x, y, z);
        uvs.push(u, v);
      }
    }

    for (let j = 0; j < vSegments; j++) {
      for (let i = 0; i < uSegments; i++) {
        const row1 = j * (uSegments + 1);
        const row2 = (j + 1) * (uSegments + 1);

        const a = row1 + i;
        const b = row1 + i + 1;
        const c = row2 + i + 1;
        const d = row2 + i;

        indices.push(a, b, d);
        indices.push(b, c, d);
        indices.push(d, b, a);
        indices.push(d, c, b);
      }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  // 5. Build 3D Straps & Back Geometric Overlays
  const buildStrapMesh = useCallback((
    strap: StrapType,
    back: BackStyleType,
    isDetermined: boolean,
    colorHex: string,
    frontTexture: THREE.Texture | null
  ): THREE.Group => {
    const group = new THREE.Group();
    group.name = 'straps_root';

    if (!isDetermined || back === 'undetermined' || strap === 'unknown') {
      return group;
    }

    const strapMat = new THREE.MeshStandardMaterial({
      map: frontTexture || null,
      color: frontTexture ? 0xffffff : (colorHex ? new THREE.Color(colorHex) : new THREE.Color(0x1e40af)),
      roughness: 0.45,
      metalness: 0.05,
      side: THREE.DoubleSide,
      shadowSide: THREE.DoubleSide,
    });

    const laceTrimMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.7,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    if (strap === 'wide_straps') {
      const leftWideCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.19, 0.72, 0.34),
        new THREE.Vector3(-0.23, 0.88, 0.22),
        new THREE.Vector3(-0.25, 0.98, 0.04),
        new THREE.Vector3(-0.22, 0.94, -0.16),
        new THREE.Vector3(-0.18, 0.72, -0.32),
      ]);
      const leftStrapMesh = createCurvedRibbonMesh(leftWideCurve, 0.088, strapMat, 36);
      group.add(leftStrapMesh);

      const leftTubeGeo = new THREE.TubeGeometry(leftWideCurve, 32, 0.022, 10, false);
      const leftTubeMesh = new THREE.Mesh(leftTubeGeo, strapMat);
      leftTubeMesh.castShadow = true;
      group.add(leftTubeMesh);

      const rightWideCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.19, 0.72, 0.34),
        new THREE.Vector3(0.23, 0.88, 0.22),
        new THREE.Vector3(0.25, 0.98, 0.04),
        new THREE.Vector3(0.22, 0.94, -0.16),
        new THREE.Vector3(0.18, 0.72, -0.32),
      ]);
      const rightStrapMesh = createCurvedRibbonMesh(rightWideCurve, 0.088, strapMat, 36);
      group.add(rightStrapMesh);

      const rightTubeGeo = new THREE.TubeGeometry(rightWideCurve, 32, 0.022, 10, false);
      const rightTubeMesh = new THREE.Mesh(rightTubeGeo, strapMat);
      rightTubeMesh.castShadow = true;
      group.add(rightTubeMesh);

      const frontNecklineCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.19, 0.73, 0.34),
        new THREE.Vector3(-0.10, 0.72, 0.37),
        new THREE.Vector3(0.00, 0.72, 0.38),
        new THREE.Vector3(0.10, 0.72, 0.37),
        new THREE.Vector3(0.19, 0.73, 0.34),
      ]);
      const laceGeo = new THREE.TubeGeometry(frontNecklineCurve, 24, 0.009, 8, false);
      const laceMesh = new THREE.Mesh(laceGeo, laceTrimMat);
      laceMesh.position.y += 0.01;
      laceMesh.position.z += 0.005;
      group.add(laceMesh);

      if (back === 'covered_back') {
        const backPanelMesh = createContouredBackPanelMesh(0.48, 0.76, strapMat, 28, 18);
        group.add(backPanelMesh);

        const backNecklineCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(-0.19, 0.74, -0.32),
          new THREE.Vector3(-0.10, 0.75, -0.345),
          new THREE.Vector3(0.00, 0.755, -0.355),
          new THREE.Vector3(0.10, 0.75, -0.345),
          new THREE.Vector3(0.19, 0.74, -0.32),
        ]);
        const backHemGeo = new THREE.TubeGeometry(backNecklineCurve, 24, 0.012, 10, false);
        const backHemMesh = new THREE.Mesh(backHemGeo, strapMat);
        group.add(backHemMesh);
      }
    } else if (strap === 'thin_double_straps') {
      const leftCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.17, 0.72, 0.33),
        new THREE.Vector3(-0.21, 0.98, 0.08),
        new THREE.Vector3(-0.19, 0.95, -0.15),
        new THREE.Vector3(-0.13, 0.55, -0.32),
      ]);
      const leftGeo = new THREE.TubeGeometry(leftCurve, 32, 0.012, 12, false);
      const leftMesh = new THREE.Mesh(leftGeo, strapMat);
      leftMesh.castShadow = true;
      group.add(leftMesh);

      const rightCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.17, 0.72, 0.33),
        new THREE.Vector3(0.21, 0.98, 0.08),
        new THREE.Vector3(0.19, 0.95, -0.15),
        new THREE.Vector3(0.13, 0.55, -0.32),
      ]);
      const rightGeo = new THREE.TubeGeometry(rightCurve, 32, 0.012, 12, false);
      const rightMesh = new THREE.Mesh(rightGeo, strapMat);
      rightMesh.castShadow = true;
      group.add(rightMesh);

      if (back === 'open_back') {
        const lowerBand = new THREE.CatmullRomCurve3([
          new THREE.Vector3(-0.28, 0.44, -0.30),
          new THREE.Vector3(0, 0.42, -0.34),
          new THREE.Vector3(0.28, 0.44, -0.30),
        ]);
        group.add(new THREE.Mesh(new THREE.TubeGeometry(lowerBand, 20, 0.01, 8, false), strapMat));
      }
    } else if (strap === 'crossed_straps' || back === 'crossed_back') {
      const leftFront = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.18, 0.72, 0.33),
        new THREE.Vector3(-0.21, 0.98, 0.08),
        new THREE.Vector3(-0.15, 0.92, -0.15),
        new THREE.Vector3(0.13, 0.52, -0.32),
      ]);
      const rightFront = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.18, 0.72, 0.33),
        new THREE.Vector3(0.21, 0.98, 0.08),
        new THREE.Vector3(0.15, 0.92, -0.15),
        new THREE.Vector3(-0.13, 0.52, -0.32),
      ]);
      const lMesh = new THREE.Mesh(new THREE.TubeGeometry(leftFront, 32, 0.014, 10, false), strapMat);
      const rMesh = new THREE.Mesh(new THREE.TubeGeometry(rightFront, 32, 0.014, 10, false), strapMat);
      lMesh.castShadow = true;
      rMesh.castShadow = true;
      group.add(lMesh);
      group.add(rMesh);
    } else if (strap === 'halter_neck') {
      const neckLoop = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.12, 0.72, 0.32),
        new THREE.Vector3(-0.09, 1.15, 0.10),
        new THREE.Vector3(0.0, 1.18, -0.16),
        new THREE.Vector3(0.09, 1.15, 0.10),
        new THREE.Vector3(0.12, 0.72, 0.32),
      ]);
      const neckGeo = new THREE.TubeGeometry(neckLoop, 36, 0.018, 12, false);
      const neckMesh = new THREE.Mesh(neckGeo, strapMat);
      neckMesh.castShadow = true;
      group.add(neckMesh);

      if (back === 'tie_back') {
        const knotMesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.038, 16, 16),
          strapMat
        );
        knotMesh.position.set(0, 1.18, -0.17);
        group.add(knotMesh);

        const ribbon1 = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0.0, 1.18, -0.17),
          new THREE.Vector3(-0.06, 0.85, -0.26),
          new THREE.Vector3(-0.04, 0.50, -0.33),
        ]);
        const ribbon2 = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0.0, 1.18, -0.17),
          new THREE.Vector3(0.06, 0.85, -0.26),
          new THREE.Vector3(0.05, 0.50, -0.33),
        ]);
        group.add(new THREE.Mesh(new THREE.TubeGeometry(ribbon1, 24, 0.012, 8, false), strapMat));
        group.add(new THREE.Mesh(new THREE.TubeGeometry(ribbon2, 24, 0.012, 8, false), strapMat));
      }
    }

    return group;
  }, []);

  // 6. Update Lighting Rig (Supports both Showroom Light and Atelier Dark)
  const applyLightingPreset = useCallback((scene: THREE.Scene, theme: 'light_showroom' | 'dark_atelier', preset: LightingPresetType) => {
    if (lightsGroupRef.current) {
      scene.remove(lightsGroupRef.current);
    }

    const group = new THREE.Group();
    group.name = 'lights_root';

    if (theme === 'light_showroom') {
      // Light Girlish Showroom setup with soft rosy ambient, flattering key light and rose-gold rim light
      const ambientLight = new THREE.AmbientLight(0xfff0f5, 1.25);
      group.add(ambientLight);

      const keyLight = new THREE.DirectionalLight(0xfff8fa, 1.5);
      keyLight.position.set(3.5, 4.5, 4.5);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.width = 2048;
      keyLight.shadow.mapSize.height = 2048;
      keyLight.shadow.bias = -0.0001;
      group.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0xfce7f3, 1.0);
      fillLight.position.set(-3.5, 2.5, 3.5);
      group.add(fillLight);

      const rimLight = new THREE.DirectionalLight(0xffffff, 1.7);
      rimLight.position.set(0, 3.5, -4.5);
      group.add(rimLight);

      const softFloorLight = new THREE.DirectionalLight(0xffe4e6, 0.6);
      softFloorLight.position.set(0, -3.5, 2.5);
      group.add(softFloorLight);
    } else {
      // Atelier Dark: dramatic, moody runway/atelier environment featuring dark charcoal canvas with focused directional spotlights
      let ambientColor = 0x18181b;
      let ambientIntensity = 0.5;
      let keyColor = 0xffffff;
      let keyIntensity = 1.9;
      let fillColor = 0x3b82f6;
      let fillIntensity = 0.5;
      let rimColor = 0xf59e0b;
      let rimIntensity = 2.4;

      if (preset === 'runway_warm') {
        ambientColor = 0x292524;
        ambientIntensity = 0.5;
        keyColor = 0xfef08a;
        keyIntensity = 2.2;
        fillColor = 0xfbcfe8;
        fillIntensity = 0.6;
        rimColor = 0xffffff;
        rimIntensity = 2.8;
      } else if (preset === 'editorial_moody') {
        ambientColor = 0x0f172a;
        ambientIntensity = 0.35;
        keyColor = 0xffffff;
        keyIntensity = 2.6;
        fillColor = 0x334155;
        fillIntensity = 0.3;
        rimColor = 0x38bdf8;
        rimIntensity = 3.2;
      } else if (preset === 'cyber_atelier') {
        ambientColor = 0x09090b;
        ambientIntensity = 0.3;
        keyColor = 0x06b6d4;
        keyIntensity = 2.0;
        fillColor = 0xec4899;
        fillIntensity = 1.6;
        rimColor = 0xa855f7;
        rimIntensity = 3.5;
      }

      const ambientLight = new THREE.AmbientLight(ambientColor, ambientIntensity);
      group.add(ambientLight);

      const keyLight = new THREE.DirectionalLight(keyColor, keyIntensity);
      keyLight.position.set(3.5, 4.0, 4.5);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.width = 2048;
      keyLight.shadow.mapSize.height = 2048;
      keyLight.shadow.bias = -0.0001;
      group.add(keyLight);

      const fillLight = new THREE.DirectionalLight(fillColor, fillIntensity);
      fillLight.position.set(-3.5, 2.0, 3.0);
      group.add(fillLight);

      const rimLight = new THREE.DirectionalLight(rimColor, rimIntensity);
      rimLight.position.set(0, 3.5, -4.5);
      group.add(rimLight);

      const spotLight = new THREE.SpotLight(0xffffff, 2.0, 15, Math.PI / 6, 0.4);
      spotLight.position.set(0, 5.0, 2.0);
      spotLight.target.position.set(0, -0.4, 0);
      group.add(spotLight);
      group.add(spotLight.target);
    }

    lightsGroupRef.current = group;
    scene.add(group);
  }, []);

  const settingsRef = useRef<ViewerSettings>(settings);
  useEffect(() => {
    settingsRef.current = settings;
    if (controlsRef.current) {
      controlsRef.current.autoRotate = settings.autoRotate;
      controlsRef.current.autoRotateSpeed = settings.autoRotateSpeed;
    }
  }, [settings]);

  // 7. Initialize Three.js Scene
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight || 550;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(studioTheme === 'light_showroom' ? 0xffedf3 : 0x241d23);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0.2, 4.8);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = studioTheme === 'light_showroom' ? 1.05 : 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 1.8;
    controls.maxDistance = 8.5;
    controls.maxPolarAngle = Math.PI / 2 + 0.15;
    controls.target.set(0, -0.4, 0);
    controls.autoRotate = settingsRef.current.autoRotate;
    controls.autoRotateSpeed = settingsRef.current.autoRotateSpeed;
    controlsRef.current = controls;

    // The 360° turntable spin now runs continuously — it is never paused by
    // dragging, touching, or scrolling the canvas. OrbitControls layers the
    // auto-rotation on top of manual orbiting each frame, so the mannequin
    // keeps spinning while the user looks around too.

    applyLightingPreset(scene, studioTheme, settings.lightingPreset);

    const mannequinGroup = buildMannequinMesh(settings.mannequinMaterial);
    mannequinGroupRef.current = mannequinGroup;
    scene.add(mannequinGroup);

    const pedestalGroup = buildPedestal();
    pedestalGroupRef.current = pedestalGroup;
    scene.add(pedestalGroup);

    proceduralNormalMapRef.current = generateProceduralFabricNormalMap(settings.fabricFinish);

    let animationFrameId: number;
    let lastTime = performance.now();
    let frameCount = 0;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      if (controlsRef.current && cameraRef.current) {
        controlsRef.current.autoRotate = settingsRef.current.autoRotate;
        controlsRef.current.autoRotateSpeed = settingsRef.current.autoRotateSpeed;
        controlsRef.current.update();

        const isBackSide = cameraRef.current.position.z < -0.8;
        setIsFacingBackAngle(isBackSide);
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }

      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastTime = now;
      }
    };

    animate();

    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight || 550;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      controls.dispose();
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      renderer.dispose();
    };
  }, []);

  // 8. Update Mannequin Material / Visibility
  useEffect(() => {
    if (!sceneRef.current) return;
    if (mannequinGroupRef.current) {
      sceneRef.current.remove(mannequinGroupRef.current);
    }
    if (settings.showMannequin) {
      const newMannequin = buildMannequinMesh(settings.mannequinMaterial);
      mannequinGroupRef.current = newMannequin;
      sceneRef.current.add(newMannequin);
    }
  }, [settings.mannequinMaterial, settings.showMannequin, buildMannequinMesh]);

  // 9. Update Pedestal Visibility
  useEffect(() => {
    if (pedestalGroupRef.current) {
      pedestalGroupRef.current.visible = settings.showPedestal;
    }
  }, [settings.showPedestal]);

  // 10. Update Lighting & Studio Environment Theme
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(studioTheme === 'light_showroom' ? 0xf5f3f4 : 0x0a0a0c);
      if (rendererRef.current) {
        rendererRef.current.toneMappingExposure = studioTheme === 'light_showroom' ? 1.05 : 1.2;
      }
      applyLightingPreset(sceneRef.current, studioTheme, settings.lightingPreset);
    }
  }, [studioTheme, settings.lightingPreset, applyLightingPreset]);

  // 11. Load & Update Textures
  useEffect(() => {
    if (!frontTextureUrl) return;

    textureLoaderRef.current.load(frontTextureUrl, (tex) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(settings.wrapRepeatX, settings.wrapRepeatY);
      tex.offset.set(settings.textureOffsetX, settings.textureOffsetY);
      tex.rotation = (settings.textureRotation * Math.PI) / 180;
      tex.colorSpace = THREE.SRGBColorSpace;
      activeFrontTextureRef.current = tex;

      updateGarmentMaterial();
    });
  }, [
    frontTextureUrl,
    settings.wrapRepeatX,
    settings.wrapRepeatY,
    settings.textureOffsetX,
    settings.textureOffsetY,
    settings.textureRotation,
  ]);

  // 12. Update Garment Mesh and Straps
  const updateGarmentMaterial = useCallback(() => {
    if (!sceneRef.current) return;

    const normalMap = generateProceduralFabricNormalMap(settings.fabricFinish);

    let roughnessVal = settings.roughness;
    let metalnessVal = settings.metalness;

    if (settings.fabricFinish === 'silk_satin') {
      roughnessVal = 0.22;
      metalnessVal = 0.05;
    } else if (settings.fabricFinish === 'cotton_matte') {
      roughnessVal = 0.82;
      metalnessVal = 0.0;
    } else if (settings.fabricFinish === 'velvet_sheen') {
      roughnessVal = 0.65;
      metalnessVal = 0.15;
    } else if (settings.fabricFinish === 'ribbed_knit') {
      roughnessVal = 0.90;
      metalnessVal = 0.0;
    } else if (settings.fabricFinish === 'metallic_lurex') {
      roughnessVal = 0.30;
      metalnessVal = 0.65;
    }

    const garmentMat = new THREE.MeshStandardMaterial({
      map: activeFrontTextureRef.current || null,
      color: activeFrontTextureRef.current ? 0xffffff : 0x059669,
      roughness: roughnessVal,
      metalness: metalnessVal,
      normalMap: normalMap,
      normalScale: new THREE.Vector2(settings.bumpScale, settings.bumpScale),
      side: THREE.DoubleSide,
      wireframe: settings.showWireframe,
      shadowSide: THREE.DoubleSide,
    });

    if (garmentMeshRef.current) {
      sceneRef.current.remove(garmentMeshRef.current);
      garmentMeshRef.current.geometry.dispose();
    }

    const geo = buildGarmentGeometry(
      settings.silhouette,
      strapType,
      settings.hemLength,
      settings.flareWidth
    );

    const garmentMesh = new THREE.Mesh(geo, garmentMat);
    garmentMesh.name = 'garment_mesh';
    garmentMesh.castShadow = true;
    garmentMesh.receiveShadow = true;
    garmentMeshRef.current = garmentMesh;
    sceneRef.current.add(garmentMesh);

    // Update 3D Straps
    if (strapGroupRef.current) {
      sceneRef.current.remove(strapGroupRef.current);
    }
    const strapGroup = buildStrapMesh(
      strapType,
      backStyle,
      isBackDetermined,
      settings.liningColor,
      activeFrontTextureRef.current
    );
    strapGroupRef.current = strapGroup;
    sceneRef.current.add(strapGroup);

  }, [
    settings.fabricFinish,
    settings.roughness,
    settings.metalness,
    settings.bumpScale,
    settings.showWireframe,
    settings.silhouette,
    settings.hemLength,
    settings.flareWidth,
    settings.liningColor,
    strapType,
    backStyle,
    isBackDetermined,
    buildGarmentGeometry,
    buildStrapMesh,
    generateProceduralFabricNormalMap,
  ]);

  useEffect(() => {
    updateGarmentMaterial();
  }, [updateGarmentMaterial]);

  // Camera angle transitions (Front, Back, Profile, Bust, Full)
  const setCameraView = (view: 'front' | 'back' | 'side' | 'full' | 'closeup') => {
    if (!controlsRef.current || !cameraRef.current) return;
    setActiveCameraView(view);

    const controls = controlsRef.current;
    const camera = cameraRef.current;

    switch (view) {
      case 'front':
        camera.position.set(0, 0.2, 4.6);
        controls.target.set(0, -0.4, 0);
        break;
      case 'back':
        camera.position.set(0, 0.2, -4.6);
        controls.target.set(0, -0.4, 0);
        break;
      case 'side':
        camera.position.set(4.6, 0.2, 0);
        controls.target.set(0, -0.4, 0);
        break;
      case 'closeup':
        camera.position.set(0, 0.65, 2.3);
        controls.target.set(0, 0.52, 0);
        break;
      case 'full':
        camera.position.set(0, -0.4, 6.0);
        controls.target.set(0, -0.85, 0);
        break;
    }
    controls.update();
  };

  const handleResetCamera = () => {
    setCameraView('front');
    // Resetting the camera also restores the continuous 360° turntable spin,
    // so the mannequin always ends up auto-rotating again after a manual look-around.
    onUpdateSettings({ autoRotate: true });
    if (controlsRef.current) {
      controlsRef.current.autoRotate = true;
    }
  };

  // High-Res Snapshot Capture Tool
  const handleCaptureSnapshot = () => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
    rendererRef.current.render(sceneRef.current, cameraRef.current);
    const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `garment-3d-mannequin-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  };

  const isBackViewActive = activeCameraView === 'back' || isFacingBackAngle;
  const showBackUnavailableWarning = isBackViewActive && (!isBackDetermined || backStyle === 'undetermined');

  return (
    <div className="relative w-full h-full min-h-[520px] bg-gradient-to-b from-[#FFF5F8] via-[#FFEBF1] to-[#FFDFE9] rounded-3xl overflow-hidden border border-[#F3D3DB] shadow-xl flex flex-col" ref={containerRef}>
      {/* Background Subtle Grid */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none z-0"
        style={{
          backgroundImage: studioTheme === 'light_showroom'
            ? 'radial-gradient(#E97A9A 1px, transparent 1px)'
            : 'radial-gradient(#777 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* 3D WebGL Canvas */}
      <canvas ref={canvasRef} className="w-full h-full cursor-grab active:cursor-grabbing block flex-1 relative z-1" id="threejs-garment-canvas" />

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex flex-col items-center justify-center text-[#2F2A2E] z-20 pointer-events-none transition-opacity">
          <div className="w-12 h-12 border-3 border-[#E97A9A] border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-xs font-mono tracking-widest uppercase text-[#E97A9A] font-bold">Synthesizing 3D Garment Mesh & UV...</p>
        </div>
      )}

      {/* Prominent "Back View Unavailable" Notification Overlay */}
      {showBackUnavailableWarning && (
        <div className="absolute top-16 left-4 right-4 sm:left-8 sm:right-8 z-20 pointer-events-auto animate-fade-in">
          <div className="bg-white/95 border border-[#F3D3DB] rounded-2xl p-4 shadow-xl backdrop-blur-md flex items-start gap-3.5">
            <div className="w-8 h-8 rounded-xl bg-[#FFF0F4] border border-[#F3D3DB] flex items-center justify-center text-[#E97A9A] shrink-0 mt-0.5">
              <svg className="w-5 h-5 text-[#E97A9A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#E97A9A]">
                  Back View Unavailable
                </h4>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-[#FFF0F4] text-[#E97A9A] border border-[#F3D3DB]">
                  Anti-Hallucination Safe
                </span>
              </div>
              <p className="text-xs text-[#6D6670] mt-1 leading-relaxed">
                Back view unavailable — the uploaded image does not contain enough visible strap information to determine the back design.
              </p>
              <div className="text-[11px] text-[#A39CA8] mt-1.5 font-mono">
                {backDeterminationMessage || 'The system refuses to invent or fabricate an unverified back construction.'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating 3D Controls Top Bar */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
        {/* 1 & 3: Camera Angle Presets (Front, Back, Profile, Bust, Full) */}
        <div className="flex items-center gap-1 bg-white/90 backdrop-blur-md p-1 rounded-2xl shadow-lg border border-[#F3D3DB] pointer-events-auto">
          <button
            id="btn-view-front"
            onClick={() => setCameraView('front')}
            title="Front: Direct orthogonal perspective"
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
              activeCameraView === 'front'
                ? 'bg-[#E97A9A] text-white font-bold shadow-xs'
                : 'text-[#6D6670] hover:text-[#E97A9A] hover:bg-[#FFF0F4]'
            }`}
          >
            Front
          </button>
          <button
            id="btn-view-back"
            onClick={() => setCameraView('back')}
            title="Back: Inspect back panel fit & rear silhouette"
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer relative ${
              activeCameraView === 'back'
                ? 'bg-[#E97A9A] text-white font-bold shadow-xs'
                : 'text-[#6D6670] hover:text-[#E97A9A] hover:bg-[#FFF0F4]'
            }`}
          >
            Back
            {!isBackDetermined && (
              <span className="ml-1 text-[9px] text-[#E97A9A] font-mono">⚠</span>
            )}
          </button>
          <button
            id="btn-view-side"
            onClick={() => setCameraView('side')}
            title="Profile: 90° side view for bust projection & flare"
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
              activeCameraView === 'side'
                ? 'bg-[#E97A9A] text-white font-bold shadow-xs'
                : 'text-[#6D6670] hover:text-[#E97A9A] hover:bg-[#FFF0F4]'
            }`}
          >
            Profile
          </button>
          <button
            id="btn-view-closeup"
            onClick={() => setCameraView('closeup')}
            title="Bust: Close-up zoom on chest, neckline, straps, and collar"
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
              activeCameraView === 'closeup'
                ? 'bg-[#E97A9A] text-white font-bold shadow-xs'
                : 'text-[#6D6670] hover:text-[#E97A9A] hover:bg-[#FFF0F4]'
            }`}
          >
            Bust
          </button>
          <button
            id="btn-view-full"
            onClick={() => setCameraView('full')}
            title="Full: Wide framing from neckline to pedestal base"
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
              activeCameraView === 'full'
                ? 'bg-[#E97A9A] text-white font-bold shadow-xs'
                : 'text-[#6D6670] hover:text-[#E97A9A] hover:bg-[#FFF0F4]'
            }`}
          >
            Full
          </button>
        </div>

        {/* Right Quick Action Tools (Features 1, 2, 4, 5) */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Feature 1: Showroom Light / Atelier Dark Toggle */}
          <button
            id="btn-toggle-studio-theme"
            onClick={() => setStudioTheme((prev) => (prev === 'light_showroom' ? 'dark_atelier' : 'light_showroom'))}
            title="1. Showroom Light / Atelier Dark: Toggle studio illumination preset"
            className={`px-2.5 py-1.5 rounded-xl text-xs font-medium border backdrop-blur-md shadow-xs transition-all flex items-center gap-1.5 cursor-pointer ${
              studioTheme === 'light_showroom'
                ? 'bg-white text-[#2F2A2E] border-[#F3D3DB] shadow-md font-semibold'
                : 'bg-white/80 text-[#6D6670] border-[#F3D3DB] hover:text-[#E97A9A] hover:bg-[#FFF0F4]'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${studioTheme === 'light_showroom' ? 'bg-[#E97A9A]' : 'bg-[#A39CA8]'}`}></span>
            <span className="uppercase tracking-wider text-[10px] font-mono">
              {studioTheme === 'light_showroom' ? 'Showroom Light' : 'Atelier Dark'}
            </span>
          </button>

          {/* Feature 2: 360° Spin (Automated Turntable Showcase) */}
          <button
            id="btn-toggle-autorotate"
            onClick={() => onUpdateSettings({ autoRotate: !settings.autoRotate })}
            title="2. 360° Spin: Automated rotational turntable loop around vertical Y-axis (pauses on click/drag)"
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border backdrop-blur-md shadow-xs transition-all flex items-center gap-2 cursor-pointer ${
              settings.autoRotate
                ? 'bg-[#E97A9A] text-white border-[#E97A9A] font-bold shadow-md shadow-[#E97A9A]/30'
                : 'bg-white/90 text-[#6D6670] border-[#F3D3DB] hover:text-[#E97A9A] hover:bg-[#FFF0F4]'
            }`}
          >
            <RotateCw className={`w-3.5 h-3.5 ${settings.autoRotate ? 'animate-spin' : ''}`} />
            <span className="uppercase tracking-wider text-[10px] font-mono">
              360° Spin {settings.autoRotate ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* Feature 5a: Quick Preset Grid Drawer (⊞) */}
          <button
            id="btn-quick-preset-grid"
            onClick={() => setIsPresetDrawerOpen((prev) => !prev)}
            title="5. Quick Tools: Preset Grid (⊞) Texture Drawer"
            className={`p-1.5 rounded-xl border backdrop-blur-md shadow-xs transition-all cursor-pointer ${
              isPresetDrawerOpen
                ? 'bg-[#E97A9A] text-white border-[#E97A9A]'
                : 'bg-white/90 text-[#6D6670] border-[#F3D3DB] hover:text-[#E97A9A] hover:bg-[#FFF0F4]'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>

          {/* Feature 5b: Snapshot Camera (📷) */}
          <button
            id="btn-capture-render"
            onClick={handleCaptureSnapshot}
            title="5. Quick Tools: Snapshot (📷) High-Res Render Download"
            className="p-1.5 rounded-xl bg-white/90 text-[#6D6670] hover:text-[#E97A9A] border border-[#F3D3DB] hover:bg-[#FFF0F4] backdrop-blur-md shadow-xs transition-all cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          {/* Feature 4: Tech Spec Modal Trigger */}
          {onOpenTechSpec && (
            <button
              id="btn-viewport-techspec"
              onClick={onOpenTechSpec}
              title="4. Tech Spec: Technical Garment Specification Modal"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/90 hover:bg-[#FFF0F4] text-[#2F2A2E] hover:text-[#E97A9A] border border-[#F3D3DB] backdrop-blur-md shadow-xs transition-all text-[10px] font-mono uppercase tracking-wider cursor-pointer"
            >
              <svg className="w-3.5 h-3.5 text-[#E97A9A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Tech Spec
            </button>
          )}
        </div>
      </div>

      {/* Feature 5: Quick-Switch Texture & Pattern Drawer Overlay */}
      {isPresetDrawerOpen && (
        <div className="absolute top-14 right-3 w-80 max-h-[420px] bg-white/95 border border-[#F3D3DB] rounded-3xl p-4 shadow-2xl backdrop-blur-xl z-20 overflow-y-auto space-y-3 animate-fade-in text-[#2F2A2E]">
          <div className="flex items-center justify-between pb-2 border-b border-[#F3D3DB]">
            <div>
              <span className="text-[9px] font-mono uppercase tracking-widest text-[#E97A9A] block font-bold">
                Quick Preset Grid ⊞
              </span>
              <h4 className="text-xs font-bold text-[#2F2A2E] uppercase tracking-wide">
                Swap Fabric & Textures
              </h4>
            </div>
            <button
              onClick={() => setIsPresetDrawerOpen(false)}
              className="text-[#6D6670] hover:text-[#2F2A2E] text-xs p-1 cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {SAMPLE_GARMENTS.map((g) => (
              <button
                key={g.id}
                onClick={() => {
                  onSelectPresetGarment?.(g);
                  setIsPresetDrawerOpen(false);
                }}
                className="group relative rounded-2xl overflow-hidden border border-[#F3D3DB] hover:border-[#E97A9A] bg-[#FFF8FA] p-1 text-left transition-all hover:scale-[1.02] cursor-pointer"
              >
                <div className="w-full aspect-square rounded-xl overflow-hidden bg-white mb-1 flex items-center justify-center p-1 border border-[#F3D3DB]/50">
                  <img
                    src={g.imageUrl}
                    alt={g.name}
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                  />
                </div>
                <div className="text-[10px] font-semibold text-[#2F2A2E] truncate leading-tight">
                  {g.name}
                </div>
                <div className="text-[8px] font-mono text-[#A39CA8] truncate">
                  {g.silhouette.replace(/_/g, ' ')}
                </div>
              </button>
            ))}
          </div>

          <div className="pt-2 border-t border-[#F3D3DB]">
            <button
              onClick={() => quickUploadInputRef.current?.click()}
              className="w-full py-1.5 text-[10px] font-mono uppercase tracking-wider rounded-xl bg-[#FFF0F4] hover:bg-[#FFE7EE] text-[#E97A9A] font-bold border border-[#F3D3DB] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5 text-[#E97A9A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload Custom Texture File
            </button>
            <input
              ref={quickUploadInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  onUploadCustomImage?.(e.target.files[0]);
                  setIsPresetDrawerOpen(false);
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Floating Bottom HUD Status */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs text-[#6D6670] pointer-events-none z-10">
        <div className="flex items-center gap-2.5 bg-white/90 backdrop-blur-md px-3.5 py-1.5 rounded-2xl border border-[#F3D3DB] shadow-lg pointer-events-auto">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E97A9A] animate-pulse"></span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-[#2F2A2E] font-semibold">
              {settings.silhouette.replace(/_/g, ' ')}
            </span>
          </div>
          <span className="text-[#F3D3DB]">|</span>
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${isBackDetermined ? 'bg-emerald-500' : 'bg-[#E97A9A]'}`}></span>
            <span className="text-[#E97A9A] font-semibold text-[11px]">
              {isBackDetermined ? backStyle.replace(/_/g, ' ').toUpperCase() : 'BACK: UNDETERMINED'}
            </span>
          </div>
          <span className="text-[#F3D3DB]">|</span>
          <span className="text-[#A39CA8] font-mono text-[10px]">{fps} FPS</span>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            id="btn-reset-camera"
            onClick={handleResetCamera}
            className="bg-white/90 hover:bg-[#FFF0F4] text-[#2F2A2E] hover:text-[#E97A9A] text-xs px-3.5 py-1.5 rounded-2xl border border-[#F3D3DB] backdrop-blur-md shadow-xs transition-colors font-mono uppercase tracking-wider text-[10px] font-semibold cursor-pointer"
          >
            Reset Camera
          </button>
        </div>
      </div>
    </div>
  );
};
