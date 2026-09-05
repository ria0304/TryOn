import { Garment, Outfit, Category, Placement, AvatarType, UploadResult } from '../types';

// --- Backend wiring ---------------------------------------------------
// Every function below talks to the real FastAPI backend (see backend/main.py
// and backend/routers/*). Auth is a lightweight "guest library" model: the
// client registers once via POST /api/users, gets back an opaque id, and
// sends it as the X-User-Id header on every request after that (see
// backend/auth.py). If the backend ever responds 401 (stale/unknown id —
// e.g. a fresh clone or a reset DB), we clear the stored id, register a new
// guest, and retry the request once.

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
const USER_ID_KEY = 'tryon_user_id';

let currentUserId: string | null =
  typeof localStorage !== 'undefined' ? localStorage.getItem(USER_ID_KEY) : null;
let registerPromise: Promise<string> | null = null;

export function getUserId(): string | null {
  return currentUserId;
}

async function doRegister(): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/users`, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Failed to register guest user (${res.status})`);
  }
  const data = await res.json();
  currentUserId = data.id;
  localStorage.setItem(USER_ID_KEY, data.id);
  return data.id;
}

export async function registerUser(): Promise<string> {
  if (currentUserId) return currentUserId;
  if (!registerPromise) {
    registerPromise = doRegister().finally(() => {
      registerPromise = null;
    });
  }
  return registerPromise;
}

async function ensureUserId(): Promise<string> {
  return currentUserId || registerUser();
}

// Backend endpoints hand back paths like "/static/uploads/xyz.png" that are
// relative to the API origin, not the Vite dev server origin. Absolutize
// them so <img>/<video> tags actually resolve.
function absolutize(url: string | null | undefined): string | undefined {
  if (!url) return url ?? undefined;
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  return `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | undefined>;
  isForm?: boolean;
}

async function apiRequest<T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
  const userId = await ensureUserId();

  const url = new URL(`${API_BASE_URL}${path}`);
  if (options.query) {
    Object.entries(options.query).forEach(([key, value]) => {
      if (value !== undefined && value !== '') url.searchParams.set(key, value);
    });
  }

  const headers: Record<string, string> = { 'X-User-Id': userId };
  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    if (options.isForm) {
      body = options.body as FormData;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
  }

  const res = await fetch(url.toString(), {
    method: options.method || 'GET',
    headers,
    body,
  });

  if (res.status === 401 && !isRetry) {
    // Stale/unknown guest id — self-heal by re-registering once (mirrors
    // backend/auth.py's own comment about api.ts owning this behavior).
    currentUserId = null;
    localStorage.removeItem(USER_ID_KEY);
    return apiRequest<T>(path, options, true);
  }

  if (!res.ok) {
    let detail = res.statusText || `Request failed (${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson?.detail) detail = errJson.detail;
    } catch {
      /* body wasn't JSON, keep default detail */
    }
    throw new Error(detail);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function mapGarment(raw: any): Garment {
  return {
    ...raw,
    imageUrl: absolutize(raw.imageUrl),
    cutoutUrl: absolutize(raw.cutoutUrl),
    warpedUrl: absolutize(raw.warpedUrl),
    canonicalAsset: raw.canonicalAsset
      ? { ...raw.canonicalAsset, url: absolutize(raw.canonicalAsset.url) as string, alphaMaskUrl: absolutize(raw.canonicalAsset.alphaMaskUrl || raw.canonicalAsset.alpha_mask_url) }
      : undefined,
  };
}

function mapOutfit(raw: any): Outfit {
  const rawGarments = raw.garments || {};
  const items: Partial<Record<Category, Garment>> = {};
  Object.entries(rawGarments).forEach(([cat, g]) => {
    items[cat as Category] = mapGarment(g);
  });
  return {
    id: raw.id,
    name: raw.name,
    avatar: raw.avatar,
    items,
    placements: raw.placements || {},
    createdAt: raw.createdAt,
  };
}

// --- Garments API -------------------------------------------------------

export async function fetchGarments(): Promise<Garment[]> {
  const raw = await apiRequest<any[]>('/api/garments');
  return raw.map(mapGarment);
}

export async function fetchGarmentsByCategory(category: Category): Promise<Garment[]> {
  const raw = await apiRequest<any[]>('/api/garments', { query: { category } });
  return raw.map(mapGarment);
}

export async function fetchGarmentsByCategories(
  categories: Category[]
): Promise<Record<Category, Garment[]>> {
  const raw = await apiRequest<Record<string, any[]>>('/api/garments/by-categories', {
    query: { categories: categories.join(',') },
  });
  const result: Partial<Record<Category, Garment[]>> = {};
  Object.entries(raw).forEach(([cat, list]) => {
    result[cat as Category] = list.map(mapGarment);
  });
  return result as Record<Category, Garment[]>;
}

export async function fetchGarment(id: string): Promise<Garment> {
  const raw = await apiRequest<any>(`/api/garments/${encodeURIComponent(id)}`);
  return mapGarment(raw);
}

export async function createGarment(garment: Omit<Garment, 'id' | 'createdAt'> & { id?: string }): Promise<Garment> {
  const raw = await apiRequest<any>('/api/garments', {
    method: 'POST',
    body: {
      id: garment.id,
      name: garment.name,
      category: garment.category,
      color: garment.color ?? '#000000',
      style: garment.style ?? 'custom',
      fabric: garment.fabric,
      isCustom: garment.isCustom ?? garment.is_custom ?? true,
      imageUrl: garment.imageUrl ?? garment.image_url,
      cutoutUrl: garment.cutoutUrl ?? garment.cutout_url,
      warpedUrl: garment.warpedUrl ?? garment.warped_url,
      canonicalAsset: garment.canonicalAsset ?? garment.canonical_asset,
    },
  });
  return mapGarment(raw);
}

export async function updateGarment(id: string, updates: Partial<Garment>): Promise<Garment> {
  const raw = await apiRequest<any>(`/api/garments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: {
      name: updates.name,
      category: updates.category,
      color: updates.color,
      style: updates.style,
      isCustom: updates.isCustom ?? updates.is_custom,
      imageUrl: updates.imageUrl ?? updates.image_url,
      cutoutUrl: updates.cutoutUrl ?? updates.cutout_url,
      warpedUrl: updates.warpedUrl ?? updates.warped_url,
      canonicalAsset: updates.canonicalAsset ?? updates.canonical_asset,
    },
  });
  return mapGarment(raw);
}

export async function deleteGarment(id: string): Promise<{ deleted: string }> {
  return apiRequest(`/api/garments/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// --- Outfits API ----------------------------------------------------------

export async function fetchOutfits(): Promise<Outfit[]> {
  const raw = await apiRequest<any[]>('/api/outfits');
  return raw.map(mapOutfit);
}

export async function fetchOutfit(id: string): Promise<Outfit> {
  const raw = await apiRequest<any>(`/api/outfits/${encodeURIComponent(id)}`);
  return mapOutfit(raw);
}

// The backend has no "update outfit" route by design (see backend/routers/
// outfits.py) — saving always creates a fresh row, matching how App.tsx
// always hands this a brand-new `local-<timestamp>` id.
export async function saveOutfit(outfit: Outfit): Promise<Outfit> {
  const garmentIds: Record<string, string> = {};
  Object.entries(outfit.items || {}).forEach(([cat, g]) => {
    if (g?.id) garmentIds[cat] = g.id;
  });

  const raw = await apiRequest<any>('/api/outfits', {
    method: 'POST',
    body: {
      name: outfit.name,
      avatar: outfit.avatar ?? 'feminine',
      garmentIds,
      placements: outfit.placements ?? {},
    },
  });
  return mapOutfit(raw);
}

export async function createOutfit(
  name: string,
  avatar: AvatarType,
  items: Partial<Record<Category, Garment>>,
  placements?: Partial<Record<Category, Placement>>
): Promise<Outfit> {
  return saveOutfit({
    id: `outfit-${Date.now()}`,
    name,
    avatar,
    items,
    placements,
    createdAt: new Date().toISOString(),
  });
}

export async function deleteOutfit(id: string): Promise<{ deleted: string }> {
  return apiRequest(`/api/outfits/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// --- Uploads --------------------------------------------------------------

export type { UploadResult };

export async function uploadGarment(
  file: File,
  skipBackgroundRemoval: boolean = false
): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);

  const raw = await apiRequest<any>('/api/uploads/garment', {
    method: 'POST',
    body: form,
    isForm: true,
    query: { skip_background_removal: String(skipBackgroundRemoval) },
  });

  return {
    ...raw,
    url: absolutize(raw.url) as string,
    cutoutUrl: absolutize(raw.cutoutUrl),
    warpedUrl: absolutize(raw.warpedUrl),
    canonicalAsset: raw.canonicalAsset
      ? { ...raw.canonicalAsset, url: absolutize(raw.canonicalAsset.url) as string, alphaMaskUrl: absolutize(raw.canonicalAsset.alphaMaskUrl || raw.canonicalAsset.alpha_mask_url) }
      : undefined,
  };
}

// --- Photorealistic Try-On --------------------------------------------------

export interface TryOnStatus {
  ready: boolean;
  repoCloned: boolean;
  standinPhotosPresent: boolean;
  weightsCached: boolean;
}

export interface TryOnResult {
  url: string;
}

export async function fetchTryOnStatus(): Promise<TryOnStatus> {
  return apiRequest<TryOnStatus>('/api/tryon/status');
}

export async function generatePhotorealisticTryOn(
  avatar: AvatarType,
  garmentImageUrl: string,
  category: Category
): Promise<TryOnResult> {
  const raw = await apiRequest<any>('/api/tryon', {
    method: 'POST',
    body: {
      avatar,
      garmentImageUrl,
      category,
    },
  });
  return { url: absolutize(raw.url) as string };
}

// --- Meta -------------------------------------------------------------

export interface CategoryMeta {
  category: Category;
  layerOrder: number;
}

export async function fetchCategories(): Promise<CategoryMeta[]> {
  return apiRequest<CategoryMeta[]>('/api/meta/categories');
}

// --- Health Check -------------------------------------------------------

export async function checkHealth(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE_URL}/api/health`);
  if (!res.ok) throw new Error(`Backend unhealthy (${res.status})`);
  return res.json();
}
