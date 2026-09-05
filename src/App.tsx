import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Category,
  Garment,
  Outfit,
  OutfitBuilderState,
  Placement,
  AvatarType,
  StylistStats,
  StylistQuest,
  TabType,
  ViewerSettings,
  GarmentItem,
  AnalysisResult,
  StrapType,
  BackStyleType,
  FabricFinishType,
  SilhouetteType,
} from './types';
import * as api from './lib/api';
import { ApiClient } from './services/apiClient';
import { SAMPLE_GARMENTS } from './data/sampleGarments';
import { getDefaultPlacement } from './data/defaultPlacements';
import { DEFAULT_GARMENTS } from './data/defaultGarments';
import { AnimatedBackground } from './components/AnimatedBackground';
import { LoginScreen } from './components/LoginScreen';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { OutfitBuilderCanvas } from './components/OutfitBuilderCanvas';
import { UploadModal } from './components/UploadModal';
import { MyGarmentsView } from './components/MyGarmentsView';
import { MyOutfitsView } from './components/MyOutfitsView';
import { CompareView } from './components/CompareView';
import { StyleInspirationPresets } from './components/StyleInspirationPresets';
import { StylistQuestsModal } from './components/StylistQuestsModal';

// 3D Viewport Components
import { ThreeMannequinViewer } from './components/ThreeMannequinViewer';
import { GarmentControls } from './components/GarmentControls';
import { GarmentGallery } from './components/GarmentGallery';
import { AnalysisPanel } from './components/AnalysisPanel';
import { StableDiffusionPanel } from './components/StableDiffusionPanel';
import { TechSpecModal } from './components/TechSpecModal';

const STYLIST_USER_KEY = 'tryon_stylist_user';
const STYLIST_STATS_KEY = 'tryon_stylist_stats';

interface StylistUser {
  name: string;
  archetype: string;
}

const QUEST_DEFS: Omit<StylistQuest, 'unlocked'>[] = [
  {
    id: 'first_upload',
    title: 'First Cutout',
    description: 'Upload your first garment screenshot.',
    icon: '📸',
    xpReward: 50,
  },
  {
    id: 'first_outfit',
    title: 'First Look',
    description: 'Save your first outfit combination.',
    icon: '👗',
    xpReward: 75,
  },
  {
    id: 'wardrobe_builder',
    title: 'Wardrobe Builder',
    description: 'Save 5 garments to your Garment Library.',
    icon: '🧵',
    xpReward: 100,
  },
  {
    id: 'outfit_collector',
    title: 'Outfit Collector',
    description: 'Save 3 different outfits.',
    icon: '🗂️',
    xpReward: 100,
  },
  {
    id: 'compare_mode',
    title: 'Side by Side',
    description: 'Open Compare Mode to weigh two looks.',
    icon: '⚖️',
    xpReward: 60,
  },
  {
    id: 'full_look',
    title: 'Head to Toe',
    description: 'Equip 4+ pieces in a single outfit at once.',
    icon: '✨',
    xpReward: 80,
  },
];

const emptyBuilderState = (): OutfitBuilderState => ({ avatar: 'feminine' });

function App() {
  // --- Auth / identity ---
  const [stylistUser, setStylistUser] = useState<StylistUser | null>(() => {
    try {
      const raw = localStorage.getItem(STYLIST_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // --- Data ---
  const [garments, setGarments] = useState<Garment[]>([]);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // --- Navigation ---
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [preloadedFileUrl, setPreloadedFileUrl] = useState<string | null>(null);
  const [compareInitialOutfit, setCompareInitialOutfit] = useState<Outfit | undefined>(undefined);
  const [hasOpenedCompare, setHasOpenedCompare] = useState(false);

  // --- 3D Mannequin Viewport State ---
  const [selectedGarment, setSelectedGarment] = useState<GarmentItem>(SAMPLE_GARMENTS[0]);
  const [currentTextureUrl, setCurrentTextureUrl] = useState<string | null>(SAMPLE_GARMENTS[0].imageUrl);
  const [currentBackTextureUrl, setCurrentBackTextureUrl] = useState<string | null>(null);
  const [strapType, setStrapType] = useState<StrapType>(SAMPLE_GARMENTS[0].strapType);
  const [backStyle, setBackStyle] = useState<BackStyleType>(SAMPLE_GARMENTS[0].backStyle);
  const [isBackDetermined, setIsBackDetermined] = useState<boolean>(true);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isTechSpecOpen, setIsTechSpecOpen] = useState<boolean>(false);
  const [isPythonAvailable, setIsPythonAvailable] = useState<boolean>(false);

  const [viewerSettings, setViewerSettings] = useState<ViewerSettings>({
    autoRotate: true,
    autoRotateSpeed: 1.5,
    wrapRepeatX: 1.0,
    wrapRepeatY: 1.0,
    textureOffsetX: 0,
    textureOffsetY: 0,
    textureRotation: 0,
    silhouette: 'a_line_dress',
    mannequinMaterial: 'matte_porcelain',
    fabricFinish: 'silk_satin',
    lightingPreset: 'editorial_moody',
    showMannequin: true,
    showPedestal: true,
    showWireframe: false,
    roughness: 0.25,
    metalness: 0.1,
    bumpScale: 0.05,
    liningColor: '#1e40af',
    hemLength: 1.0,
    flareWidth: 1.0,
  });

  // Check Python backend health on mount
  useEffect(() => {
    ApiClient.checkHealth().then((healthy) => {
      setIsPythonAvailable(healthy);
    });
  }, []);

  // Run initial analysis for default sample garment
  useEffect(() => {
    if (selectedGarment && !analysis) {
      setIsAnalyzing(true);
      ApiClient.analyzeGarment(selectedGarment.imageUrl)
        .then((res) => {
          setAnalysis(res);
          setStrapType(res.strapType);
          setBackStyle(res.backStyle);
          setIsBackDetermined(res.isBackDetermined);
        })
        .catch((err) => console.error(err))
        .finally(() => setIsAnalyzing(false));
    }
  }, [selectedGarment, analysis]);

  // Handle Garment Preset Selection
  const handleSelectPresetGarment = (item: GarmentItem) => {
    setSelectedGarment(item);
    setCurrentTextureUrl(item.imageUrl);
    setCurrentBackTextureUrl(null);
    setStrapType(item.strapType);
    setBackStyle(item.backStyle);
    setIsBackDetermined(
      item.backDeterminationStatus !== 'insufficient_straps' &&
      item.backDeterminationStatus !== 'ambiguous' &&
      item.backStyle !== 'undetermined'
    );
    setViewerSettings((prev) => ({
      ...prev,
      silhouette: item.silhouette,
      fabricFinish: item.fabricFinish,
      wrapRepeatX: item.recommendedWrap || 1.0,
    }));

    setIsAnalyzing(true);
    ApiClient.analyzeGarment(item.imageUrl)
      .then((res) => {
        setAnalysis(res);
        setStrapType(res.strapType);
        setBackStyle(res.backStyle);
        setIsBackDetermined(res.isBackDetermined);
      })
      .catch((err) => console.error(err))
      .finally(() => setIsAnalyzing(false));
  };

  // Handle Custom Upload from Local File
  const handleUploadCustomGarment = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) {
        const customItem: GarmentItem = {
          id: `custom_${Date.now()}`,
          name: file.name.replace(/\.[^/.]+$/, ''),
          category: 'Custom Upload',
          imageUrl: dataUrl,
          strapType: 'unknown',
          backStyle: 'undetermined',
          silhouette: 'a_line_dress',
          fabricFinish: 'silk_satin',
          recommendedWrap: 1.0,
          backDeterminationStatus: 'ambiguous',
        };
        setSelectedGarment(customItem);
        setCurrentTextureUrl(dataUrl);
        setCurrentBackTextureUrl(null);

        setIsAnalyzing(true);
        ApiClient.analyzeGarment(dataUrl)
          .then((res) => {
            setAnalysis(res);
            setStrapType(res.strapType);
            setBackStyle(res.backStyle);
            setIsBackDetermined(res.isBackDetermined);
            setViewerSettings((prev) => ({
              ...prev,
              liningColor: res.garmentColor || prev.liningColor,
            }));
          })
          .catch((err) => console.error(err))
          .finally(() => setIsAnalyzing(false));
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle Stable Diffusion Generated Textures
  const handleGeneratedImage = (imageUrl: string, isBackView = false) => {
    if (isBackView) {
      setCurrentBackTextureUrl(imageUrl);
    } else {
      setCurrentTextureUrl(imageUrl);
      // Run analysis on newly generated front garment
      setIsAnalyzing(true);
      ApiClient.analyzeGarment(imageUrl)
        .then((res) => {
          setAnalysis(res);
          setStrapType(res.strapType);
          setBackStyle(res.backStyle);
          setIsBackDetermined(res.isBackDetermined);
        })
        .catch((err) => console.error(err))
        .finally(() => setIsAnalyzing(false));
    }
  };

  // --- Outfit builder state with undo/redo history ---
  const [history, setHistory] = useState<OutfitBuilderState[]>([emptyBuilderState()]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const builderState = history[historyIndex];

  const pushState = useCallback(
    (next: OutfitBuilderState) => {
      setHistory((prev) => {
        const trimmed = prev.slice(0, historyIndex + 1);
        return [...trimmed, next];
      });
      setHistoryIndex((i) => i + 1);
    },
    [historyIndex]
  );

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const onUndo = useCallback(() => {
    setHistoryIndex((i) => Math.max(0, i - 1));
  }, []);

  const onRedo = useCallback(() => {
    setHistoryIndex((i) => Math.min(history.length - 1, i + 1));
  }, [history.length]);

  // --- Stylist progression ---
  const [stats, setStats] = useState<StylistStats>(() => {
    try {
      const raw = localStorage.getItem(STYLIST_STATS_KEY);
      return raw ? JSON.parse(raw) : { level: 1, xp: 0, completedQuestIds: [] };
    } catch {
      return { level: 1, xp: 0, completedQuestIds: [] };
    }
  });
  const [showQuests, setShowQuests] = useState(false);

  useEffect(() => {
    localStorage.setItem(STYLIST_STATS_KEY, JSON.stringify(stats));
  }, [stats]);

  const quests: StylistQuest[] = useMemo(() => {
    const customUploadCount = garments.filter((g) => g.isCustom).length;
    const equippedCount = ['top', 'bottom', 'dress', 'jacket', 'shoes', 'bag', 'jewellery', 'accessories']
      .filter((c) => !!builderState[c as Category]).length;

    const unlockedMap: Record<string, boolean> = {
      first_upload: customUploadCount >= 1,
      first_outfit: outfits.length >= 1,
      wardrobe_builder: garments.length >= 5,
      outfit_collector: outfits.length >= 3,
      compare_mode: hasOpenedCompare,
      full_look: equippedCount >= 4,
    };

    return QUEST_DEFS.map((q) => ({ ...q, unlocked: unlockedMap[q.id] ?? false }));
  }, [garments, outfits, builderState, hasOpenedCompare]);

  const onClaimQuest = useCallback((questId: string) => {
    setStats((prev) => {
      if (prev.completedQuestIds.includes(questId)) return prev;
      const quest = QUEST_DEFS.find((q) => q.id === questId);
      const xpGain = quest?.xpReward ?? 0;
      const nextXp = prev.xp + xpGain;
      const nextLevel = Math.max(prev.level, Math.floor(nextXp / 300) + 1);
      return {
        level: nextLevel,
        xp: nextXp,
        completedQuestIds: [...prev.completedQuestIds, questId],
      };
    });
  }, []);

  // --- Load data from backend once logged in ---
  const dataLoadedRef = useRef(false);
  useEffect(() => {
    if (!stylistUser || dataLoadedRef.current) return;
    dataLoadedRef.current = true;

    setIsLoadingData(true);
    setLoadError(null);

    Promise.all([api.fetchGarments(), api.fetchOutfits()])
      .then(([fetchedGarments, fetchedOutfits]) => {
        setGarments(fetchedGarments.length > 0 ? fetchedGarments : DEFAULT_GARMENTS);
        setOutfits(fetchedOutfits);
      })
      .catch((err) => {
        console.warn('Failed to load data from backend, continuing with local defaults:', err);
        setGarments(DEFAULT_GARMENTS);
        setLoadError(err instanceof Error ? err.message : 'Failed to load your wardrobe.');
      })
      .finally(() => setIsLoadingData(false));
  }, [stylistUser]);

  // --- Auth handlers ---
  const handleLogin = useCallback((stylistName: string, archetype: string) => {
    const user = { name: stylistName, archetype };
    setStylistUser(user);
    localStorage.setItem(STYLIST_USER_KEY, JSON.stringify(user));
  }, []);

  const handleLogout = useCallback(() => {
    setStylistUser(null);
    localStorage.removeItem(STYLIST_USER_KEY);
    dataLoadedRef.current = false;
  }, []);

  // --- Outfit builder handlers ---
  const onSelectBuilderGarment = useCallback(
    (garment: Garment) => {
      const next: OutfitBuilderState = {
        ...builderState,
        [garment.category]: garment,
        placements: {
          ...builderState.placements,
          [garment.category]: builderState.placements?.[garment.category] ?? getDefaultPlacement(garment.category),
        },
      };
      if (garment.category === 'dress') {
        delete next.top;
        delete next.bottom;
      } else if (garment.category === 'top' || garment.category === 'bottom') {
        delete next.dress;
      }
      pushState(next);
    },
    [builderState, pushState]
  );

  // --- Garment handlers ---
  const handleAddGarment = useCallback((garment: Garment) => {
    setGarments((prev) => [garment, ...prev]);
    
    // Automatically equip to outfit builder
    onSelectBuilderGarment(garment);
    
    // Also sync to 3D viewer state
    const garmentItem: GarmentItem = {
      id: garment.id,
      name: garment.name,
      category: garment.category,
      imageUrl: garment.warpedUrl || garment.cutoutUrl || garment.imageUrl || '',
      strapType: garment.strapType || 'wide_straps',
      backStyle: garment.backStyle || 'open_back',
      silhouette: (garment.category === 'dress' ? 'a_line_dress' : 'peplum_top') as SilhouetteType,
      fabricFinish: (garment.style as FabricFinishType) || 'silk_satin',
      recommendedWrap: 1.0,
      backDeterminationStatus: 'determined',
    };
    setSelectedGarment(garmentItem);
    setCurrentTextureUrl(garment.warpedUrl || garment.cutoutUrl || garment.imageUrl || '');
    if (garment.strapType) setStrapType(garment.strapType);
    if (garment.backStyle) setBackStyle(garment.backStyle);

    api
      .createGarment(garment)
      .then((saved) => {
        setGarments((prev) => prev.map((g) => (g.id === garment.id ? saved : g)));
      })
      .catch((err) => {
        console.warn('Failed to persist garment to backend:', err);
        // Don't leave a phantom "saved" garment in the UI — it only exists in
        // local state and will vanish on refresh, so make that visible.
        setGarments((prev) => prev.filter((g) => g.id !== garment.id));
        setLoadError(
          `Couldn't save "${garment.name}" (${err instanceof Error ? err.message : 'server error'}) — it wasn't added to your wardrobe.`
        );
      });
  }, [onSelectBuilderGarment]);

  const handleDeleteGarment = useCallback((id: string) => {
    setGarments((prev) => prev.filter((g) => g.id !== id));
    if (!id.startsWith('custom-')) return;
    api.deleteGarment(id).catch((err) => {
      console.warn('Failed to delete garment on backend:', err);
    });
  }, []);

  const onRemoveGarment = useCallback(
    (category: Category) => {
      const next = { ...builderState };
      delete next[category];
      if (next.placements) {
        const placements = { ...next.placements };
        delete placements[category];
        next.placements = placements;
      }
      pushState(next);
    },
    [builderState, pushState]
  );

  const onUpdatePlacement = useCallback(
    (category: Category, placement: Placement) => {
      pushState({
        ...builderState,
        placements: {
          ...builderState.placements,
          [category]: placement,
        },
      });
    },
    [builderState, pushState]
  );

  const onAvatarChange = useCallback(
    (avatar: AvatarType) => {
      pushState({ ...builderState, avatar });
    },
    [builderState, pushState]
  );

  const onApplyPreset = useCallback(
    (equippedMap: Partial<Record<Category, Garment>>) => {
      const placements: Partial<Record<Category, Placement>> = { ...builderState.placements };
      (Object.keys(equippedMap) as Category[]).forEach((cat) => {
        if (!placements[cat]) placements[cat] = getDefaultPlacement(cat);
      });
      pushState({ ...builderState, ...equippedMap, placements });
      setActiveTab('home');
    },
    [builderState, pushState]
  );

  const handleFileDrop = useCallback((dataUrl: string) => {
    setPreloadedFileUrl(dataUrl);
    setActiveTab('upload');
  }, []);

  const handleNavigateToUpload = useCallback(() => {
    setPreloadedFileUrl(null);
    setActiveTab('upload');
  }, []);

  const handleSaveOutfit = useCallback(
    (name: string) => {
      const items: Outfit['items'] = {};
      (['top', 'bottom', 'dress', 'jacket', 'shoes', 'bag', 'jewellery', 'accessories'] as Category[]).forEach(
        (cat) => {
          const g = builderState[cat];
          if (g) items[cat] = g;
        }
      );

      const outfit: Outfit = {
        id: `local-${Date.now()}`,
        name,
        items,
        placements: builderState.placements,
        avatar: builderState.avatar ?? 'feminine',
        createdAt: new Date().toISOString(),
      };

      setOutfits((prev) => [outfit, ...prev]);

      api
        .saveOutfit(outfit)
        .then((saved) => {
          setOutfits((prev) => prev.map((o) => (o.id === outfit.id ? saved : o)));
        })
        .catch((err) => {
          console.warn('Failed to persist outfit to backend, keeping local copy:', err);
        });
    },
    [builderState]
  );

  const handleDeleteOutfit = useCallback((id: string) => {
    setOutfits((prev) => prev.filter((o) => o.id !== id));
    if (id.startsWith('local-')) return;
    api.deleteOutfit(id).catch((err) => {
      console.warn('Failed to delete outfit on backend:', err);
    });
  }, []);

  const handleLoadOutfit = useCallback(
    (outfit: Outfit) => {
      const next: OutfitBuilderState = {
        ...outfit.items,
        placements: outfit.placements,
        avatar: outfit.avatar ?? 'feminine',
      };
      pushState(next);
      setActiveTab('home');
    },
    [pushState]
  );

  const handleCompareOutfit = useCallback((outfit: Outfit) => {
    setCompareInitialOutfit(outfit);
    setHasOpenedCompare(true);
    setActiveTab('compare');
  }, []);

  const handleNavigateToBuilder = useCallback(() => setActiveTab('home'), []);

  const handleTabChange = useCallback((tab: TabType) => {
    if (tab === 'compare') setHasOpenedCompare(true);
    if (tab !== 'upload') setPreloadedFileUrl(null);
    setActiveTab(tab);
  }, []);

  if (!stylistUser) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="relative min-h-screen bg-[#FFF8FA] text-[#2F2A2E] selection:bg-[#E97A9A] selection:text-white">
      <AnimatedBackground />
      <Sidebar activeTab={activeTab} onTabChange={handleTabChange} onLogout={handleLogout} userName={stylistUser.name} />

      <div className="pl-64">
        <Header
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          stats={stats}
          onOpenQuests={() => setShowQuests(true)}
          stylistUser={stylistUser}
          onLogout={handleLogout}
        />

        <main className="pt-16 p-6 max-w-[1700px] mx-auto space-y-6">
          {loadError && (
            <div className="text-xs text-amber-300 bg-amber-950/40 border border-amber-500/30 rounded-xl px-4 py-3 font-mono">
              Couldn't reach the backend ({loadError}) — fallback engine active.
            </div>
          )}

          {/* TAB 1: 3D MANNEQUIN VIEWPORT */}
          {activeTab === '3d_viewer' && (
            <div className="space-y-6 animate-fade-in">
              {/* Primary 3D Canvas Stage */}
              <div className="w-full">
                <ThreeMannequinViewer
                  settings={viewerSettings}
                  onUpdateSettings={(newSettings) => setViewerSettings((prev) => ({ ...prev, ...newSettings }))}
                  frontTextureUrl={currentTextureUrl}
                  backTextureUrl={currentBackTextureUrl}
                  strapType={strapType}
                  backStyle={backStyle}
                  backDeterminationStatus={selectedGarment?.backDeterminationStatus || 'determined'}
                  isBackDetermined={isBackDetermined}
                  onOpenTechSpec={() => setIsTechSpecOpen(true)}
                  onSelectPresetGarment={handleSelectPresetGarment}
                  onUploadCustomImage={handleUploadCustomGarment}
                  isLoading={isAnalyzing}
                />
              </div>

              {/* Multi-Panel Grid for Controls, CV Analysis & SD Diffusion */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left 4 Cols: Computer Vision Analysis */}
                <div className="lg:col-span-4 space-y-6">
                  <AnalysisPanel
                    analysis={analysis}
                    isAnalyzing={isAnalyzing}
                    onApplyToMannequin={() => {
                      if (analysis) {
                        setStrapType(analysis.strapType);
                        setBackStyle(analysis.backStyle);
                        setIsBackDetermined(analysis.isBackDetermined);
                      }
                    }}
                    onOverrideStrapType={(st, bs) => {
                      setStrapType(st);
                      setBackStyle(bs);
                      setIsBackDetermined(bs !== 'undetermined');
                    }}
                    backendEngine={isPythonAvailable ? 'python_fastapi' : 'client_cv'}
                    isPythonAvailable={isPythonAvailable}
                  />
                </div>

                {/* Center 4 Cols: 3D Parameters & Materials */}
                <div className="lg:col-span-4 space-y-6">
                  <GarmentControls
                    settings={viewerSettings}
                    onUpdate={(newSettings) => setViewerSettings((prev) => ({ ...prev, ...newSettings }))}
                    onOpenTechSpec={() => setIsTechSpecOpen(true)}
                  />
                </div>

                {/* Right 4 Cols: Stable Diffusion Studio */}
                <div className="lg:col-span-4 space-y-6">
                  <StableDiffusionPanel
                    currentFrontImageUrl={currentTextureUrl}
                    currentStrapType={strapType}
                    currentBackStyle={backStyle}
                    garmentColorHex={analysis?.garmentColor || '#0d9488'}
                    onGeneratedImage={handleGeneratedImage}
                  />
                </div>
              </div>

              {/* Bottom Garment Preset Bench */}
              <div>
                <GarmentGallery
                  selectedGarmentId={selectedGarment?.id || null}
                  onSelectGarment={handleSelectPresetGarment}
                  onUploadCustomImage={handleUploadCustomGarment}
                />
              </div>
            </div>
          )}

          {/* TAB 2: 2D OUTFIT CANVAS */}
          {activeTab === 'home' && (
            <div className="space-y-6 bg-white rounded-3xl p-6 text-[#2F2A2E] shadow-2xl border border-white/20 animate-fade-in">
              <StyleInspirationPresets garments={garments} onApplyPreset={onApplyPreset} />
              <OutfitBuilderCanvas
                state={builderState}
                onSelectGarment={onSelectBuilderGarment}
                onRemoveGarment={onRemoveGarment}
                onUpdatePlacement={onUpdatePlacement}
                onUndo={onUndo}
                onRedo={onRedo}
                canUndo={canUndo}
                canRedo={canRedo}
                garments={garments}
                onSaveOutfit={handleSaveOutfit}
                onNavigateToUpload={handleNavigateToUpload}
                onFileDrop={handleFileDrop}
                onAvatarChange={onAvatarChange}
              />
            </div>
          )}

          {/* TAB 3: UPLOAD MODAL / VIEW */}
          {activeTab === 'upload' && (
            <div className="bg-white rounded-3xl p-6 text-[#2F2A2E] shadow-2xl border border-white/20 animate-fade-in">
              <UploadModal
                onAddGarment={handleAddGarment}
                onSuccess={() => setActiveTab('home')}
                preloadedFileUrl={preloadedFileUrl}
              />
            </div>
          )}

          {/* TAB 4: MY GARMENTS */}
          {activeTab === 'garments' && (
            <div className="bg-white rounded-3xl p-6 text-[#2F2A2E] shadow-2xl border border-white/20 animate-fade-in">
              <MyGarmentsView
                garments={garments}
                onDeleteGarment={handleDeleteGarment}
                onTryOnGarment={onSelectBuilderGarment}
                onNavigateToUpload={handleNavigateToUpload}
                searchQuery={searchQuery}
              />
            </div>
          )}

          {/* TAB 5: MY OUTFITS */}
          {activeTab === 'outfits' && (
            <div className="bg-white rounded-3xl p-6 text-[#2F2A2E] shadow-2xl border border-white/20 animate-fade-in">
              <MyOutfitsView
                outfits={outfits}
                onDeleteOutfit={handleDeleteOutfit}
                onLoadOutfit={handleLoadOutfit}
                onCompareOutfit={handleCompareOutfit}
                onNavigateToBuilder={handleNavigateToBuilder}
                searchQuery={searchQuery}
              />
            </div>
          )}

          {/* TAB 6: COMPARE LOOKS */}
          {activeTab === 'compare' && (
            <div className="bg-white rounded-3xl p-6 text-[#2F2A2E] shadow-2xl border border-white/20 animate-fade-in">
              <CompareView
                outfits={outfits}
                onNavigateToBuilder={handleNavigateToBuilder}
                onLoadOutfit={handleLoadOutfit}
                initialCompareOutfit={compareInitialOutfit}
              />
            </div>
          )}

          {isLoadingData && (
            <p className="text-center text-[10px] text-zinc-500 italic font-mono">Syncing wardrobe data…</p>
          )}
        </main>
      </div>

      {/* Tech Spec Analytical Diagnostic Modal */}
      <TechSpecModal
        isOpen={isTechSpecOpen}
        onClose={() => setIsTechSpecOpen(false)}
        settings={viewerSettings}
        strapType={strapType}
        backStyle={backStyle}
        analysis={analysis}
        currentTextureUrl={currentTextureUrl}
      />

      {/* Stylist Quests Modal */}
      {showQuests && (
        <StylistQuestsModal
          stats={stats}
          quests={quests}
          onClose={() => setShowQuests(false)}
          onClaimQuest={onClaimQuest}
        />
      )}
    </div>
  );
}

export default App;
