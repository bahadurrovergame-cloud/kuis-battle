/**
 * PATH STORE & CACHE (Client-Side)
 * Menyediakan in-memory & session storage cache untuk The Path (Peta Pulau & Level).
 * 
 * Manfaat Performa:
 * 1. Kembali ke peta terasa INSTAN (0 ms) tanpa layar pemblokir "MEMUAT THE PATH...".
 * 2. Stale-While-Revalidate (SWR): Menampilkan cache lama langsung ke layar, 
 *    lalu memperbarui data di latar belakang tanpa mengunci (freeze) UI.
 * 3. Optimistic Update: Ketika pemain tamat level di /tts/[levelId], 
 *    status level langsung diubah ke 'completed' (berbintang) di cache sebelum user kembali ke peta!
 */

import { Profile, GameSettings, TTSUnit, TTSLevel, TTSUserProgress } from '@/lib/supabase-hub';

export interface PathCacheData {
  profile: Profile | null;
  settings: GameSettings | null;
  units: TTSUnit[];
  levels: TTSLevel[];
  userProgress: Record<string, TTSUserProgress>;
  timestamp: number;
}

let inMemoryPathCache: PathCacheData | null = null;
const CACHE_STORAGE_KEY = 'kuis_battle_path_cache_v2';
const CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 1 Jam untuk unit & level statis

export function getPathCache(): PathCacheData | null {
  if (inMemoryPathCache) {
    return inMemoryPathCache;
  }
  if (typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(CACHE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PathCacheData;
        if (Date.now() - parsed.timestamp < CACHE_MAX_AGE_MS) {
          inMemoryPathCache = parsed;
          return parsed;
        }
      }
    } catch {
      // Abaikan jika quota storage browser penuh
    }
  }
  return null;
}

export function setPathCache(data: Omit<PathCacheData, 'timestamp'>) {
  const cacheObj: PathCacheData = {
    ...data,
    timestamp: Date.now(),
  };
  inMemoryPathCache = cacheObj;
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cacheObj));
    } catch {
      // Abaikan error storage
    }
  }
}

/**
 * Optimistic Update: Dipanggil seketika saat pemain menyelesaikan level di /tts/[levelId]
 * Sehingga saat pemain kembali ke /path, level sudah berbintang emas dan level berikutnya langsung terbuka!
 */
export function updatePathOptimisticCompletion(
  levelId: string,
  scoreEarned: number,
  coinsEarned: number = 20
) {
  const current = getPathCache();
  if (!current) return;

  const existingProg = current.userProgress[levelId];
  const updatedProg: TTSUserProgress = {
    id: existingProg?.id || `opt-${levelId}`,
    user_id: current.profile?.id || '',
    level_id: levelId,
    status: 'completed',
    score_earned: Math.max(scoreEarned, existingProg?.score_earned || 0),
    time_taken_seconds: existingProg?.time_taken_seconds || 60,
    completed_words: existingProg?.completed_words || [],
    grid_state: existingProg?.grid_state || {},
    combo_multiplier: existingProg?.combo_multiplier || 1,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const updatedProgressMap: Record<string, TTSUserProgress> = {
    ...current.userProgress,
    [levelId]: updatedProg,
  };

  const updatedProfile = current.profile
    ? {
        ...current.profile,
        coins: (current.profile.coins || 0) + coinsEarned,
        total_score: (current.profile.total_score || 0) + scoreEarned,
      }
    : null;

  setPathCache({
    ...current,
    profile: updatedProfile,
    userProgress: updatedProgressMap,
  });
}

/**
 * Update Nyawa & Koin Optimistik
 */
export function updatePathOptimisticResources(lives?: number, coins?: number) {
  const current = getPathCache();
  if (!current || !current.profile) return;

  const updatedProfile = {
    ...current.profile,
    lives: lives !== undefined ? lives : current.profile.lives,
    coins: coins !== undefined ? coins : current.profile.coins,
  };

  setPathCache({
    ...current,
    profile: updatedProfile,
  });
}

/**
 * Hapus Cache Path (misal saat logout atau admin mengubah struktur level)
 */
export function invalidatePathCache() {
  inMemoryPathCache = null;
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(CACHE_STORAGE_KEY);
    } catch {
      // Abaikan
    }
  }
}
