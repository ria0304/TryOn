import { useEffect, useState } from 'react';
import * as THREE from 'three';

export interface FrontTextureResult {
  texture: THREE.Texture | null;
  fabricTexture: THREE.Texture | null;
  dominantColor: string;
  failed: boolean;
}

function toHex(n: number): string {
  return n.toString(16).padStart(2, '0');
}

export function useFrontGarmentTexture(
  url: string | undefined,
  fallbackColor?: string
): FrontTextureResult {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [fabricTexture, setFabricTexture] = useState<THREE.Texture | null>(null);
  const [dominantColor, setDominantColor] = useState<string>(fallbackColor || '#f8fafc');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!url) {
      setTexture(null);
      setFabricTexture(null);
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
        const scanCanvas = document.createElement('canvas');
        scanCanvas.width = srcW;
        scanCanvas.height = srcH;
        const scanCtx = scanCanvas.getContext('2d');
        if (!scanCtx) {
          setFailed(true);
          return;
        }

        scanCtx.drawImage(img, 0, 0, srcW, srcH);
        const imgData = scanCtx.getImageData(0, 0, srcW, srcH).data;

        let minX = srcW;
        let maxX = 0;
        let minY = srcH;
        let maxY = 0;
        let totalR = 0;
        let totalG = 0;
        let totalB = 0;
        let sampleCount = 0;

        for (let y = 0; y < srcH; y++) {
          for (let x = 0; x < srcW; x++) {
            const idx = (y * srcW + x) * 4;
            const a = imgData[idx + 3];
            const r = imgData[idx];
            const g = imgData[idx + 1];
            const b = imgData[idx + 2];
            const isWhite = r > 246 && g > 246 && b > 246;
            const isBlack = r < 12 && g < 12 && b < 12;
            if (a > 40 && !isWhite && !isBlack) {
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

        if (minX >= maxX || minY >= maxY || sampleCount < 100) {
          minX = 0;
          maxX = srcW;
          minY = 0;
          maxY = srcH;
        }

        const avgR = sampleCount > 0 ? Math.round(totalR / sampleCount) : 220;
        const avgG = sampleCount > 0 ? Math.round(totalG / sampleCount) : 220;
        const avgB = sampleCount > 0 ? Math.round(totalB / sampleCount) : 220;
        setDominantColor(`#${toHex(avgR)}${toHex(avgG)}${toHex(avgB)}`);

        // Inpaint any fully-transparent "holes" (e.g. from upstream background/
        // head/limb removal) so they never render as solid black. Upstream
        // cutouts commonly zero out RGB *and* alpha for discarded pixels; if we
        // draw those verbatim onto an opaque (transparent:false) material, the
        // renderer shows literal black instead of garment fabric. We fill each
        // hole with the nearest valid fabric color in the same column (carried
        // forward top-to-bottom, then backfilled for any leading gap) so holes
        // read as plausible fabric instead of a rendering artifact.
        const HOLE_ALPHA_THRESHOLD = 40;
        for (let x = 0; x < srcW; x++) {
          let lastR = -1, lastG = -1, lastB = -1;
          let firstR = -1, firstG = -1, firstB = -1;
          for (let y = 0; y < srcH; y++) {
            const idx = (y * srcW + x) * 4;
            const a = imgData[idx + 3];
            if (a > HOLE_ALPHA_THRESHOLD) {
              lastR = imgData[idx];
              lastG = imgData[idx + 1];
              lastB = imgData[idx + 2];
              if (firstR === -1) {
                firstR = lastR;
                firstG = lastG;
                firstB = lastB;
              }
            } else if (lastR !== -1) {
              imgData[idx] = lastR;
              imgData[idx + 1] = lastG;
              imgData[idx + 2] = lastB;
              imgData[idx + 3] = 255;
            }
          }
          if (firstR !== -1) {
            // Backfill any leading transparent run at the top of the column
            // (e.g. a blanked-out neckline/strap area) with the first valid
            // color found further down the same column.
            for (let y = 0; y < srcH; y++) {
              const idx = (y * srcW + x) * 4;
              if (imgData[idx + 3] > HOLE_ALPHA_THRESHOLD) break;
              imgData[idx] = firstR;
              imgData[idx + 1] = firstG;
              imgData[idx + 2] = firstB;
              imgData[idx + 3] = 255;
            }
          } else {
            // Entire column had no valid fabric pixel at all — fall back to
            // the overall dominant color rather than leaving it black.
            for (let y = 0; y < srcH; y++) {
              const idx = (y * srcW + x) * 4;
              imgData[idx] = avgR;
              imgData[idx + 1] = avgG;
              imgData[idx + 2] = avgB;
              imgData[idx + 3] = 255;
            }
          }
        }
        scanCtx.putImageData(new ImageData(imgData, srcW, srcH), 0, 0);

        const cropW = Math.max(1, maxX - minX);
        const cropH = Math.max(1, maxY - minY);
        const target = document.createElement('canvas');
        target.width = 1024;
        target.height = 1024;
        const ctx = target.getContext('2d');
        if (!ctx) {
          setFailed(true);
          return;
        }

        ctx.clearRect(0, 0, 1024, 1024);
        ctx.drawImage(scanCanvas, minX, minY, cropW, cropH, 0, 0, 1024, 1024);

        const tex = new THREE.CanvasTexture(target);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;

        const patchSize = Math.max(32, Math.min(cropW, cropH, 160));
        const px = minX + Math.floor((cropW - patchSize) / 2);
        const py = minY + Math.floor((cropH - patchSize) / 2);
        const swatch = document.createElement('canvas');
        swatch.width = 256;
        swatch.height = 256;
        const swCtx = swatch.getContext('2d');
        if (swCtx) {
          swCtx.fillStyle = `#${toHex(avgR)}${toHex(avgG)}${toHex(avgB)}`;
          swCtx.fillRect(0, 0, 256, 256);
          swCtx.drawImage(scanCanvas, px, py, patchSize, patchSize, 0, 0, 256, 256);
          swCtx.fillStyle = 'rgba(0,0,0,0.06)';
          swCtx.fillRect(124, 0, 8, 256);
        }
        const fabric = new THREE.CanvasTexture(swatch);
        fabric.colorSpace = THREE.SRGBColorSpace;
        fabric.wrapS = THREE.RepeatWrapping;
        fabric.wrapT = THREE.RepeatWrapping;
        fabric.repeat.set(2, 3);
        fabric.needsUpdate = true;

        setTexture(tex);
        setFabricTexture(fabric);
        setFailed(false);
      } catch {
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
  }, [url, fallbackColor]);

  return { texture, fabricTexture, dominantColor, failed };
}
