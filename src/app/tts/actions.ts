'use server';

import { revalidatePath } from 'next/cache';
import {
  createHubServerClient,
  createHubAdminClient,
  isRealServiceRoleKey,
} from '@/lib/supabase-hub-server';
import { GameSettings, TTSLevel, TTSWord, TTSUserProgress, Profile } from '@/lib/supabase-hub';
import { createGameSessionToken, verifyGameSessionToken } from '@/lib/game-crypto';
import { buildCrosswordLayout } from '@/lib/crossword-generator';

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
      .select('lives, max_lives, is_banned, role')
      .eq('id', user.id)
      .maybeSingle();

    if (prof?.is_banned && prof?.role !== 'admin') {
      return {
        success: false,
        error: 'Akun Anda sedang diblokir karena terdeteksi melakukan kecurangan.',
      };
    }

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

/**
 * Inisialisasi Cepat Level TTS (High-Performance Unified Server Action):
 * Menggabungkan 8-15 request terpisah menjadi 1 request paralel berkecepatan tinggi:
 * - Autentikasi Pengguna
 * - Profile & Settings
 * - Level Data & Words
 * - Sesi Token HMAC-SHA256
 * - Resolusi Tata Letak TTS Skema 1 (In-house Engine)
 * - User Progress Terkini
 */
export async function initTTSGameAction({ levelId }: { levelId: string }): Promise<{
  success: boolean;
  sessionToken?: string;
  profile?: Profile;
  settings?: GameSettings;
  level?: TTSLevel;
  words?: TTSWord[];
  progress?: TTSUserProgress;
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

    // 1. Eksekusi seluruh pembacaan data secara PARALEL dengan Promise.all
    const [
      profRes,
      settsRes,
      lvlRes,
      wordsRes,
      progRes,
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('game_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('tts_levels').select('*').eq('id', levelId).maybeSingle(),
      supabase
        .from('tts_words')
        .select('*')
        .eq('level_id', levelId)
        .order('word_number', { ascending: true }),
      supabase
        .from('tts_user_progress')
        .select('*')
        .eq('user_id', user.id)
        .eq('level_id', levelId)
        .maybeSingle(),
    ]);

    const prof = profRes.data as Profile | null;
    const setts = settsRes.data as GameSettings | null;
    const lvl = lvlRes.data as TTSLevel | null;
    const dbWords = (wordsRes.data as TTSWord[]) || [];
    let prog = progRes.data as TTSUserProgress | null;

    if (!lvl) {
      return { success: false, error: 'Level TTS tidak ditemukan' };
    }

    // 2. Cek & Regenerasi Nyawa in-memory (Instan tanpa blocking)
    if (prof) {
      const maxLives = prof.max_lives || 5;
      const currentLives = prof.lives ?? 5;
      const regenMinutes = setts?.life_regen_minutes || 15;

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

          // Asynchronously update DB in background
          supabase
            .from('profiles')
            .update({ lives: newLives, last_life_regen: newLastRegen, updated_at: new Date().toISOString() })
            .eq('id', user.id)
            .then(() => {});
        }
      }

      if ((prof.lives ?? 5) <= 0) {
        return {
          success: false,
          error: 'Nyawa Anda habis! Tunggu waktu regenerasi atau tukarkan Koin untuk mengisi nyawa.',
        };
      }
    }

    // 3. Buat Cryptographic HMAC Token
    const sessionToken = createGameSessionToken(user.id, levelId);

    // 4. Resolusi Kata & Susunan Grid (Skema 1: Bank Kosakata Dinamis)
    let actualWords: TTSWord[] = [];
    const savedActiveWords = (prog?.grid_state as any)?._active_words;

    if (Array.isArray(savedActiveWords) && savedActiveWords.length >= 3) {
      actualWords = savedActiveWords as TTSWord[];
    } else if (dbWords && dbWords.length > 5) {
      // Level memiliki Bank Kosakata (> 5 kata). Susun kisi-kisi dinamis unik untuk user ini!
      const layout = buildCrosswordLayout(
        lvl.title || 'Level TTS',
        dbWords.map((w) => ({
          id: w.id,
          word: w.word,
          clue: w.clue,
          points: w.points || 100,
        })),
        4
      );

      if (layout && layout.words.length >= 3) {
        actualWords = layout.words.map((w, idx) => ({
          id: w.id || `w-${idx}`,
          level_id: levelId,
          word_number: w.word_number,
          direction: w.direction,
          start_row: w.start_row,
          start_col: w.start_col,
          word: w.word,
          clue: w.clue,
          points: w.points || 100,
          created_at: new Date().toISOString(),
        }));

        const updatedGridState = {
          ...(prog?.grid_state || {}),
          _active_words: actualWords,
          _active_word_ids: actualWords.map((w) => w.id),
        };

        const { data: savedProg } = await supabase
          .from('tts_user_progress')
          .upsert(
            {
              user_id: user.id,
              level_id: levelId,
              status: prog?.status || 'in_progress',
              grid_state: updatedGridState,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,level_id' }
          )
          .select()
          .maybeSingle();

        if (savedProg) prog = savedProg as TTSUserProgress;
      } else {
        actualWords = dbWords.slice(0, 4);
      }
    } else {
      actualWords = dbWords.length > 0 ? dbWords : [];
    }

    // 5. Inisialisasi progress awal jika belum ada
    if (!prog) {
      const { data: newProg } = await supabase
        .from('tts_user_progress')
        .insert({
          user_id: user.id,
          level_id: levelId,
          status: 'in_progress',
          updated_at: new Date().toISOString(),
        })
        .select()
        .maybeSingle();
      if (newProg) prog = newProg as TTSUserProgress;
    } else if (prog.status !== 'completed' && prog.status !== 'in_progress') {
      await supabase
        .from('tts_user_progress')
        .update({ status: 'in_progress', updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('level_id', levelId);
    }

    return {
      success: true,
      sessionToken,
      profile: prof || undefined,
      settings: setts || undefined,
      level: lvl,
      words: actualWords,
      progress: prog || undefined,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Kesalahan server saat mempersiapkan level TTS';
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

    // Tentukan kata-kata target untuk pemain ini (mendukung Skema 1: Bank Kosakata Dinamis)
    const assignedWordIds: string[] | undefined = (prog.grid_state as any)?._active_word_ids;
    const targetWords =
      assignedWordIds && assignedWordIds.length > 0
        ? dbWords.filter((w) => assignedWordIds.includes(w.id))
        : dbWords;

    // VALIDASI INTEGRITAS 1: Pastikan SEMUA kata pada target level pemain benar-benar telah terjawab!
    const allWordsAnswered = targetWords.every((w) => completedWords.includes(w.id));
    if (!allWordsAnswered || completedWords.length < targetWords.length) {
      return {
        success: false,
        error: `Integritas Gagal: Level belum selesai (${completedWords.length}/${targetWords.length} kata terjawab).`,
        isCheatDetected: true,
      };
    }

    // VALIDASI INTEGRITAS 2: Speedhack Prevention (Batas Fisik Kecepatan Manusia)
    // Toleran untuk pemain yang me-reload halaman atau menyelesaikan kata terakhir.
    const prevTimeTaken = prog.time_taken_seconds || 0;
    const totalEffectiveTime = Math.max(realElapsedSeconds, prevTimeTaken);
    if (totalEffectiveTime < 2 && targetWords.length > 2 && prog.status !== 'completed') {
      return {
        success: false,
        error: `Speedhack Anomaly: Waktu tempuh (${totalEffectiveTime}s) terlalu cepat untuk ${targetWords.length} kata.`,
        isCheatDetected: true,
      };
    }

    // VALIDASI INTEGRITAS 3: Cegah Injeksi Skor (Payload Tampering)
    const totalBasePoints = targetWords.reduce((sum, w) => sum + (w.points || 100), 0);
    const maxTheoreticalScore = Math.round(totalBasePoints * 3.0);
    const scoreEarned = prog.score_earned || 0;

    if (scoreEarned > maxTheoreticalScore) {
      return {
        success: false,
        error: `Payload Tampering Anomaly: Skor (${scoreEarned}) melebihi batas maksimal teoretis (${maxTheoreticalScore}).`,
        isCheatDetected: true,
      };
    }

    // 5. Ambil Pengaturan Game & Detail Level
    const [settsRes, currentLvlRes] = await Promise.all([
      supabase
        .from('game_settings')
        .select('coins_per_level, current_season')
        .eq('id', 1)
        .maybeSingle(),
      supabase
        .from('tts_levels')
        .select('id, level_number, unit_id, is_hard_zone')
        .eq('id', levelId)
        .maybeSingle(),
    ]);

    const setts = settsRes.data;
    const currentLvl = currentLvlRes.data;

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

      // PENCATATAN POINT HISTORY (TAHAP 2: Transparansi Skor)
      try {
        await dbClient.from('point_history').insert({
          user_id: user.id,
          amount: scoreEarned,
          description: `Menyelesaikan Level ${currentLvl?.level_number || 1}${currentLvl?.is_hard_zone ? ' (Zona Hard 🔥)' : ''}`,
        });
      } catch (histErr) {
        console.error('Non-blocking: Gagal mencatat point_history saat complete level:', histErr);
      }
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

    // 10. Revalidasi cache server & route peta di Next.js (Vercel Edge / Node runtime)
    try {
      revalidatePath('/path');
      revalidatePath('/path', 'page');
      revalidatePath(`/tts/${levelId}`);
    } catch (revalErr) {
      console.warn('revalidatePath warning:', revalErr);
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
      const assignedWordIds: string[] | undefined = (prog.grid_state as any)?._active_word_ids;
      const levelWordIds =
        assignedWordIds && assignedWordIds.length > 0
          ? assignedWordIds
          : wordsByLevel[prog.level_id] || [];
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

    if (syncedCount > 0) {
      try {
        revalidatePath('/path');
        revalidatePath('/path', 'page');
      } catch (revalErr) {
        console.warn('revalidatePath warning:', revalErr);
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
  gridState: Record<string, any>;
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
// 7. SENSOR CURANG KE-3: PEMBLOKIRAN AKUN & HARD RESET PROGRES (ANTI-CHEAT)
// Mengubah status akun menjadi BANNED, mereset poin = 0, increment ban_count, & membersihkan leaderboard
// ==============================================================================

/**
 * Server Action: triggerBanUser(userId, reason)
 * Membekukan akun secara permanen di database:
 * 1. Mengubah is_banned = true
 * 2. Mereset total_score = 0
 * 3. Menambahkan ban_count = ban_count + 1
 */
export async function triggerBanUser(
  userId: string,
  reason: string = 'Terdeteksi manipulasi game/pindah layar 3x'
): Promise<{ success: boolean; isBanned?: boolean; error?: string }> {
  try {
    if (!userId) {
      return { success: false, error: 'User ID tidak valid' };
    }

    const supabaseServer = await createHubServerClient();
    const serviceRoleKey = process.env.SUPABASE_HUB_SERVICE_ROLE_KEY;
    const dbClient = isRealServiceRoleKey(serviceRoleKey)
      ? createHubAdminClient()
      : supabaseServer;

    // Ambil profil pemain saat ini untuk mengetahui username, total_score, dan ban_count
    const { data: prof } = await dbClient
      .from('profiles')
      .select('id, username, total_score, ban_count')
      .eq('id', userId)
      .maybeSingle();

    const username = prof?.username || 'pemain';
    const effectiveEmail = `${username.toLowerCase()}@player.kuisbattle.com`;
    const previousScore = prof?.total_score || 0;
    const currentBanCount = Number(prof?.ban_count) || 0;
    const nextBanCount = currentBanCount + 1;

    console.warn(`[Anti-Cheat triggerBanUser] Memblokir akun ${username} (${userId}). Total ban: ${nextBanCount}. Alasan: ${reason}`);

    // 1. Eksekusi RPC jika tersedia di Supabase (Security Definer)
    try {
      await dbClient.rpc('execute_anti_cheat_ban', {
        target_user_id: userId,
        target_email: effectiveEmail,
        ban_reason: reason,
      });
    } catch {
      // Abaikan jika RPC belum di-deploy di Supabase
    }

    // 2. EKSEKUSI TIGA HAL SEKALIGUS KE PROFILES:
    // a) is_banned = true
    // b) total_score = 0 (reset skor)
    // c) ban_count = ban_count + 1
    const { error: updateProfErr } = await dbClient
      .from('profiles')
      .update({
        is_banned: true,
        total_score: 0,
        ban_count: nextBanCount,
        banned_reason: reason,
        banned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateProfErr) {
      console.warn('[Anti-Cheat triggerBanUser] Fallback update with session client:', updateProfErr);
      if (dbClient !== supabaseServer) {
        await supabaseServer
          .from('profiles')
          .update({
            is_banned: true,
            total_score: 0,
            ban_count: nextBanCount,
            banned_reason: reason,
            banned_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId);
      }
    }

    // 3. Catat penalti ke point_history (Tahap 2: Transparansi Skor)
    if (previousScore > 0) {
      try {
        await dbClient.from('point_history').insert({
          user_id: userId,
          amount: -previousScore,
          description: `Penalti Anti-Cheat (Ban #${nextBanCount}): ${reason}`,
        });
      } catch (histErr) {
        console.warn('[Anti-Cheat triggerBanUser] Catat point_history skipped:', histErr);
      }
    }

    // 4. CATAT KE TABEL BANNED_USERS (Agar muncul di Dashboard Admin)
    try {
      await dbClient.from('banned_users').upsert(
        {
          email: effectiveEmail,
          user_id: userId,
          reason,
          banned_at: new Date().toISOString(),
        },
        { onConflict: 'email' }
      );
    } catch (tableErr) {
      console.warn('[Anti-Cheat triggerBanUser] Catat banned_users skipped:', tableErr);
    }

    // 5. BERSIHKAN DARI KLASEMEN (Leaderboard) AGAR RANKING TIDAK RUSAK
    try {
      await dbClient.from('tts_leaderboard').delete().eq('user_id', userId);
    } catch (lbErr) {
      console.warn('[Anti-Cheat triggerBanUser] Gagal bersihkan leaderboard:', lbErr);
    }

    // 6. RESET PROGRES LEVEL AKTIF
    try {
      await dbClient.from('tts_user_progress').delete().eq('user_id', userId);
    } catch (progErr) {
      console.warn('[Anti-Cheat triggerBanUser] Gagal bersihkan progress:', progErr);
    }

    // 7. Invalidate server cache Next.js
    try {
      revalidatePath('/path');
      revalidatePath('/path', 'page');
      revalidatePath('/admin-hub');
      revalidatePath('/admin-hub', 'page');
      revalidatePath('/ban');
      revalidatePath('/banned');
    } catch (revalErr) {
      console.warn('[Anti-Cheat triggerBanUser] revalidatePath warning:', revalErr);
    }

    return {
      success: true,
      isBanned: true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal trigger ban user';
    return { success: false, error: msg };
  }
}

export async function triggerAntiCheatExecution(reason = 'Terdeteksi manipulasi game/pindah layar 3x') {
  try {
    const supabaseServer = await createHubServerClient();
    const {
      data: { user },
    } = await supabaseServer.auth.getUser();

    if (!user) {
      return { success: false, error: 'User tidak ditemukan' };
    }

    return await triggerBanUser(user.id, reason);
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

    // Cek juga dari tabel profiles
    const { data: prof } = await supabase
      .from('profiles')
      .select('is_banned, banned_reason')
      .or(`username.ilike.${cleanEmail.replace('@player.kuisbattle.com', '')}`)
      .maybeSingle();

    if (prof?.is_banned) {
      return {
        isBanned: true,
        reason: prof.banned_reason || 'Terdeteksi manipulasi game 3x',
      };
    }

    return { isBanned: false };
  } catch {
    return { isBanned: false };
  }
}

/**
 * Buka blokir satu pemain oleh Admin:
 * 1. Ubah status is_banned di profiles menjadi false (CLEAN).
 * 2. Hard Reset Skor: total_score = 0, coins = 0, lives = 5.
 * 3. Hard Reset Progress: hapus tts_user_progress dan tts_leaderboard murni ke level 1.
 * 4. Hapus dari tabel banned_users.
 */
export async function unbanEmailAction(email: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  try {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return { success: false, error: 'Email atau username wajib diisi' };

    const dbClient = isRealServiceRoleKey(process.env.SUPABASE_HUB_SERVICE_ROLE_KEY)
      ? createHubAdminClient()
      : await createHubServerClient();

    // 1. Cari user_id dari tabel banned_users
    const { data: bannedRow } = await dbClient
      .from('banned_users')
      .select('user_id')
      .eq('email', cleanEmail)
      .maybeSingle();

    let targetUserId = bannedRow?.user_id;

    // Jika tidak ditemukan via email di banned_users, cari via username di profiles
    if (!targetUserId) {
      const usernameClean = cleanEmail.replace('@player.kuisbattle.com', '').replace(/^@/, '');
      const { data: profRow } = await dbClient
        .from('profiles')
        .select('id')
        .or(`username.ilike.${usernameClean},id.eq.${cleanEmail}`)
        .maybeSingle();

      if (profRow) {
        targetUserId = profRow.id;
      }
    }

    // 2. Eksekusi Hard Reset & Unban pada Profiles
    if (targetUserId) {
      await dbClient
        .from('profiles')
        .update({
          is_banned: false,
          banned_reason: null,
          banned_at: null,
          total_score: 0, // HARD RESET SKOR
          coins: 0,       // HARD RESET KOIN
          lives: 5,       // RESET NYAWA STANDAR
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetUserId);

      // HARD RESET PROGRESS: Hapus seluruh progres level & klasemen pemain
      await dbClient.from('tts_user_progress').delete().eq('user_id', targetUserId);
      await dbClient.from('tts_leaderboard').delete().eq('user_id', targetUserId);

      // Catat ke point_history (Tahap 2)
      try {
        await dbClient.from('point_history').insert({
          user_id: targetUserId,
          amount: 0,
          description: 'Buka Blokir & Hard Reset Skor oleh Admin',
        });
      } catch {
        // Non-blocking
      }
    }

    // 3. Hapus dari tabel banned_users
    if (targetUserId) {
      await dbClient
        .from('banned_users')
        .delete()
        .or(`email.eq.${cleanEmail},user_id.eq.${targetUserId}`);
    } else {
      await dbClient.from('banned_users').delete().eq('email', cleanEmail);
    }

    // 4. Invalidate cache agar UI Admin & Path langsung ter-update seketika
    try {
      revalidatePath('/admin-hub');
      revalidatePath('/admin-hub', 'page');
      revalidatePath('/path');
      revalidatePath('/path', 'page');
      revalidatePath('/ban');
      revalidatePath('/banned');
    } catch {}

    return {
      success: true,
      message: `Pemain ${cleanEmail} berhasil dibuka blokirnya dan data di-reset murni ke Level 1.`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal unban email';
    return { success: false, error: msg };
  }
}

/**
 * Buka blokir pemain berdasarkan User ID (Admin Panel Action)
 */
export async function unbanUser(userId: string) {
  return await unbanEmailAction(userId);
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
