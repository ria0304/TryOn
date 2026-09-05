import React from 'react';
import { AnalysisResult, StrapType, BackStyleType } from '../types';

interface AnalysisPanelProps {
  analysis: AnalysisResult | null;
  isAnalyzing: boolean;
  onApplyToMannequin: () => void;
  onOverrideStrapType: (strapType: StrapType, backStyle: BackStyleType) => void;
  backendEngine?: 'python_fastapi' | 'client_cv';
  isPythonAvailable?: boolean;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  analysis,
  isAnalyzing,
  onApplyToMannequin,
  onOverrideStrapType,
  backendEngine = 'python_fastapi',
  isPythonAvailable = false,
}) => {
  if (isAnalyzing) {
    return (
      <div className="bg-white rounded-3xl p-6 border border-[#F3D3DB] shadow-sm flex flex-col items-center justify-center min-h-[360px] text-center">
        <div className="w-12 h-12 border-3 border-[#E97A9A] border-t-transparent rounded-full animate-spin mb-4"></div>
        <h4 className="text-sm font-bold uppercase tracking-widest text-[#E97A9A] mb-1">Analyzing Garment Pixels...</h4>
        <p className="text-xs text-[#6D6670] max-w-xs">
          Scanning upper 6%–28% shoulder region, inspecting neckline contour, computing strap width ratios, and determining back structure...
        </p>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="bg-white rounded-3xl p-6 border border-[#F3D3DB] shadow-sm flex flex-col items-center justify-center min-h-[360px] text-center">
        <div className="w-12 h-12 bg-[#FFF0F4] border border-[#F3D3DB] rounded-full flex items-center justify-center text-[#E97A9A] mb-3">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
          </svg>
        </div>
        <h4 className="text-sm font-bold uppercase tracking-widest text-[#2F2A2E] mb-1">No Image Analyzed</h4>
        <p className="text-xs text-[#6D6670] max-w-xs">
          Upload a garment photograph or select a preset from the gallery to inspect strap heuristics, neckline profile, and back construction.
        </p>
      </div>
    );
  }

  const confidencePercentage = Math.round(analysis.confidence * 100);
  const strapConfPct = Math.round((analysis.strapConfidence ?? analysis.confidence) * 100);
  const necklineConfPct = Math.round((analysis.necklineConfidence ?? analysis.confidence) * 100);
  const backConfPct = Math.round((analysis.backConfidence ?? analysis.confidence) * 100);

  return (
    <div className="bg-white rounded-3xl p-5 border border-[#F3D3DB] shadow-sm space-y-4 text-[#2F2A2E]">
      {/* Header & Overall Confidence Badge */}
      <div className="flex items-center justify-between pb-3 border-b border-[#F3D3DB]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono tracking-widest uppercase text-[#E97A9A] block font-bold">
              Computer Vision Analysis
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider bg-[#FFF0F4] text-[#E97A9A] border border-[#F3D3DB]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E97A9A]"></span>
              {backendEngine === 'python_fastapi' || isPythonAvailable ? 'Python CV Engine' : 'Client CV Engine'}
            </span>
          </div>
          <h3 className="text-sm sm:text-base font-bold tracking-wide uppercase text-[#2F2A2E] mt-0.5">
            Strap & Silhouette Heuristics
          </h3>
        </div>
        <div className="text-right">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-[#FFF0F4] text-[#E97A9A] border border-[#F3D3DB]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E97A9A] animate-pulse"></span>
            {confidencePercentage}% Overall
          </span>
        </div>
      </div>

      {/* Strict Anti-Hallucination Warnings */}
      {analysis.antiHallucinationWarnings && analysis.antiHallucinationWarnings.length > 0 && (
        <div className="bg-[#FFF0F4] border border-[#F3D3DB] rounded-2xl p-3.5 space-y-2">
          <div className="flex items-center gap-2 text-[#E97A9A] text-xs font-bold uppercase">
            <svg className="w-4 h-4 text-[#E97A9A] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Anti-Hallucination Guardrail Active</span>
          </div>
          <ul className="space-y-1 text-xs text-[#6D6670] list-disc list-inside">
            {analysis.antiHallucinationWarnings.map((warn, i) => (
              <li key={i}>{warn}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Main Multi-Metric Breakdown Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {/* 1. Strap Geometry */}
        <div className="bg-[#FFF8FA] rounded-2xl p-3.5 border border-[#F3D3DB] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-[#6D6670] mb-1">
              <span>Straps</span>
              <span className="text-[#E97A9A] font-bold">{strapConfPct}%</span>
            </div>
            <div className="text-xs font-bold text-[#2F2A2E] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E97A9A]"></span>
              {analysis.strapTypeLabel}
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-[#F3D3DB] space-y-1 text-[11px] text-[#6D6670]">
            <div className="flex justify-between">
              <span>Count:</span>
              <span className="font-semibold text-[#2F2A2E]">{analysis.strapCount} {analysis.strapCount === 1 ? 'band' : 'straps'}</span>
            </div>
            <div className="flex justify-between">
              <span>Width:</span>
              <span className="font-semibold text-[#2F2A2E]">
                {analysis.strapWidthPx ? `${analysis.strapWidthPx}px` : `${(analysis.averageStrapWidthRatio * 100).toFixed(1)}%`}
              </span>
            </div>
          </div>
        </div>

        {/* 2. Neckline Profile */}
        <div className="bg-[#FFF8FA] rounded-2xl p-3.5 border border-[#F3D3DB] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-[#6D6670] mb-1">
              <span>Neckline</span>
              <span className="text-[#E97A9A] font-bold">{necklineConfPct}%</span>
            </div>
            <div className="text-xs font-bold text-[#2F2A2E] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E97A9A]"></span>
              {analysis.necklineShape ? `${analysis.necklineShape.toUpperCase()} CUT` : 'SQUARE / SCOOP'}
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-[#F3D3DB] space-y-1 text-[11px] text-[#6D6670]">
            <div className="flex justify-between">
              <span>Visibility:</span>
              <span className="font-semibold text-[#2F2A2E]">{analysis.shoulderAreaVisibility.replace(/_/g, ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span>Shoulder Span:</span>
              <span className="font-semibold text-[#2F2A2E]">{(analysis.shoulderSpanRatio * 100).toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* 3. Back Construction */}
        <div className="bg-[#FFF8FA] rounded-2xl p-3.5 border border-[#F3D3DB] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-[#6D6670] mb-1">
              <span>Back Style</span>
              <span className={`${analysis.isBackDetermined ? 'text-emerald-500' : 'text-[#E97A9A]'} font-bold`}>
                {backConfPct}%
              </span>
            </div>
            <div className="text-xs font-bold text-[#2F2A2E] flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${analysis.isBackDetermined ? 'bg-emerald-500' : 'bg-[#E97A9A]'}`}></span>
              {analysis.backStyleLabel}
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-[#F3D3DB] space-y-1 text-[11px] text-[#6D6670]">
            <div className="flex justify-between">
              <span>Status:</span>
              <span className={`font-semibold ${analysis.isBackDetermined ? 'text-emerald-600' : 'text-[#E97A9A]'}`}>
                {analysis.isBackDetermined ? 'Determined' : 'Undetermined'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>3D Geometry:</span>
              <span className="font-semibold text-[#2F2A2E]">
                {analysis.isBackDetermined ? 'Reconstructed' : 'Refused / Safe'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* CV Debug Mask & Color Segmentation */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[#6D6670]">
          <span>Strap Scan Mask (6%–28% Slice)</span>
          <div className="flex items-center gap-2 text-[10px] text-[#A39CA8]">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-xs bg-[#E97A9A] inline-block"></span> Strap Pixels
            </span>
          </div>
        </div>

        {analysis.debugMaskDataUrl && (
          <div className="relative rounded-2xl overflow-hidden border border-[#F3D3DB] bg-[#FFF8FA] max-h-44 flex items-center justify-center p-2">
            <img
              src={analysis.debugMaskDataUrl}
              alt="Computer Vision Strap Segmentation Mask"
              className="max-h-40 w-auto object-contain rounded-xl"
            />
          </div>
        )}
      </div>

      {/* Heuristic Explanation */}
      <div className="bg-[#FFF8FA] rounded-2xl p-4 border border-[#F3D3DB] text-xs text-[#2F2A2E] leading-relaxed">
        <p className="uppercase tracking-wider font-bold text-[#E97A9A] mb-1 flex items-center gap-1.5 text-[11px]">
          <svg className="w-3.5 h-3.5 text-[#E97A9A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Reconstruction Rationale
        </p>
        <p className="text-[#6D6670]">{analysis.explanation}</p>

        {analysis.detectedFeatures.length > 0 && (
          <ul className="mt-2 space-y-1 text-[11px] text-[#A39CA8] list-disc list-inside">
            {analysis.detectedFeatures.map((feat, i) => (
              <li key={i}>{feat}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Manual Classification Override Switcher */}
      <div className="pt-1">
        <div className="text-[10px] font-bold uppercase tracking-widest text-[#6D6670] mb-2">Manual Style Override</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          <button
            id="btn-override-thin"
            onClick={() => onOverrideStrapType('thin_double_straps', 'open_back')}
            className={`px-2 py-1.5 text-[11px] font-semibold rounded-xl border transition-all text-center cursor-pointer ${
              analysis.strapType === 'thin_double_straps'
                ? 'bg-[#E97A9A] text-white border-[#E97A9A] font-bold shadow-xs'
                : 'bg-[#FFF8FA] text-[#6D6670] border-[#F3D3DB] hover:border-[#E97A9A] hover:bg-[#FFF0F4] hover:text-[#E97A9A]'
            }`}
          >
            Thin Straps
          </button>
          <button
            id="btn-override-halter"
            onClick={() => onOverrideStrapType('halter_neck', 'tie_back')}
            className={`px-2 py-1.5 text-[11px] font-semibold rounded-xl border transition-all text-center cursor-pointer ${
              analysis.strapType === 'halter_neck'
                ? 'bg-[#E97A9A] text-white border-[#E97A9A] font-bold shadow-xs'
                : 'bg-[#FFF8FA] text-[#6D6670] border-[#F3D3DB] hover:border-[#E97A9A] hover:bg-[#FFF0F4] hover:text-[#E97A9A]'
            }`}
          >
            Halter Neck
          </button>
          <button
            id="btn-override-wide"
            onClick={() => onOverrideStrapType('wide_straps', 'covered_back')}
            className={`px-2 py-1.5 text-[11px] font-semibold rounded-xl border transition-all text-center cursor-pointer ${
              analysis.strapType === 'wide_straps'
                ? 'bg-[#E97A9A] text-white border-[#E97A9A] font-bold shadow-xs'
                : 'bg-[#FFF8FA] text-[#6D6670] border-[#F3D3DB] hover:border-[#E97A9A] hover:bg-[#FFF0F4] hover:text-[#E97A9A]'
            }`}
          >
            Wide Bodice
          </button>
          <button
            id="btn-override-strapless"
            onClick={() => onOverrideStrapType('strapless', 'open_back')}
            className={`px-2 py-1.5 text-[11px] font-semibold rounded-xl border transition-all text-center cursor-pointer ${
              analysis.strapType === 'strapless'
                ? 'bg-[#E97A9A] text-white border-[#E97A9A] font-bold shadow-xs'
                : 'bg-[#FFF8FA] text-[#6D6670] border-[#F3D3DB] hover:border-[#E97A9A] hover:bg-[#FFF0F4] hover:text-[#E97A9A]'
            }`}
          >
            Strapless
          </button>
        </div>
      </div>

      {/* Action Commit Button */}
      <button
        id="btn-apply-to-mannequin"
        onClick={onApplyToMannequin}
        className="w-full py-3 px-4 rounded-2xl bg-[#E97A9A] hover:bg-[#D9698A] active:scale-[0.99] text-white font-bold uppercase tracking-wider text-xs shadow-md shadow-[#E97A9A]/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
      >
        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
        </svg>
        Reconstruct 3D Garment Geometry
      </button>
    </div>
  );
};
