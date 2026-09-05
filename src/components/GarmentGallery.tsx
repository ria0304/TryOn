import React, { useRef } from 'react';
import { SAMPLE_GARMENTS } from '../data/sampleGarments';
import { GarmentItem } from '../types';

interface GarmentGalleryProps {
  selectedGarmentId: string | null;
  onSelectGarment: (garment: GarmentItem) => void;
  onUploadCustomImage: (file: File) => void;
}

export const GarmentGallery: React.FC<GarmentGalleryProps> = ({
  selectedGarmentId,
  onSelectGarment,
  onUploadCustomImage,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onUploadCustomImage(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUploadCustomImage(e.target.files[0]);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-5 border border-[#F3D3DB] shadow-sm space-y-4 text-[#2F2A2E]">
      {/* Header & Upload Bar */}
      <div className="flex items-center justify-between pb-3 border-b border-[#F3D3DB]">
        <div>
          <span className="text-[10px] font-mono tracking-widest uppercase text-[#E97A9A] block font-bold">
            Garment Library & Input
          </span>
          <h3 className="text-sm sm:text-base font-bold tracking-wide uppercase text-[#2F2A2E] mt-0.5">
            Select or Upload 2D Image
          </h3>
        </div>

        <button
          id="btn-upload-file"
          onClick={() => fileInputRef.current?.click()}
          className="px-3.5 py-1.5 rounded-xl border border-[#F3D3DB] hover:border-[#E97A9A] bg-[#FFF0F4] hover:bg-[#FFE7EE] text-[#E97A9A] text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <svg className="w-3.5 h-3.5 text-[#E97A9A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Upload Image
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Drag and Drop Zone */}
      <div
        id="dropzone-garment-upload"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef.current?.click()}
        className="border border-dashed border-[#F3D3DB] hover:border-[#E97A9A] bg-[#FFF8FA] hover:bg-[#FFF0F4] rounded-2xl p-4 text-center cursor-pointer transition-all flex items-center justify-center gap-3 group"
      >
        <div className="w-9 h-9 rounded-xl bg-white border border-[#F3D3DB] group-hover:border-[#E97A9A] group-hover:text-[#E97A9A] flex items-center justify-center text-[#A39CA8] transition-colors shadow-xs">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <div className="text-left">
          <p className="text-xs font-semibold text-[#2F2A2E] group-hover:text-[#E97A9A] transition-colors">
            Drag & drop 2D garment photo here, or click to browse
          </p>
          <p className="text-[10px] text-[#A39CA8] uppercase tracking-wider mt-0.5">
            PNG, JPG, WebP • Front-facing dresses, gowns, tops
          </p>
        </div>
      </div>

      {/* Preset Garments Grid */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#6D6670]">
            Garment Strap Test Bench & Preset Archive
          </div>
          <span className="text-[10px] text-[#E97A9A] font-bold">
            Anti-Hallucination Verified
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
          {SAMPLE_GARMENTS.map((item) => {
            const isSelected = selectedGarmentId === item.id;
            const isDetermined = item.backDeterminationStatus !== 'insufficient_straps' && item.backDeterminationStatus !== 'ambiguous' && item.backStyle !== 'undetermined';

            return (
              <button
                key={item.id}
                id={`preset-${item.id}`}
                onClick={() => onSelectGarment(item)}
                className={`relative text-left rounded-2xl p-2.5 border transition-all group overflow-hidden cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'border-[#E97A9A] bg-[#FFF0F4] ring-2 ring-[#E97A9A]/30 shadow-md'
                    : 'border-[#F3D3DB] bg-[#FFF8FA] hover:bg-[#FFF0F4] hover:border-[#E97A9A]'
                }`}
              >
                <div>
                  <div className="w-full aspect-3/4 rounded-xl overflow-hidden bg-white mb-2 relative border border-[#F3D3DB] flex items-center justify-center p-1 shadow-xs">
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                    />
                    {isSelected && (
                      <span className="absolute top-1 right-1 w-4 h-4 bg-[#E97A9A] text-white rounded-full flex items-center justify-center shadow-xs">
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                    )}

                    <div className="absolute bottom-1 left-1 right-1">
                      <span
                        className={`text-[8px] font-bold px-1 py-0.5 rounded-md block text-center truncate ${
                          isDetermined
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                            : 'bg-rose-100 text-rose-700 border border-rose-300'
                        }`}
                      >
                        {isDetermined ? '✓ Determined' : '⚠ Undetermined'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-[#2F2A2E] truncate leading-tight">
                      {item.name}
                    </div>
                    <div className="text-[10px] text-[#A39CA8] line-clamp-1">
                      {item.category}
                    </div>
                  </div>
                </div>

                <div className="mt-2 pt-1.5 border-t border-[#F3D3DB] flex items-center justify-between text-[9px] font-semibold text-[#6D6670]">
                  <span>{item.strapType === 'thin_double_straps' ? '2 Straps' : item.strapType === 'halter_neck' ? 'Halter' : item.strapType === 'wide_straps' ? 'Wide' : item.strapType === 'crossed_straps' ? 'Crossed' : 'Unknown'}</span>
                  <span className={isDetermined ? 'text-emerald-600 font-bold' : 'text-[#E97A9A] font-bold'}>
                    {isDetermined ? item.backStyle.replace('_back', '') : 'No Guess'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
