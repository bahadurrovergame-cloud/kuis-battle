'use server';

import {
  createHubServerClient,
  createHubAdminClient,
  isRealServiceRoleKey,
} from '@/lib/supabase-hub-server';
import { GameSettings, TTSLevel, TTSWord, TTSUserProgress, Profile } from '@/lib/supabase-hub';
import { createGameSessionToken, verifyGameSessionToken } from '@/lib/game-crypto';

// ==============================================================================
// 1. INISIALISASI SESI GAME DENGAN TOKEN ENKRIPSI (HMAC-SHA256 SIGNATURE)
// Mencegah penembakan API via Postman/curl tanpa token sesi yang sah dari server
// ==============================================================================
export async function startLevelSessionAction({ levelId }: { levelId: string }): Promise<{
  success: boolean;
  sessionToken?: string;
  serverStartedAt?: number;
  error?: string;
}> {
  try {
    const supabase = await createHubServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Sesi login tidak valid' };
    }

    // 1. Cek & sinkronisasi ketersediaan nyawa pemain dengan regenerasi otomatis
    await syncLifeRegenAction();

    const { data: prof } = await supabase
      .from('profiles')
      .select('lives, max_lives')
      .eq('id', user.id)
      .single();

    if (prof && (prof.lives ?? 5) <= 0) {
      return {
        success: false,
        error: 'Nyawa Anda habis! Tunggu waktu regenerasi atau tukarkan Koin untuk mengisi nyawa.',
      };
    }

    // 2. Cek apakah level valid dan berstatus published (atau user adalah admin)
    const { data: lvl } = await supabase
      .from('tts_levels')
      .select('id, status')
      .eq('id', levelId)
      .maybeSingle();

    if (!lvl) {
      return { success: false, error: 'Level TTS tidak ditemukan' };
    }

    // 3. Buat Cryptographic HMAC Token yang memuat timestamp server terverifikasi
    const sessionToken = createGameSessionToken(user.id, levelId);

    // 4. Inisialisasi progress awal (HANYA jika belum ada atau statusnya bukan 'completed')
    const { data: existingProg } = await supabase
      .from('tts_user_progress')
      .select('status')
      .eq('user_id', user.id)
      .eq('level_id', levelId)
      .maybeSingle();

    if (!existingProg) {
      await supabase.from('tts_user_progress').insert({
        user_id: user.id,
        level_id: levelId,
        status: 'in_progress',
        updated_at: new Date().toISOString(),
      });
    } else if (existingProg.status !== 'completed') {
      await supabase
        .from('tts_user_progress')
        .update({
          status: 'in_progress',
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('level_id', levelId);
    }

    return {
      success: true,
      sessionToken,
      serverStartedAt: Date.now(),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Kesalahan server saat memulai sesi';
    return { success: false, error: msg };
  }
}

// ==============================================================================
// 2. SUBMIT JAWABAN KATA DENGAN VERIFIKASI TOKEN & SERVER-SIDE SCORING
// (Anti-Speedhack, Anti-Replay, Anti-Double Scoring, & Anti-Payload Tampering)
// ==============================================================================
export async function submitWordAction({
  levelId,
  wordId,
  submittedWord,
  sessionToken,
}: {
  levelId: string;
  wordId: string;
  submittedWord: string;
  sessionToken: string;
}): Promise<{
  success: boolean;
  isCorrect?: boolean;
  isAlreadyCompleted?: boolean;
  newCombo?: number;
  earnedScore?: number;
  totalScoreNow?: number;
  targetWord?: string;
  message?: string;
  error?: string;
  isCheatDetected?: boolean;
}> {
  try {
    const supabase = await createHubServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Sesi login tidak valid' };
    }

    // 1. Verifikasi Integritas Token Sesi Game (Anti-Tampering & Anti-Postman)
    const tokenVerify = verifyGameSessionToken(sessionToken, user.id, levelId);
    if (!tokenVerify.isValid || !tokenVerify.startedAt) {
      return {
        success: false,
        error: tokenVerify.error || 'Token sesi game tidak valid',
        isCheatDetected: true,
      };
    }

    // 2. Hitung Waktu Elapsed Asli dari Sisi Server (Speedhack Prevention)
    const serverElapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - tokenVerify.startedAt) / 1000)
    );

    // 3. Ambil Target Kata dari Database
    const { data: wordData, error: wordErr } = await supabase
      .from('tts_words')
      .select('*')
      .eq('id', wordId)
      .eq('level_id', levelId)
      .maybeSingle();

    if (wordErr || !wordData) {
      return { success: false, error: 'Data kata tidak ditemukan dalam level ini' };
    }

    // 4. Ambil Progress User Saat Ini
    const { data: existingProg } = await supabase
      .from('tts_user_progress')
      .select('*')
      .eq('user_id', user.id)
      .eq('level_id', levelId)
      .maybeSingle();

    const completedWords: string[] = Array.isArray(existingProg?.completed_words)
      ? existingProg.completed_words
      : [];

    // CEGAH EXPLOIT DOUBLE-SCORING: Jika kata sudah pernah dijawab benar, jangan tambah poin lagi!
    if (completedWords.includes(wordId)) {
      return {
        success: true,
        isCorrect: true,
        isAlreadyCompleted: true,
        earnedScore: 0,
        totalScoreNow: existingProg?.score_earned || 0,
        message: 'Kata ini telah diselesaikan sebelumnya.',
        targetWord: wordData.word.trim().toUpperCase(),
      };
    }

    const cleanTarget = wordData.word.trim().toUpperCase();
    const cleanInput = submittedWord.trim().toUpperCase();

    // 5. Evaluasi Jawaban
    if (cleanTarget !== cleanInput) {
      // Salah: Reset combo streak ke 1.0 di database
      await supabase
        .from('tts_user_progress')
        .upsert(
          {
            user_id: user.id,
            level_id: levelId,
            combo_multiplier: 1.0,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,level_id' }
        );

      return {
        success: true,
        isCorrect: false,
        newCombo: 1.0,
        message: 'Jawaban belum tepat',
      };
    }

    // 6. Jawaban Benar: Ambil Multiplier Saat Ini dari DATABASE (Bukan dari Input Client!)
    const currentDbCombo = Number(existingProg?.combo_multiplier) || 1.0;
    let newCombo = 1.2;
    if (currentDbCombo >= 2.5) newCombo = 3.0;
    else if (currentDbCombo >= 2.0) newCombo = 2.5;
    else if (currentDbCombo >= 1.5) newCombo = 2.0;
    else if (currentDbCombo >= 1.2) newCombo = 1.5;

    // 7. Hitung Scoring Decay Menggunakan Waktu Asli Server
    const { data: setts } = await supabase
      .from('game_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    const { data: levelData } = await supabase
      .from('tts_levels')
      .select('decay_rate_override, is_hard_zone')
      .eq('id', levelId)
      .maybeSingle();

    const basePoints = wordData.points || 100;
    let decayRate = levelData?.decay_rate_override || setts?.decay_rate_per_sec || 2;
    if (levelData?.is_hard_zone) {
      decayRate = Math.max(decayRate, 4); // Zona Hard: Decay minimal 4 poin/detik
    }

    const pointsLost = Math.floor(serverElapsedSeconds * decayRate);
    const minPoints = 20; // Poin dasar minimum jika terlambat menjawab
    const netPoints = Math.max(minPoints, basePoints - pointsLost);
    const finalEarnedScore = Math.round(netPoints * newCombo);

    // 8. Update Progress di Database secara Atomik
    if (!completedWords.includes(wordId)) {
      completedWords.push(wordId);
    }
    const currentTotalScore = (existingProg?.score_earned || 0) + finalEarnedScore;
    const targetStatus = existingProg?.status === 'completed' ? 'completed' : 'in_progress';

    await supabase.from('tts_user_progress').upsert(
      {
        user_id: user.id,
        level_id: levelId,
        status: targetStatus,
        completed_words: completedWords,
        score_earned: currentTotalScore,
        combo_multiplier: newCombo,
        time_taken_seconds: serverElapsedSeconds,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,level_id' }
    );

    return {
      success: true,
      isCorrect: true,
      isAlreadyCompleted: false,
      newCombo,
      earnedScore: finalEarnedScore,
      totalScoreNow: currentTotalScore,
      targetWord: cleanTarget,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Kesalahan server saat mengevaluasi kata';
    return { success: false, error: msg };
  }
}

// ==============================================================================
// 3. SELESAIKAN LEVEL & DISTRIBUSI HADIAH (SERVER VALIDATION KETAT)
// Validasi: Speedhack Human Limit, Kelengkapan Semua Kata, & Batas Skor Maksimal
// ==============================================================================
export async function completeLevelAction({
  levelId,
  sessionToken,
}: {
  levelId: string;
  sessionToken: string;
}): Promise<{
  success: boolean;
  scoreEarned?: number;
  coinsEarned?: number;
  totalScoreNow?: number;
  nextLevelId?: string;
  isAlreadyCompleted?: boolean;
  error?: string;
  isCheatDetected?: boolean;
}> {
  try {
    const supabase = await createHubServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: 'Unauthorized' };

    // 1. Verifikasi Token Sesi Game
    const tokenVerify = verifyGameSessionToken(sessionToken, user.id, levelId);
    if (!tokenVerify.isValid || !tokenVerify.startedAt) {
      return {
        success: false,
        error: tokenVerify.error || 'Token sesi game tidak valid',
        isCheatDetected: true,
      };
    }

    // 2. Waktu Asli Pengerjaan Dihitung Murni dari Sisi Server
    const realElapsedSeconds = Math.max(
      1,
      Math.floor((Date.now() - tokenVerify.startedAt) / 1000)
    );

    // 3. Ambil Semua Kata yang Ada di Level Ini
    const { data: dbWords, error: dbWordsErr } = await supabase
      .from('tts_words')
      .select('id, points')
      .eq('level_id', levelId);

    if (dbWordsErr || !dbWords || dbWords.length === 0) {
      return { success: false, error: 'Data soal level tidak ditemukan' };
    }

    // 4. Ambil Progress User Saat Ini
    const { data: prog } = await supabase
      .from('tts_user_progress')
      .select('*')
      .eq('user_id', user.id)
      .eq('level_id', levelId)
      .maybeSingle();

    if (!prog) {
      return { success: false, error: 'Progress level pemain tidak ditemukan' };
    }

    const completedWords: string[] = Array.isArray(prog.completed_words) ? prog.completed_words : [];

    // VALIDASI INTEGRITAS 1: Pastikan SEMUA kata pada level ini benar-benar telah terjawab!
    const allWordsAnswered = dbWords.every((w) => completedWords.includes(w.id));
    if (!allWordsAnswered || completedWords.length < dbWords.length) {
      return {
        success: false,
        error: `Integritas Gagal: Level belum selesai (${completedWords.length}/${dbWords.length} kata terjawab).`,
        isCheatDetected: true,
      };
    }

    // VALIDASI INTEGRITAS 2: Speedhack Prevention (Batas Fisik Kecepatan Manusia)
    // Toleran untuk pemain yang me-reload halaman atau menyelesaikan kata terakhir.
    const prevTimeTaken = prog.time_taken_seconds || 0;
    const totalEffectiveTime = Math.max(realElapsedSeconds, prevTimeTaken);
    if (totalEffectiveTime < 2 && dbWords.length > 2 && prog.status !== 'completed') {
      return {
        success: false,
        error: `Speedhack Anomaly: Waktu tempuh (${totalEffectiveTime}s) terlalu cepat untuk ${dbWords.length} kata.`,
        isCheatDetected: true,
      };
    }

    // VALIDASI INTEGRITAS 3: Cegah Injeksi Skor (Payload Tampering)
    const totalBasePoints = dbWords.reduce((sum, w) => sum + (w.points || 100), 0);
    const maxTheoreticalScore = Math.round(totalBasePoints * 3.0);
    const scoreEarned = prog.score_earned || 0;

    if (scoreEarned > maxTheoreticalScore) {
      return {
        success: false,
        error: `Payload Tampering Anomaly: Skor (${scoreEarned}) melebihi batas maksimal teoretis (${maxTheoreticalScore}).`,
        isCheatDetected: true,
      };
    }

    // 5. Ambil Pengaturan Game
    const { data: setts } = await supabase
      .from('game_settings')
      .select('coins_per_level, current_season')
      .eq('id', 1)
      .maybeSingle();

    const coinsReward = setts?.coins_per_level || 20;
    const currentSeason = setts?.current_season || 1;
    const isFirstTimeCompletion = prog.status !== 'completed';

    // 6. Update Status Progress Level Menjadi Completed
    const dbClient = isRealServiceRoleKey(process.env.SUPABASE_HUB_SERVICE_ROLE_KEY)
      ? createHubAdminClient()
      : supabase;

    await dbClient
      .from('tts_user_progress')
      .update({
        status: 'completed',
        time_taken_seconds: Math.max(realElapsedSeconds, prevTimeTaken),
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('level_id', levelId);

    // 7. Tambahkan Koin & Skor ke Profil Pemain (HANYA jika belum pernah completed sebelumnya)
    let coinsEarnedThisRun = 0;
    const { data: prof } = await dbClient
      .from('profiles')
      .select('coins, total_score')
      .eq('id', user.id)
      .single();

    let currentTotalScore = prof?.total_score || 0;

    if (prof && isFirstTimeCompletion) {
      coinsEarnedThisRun = coinsReward;
      currentTotalScore += scoreEarned;
      await dbClient
        .from('profiles')
        .update({
          coins: (prof.coins || 0) + coinsReward,
          total_score: currentTotalScore,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
    }

    // 8. Update Klasemen Realtime (tts_leaderboard) jika penyelesaian baru (HANYA UNTUK NON-ADMIN)
    const { data: userRoleProf } = await dbClient
      .from('profiles')
      .select('role, username')
      .eq('id', user.id)
      .maybeSingle();

    const isAdminUser =
      userRoleProf?.role === 'admin' ||
      userRoleProf?.username?.toLowerCase().includes('admin');

    if (isFirstTimeCompletion && !isAdminUser) {
      const { data: leaderRow } = await dbClient
        .from('tts_leaderboard')
        .select('*')
        .eq('user_id', user.id)
        .eq('season_number', currentSeason)
        .maybeSingle();

      const prevScore = leaderRow?.total_score || 0;
      const prevTime = leaderRow?.total_time_taken || 0;
      const prevLevels = leaderRow?.levels_completed || 0;

      await dbClient.from('tts_leaderboard').upsert(
        {
          user_id: user.id,
          season_number: currentSeason,
          total_score: prevScore + scoreEarned,
          total_time_taken: prevTime + realElapsedSeconds,
          levels_completed: prevLevels + 1,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,season_number' }
      );
    }

    // 9. Cari Next Level ID untuk navigasi langsung ke level selanjutnya
    let nextLevelId: string | null = null;
    const { data: currentLvl } = await dbClient
      .from('tts_levels')
      .select('id, level_number, unit_id')
      .eq('id', levelId)
      .maybeSingle();

    if (currentLvl) {
      // Cari level berikutnya di unit yang sama
      const { data: nextInUnit } = await dbClient
        .from('tts_levels')
        .select('id')
        .eq('unit_id', currentLvl.unit_id)
        .eq('status', 'published')
        .gt('level_number', currentLvl.level_number)
        .order('level_number', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (nextInUnit) {
        nextLevelId = nextInUnit.id;
      } else {
        // Cari level pertama di unit selanjutnya
        const { data: currentUnit } = await dbClient
          .from('tts_units')
          .select('unit_number')
          .eq('id', currentLvl.unit_id)
          .maybeSingle();

        if (currentUnit) {
          const { data: nextUnit } = await dbClient
            .from('tts_units')
            .select('id')
            .eq('is_active', true)
            .gt('unit_number', currentUnit.unit_number)
            .order('unit_number', { ascending: true })
            .limit(1)
            .maybeSingle();

          if (nextUnit) {
            const { data: firstLvlNextUnit } = await dbClient
              .from('tts_levels')
              .select('id')
              .eq('unit_id', nextUnit.id)
              .eq('status', 'published')
              .order('level_number', { ascending: true })
              .limit(1)
              .maybeSingle();

            if (firstLvlNextUnit) {
              nextLevelId = firstLvlNextUnit.id;
            }
          }
        }
      }
    }

    return {
      success: true,
      scoreEarned,
      coinsEarned: coinsEarnedThisRun,
      totalScoreNow: currentTotalScore,
      nextLevelId: nextLevelId || undefined,
      isAlreadyCompleted: !isFirstTimeCompletion,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal menyelesaikan level';
    return { success: false, error: msg };
  }
}

/**
 * Self-Healing Progress: Menyinkronkan status level yang seluruh katanya sudah lengkap
 * agar pulau dan path segera mencerminkan status tamat dan membuka level berikutnya.
 */
export async function syncCompletedLevelsAction(): Promise<{ success: boolean; syncedCount: number }> {
  try {
    const supabase = await createHubServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, syncedCount: 0 };

    const { data: progressRows } = await supabase
      .from('tts_user_progress')
      .select('*')
      .eq('user_id', user.id)
      .neq('status', 'completed');

    if (!progressRows || progressRows.length === 0) {
      return { success: true, syncedCount: 0 };
    }

    const { data: allWords } = await supabase
      .from('tts_words')
      .select('id, level_id');

    if (!allWords || allWords.length === 0) return { success: true, syncedCount: 0 };

    const wordsByLevel: Record<string, string[]> = {};
    allWords.forEach((w) => {
      if (!wordsByLevel[w.level_id]) wordsByLevel[w.level_id] = [];
      wordsByLevel[w.level_id].push(w.id);
    });

    let syncedCount = 0;
    const dbClient = isRealServiceRoleKey(process.env.SUPABASE_HUB_SERVICE_ROLE_KEY)
      ? createHubAdminClient()
      : supabase;

    for (const prog of progressRows) {
      const levelWordIds = wordsByLevel[prog.level_id] || [];
      const completedWords: string[] = Array.isArray(prog.completed_words) ? prog.completed_words : [];

      if (levelWordIds.length > 0 && levelWordIds.every((wid) => completedWords.includes(wid))) {
        await dbClient
          .from('tts_user_progress')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id)
          .eq('level_id', prog.level_id);

        syncedCount++;
      }
    }

    return { success: true, syncedCount };
  } catch (err) {
    console.error('Error syncing completed levels:', err);
    return { success: false, syncedCount: 0 };
  }
}

// ==============================================================================
// 4. POWER-UP: HINT (VERIFIKASI TOKEN & PEMOTONGAN KOIN AMAN)
// ==============================================================================
export async function useHintAction({
  levelId,
  sessionToken,
}: {
  levelId: string;
  sessionToken: string;
}) {
  try {
    const supabase = await createHubServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: 'Unauthorized' };

    const tokenVerify = verifyGameSessionToken(sessionToken, user.id, levelId);
    if (!tokenVerify.isValid) {
      return { success: false, error: tokenVerify.error || 'Token sesi game tidak valid' };
    }

    const { data: setts } = await supabase
      .from('game_settings')
      .select('hint_price_coins, coins_per_level')
      .eq('id', 1)
      .maybeSingle();

    const price = setts?.hint_price_coins || 15;

    const dbClient = isRealServiceRoleKey(process.env.SUPABASE_HUB_SERVICE_ROLE_KEY)
      ? createHubAdminClient()
      : supabase;
    const { data: prof } = await dbClient
      .from('profiles')
      .select('coins')
      .eq('id', user.id)
      .single();

    if (!prof || prof.coins < price) {
      return {
        success: false,
        error: `Koin tidak mencukupi (${prof?.coins ?? 0}/${price} 🪙). Selesaikan level di peta petualangan untuk mendapatkan +${setts?.coins_per_level || 20} Koin per level!`,
      };
    }

    const newCoins = prof.coins - price;
    await dbClient.from('profiles').update({ coins: newCoins }).eq('id', user.id);

    return { success: true, newCoins };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal membeli hint';
    return { success: false, error: msg };
  }
}

// ==============================================================================
// 5. POWER-UP: FREEZE TIME (VERIFIKASI TOKEN & PEMOTONGAN KOIN AMAN)
// ==============================================================================
export async function useFreezeAction({
  levelId,
  sessionToken,
}: {
  levelId: string;
  sessionToken: string;
}) {
  try {
    const supabase = await createHubServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: 'Unauthorized' };

    const tokenVerify = verifyGameSessionToken(sessionToken, user.id, levelId);
    if (!tokenVerify.isValid) {
      return { success: false, error: tokenVerify.error || 'Token sesi game tidak valid' };
    }

    const { data: setts } = await supabase
      .from('game_settings')
      .select('freeze_price_coins, freeze_duration_seconds, coins_per_level')
      .eq('id', 1)
      .maybeSingle();

    const price = setts?.freeze_price_coins || 25;
    const duration = setts?.freeze_duration_seconds || 10;

    const dbClient = isRealServiceRoleKey(process.env.SUPABASE_HUB_SERVICE_ROLE_KEY)
      ? createHubAdminClient()
      : supabase;
    const { data: prof } = await dbClient
      .from('profiles')
      .select('coins')
      .eq('id', user.id)
      .single();

    if (!prof || prof.coins < price) {
      return {
        success: false,
        error: `Koin tidak mencukupi (${prof?.coins ?? 0}/${price} 🪙). Selesaikan level di peta petualangan untuk mendapatkan +${setts?.coins_per_level || 20} Koin per level!`,
      };
    }

    const newCoins = prof.coins - price;
    await dbClient.from('profiles').update({ coins: newCoins }).eq('id', user.id);

    return { success: true, newCoins, durationSeconds: duration };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal membekukan waktu';
    return { success: false, error: msg };
  }
}

// ==============================================================================
// 6. CLOUD AUTO-SAVE DEBOUNCED (ANTI-SPAM DATABASE)
// ==============================================================================
export async function saveProgressDebouncedAction({
  levelId,
  gridState,
  sessionToken,
}: {
  levelId: string;
  gridState: Record<string, string>;
  sessionToken: string;
}) {
  try {
    const supabase = await createHubServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: 'Unauthorized' };

    const tokenVerify = verifyGameSessionToken(sessionToken, user.id, levelId);
    if (!tokenVerify.isValid || !tokenVerify.startedAt) {
      return { success: false, error: 'Token sesi tidak valid' };
    }

    const serverElapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - tokenVerify.startedAt) / 1000)
    );

    await supabase.from('tts_user_progress').upsert(
      {
        user_id: user.id,
        level_id: levelId,
        grid_state: gridState,
        time_taken_seconds: serverElapsedSeconds,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,level_id' }
    );

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal auto-save';
    return { success: false, error: msg };
  }
}

// ==============================================================================
// 7. SENSOR CURANG KE-3: PEMUSNAHAN AKUN OTOMATIS (CASCADE DELETE SERVICE ROLE)
// Zero-Tolerance Anti-Cheat: Hapus Akun & Seluruh Data Seketika untuk Hemat Memori
// ==============================================================================
export async function triggerAntiCheatExecution(reason = 'Terdeteksi manipulasi game/pindah layar 3x') {
  try {
    const supabaseServer = await createHubServerClient();
    const {
      data: { user },
    } = await supabaseServer.auth.getUser();

    if (!user) {
      return { success: false, error: 'User tidak ditemukan' };
    }

    const userId = user.id;
    const userEmail = user.email?.trim().toLowerCase();
    console.warn(`[Anti-Cheat Zero-Tolerance] Memusnahkan akun ${userId} (${userEmail}). Alasan: ${reason}`);

    // 1. Coba eksekusi melalui PostgreSQL RPC Super-User jika tersedia di database
    if (userEmail) {
      try {
        await supabaseServer.rpc('execute_anti_cheat_ban', {
          target_user_id: userId,
          target_email: userEmail,
          ban_reason: reason,
        });
      } catch (rpcErr) {
        console.warn('[Anti-Cheat] RPC execute_anti_cheat_ban not available or skipped:', rpcErr);
      }

      // Catat ke tabel banned_users
      try {
        await supabaseServer.from('banned_users').upsert(
          {
            email: userEmail,
            user_id: userId,
            reason,
            banned_at: new Date().toISOString(),
          },
          { onConflict: 'email' }
        );
      } catch (tableErr) {
        console.warn('[Anti-Cheat] Catat banned_users skipped:', tableErr);
      }
    }

    // 2. Eksekusi penghapusan akun auth jika Service Role Key tersedia
    if (isRealServiceRoleKey(process.env.SUPABASE_HUB_SERVICE_ROLE_KEY)) {
      const supabaseAdmin = createHubAdminClient();
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (deleteError) {
        console.error('[Anti-Cheat Engine] Gagal menghapus user via admin API:', deleteError);
      }
    }

    // 3. Hapus data game pemain
    await supabaseServer.from('tts_user_progress').delete().eq('user_id', userId);
    await supabaseServer.from('tts_leaderboard').delete().eq('user_id', userId);
    await supabaseServer.from('profiles').delete().eq('id', userId);

    // 4. Hapus sesi di browser
    await supabaseServer.auth.signOut();

    return {
      success: true,
      message: 'Akun dan email Anda telah dimusnahkan secara permanen karena terdeteksi melakukan kecurangan.',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal mengeksekusi anti-cheat';
    return { success: false, error: msg };
  }
}

/**
 * Cek apakah email berada dalam daftar banned Anti-Cheat
 */
export async function checkBannedEmailAction(email: string): Promise<{
  isBanned: boolean;
  reason?: string;
}> {
  try {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return { isBanned: false };

    const supabase = await createHubServerClient();
    const { data } = await supabase
      .from('banned_users')
      .select('reason')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (data) {
      return {
        isBanned: true,
        reason: data.reason || 'Terdeteksi manipulasi game 3x',
      };
    }

    return { isBanned: false };
  } catch {
    return { isBanned: false };
  }
}

/**
 * Unban / Reset Email Pemain (Untuk Admin & Keperluan Testing)
 */
export async function unbanEmailAction(email: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  try {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return { success: false, error: 'Email wajib diisi' };

    const supabase = await createHubServerClient();

    // Hapus dari daftar banned_users
    await supabase.from('banned_users').delete().eq('email', cleanEmail);

    // Hapus dari auth.users jika Service Role Key tersedia
    if (isRealServiceRoleKey(process.env.SUPABASE_HUB_SERVICE_ROLE_KEY)) {
      const adminClient = createHubAdminClient();
      const { data: usersData } = await adminClient.auth.admin.listUsers();
      const foundUser = usersData?.users.find((u) => u.email?.toLowerCase() === cleanEmail);
      if (foundUser) {
        await adminClient.auth.admin.deleteUser(foundUser.id);
      }
    }

    return { success: true, message: `Email ${cleanEmail} berhasil di-unban / direset.` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal unban email';
    return { success: false, error: msg };
  }
}

// ==============================================================================
// 8. KURANGI NYAWA SAAT GAME OVER (HARD TIMER HABIS)
// ==============================================================================
export async function deductLifeOnGameOverAction() {
  try {
    const supabase = await createHubServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: 'Unauthorized' };

    const dbClient = isRealServiceRoleKey(process.env.SUPABASE_HUB_SERVICE_ROLE_KEY)
      ? createHubAdminClient()
      : supabase;
    const { data: prof } = await dbClient
      .from('profiles')
      .select('lives')
      .eq('id', user.id)
      .single();

    if (prof) {
      const remainingLives = Math.max(0, (prof.lives || 1) - 1);
      await dbClient
        .from('profiles')
        .update({
          lives: remainingLives,
          last_life_regen: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      return { success: true, remainingLives };
    }

    return { success: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal mengurangi nyawa';
    return { success: false, error: msg };
  }
}

// ==============================================================================
// 9. REFILL NYAWA PENUH DENGAN KOIN (SERVER-SIDE VALIDATION)
// Mencegah eksploitasi manipulasi profil di browser console (Security Hardening)
// ==============================================================================
export async function refillLivesAction(): Promise<{
  success: boolean;
  newCoins?: number;
  newLives?: number;
  error?: string;
}> {
  try {
    const supabase = await createHubServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: 'Unauthorized' };

    const { data: setts } = await supabase
      .from('game_settings')
      .select('coins_refill_lives_price')
      .eq('id', 1)
      .maybeSingle();

    const price = setts?.coins_refill_lives_price || 50;

    const dbClient = isRealServiceRoleKey(process.env.SUPABASE_HUB_SERVICE_ROLE_KEY)
      ? createHubAdminClient()
      : supabase;
    const { data: prof } = await dbClient
      .from('profiles')
      .select('coins, lives, max_lives')
      .eq('id', user.id)
      .single();

    if (!prof) {
      return { success: false, error: 'Profil pemain tidak ditemukan' };
    }

    if (prof.coins < price) {
      return { success: false, error: `Koin tidak mencukupi (${prof.coins}/${price} Koin)` };
    }

    const newCoins = prof.coins - price;
    const newLives = prof.max_lives || 5;

    await dbClient
      .from('profiles')
      .update({
        coins: newCoins,
        lives: newLives,
        last_life_regen: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    return { success: true, newCoins, newLives };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal mengisi ulang nyawa';
    return { success: false, error: msg };
  }
}

// ==============================================================================
// 10. SINKRONISASI REGENERASI NYAWA OTOMATIS BERDASARKAN WAKTU BERLALU
// ==============================================================================
export async function syncLifeRegenAction(): Promise<{
  success: boolean;
  lives?: number;
  maxLives?: number;
  lastLifeRegen?: string;
  minutesPerLife?: number;
}> {
  try {
    const supabase = await createHubServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false };

    const { data: setts } = await supabase
      .from('game_settings')
      .select('life_regen_minutes')
      .eq('id', 1)
      .maybeSingle();

    const regenMinutes = setts?.life_regen_minutes || 15;
    const regenMs = regenMinutes * 60 * 1000;

    const dbClient = isRealServiceRoleKey(process.env.SUPABASE_HUB_SERVICE_ROLE_KEY)
      ? createHubAdminClient()
      : supabase;

    const { data: prof } = await dbClient
      .from('profiles')
      .select('lives, max_lives, last_life_regen')
      .eq('id', user.id)
      .single();

    if (!prof) return { success: false };

    const maxLives = prof.max_lives || 5;
    let currentLives = prof.lives ?? 5;
    const lastRegenTime = prof.last_life_regen ? new Date(prof.last_life_regen).getTime() : Date.now();

    // Jika nyawa kurang dari batas maksimal, hitung regenerasi
    if (currentLives < maxLives) {
      const now = Date.now();
      const elapsedMs = Math.max(0, now - lastRegenTime);

      if (elapsedMs >= regenMs) {
        const livesToAdd = Math.floor(elapsedMs / regenMs);
        currentLives = Math.min(maxLives, currentLives + livesToAdd);

        // Jika nyawa sudah penuh, set ke now; jika belum, pertahankan sisa waktu untuk regen berikutnya
        const leftoverMs = currentLives >= maxLives ? 0 : elapsedMs % regenMs;
        const newRegenIso = new Date(now - leftoverMs).toISOString();

        await dbClient
          .from('profiles')
          .update({
            lives: currentLives,
            last_life_regen: newRegenIso,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);

        return {
          success: true,
          lives: currentLives,
          maxLives,
          lastLifeRegen: newRegenIso,
          minutesPerLife: regenMinutes,
        };
      }
    }

    return {
      success: true,
      lives: currentLives,
      maxLives,
      lastLifeRegen: prof.last_life_regen,
      minutesPerLife: regenMinutes,
    };
  } catch (err) {
    console.error('Error syncing life regen:', err);
    return { success: false };
  }
}
