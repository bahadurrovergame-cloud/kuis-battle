/**
 * PATH STORE & CACHE (Client-Side)
 * Menyediakan in-memory & session storage cache untuk The Path (Peta Pulau & Level).
 * 
 * Manfaat Performa:
 * 1. Kembali ke peta terasa INSTAN (0 ms) tanpa layar pemblokir "MEMUAT THE PATH...".
 * 2. Stale-While-Revalidate (SWR): Menampilkan cache lama langsung ke layar, 
 *    lalu memperbarui data di latar belakang tanpa mengunci (freeze) UI.
 * 3. TRUE OPTIMISTIC UPDATE: Ketika pemain tamat level di /tts/[levelId], 
 *    status level langsung diubah ke 'completed' (berbintang emas) dan level berikutnya langsung dibuka
 *    dalam 0 milidetik, bahkan jika database server lambat atau masih dalam proses request.
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

export interface OptimisticLevelRecord {
  levelId: string;
  score: number;
  coins: number;
  completedAt: string;
}

let inMemoryPathCache: PathCacheData | null = null;
let inMemoryOptimisticCompletions: Record<string, OptimisticLevelRecord> = {};

const CACHE_STORAGE_KEY = 'kuis_battle_path_cache_v2';
const OPTIMISTIC_STORAGE_KEY = 'kuis_battle_optimistic_completions_v2';
const CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 1 Jam untuk unit & level statis

/**
 * Mengambil rekaman level yang telah diselesaikan secara optimistik
 */
export function getOptimisticCompletions(): Record<string, OptimisticLevelRecord> {
  if (typeof window === 'undefined') {
    return inMemoryOptimisticCompletions;
  }
  try {
    const raw = sessionStorage.getItem(OPTIMISTIC_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      inMemoryOptimisticCompletions = { ...inMemoryOptimisticCompletions, ...parsed };
    }
  } catch {
    // Abaikan jika storage disabled
  }
  return inMemoryOptimisticCompletions;
}

/**
 * Menghapus rekaman optimistik setelah database Supabase mengonfirmasi data tersimpan
 */
export function clearOptimisticCompletion(levelId: string) {
  delete inMemoryOptimisticCompletions[levelId];
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(OPTIMISTIC_STORAGE_KEY, JSON.stringify(inMemoryOptimisticCompletions));
    } catch {
      // Abaikan
    }
  }
}

/**
 * Mengambil cache Path client-side dengan overlay otomatis progres optimistik
 */
export function getPathCache(): PathCacheData | null {
  let cache = inMemoryPathCache;
  if (!cache && typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(CACHE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PathCacheData;
        if (Date.now() - parsed.timestamp < CACHE_MAX_AGE_MS) {
          cache = parsed;
          inMemoryPathCache = parsed;
        }
      }
    } catch {
      // Abaikan jika quota storage browser penuh
    }
  }

  if (!cache) return null;

  // Lapiskan progres optimistik ke atas cache agar level berbintang dan terbuka instan (0 ms)
  const optimistic = getOptimisticCompletions();
  let hasMergedOptimistic = false;
  const mergedProgress: Record<string, TTSUserProgress> = { ...cache.userProgress };

  for (const [lvlId, opt] of Object.entries(optimistic)) {
    if (!mergedProgress[lvlId] || mergedProgress[lvlId].status !== 'completed') {
      mergedProgress[lvlId] = {
        id: `opt-${lvlId}`,
        user_id: cache.profile?.id || '',
        level_id: lvlId,
        status: 'completed',
        score_earned: Math.max(opt.score, mergedProgress[lvlId]?.score_earned || 0),
        time_taken_seconds: 60,
        completed_words: [],
        grid_state: {},
        combo_multiplier: 1,
        completed_at: opt.completedAt,
        updated_at: opt.completedAt,
      };
      hasMergedOptimistic = true;
    }
  }

  if (hasMergedOptimistic) {
    return {
      ...cache,
      userProgress: mergedProgress,
    };
  }

  return cache;
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
  const completedAt = new Date().toISOString();

  // 1. Simpan ke Optimistic Record (tetap tersimpan meskipun cache peta belum ada)
  inMemoryOptimisticCompletions[levelId] = {
    levelId,
    score: scoreEarned,
    coins: coinsEarned,
    completedAt,
  };

  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(
        OPTIMISTIC_STORAGE_KEY,
        JSON.stringify(inMemoryOptimisticCompletions)
      );
    } catch {
      // Abaikan
    }
  }

  // 2. Jika ada cache peta, perbarui progres dan sumber daya pemain seketika
  const current = inMemoryPathCache;
  if (current) {
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
      completed_at: completedAt,
      updated_at: completedAt,
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

  // 3. Pancarkan event agar komponen ThePathPage langsung update React state tanpa reload
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('path-data-updated', {
        detail: { levelId, scoreEarned, coinsEarned },
      })
    );
  }
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

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('path-data-updated'));
  }
}

/**
 * Hapus Cache Path (misal saat logout atau admin mengubah struktur level)
 */
export function invalidatePathCache() {
  inMemoryPathCache = null;
  inMemoryOptimisticCompletions = {};
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(CACHE_STORAGE_KEY);
      sessionStorage.removeItem(OPTIMISTIC_STORAGE_KEY);
    } catch {
      // Abaikan
    }
  }
}
