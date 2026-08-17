import React, { useState, useRef, useEffect } from 'react';
import { Category, Garment, UploadResult } from '../types';
import {
  Upload, Check, Sparkles, RefreshCw, X, Info
} from 'lucide-react';
import { uploadGarment } from '../lib/api';

interface UploadModalProps {
  onAddGarment: (garment: Garment) => void;
  onSuccess?: () => void;
  preloadedFileUrl?: string | null;
}

const ALL_CATEGORIES: Category[] = [
  'top', 'bottom', 'dress', 'jacket', 'shoes', 'bag', 'jewellery', 'accessories'
];

const CATEGORY_LABELS: Record<Category, string> = {
  top: 'Top',
  bottom: 'Bottom',
  dress: 'Dress',
  jacket: 'Jacket',
  shoes: 'Shoes',
  bag: 'Bag',
  jewellery: 'Jewellery',
  accessories: 'Accessories',
};

export const UploadModal: React.FC<UploadModalProps> = ({
  onAddGarment,
  onSuccess,
  preloadedFileUrl
}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>('top');
  const [color, setColor] = useState('#db2777');
  const [singleImagePreview, setSingleImagePreview] = useState<string | null>(null);
  const [singleImageFile, setSingleImageFile] = useState<File | null>(null);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedResult, setDetectedResult] = useState<UploadResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const detectionPromiseRef = useRef<Promise<UploadResult> | null>(null);
  const detectedFileRef = useRef<File | null>(null);

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
        if (res.suggestedName && !name.trim()) {
          setName(res.suggestedName);
        }
      })
      .catch((err) => {
        console.warn('Auto-detection failed:', err);
      })
      .finally(() => {
        if (detectedFileRef.current === file) setIsDetecting(false);
      });
  };

  useEffect(() => {
    if (preloadedFileUrl) {
      setSingleImagePreview(preloadedFileUrl);
      fetch(preloadedFileUrl)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], 'dropped-garment.png', { type: blob.type });
          setSingleImageFile(file);
          runDetection(file);
        })
        .catch(() => console.warn('Could not fetch preloaded file'));
    }
  }, [preloadedFileUrl]);

  const handleSingleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSingleImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setSingleImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      runDetection(file);
    }
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleImageFile) {
      setNotificationMessage('Please upload a garment photo');
      setShowNotification(true);
      return;
    }

    setIsSubmitting(true);
    try {
      let uploadRes: UploadResult;
      if (detectedFileRef.current === singleImageFile && detectionPromiseRef.current) {
        try {
          uploadRes = await detectionPromiseRef.current;
        } catch {
          uploadRes = await uploadGarment(singleImageFile, false);
        }
      } else {
        uploadRes = await uploadGarment(singleImageFile, false);
      }
      
      const newGarment: Garment = {
        id: `custom-${Date.now()}`,
        name: name.trim() || `My ${CATEGORY_LABELS[category]}`,
        category,
        color,
        style: 'custom',
        imageUrl: uploadRes.url,
        cutoutUrl: uploadRes.cutoutUrl || uploadRes.url,
        warpedUrl: uploadRes.warpedUrl,
        isCustom: true,
        createdAt: new Date().toISOString(),
      };

      onAddGarment(newGarment);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('Failed to upload garment:', err);
      setNotificationMessage('Failed to process garment photo');
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
        {/* Left: Upload Zone */}
        <div className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-[#2F2A2E]">1. Upload Screenshot</h3>
            <p className="text-xs text-[#6D6670]">Upload a screenshot from Pinterest, Instagram, or a web store.</p>
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
              <div className="w-full h-full p-4 relative group">
                <img
                  src={singleImagePreview}
                  alt="Garment Preview"
                  className="w-full h-full object-contain rounded-2xl"
                />
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center">
                  <span className="text-white text-xs font-bold bg-[#E97A9A] px-3 py-1.5 rounded-full">Replace Photo</span>
                </div>
              </div>
            ) : (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-[#F8D7DE] flex items-center justify-center text-[#E97A9A]">
                  <Upload className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#2F2A2E]">Click to select or drag & drop</p>
                  <p className="text-[10px] text-[#6D6670] mt-1">PNG, JPG or WebP</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-2xl border border-blue-100">
            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-[10px] text-blue-700 leading-relaxed">
              <strong>Tip:</strong> For best results, use screenshots where the garment is clearly visible against a relatively simple background. Our AI will automatically remove the background for you.
            </p>
          </div>
        </div>

        {/* Right: Metadata & Processing */}
        <div className="space-y-8">
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-[#2F2A2E]">2. Confirm Details</h3>
            <p className="text-xs text-[#6D6670]">We've automatically detected these details. Feel free to adjust.</p>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-[#6D6670] uppercase tracking-wider">Garment Category</label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`px-3 py-2.5 rounded-xl text-xs font-medium border transition-all ${
                      category === cat
                        ? 'bg-[#E97A9A] text-white border-[#E97A9A] shadow-sm'
                        : 'bg-[#FFF8FA] text-[#6D6670] border-[#F3D3DB] hover:border-[#E97A9A]/30'
                    }`}
                  >
                    {CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-[#6D6670] uppercase tracking-wider">Garment Name (Optional)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`e.g., White Silk ${CATEGORY_LABELS[category]}`}
                className="w-full px-4 py-3 bg-[#FFF8FA] border border-[#F3D3DB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#E97A9A] text-sm"
              />
            </div>

            {isDetecting && (
              <div className="flex items-center gap-3 p-4 bg-[#FFF8FA] rounded-2xl border border-[#F3D3DB]">
                <RefreshCw className="w-4 h-4 text-[#E97A9A] animate-spin" />
                <span className="text-xs font-medium text-[#2F2A2E]">AI is extracting garment details...</span>
              </div>
            )}

            {!isDetecting && detectedResult && (
              <div className="flex items-center gap-3 p-4 bg-green-50 rounded-2xl border border-green-100">
                <Check className="w-4 h-4 text-green-500" />
                <span className="text-xs font-medium text-green-700">Garment successfully analyzed!</span>
              </div>
            )}
          </div>

          <div className="pt-4">
            <button
              onClick={handleSingleSubmit}
              disabled={isSubmitting || !singleImageFile}
              className={`w-full py-4 rounded-2xl text-sm font-bold transition-all shadow-md flex items-center justify-center gap-2 ${
                isSubmitting || !singleImageFile
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-[#111827] text-white hover:bg-[#1f2937]'
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Extracting & Saving...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-[#E97A9A]" />
                  <span>Add to My Library</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
