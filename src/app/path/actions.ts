'use server';

import { createHubServerClient } from '@/lib/supabase-hub-server';
import { Profile, GameSettings, TTSUnit, TTSLevel, TTSUserProgress } from '@/lib/supabase-hub';

/**
 * Mengambil seluruh data peta The Path dalam SATU roundtrip paralel:
 * - Profile User & Sinkronisasi Regenerasi Nyawa In-Memory
 * - Game Settings
 * - Active Units (Pulau)
 * - Published Levels
 * - User Progress untuk seluruh level
 */
export async function getPathDataAction(): Promise<{
  success: boolean;
  profile?: Profile;
  settings?: GameSettings;
  units?: TTSUnit[];
  levels?: TTSLevel[];
  userProgress?: Record<string, TTSUserProgress>;
  error?: string;
}> {
  try {
    const supabase = await createHubServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized: Sesi login tidak valid' };
    }

    // Eksekusi seluruh pembacaan data secara PARALEL murni (Promise.all)
    const [
      profRes,
      settsRes,
      unitsRes,
      levelsRes,
      progressRes,
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('game_settings').select('*').eq('id', 1).maybeSingle(),
      supabase
        .from('tts_units')
        .select('*')
        .eq('is_active', true)
        .order('unit_number', { ascending: true }),
      supabase
        .from('tts_levels')
        .select('*')
        .eq('status', 'published')
        .order('level_number', { ascending: true }),
      supabase.from('tts_user_progress').select('*').eq('user_id', user.id),
    ]);

    const prof = (profRes.data as Profile) || null;
    const setts = (settsRes.data as GameSettings) || null;

    // Kalkulasi regenerasi nyawa otomatis secara instan in-memory
    if (prof && setts) {
      const maxLives = prof.max_lives || 5;
      const currentLives = prof.lives ?? 5;
      const regenMinutes = setts.life_regen_minutes || 15;

      if (currentLives < maxLives && prof.last_life_regen) {
        const lastRegen = new Date(prof.last_life_regen).getTime();
        const now = Date.now();
        const diffMinutes = Math.floor((now - lastRegen) / (1000 * 60));
        const livesToAdd = Math.floor(diffMinutes / regenMinutes);

        if (livesToAdd > 0) {
          const newLives = Math.min(maxLives, currentLives + livesToAdd);
          const newLastRegen = new Date(lastRegen + livesToAdd * regenMinutes * 60 * 1000).toISOString();
          prof.lives = newLives;
          prof.last_life_regen = newLastRegen;

          // Perbarui database secara asinkron di latar belakang (non-blocking)
          supabase
            .from('profiles')
            .update({ lives: newLives, last_life_regen: newLastRegen, updated_at: new Date().toISOString() })
            .eq('id', user.id)
            .then(() => {});
        }
      }
    }

    const progressMap: Record<string, TTSUserProgress> = {};
    (progressRes.data || []).forEach((p) => {
      progressMap[p.level_id] = p as TTSUserProgress;
    });

    return {
      success: true,
      profile: prof || undefined,
      settings: setts || undefined,
      units: (unitsRes.data as TTSUnit[]) || [],
      levels: (levelsRes.data as TTSLevel[]) || [],
      userProgress: progressMap,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal memuat data peta The Path.';
    return { success: false, error: msg };
  }
}
