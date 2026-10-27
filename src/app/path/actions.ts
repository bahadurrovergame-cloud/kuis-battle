'use server';

import { createHubServerClient, createHubAdminClient } from '@/lib/supabase-hub-server';
import { Profile, GameSettings, TTSUnit, TTSLevel, TTSUserProgress, PointHistory } from '@/lib/supabase-hub';

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
  isBanned?: boolean;
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

    // CEK STATUS BANNED: Jika akun diblokir, hentikan akses ke peta dan lempar ke /banned
    if (prof?.is_banned && prof?.role !== 'admin') {
      return { success: false, isBanned: true, error: 'Akun Anda sedang diblokir oleh sistem Anti-Cheat.' };
    }
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

/**
 * Mengambil daftar riwayat perolehan & penyesuaian poin pemain (Tahap 2 Transparansi Skor)
 * Dilengkapi dengan fallback admin client dan auto-backfill progres lama agar tidak kosong.
 */
export async function getUserPointHistoryAction(): Promise<{
  success: boolean;
  history?: PointHistory[];
  error?: string;
}> {
  try {
    const supabase = await createHubServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized: Sesi tidak valid' };
    }

    // 1. Coba fetch dari tabel point_history
    const admin = createHubAdminClient();
    let rows: PointHistory[] = [];

    const { data, error } = await supabase
      .from('point_history')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data && data.length > 0) {
      rows = data as PointHistory[];
    } else {
      // Coba lewat admin client untuk memverifikasi apakah ada kendala RLS
      const { data: adminData } = await admin
        .from('point_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (adminData && adminData.length > 0) {
        rows = adminData as PointHistory[];
      }
    }

    // 2. AUTO-BACKFILL: Jika riwayat masih kosong tetapi pemain sudah punya progress TTS
    if (rows.length === 0) {
      try {
        const { data: progressList } = await admin
          .from('tts_user_progress')
          .select('id, level_id, score_earned, completed_at, updated_at')
          .eq('user_id', user.id)
          .eq('status', 'completed')
          .gt('score_earned', 0)
          .order('completed_at', { ascending: false });

        if (progressList && progressList.length > 0) {
          const { data: levelList } = await admin.from('tts_levels').select('id, level_number');
          const levelMap = new Map((levelList || []).map((l: { id: string; level_number: number }) => [l.id, l.level_number]));

          const backfilledRows = progressList.map((p: { id: string; level_id: string; score_earned: number; completed_at?: string; updated_at?: string }) => ({
            id: `bf-${p.id}`,
            user_id: user.id,
            amount: p.score_earned,
            description: `Menyelesaikan Level ${levelMap.get(p.level_id) || ''}`,
            created_at: p.completed_at || p.updated_at || new Date().toISOString(),
          }));

          rows = backfilledRows;

          // Simpan ke database di background agar permanen
          const insertPayload = backfilledRows.map((r) => ({
            user_id: user.id,
            amount: r.amount,
            description: r.description,
            created_at: r.created_at,
          }));

          try {
            await admin.from('point_history').insert(insertPayload);
          } catch {
            // Abaikan jika background insert gagal
          }
        } else {
          // Cek apakah pemain memiliki total_score di profiles
          const { data: profileRow } = await admin
            .from('profiles')
            .select('total_score')
            .eq('id', user.id)
            .maybeSingle();

          if (profileRow && profileRow.total_score > 0) {
            rows = [
              {
                id: `init-${user.id}`,
                user_id: user.id,
                amount: profileRow.total_score,
                description: 'Total Skor Petualangan TTS',
                created_at: new Date().toISOString(),
              },
            ];
          }
        }
      } catch (backfillErr) {
        console.error('Error auto-backfilling point history:', backfillErr);
      }
    }

    return {
      success: true,
      history: rows,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal mengambil riwayat poin.';
    return { success: false, error: msg };
  }
}


