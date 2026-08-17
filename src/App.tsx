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
} from './types';
import * as api from './lib/api';
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
        // Wardrobe is built from the user's uploads, but seeded with the
        // starter pieces whenever the backend has nothing yet, so the
        // mannequin can always be dressed.
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

  // --- Garment handlers ---
  const handleAddGarment = useCallback((garment: Garment) => {
    // Optimistically show it immediately, then reconcile with the server id.
    setGarments((prev) => [garment, ...prev]);
    api
      .createGarment(garment)
      .then((saved) => {
        setGarments((prev) => prev.map((g) => (g.id === garment.id ? saved : g)));
      })
      .catch((err) => {
        console.warn('Failed to persist garment to backend, keeping local copy:', err);
      });
  }, []);

  const handleDeleteGarment = useCallback((id: string) => {
    setGarments((prev) => prev.filter((g) => g.id !== id));
    if (!id.startsWith('custom-')) return; // seeded defaults aren't on the server
    api.deleteGarment(id).catch((err) => {
      console.warn('Failed to delete garment on backend:', err);
    });
  }, []);

  // --- Outfit builder handlers ---
  const onSelectGarment = useCallback(
    (garment: Garment) => {
      const next: OutfitBuilderState = {
        ...builderState,
        [garment.category]: garment,
        placements: {
          ...builderState.placements,
          [garment.category]: builderState.placements?.[garment.category] ?? getDefaultPlacement(garment.category),
        },
      };
      // A dress replaces top/bottom and vice versa (mirrors backend's 400 rule).
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
    <div className="relative min-h-screen bg-[#FFFBFC]">
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

        <main className="pt-16 p-6 max-w-[1600px] mx-auto space-y-6">
          {loadError && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              Couldn't reach the backend ({loadError}) — showing your local wardrobe instead.
            </div>
          )}

          {activeTab === 'home' && (
            <div className="space-y-6">
              <StyleInspirationPresets garments={garments} onApplyPreset={onApplyPreset} />
              <OutfitBuilderCanvas
                state={builderState}
                onSelectGarment={onSelectGarment}
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

          {activeTab === 'upload' && (
            <UploadModal
              onAddGarment={handleAddGarment}
              onSuccess={() => setActiveTab('garments')}
              preloadedFileUrl={preloadedFileUrl}
            />
          )}

          {activeTab === 'garments' && (
            <MyGarmentsView
              garments={garments}
              onDeleteGarment={handleDeleteGarment}
              onTryOnGarment={onSelectGarment}
              onNavigateToUpload={handleNavigateToUpload}
              searchQuery={searchQuery}
            />
          )}

          {activeTab === 'outfits' && (
            <MyOutfitsView
              outfits={outfits}
              onDeleteOutfit={handleDeleteOutfit}
              onLoadOutfit={handleLoadOutfit}
              onCompareOutfit={handleCompareOutfit}
              onNavigateToBuilder={handleNavigateToBuilder}
              searchQuery={searchQuery}
            />
          )}

          {activeTab === 'compare' && (
            <CompareView
              outfits={outfits}
              onNavigateToBuilder={handleNavigateToBuilder}
              onLoadOutfit={handleLoadOutfit}
              initialCompareOutfit={compareInitialOutfit}
            />
          )}

          {isLoadingData && (
            <p className="text-center text-[10px] text-[#6D6670] italic">Syncing your wardrobe…</p>
          )}
        </main>
      </div>

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
