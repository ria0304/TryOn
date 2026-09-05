import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Category, Garment, UploadResult, StrapType, FabricFinishType } from '../types';
import {
  Upload, Check, Sparkles, RefreshCw, X, Info, Palette, Eye, Shirt, Scissors
} from 'lucide-react';
import { uploadGarment } from '../lib/api';
import { segmentGarmentFromImage } from '../lib/garmentSegmentation';

interface UploadModalProps {
  onAddGarment: (garment: Garment) => void;
  onSuccess?: () => void;
  preloadedFileUrl?: string | null;
}

// Keep in sync with backend/config.py MAX_UPLOAD_BYTES.
const MAX_UPLOAD_MB = 15;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

const ALL_CATEGORIES: Category[] = [
  'dress', 'top', 'bottom', 'jacket', 'shoes', 'bag', 'jewellery', 'accessories'
];

const CATEGORY_LABELS: Record<Category, string> = {
  dress: 'Dress',
  top: 'Top',
  bottom: 'Bottom',
  jacket: 'Jacket',
  shoes: 'Shoes',
  bag: 'Bag',
  jewellery: 'Jewellery',
  accessories: 'Accessories',
};

const FABRIC_FINISHES: { id: FabricFinishType; label: string; desc: string }[] = [
  { id: 'silk_satin', label: 'Silk & Satin', desc: 'Lustrous sheen & soft reflection' },
  { id: 'cotton_matte', label: 'Matte Cotton', desc: 'Clean, smooth matte finish' },
  { id: 'linen_weave', label: 'Linen Weave', desc: 'Tactile natural woven texture' },
  { id: 'velvet_sheen', label: 'Velvet Sheen', desc: 'Rich, deep pile & subtle glow' },
  { id: 'ribbed_knit', label: 'Ribbed Knit', desc: 'Stretchy structured ribs' },
  { id: 'metallic_lurex', label: 'Metallic / Sequins', desc: 'High specular shimmer' },
];

const STRAP_OPTIONS: { id: StrapType; label: string }[] = [
  { id: 'wide_straps', label: 'Wide Straps / Square Bodice' },
  { id: 'thin_double_straps', label: 'Spaghetti / Double Straps' },
  { id: 'halter_neck', label: 'Halter Neck' },
  { id: 'strapless', label: 'Strapless / Bandeau' },
  { id: 'crossed_straps', label: 'Crossed Back Straps' },
];

// Client-side pixel color & material analyzer for screenshots
function analyzeScreenshotImage(imgElement: HTMLImageElement): {
  dominantHex: string;
  paletteHexes: string[];
  detectedFabric: FabricFinishType;
  detectedCategory: Category;
  detectedStrapType: StrapType;
  brightness: number;
} {
  const canvas = document.createElement('canvas');
  const maxDim = 200;
  let w = imgElement.naturalWidth || imgElement.width || 200;
  let h = imgElement.naturalHeight || imgElement.height || 200;
  if (w > h) {
    h = Math.round((h * maxDim) / w);
    w = maxDim;
  } else {
    w = Math.round((w * maxDim) / h);
    h = maxDim;
  }
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      dominantHex: '#db2777',
      paletteHexes: ['#db2777', '#f43f5e'],
      detectedFabric: 'silk_satin',
      detectedCategory: 'dress',
      detectedStrapType: 'wide_straps',
      brightness: 128,
    };
  }

  ctx.drawImage(imgElement, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h).data;

  const colorBuckets: Record<string, { r: number; g: number; b: number; count: number }> = {};
  let totalR = 0, totalG = 0, totalB = 0, validPixelCount = 0;
  const luminances: number[] = [];

  for (let i = 0; i < imgData.length; i += 16) {
    const r = imgData[i];
    const g = imgData[i + 1];
    const b = imgData[i + 2];
    const a = imgData[i + 3];

    // Filter out transparent or extreme pure white background edges
    if (a < 80) continue;
    if (r > 248 && g > 248 && b > 248) continue;
    if (r < 10 && g < 10 && b < 10) continue;

    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    luminances.push(lum);
    totalR += r;
    totalG += g;
    totalB += b;
    validPixelCount++;

    // Quantize color into buckets of 32
    const qr = Math.floor(r / 32) * 32;
    const qg = Math.floor(g / 32) * 32;
    const qb = Math.floor(b / 32) * 32;
    const key = `${qr},${qg},${qb}`;
    if (!colorBuckets[key]) {
      colorBuckets[key] = { r: qr, g: qg, b: qb, count: 0 };
    }
    colorBuckets[key].count++;
  }

  let dominantHex = '#db2777';
  const sortedBuckets = Object.values(colorBuckets).sort((a, b) => b.count - a.count);
  if (sortedBuckets.length > 0) {
    const top = sortedBuckets[0];
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    dominantHex = `#${toHex(top.r)}${toHex(top.g)}${toHex(top.b)}`;
  } else if (validPixelCount > 0) {
    const avgR = Math.round(totalR / validPixelCount);
    const avgG = Math.round(totalG / validPixelCount);
    const avgB = Math.round(totalB / validPixelCount);
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    dominantHex = `#${toHex(avgR)}${toHex(avgG)}${toHex(avgB)}`;
  }

  const paletteHexes: string[] = sortedBuckets.slice(0, 4).map((b) => {
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${toHex(b.r)}${toHex(b.g)}${toHex(b.b)}`;
  });

  // Calculate luminance variance for fabric sheen detection
  let detectedFabric: FabricFinishType = 'silk_satin';
  if (luminances.length > 0) {
    const meanLum = luminances.reduce((a, b) => a + b, 0) / luminances.length;
    const variance = luminances.reduce((acc, val) => acc + Math.pow(val - meanLum, 2), 0) / luminances.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev > 55) {
      detectedFabric = 'silk_satin'; // High specular contrast = silk/satin
    } else if (stdDev > 35) {
      detectedFabric = 'linen_weave';
    } else {
      detectedFabric = 'cotton_matte';
    }
  }

  // Detect category from aspect ratio
  const aspectRatio = h / Math.max(w, 1);
  let detectedCategory: Category = 'top';
  if (aspectRatio > 1.25) {
    detectedCategory = 'dress';
  } else if (aspectRatio < 0.8) {
    detectedCategory = 'shoes';
  }

  let detectedStrapType: StrapType = 'wide_straps';
  if (detectedCategory === 'dress') {
    detectedStrapType = 'wide_straps';
  }

  return {
    dominantHex,
    paletteHexes: paletteHexes.length ? paletteHexes : [dominantHex],
    detectedFabric,
    detectedCategory,
    detectedStrapType,
    brightness: luminances.length > 0 ? luminances.reduce((a, b) => a + b, 0) / luminances.length : 128,
  };
}

export const UploadModal: React.FC<UploadModalProps> = ({
  onAddGarment,
  onSuccess,
  preloadedFileUrl
}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>('dress');
  const [color, setColor] = useState('#db2777');
  const [paletteColors, setPaletteColors] = useState<string[]>(['#db2777', '#f43f5e', '#ec4899']);
  const [fabricFinish, setFabricFinish] = useState<FabricFinishType>('silk_satin');
  const [fabric, setFabric] = useState<string | undefined>(undefined);
  const [strapType, setStrapType] = useState<StrapType>('wide_straps');
  const [singleImagePreview, setSingleImagePreview] = useState<string | null>(null);
  const [isolatedCutoutUrl, setIsolatedCutoutUrl] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'isolated' | 'original'>('isolated');
  const [singleImageFile, setSingleImageFile] = useState<File | null>(null);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedResult, setDetectedResult] = useState<UploadResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const detectionPromiseRef = useRef<Promise<UploadResult> | null>(null);
  const detectedFileRef = useRef<File | null>(null);

  const processScreenshotAnalysis = useCallback((previewUrl: string) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const seg = segmentGarmentFromImage(img);
        setIsolatedCutoutUrl(seg.cutoutUrl);
        setColor(seg.dominantColor);
        setPaletteColors([seg.dominantColor, seg.strapColor]);
      } catch (err) {
        console.warn('Smart segmentation error, falling back to basic analyzer:', err);
      }

      const analysis = analyzeScreenshotImage(img);
      if (!color) setColor(analysis.dominantHex);
      setFabricFinish(analysis.detectedFabric);
      setCategory(analysis.detectedCategory);
      setStrapType(analysis.detectedStrapType);
    };
    img.src = previewUrl;
  }, [color]);

  const runDetection = (file: File) => {
    detectedFileRef.current = file;
    setDetectedResult(null);
    setIsDetecting(true);
    const promise = uploadGarment(file, false);
    detectionPromiseRef.current = promise;
    promise
      .then((res) => {
        if (detectedFileRef.current !== file) return;
        setDetectedResult(res);
        if (res.suggestedCategory) {
          setCategory(res.suggestedCategory as Category);
        }
        if (res.suggestedColorHex) {
          setColor(res.suggestedColorHex);
        }
        if (res.suggestedFabric) {
          setFabric(res.suggestedFabric);
        }
        if (res.suggestedName && !name.trim()) {
          setName(res.suggestedName);
        }
      })
      .catch((err) => {
        console.warn('Auto-detection fallback active:', err);
      })
      .finally(() => {
        if (detectedFileRef.current === file) setIsDetecting(false);
      });
  };

  useEffect(() => {
    if (preloadedFileUrl) {
      setSingleImagePreview(preloadedFileUrl);
      processScreenshotAnalysis(preloadedFileUrl);
      fetch(preloadedFileUrl)
        .then((res) => res.blob())
        .then((blob) => {
          const file = new File([blob], 'screenshot-garment.png', { type: blob.type });
          setSingleImageFile(file);
          runDetection(file);
        })
        .catch(() => console.warn('Could not fetch preloaded file'));
    }
  }, [preloadedFileUrl, processScreenshotAnalysis]);

  const handleSingleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > MAX_UPLOAD_BYTES) {
        setNotificationMessage(
          `That photo is ${(file.size / (1024 * 1024)).toFixed(1)}MB — please use one under ${MAX_UPLOAD_MB}MB.`
        );
        setShowNotification(true);
        e.target.value = '';
        return;
      }
      setSingleImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        const resultUrl = reader.result as string;
        setSingleImagePreview(resultUrl);
        processScreenshotAnalysis(resultUrl);
      };
      reader.readAsDataURL(file);
      runDetection(file);
    }
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleImageFile && !singleImagePreview) {
      setNotificationMessage('Please upload or drop a garment screenshot');
      setShowNotification(true);
      return;
    }

    setIsSubmitting(true);
    try {
      let uploadRes: UploadResult | null = null;
      let uploadFailed = false;
      if (singleImageFile) {
        if (detectedFileRef.current === singleImageFile && detectionPromiseRef.current) {
          try {
            uploadRes = await detectionPromiseRef.current;
          } catch {
            try {
              uploadRes = await uploadGarment(singleImageFile, false);
            } catch (uploadErr) {
              uploadFailed = true;
              console.error('Garment upload failed:', uploadErr);
            }
          }
        } else {
          try {
            uploadRes = await uploadGarment(singleImageFile, false);
          } catch (uploadErr) {
            uploadFailed = true;
            console.error('Garment upload failed:', uploadErr);
          }
        }
      }

      // If the server upload failed, don't pretend it succeeded — the local
      // preview/cutout is a fallback for display only and was never sent to
      // the backend, so a garment built from it can't be persisted properly.
      if (uploadFailed) {
        setNotificationMessage(
          "Couldn't upload that photo to the server, so it wasn't saved. Check your connection and try again."
        );
        setShowNotification(true);
        setIsSubmitting(false);
        return;
      }

      const imageUrl = uploadRes?.url || singleImagePreview || '';
      // The server cutout is the authoritative, canonical RGBA garment asset.
      // The browser extractor remains a preview fallback only; its synthesized
      // panorama must never replace the real garment asset.
      const cutoutUrl = uploadRes?.cutoutUrl || isolatedCutoutUrl || uploadRes?.url || singleImagePreview || '';
      const warpedUrl = uploadRes?.warpedUrl || undefined;

      const newGarment: Garment = {
        id: `custom-${Date.now()}`,
        name: name.trim() || `Custom ${CATEGORY_LABELS[category]}`,
        category,
        color,
        style: fabricFinish,
        fabric,
        imageUrl,
        cutoutUrl,
        warpedUrl,
        canonicalAsset: uploadRes?.canonicalAsset,
        strapType,
        backStyle: strapType === 'halter_neck' ? 'tie_back' : strapType === 'crossed_straps' ? 'crossed_back' : 'open_back',
        isCustom: true,
        createdAt: new Date().toISOString(),
      };

      onAddGarment(newGarment);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('Failed to upload garment:', err);
      setNotificationMessage(err?.message || "Something went wrong and the garment wasn't saved. Please try again.");
      setShowNotification(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-[#F3D3DB] rounded-3xl p-8 shadow-sm max-w-4xl mx-auto relative overflow-hidden">
      {/* Toast Notification */}
      {showNotification && (
        <div className="absolute top-4 right-4 z-50 bg-[#111827] text-white text-xs px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-fadeIn">
          <span>⚠️ {notificationMessage}</span>
          <button onClick={() => setShowNotification(false)}><X className="w-3 h-3" /></button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        {/* Left: Upload Screenshot & Live Extraction Preview */}
        <div className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-[#2F2A2E] flex items-center gap-2">
              <Shirt className="w-5 h-5 text-[#E97A9A]" />
              <span>1. Upload Screenshot</span>
            </h3>
            <p className="text-xs text-[#6D6670]">
              Upload any screenshot from Pinterest, Zara, ASOS, Instagram or your gallery. The exact material, color, and silhouette will be extracted and wrapped in 3D.
            </p>
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            className={`aspect-square border-2 border-dashed rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all ${
              singleImagePreview
                ? 'border-[#E97A9A] bg-[#FFF8FA]'
                : 'border-[#F3D3DB] hover:border-[#E97A9A]/50 bg-[#FFF8FA]/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleSingleFileChange}
              className="hidden"
            />

            {singleImagePreview ? (
              <div className="w-full h-full p-4 relative group flex flex-col items-center justify-center">
                <img
                  src={previewMode === 'isolated' && isolatedCutoutUrl ? isolatedCutoutUrl : singleImagePreview}
                  alt="Garment Preview"
                  className="w-full h-full object-contain rounded-2xl drop-shadow-md"
                />
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center gap-2">
                  <span className="text-white text-xs font-bold bg-[#E97A9A] px-4 py-2 rounded-full shadow-lg">
                    Replace Screenshot
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center space-y-4 p-6">
                <div className="w-16 h-16 mx-auto rounded-full bg-[#F8D7DE] flex items-center justify-center text-[#E97A9A] shadow-inner">
                  <Upload className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#2F2A2E]">Click to select or drag screenshot here</p>
                  <p className="text-[11px] text-[#6D6670] mt-1">PNG, JPG, WebP from web stores or photos</p>
                </div>
              </div>
            )}
          </div>

          {/* Extracted Color Swatches & Material Badge */}
          {singleImagePreview && (
            <div className="space-y-3">
              {/* Isolated Garment View Switcher */}
              <div className="flex items-center justify-between bg-[#FFF0F4] border border-[#F3D3DB] rounded-2xl p-2">
                <div className="flex items-center gap-1.5 px-2">
                  <Scissors className="w-3.5 h-3.5 text-[#E97A9A]" />
                  <span className="text-[11px] font-bold text-[#2F2A2E]">Preview Mode:</span>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setPreviewMode('isolated')}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-xl transition-all cursor-pointer ${
                      previewMode === 'isolated'
                        ? 'bg-[#E97A9A] text-white shadow-xs'
                        : 'text-[#6D6670] hover:text-[#2F2A2E]'
                    }`}
                  >
                    Garment Only Cutout
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode('original')}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-xl transition-all cursor-pointer ${
                      previewMode === 'original'
                        ? 'bg-[#E97A9A] text-white shadow-xs'
                        : 'text-[#6D6670] hover:text-[#2F2A2E]'
                    }`}
                  >
                    Original Photo
                  </button>
                </div>
              </div>

              <div className="bg-[#FFF5F8] border border-[#F3D3DB] rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#2F2A2E] flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-[#E97A9A]" />
                    Extracted Material & Colors
                  </span>
                  <span className="text-[10px] font-semibold text-[#E97A9A] bg-[#FFF0F4] px-2 py-0.5 rounded-md border border-[#F3D3DB]">
                    Skin & BG Stripped
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-xl border border-black/10 shadow-xs shrink-0"
                    style={{ backgroundColor: color }}
                    title={`Selected Dominant Tone: ${color}`}
                  />
                  <div className="flex items-center gap-1.5 flex-1">
                    {paletteColors.map((hex, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setColor(hex)}
                        className={`w-6 h-6 rounded-lg border transition-all cursor-pointer ${
                          color.toLowerCase() === hex.toLowerCase()
                            ? 'ring-2 ring-[#E97A9A] scale-110'
                            : 'border-black/10 hover:scale-105'
                        }`}
                        style={{ backgroundColor: hex }}
                        title={`Select tone: ${hex}`}
                      />
                    ))}
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="w-6 h-6 rounded-lg cursor-pointer border-0 bg-transparent"
                      title="Custom Color Picker"
                    />
                  </div>
                  <span className="font-mono text-[11px] text-[#6D6670]">{color}</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3 p-3.5 bg-blue-50 rounded-2xl border border-blue-100">
            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-blue-700 leading-relaxed">
              <strong>Exact Fit Guarantee:</strong> The screenshot is mapped onto the 3D dressform with 360° tailored draping, genuine fabric sheen, and 3D shoulder straps matching your screenshot.
            </p>
          </div>
        </div>

        {/* Right: Category, Material & Silhouette Confirmation */}
        <div className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-[#2F2A2E]">2. Confirm Draping & Finish</h3>
            <p className="text-xs text-[#6D6670]">Confirm the category, strap style, and fabric texture.</p>
          </div>

          <div className="space-y-5">
            {/* Category Selector */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-[#6D6670] uppercase tracking-wider">Garment Category</label>
              <div className="grid grid-cols-4 gap-2">
                {ALL_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`px-2.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      category === cat
                        ? 'bg-[#E97A9A] text-white border-[#E97A9A] shadow-xs'
                        : 'bg-[#FFF8FA] text-[#6D6670] border-[#F3D3DB] hover:border-[#E97A9A]/40'
                    }`}
                  >
                    {CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>
            </div>

            {/* Fabric Material / Finish Selector */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-[#6D6670] uppercase tracking-wider">
                Fabric Material & Sheen
              </label>
              <div className="grid grid-cols-2 gap-2">
                {FABRIC_FINISHES.map((fab) => (
                  <button
                    key={fab.id}
                    type="button"
                    onClick={() => setFabricFinish(fab.id)}
                    className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                      fabricFinish === fab.id
                        ? 'bg-[#FFF0F4] border-[#E97A9A] shadow-xs'
                        : 'bg-[#FFF8FA] border-[#F3D3DB] hover:border-[#E97A9A]/30'
                    }`}
                  >
                    <div className="text-xs font-bold text-[#2F2A2E]">{fab.label}</div>
                    <div className="text-[10px] text-[#6D6670] leading-tight">{fab.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 3D Strap / Neckline Type (for Dresses & Tops) */}
            {(category === 'dress' || category === 'top') && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-[#6D6670] uppercase tracking-wider">
                  3D Shoulder Straps & Bodice Cut
                </label>
                <div className="space-y-1.5">
                  {STRAP_OPTIONS.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setStrapType(st.id)}
                      className={`w-full px-3 py-2 rounded-xl text-left text-xs font-medium border transition-all cursor-pointer flex items-center justify-between ${
                        strapType === st.id
                          ? 'bg-[#E97A9A] text-white border-[#E97A9A] shadow-xs'
                          : 'bg-[#FFF8FA] text-[#6D6670] border-[#F3D3DB] hover:border-[#E97A9A]/30'
                      }`}
                    >
                      <span>{st.label}</span>
                      {strapType === st.id && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Garment Name Input */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-[#6D6670] uppercase tracking-wider">Garment Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`e.g., Floral ${CATEGORY_LABELS[category]}`}
                className="w-full px-4 py-2.5 bg-[#FFF8FA] border border-[#F3D3DB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#E97A9A] text-sm text-[#2F2A2E]"
              />
            </div>

            {isDetecting && (
              <div className="flex items-center gap-3 p-3.5 bg-[#FFF8FA] rounded-2xl border border-[#F3D3DB]">
                <RefreshCw className="w-4 h-4 text-[#E97A9A] animate-spin" />
                <span className="text-xs font-medium text-[#2F2A2E]">Analyzing screenshot material & colors...</span>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              onClick={handleSingleSubmit}
              disabled={isSubmitting || (!singleImageFile && !singleImagePreview)}
              className={`w-full py-4 rounded-2xl text-sm font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer ${
                isSubmitting || (!singleImageFile && !singleImagePreview)
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-[#111827] text-white hover:bg-[#1f2937] hover:shadow-lg'
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Draping Outfit in 3D...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-[#E97A9A]" />
                  <span>Equip to 3D Mannequin & Save</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
