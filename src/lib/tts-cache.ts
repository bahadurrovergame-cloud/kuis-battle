import { initTTSGameAction } from '@/app/tts/actions';
import type { TTSLevel, TTSWord, TTSUserProgress, Profile, GameSettings } from '@/lib/supabase-hub';

export type TTSGameInitResult = {
  success: boolean;
  sessionToken?: string;
  startedAtMs?: number;
  serverElapsedSeconds?: number;
  profile?: Profile;
  settings?: GameSettings;
  level?: TTSLevel;
  words?: TTSWord[];
  progress?: TTSUserProgress;
  error?: string;
};

// In-flight Promise cache untuk deduplikasi request & eliminasi waterfall
const inFlightPromises = new Map<string, Promise<TTSGameInitResult>>();

// Client-side in-memory data cache dengan TTL
const dataCache = new Map<string, { data: TTSGameInitResult; timestamp: number }>();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 Menit

/**
 * Memulai prefetching data level TTS di latar belakang saat pemain membuka modal level di /path.
 * Menghilangkan jeda "Mempersiapkan Papan TTS..." saat pemain menekan "Mulai Tantangan".
 */
export function prefetchTTSGame(levelId: string): Promise<TTSGameInitResult> {
  if (!levelId) return Promise.resolve({ success: false, error: 'Level ID tidak valid' });

  // 1. Cek cache in-memory yang masih fresh
  const cached = dataCache.get(levelId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS && cached.data.success) {
    return Promise.resolve(cached.data);
  }

  // 2. Cek apakah ada request yang sedang in-flight
  const existingPromise = inFlightPromises.get(levelId);
  if (existingPromise) {
    return existingPromise;
  }

  // 3. Eksekusi request ke Server Action
  const promise = initTTSGameAction({ levelId })
    .then((res) => {
      if (res.success) {
        dataCache.set(levelId, { data: res, timestamp: Date.now() });
      }
      return res;
    })
    .catch((err) => {
      return { success: false, error: err instanceof Error ? err.message : 'Gagal memuat level TTS' };
    })
    .finally(() => {
      inFlightPromises.delete(levelId);
    });

  inFlightPromises.set(levelId, promise);
  return promise;
}

/**
 * Mengambil data level TTS dari cache secara sinkron untuk render awal (0 ms render).
 */
export function getCachedTTSGame(levelId: string): TTSGameInitResult | null {
  if (!levelId) return null;
  const cached = dataCache.get(levelId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS && cached.data.success) {
    return cached.data;
  }
  return null;
}

/**
 * Mengambil referensi Promise in-flight jika request sedang berjalan di latar belakang.
 */
export function getInFlightTTSGamePromise(levelId: string): Promise<TTSGameInitResult> | null {
  return inFlightPromises.get(levelId) || null;
}

/**
 * Membersihkan cache game TTS tertentu atau seluruhnya (misal setelah level selesai / reset skor).
 */
export function invalidateTTSGameCache(levelId?: string) {
  if (levelId) {
    dataCache.delete(levelId);
    inFlightPromises.delete(levelId);
  } else {
    dataCache.clear();
    inFlightPromises.clear();
  }
}

