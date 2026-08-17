import { Garment, Outfit, Category, Placement, AvatarType, UploadResult } from '../types';

const API_URL = import.meta.env.VITE_API_URL || '';

// --- User Authentication ---

let currentUserId: string | null = localStorage.getItem('tryon_user_id');

export function getUserId(): string | null {
  return currentUserId;
}

export async function registerUser(): Promise<string> {
  const result = await request<{ id: string }>('/api/users', { method: 'POST' });
  currentUserId = result.id;
  localStorage.setItem('tryon_user_id', currentUserId);
  return currentUserId;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  if (!currentUserId && path !== '/api/users') {
    try {
      await registerUser();
    } catch (e) {
      console.warn('Auto registration before request failed:', e);
    }
  }

  const headers: HeadersInit = {
    ...(options?.headers || {}),
  };

  if (!(options?.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (currentUserId) {
    headers['X-User-Id'] = currentUserId;
  }

  const res = await fetch(`${API_URL}${path}`, {
    headers,
    ...options,
  });

  const serverUserId = res.headers.get('X-User-Id');
  if (serverUserId) {
    currentUserId = serverUserId;
    localStorage.setItem('tryon_user_id', serverUserId);
  }

  if (res.status === 401) {
    localStorage.removeItem('tryon_user_id');
    currentUserId = null;
    throw new Error('Session expired. Please refresh the page to continue.');
  }

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!res.ok) {
    let detail = null;
    if (isJson) {
      detail = await res.json().catch(() => null);
    }
    throw new Error(detail?.detail || `Request failed (${res.status}): ${path}`);
  }

  if (res.status === 204) return undefined as T;

  if (!isJson) {
    throw new Error(`Expected JSON response from ${path}, received ${contentType || 'non-JSON'}`);
  }

  return res.json() as Promise<T>;
}

// --- Garments ---

export function fetchGarments(): Promise<Garment[]> {
  return request<Garment[]>('/api/garments');
}

export function fetchGarmentsByCategory(category: Category): Promise<Garment[]> {
  return request<Garment[]>(`/api/garments?category=${category}`);
}

export function fetchGarmentsByCategories(categories: Category[]): Promise<Record<Category, Garment[]>> {
  const cats = categories.join(',');
  return request<Record<Category, Garment[]>>(`/api/garments/by-categories?categories=${cats}`);
}

export function fetchGarment(id: string): Promise<Garment> {
  return request<Garment>(`/api/garments/${id}`);
}

export function createGarment(garment: Omit<Garment, 'id' | 'createdAt'>): Promise<Garment> {
  const payload = {
    name: garment.name,
    category: garment.category,
    color: garment.color,
    style: garment.style,
    is_custom: garment.isCustom ?? true,
    image_url: garment.imageUrl,
    cutout_url: garment.cutoutUrl,
    warped_url: garment.warpedUrl,
  };
  return request<Garment>('/api/garments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateGarment(id: string, updates: Partial<Garment>): Promise<Garment> {
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.category !== undefined) payload.category = updates.category;
  if (updates.color !== undefined) payload.color = updates.color;
  if (updates.style !== undefined) payload.style = updates.style;
  if (updates.imageUrl !== undefined) payload.image_url = updates.imageUrl;
  if (updates.cutoutUrl !== undefined) payload.cutout_url = updates.cutoutUrl;
  if (updates.warpedUrl !== undefined) payload.warped_url = updates.warpedUrl;
  if (updates.isCustom !== undefined) payload.is_custom = updates.isCustom;

  return request<Garment>(`/api/garments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteGarment(id: string): Promise<{ deleted: string }> {
  return request(`/api/garments/${id}`, { method: 'DELETE' });
}

// --- Outfits ---

interface OutfitWire {
  id: string;
  name: string;
  avatar: string;
  garmentIds: Partial<Record<Category, string>>;
  garments: Partial<Record<Category, Garment>>;
  placements?: Partial<Record<Category, Placement>>;
  createdAt: string;
}

function wireToOutfit(o: OutfitWire): Outfit {
  return {
    id: o.id,
    name: o.name,
    avatar: o.avatar as AvatarType,
    items: o.garments,
    placements: o.placements,
    createdAt: o.createdAt,
  };
}

export async function fetchOutfits(): Promise<Outfit[]> {
  const wire = await request<OutfitWire[]>('/api/outfits');
  return wire.map(wireToOutfit);
}

export async function fetchOutfit(id: string): Promise<Outfit> {
  const wire = await request<OutfitWire>(`/api/outfits/${id}`);
  return wireToOutfit(wire);
}

export async function saveOutfit(outfit: Outfit): Promise<Outfit> {
  const garmentIds: Partial<Record<Category, string>> = {};
  (Object.keys(outfit.items) as Category[]).forEach((cat) => {
    const g = outfit.items[cat];
    if (g) garmentIds[cat] = g.id;
  });

  const wire = await request<OutfitWire>('/api/outfits', {
    method: 'POST',
    body: JSON.stringify({ 
      name: outfit.name, 
      avatar: outfit.avatar, 
      garmentIds, 
      placements: outfit.placements 
    }),
  });
  return wireToOutfit(wire);
}

// Backward compatibility
export async function createOutfit(
  name: string,
  avatar: AvatarType,
  items: Partial<Record<Category, Garment>>,
  placements?: Partial<Record<Category, Placement>>
): Promise<Outfit> {
  return saveOutfit({
    id: '',
    name,
    avatar,
    items,
    placements,
    createdAt: new Date().toISOString()
  });
}

export function deleteOutfit(id: string): Promise<{ deleted: string }> {
  return request(`/api/outfits/${id}`, { method: 'DELETE' });
}

// --- Uploads ---

export type { UploadResult };

function toAbsolute(result: UploadResult): UploadResult {
  return {
    ...result,
    url: result.url.startsWith('http') ? result.url : `${API_URL}${result.url}`,
    cutoutUrl: result.cutoutUrl ? (result.cutoutUrl.startsWith('http') ? result.cutoutUrl : `${API_URL}${result.cutoutUrl}`) : undefined,
    warpedUrl: result.warpedUrl ? (result.warpedUrl.startsWith('http') ? result.warpedUrl : `${API_URL}${result.warpedUrl}`) : undefined,
  };
}

export async function uploadGarment(
  file: File,
  skipBackgroundRemoval: boolean = false
): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  const result = await request<UploadResult>(
    `/api/uploads/garment?skip_background_removal=${skipBackgroundRemoval}`,
    { method: 'POST', body: form }
  );
  return toAbsolute(result);
}

// --- Photorealistic Try-On ---
// No person photo is ever sent — the backend dresses a bundled stand-in
// model photo picked by avatar type, matching the mannequin concept.

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
  return request<TryOnStatus>('/api/tryon/status');
}

export async function generatePhotorealisticTryOn(
  avatar: AvatarType,
  garmentImageUrl: string,
  category: Category
): Promise<TryOnResult> {
  const result = await request<TryOnResult>('/api/tryon', {
    method: 'POST',
    body: JSON.stringify({ avatar, garmentImageUrl, category }),
  });
  return {
    url: result.url.startsWith('http') ? result.url : `${API_URL}${result.url}`,
  };
}

// --- Meta ---

export interface CategoryMeta {
  category: Category;
  layerOrder: number;
}

export async function fetchCategories(): Promise<CategoryMeta[]> {
  return request<CategoryMeta[]>('/api/meta/categories');
}

// --- Health Check ---

export async function checkHealth(): Promise<{ status: string }> {
  return request<{ status: string }>('/api/health');
}
