'use server';

import { revalidatePath } from 'next/cache';
import {
  createHubAdminClient,
  createHubServerClient,
  isRealServiceRoleKey,
} from '@/lib/supabase-hub-server';
import { TTSUnit, Profile, BannedUser } from '@/lib/supabase-hub';

/**
 * Mendapatkan Supabase client terbaik untuk operasi admin:
 * - Menggunakan Service Role Client jika SUPABASE_HUB_SERVICE_ROLE_KEY valid.
 * - Menggunakan Session Server Client (cookies) jika service role belum diatur, memanfaatkan role admin pengguna.
 */
async function getEffectiveAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_HUB_SERVICE_ROLE_KEY;
  if (isRealServiceRoleKey(serviceRoleKey)) {
    return createHubAdminClient();
  }
  return await createHubServerClient();
}

/**
 * Inisialisasi 3 Pulau Tematik standar awal jika tabel tts_units masih kosong di database Supabase Hub.
 */
export async function seedDefaultUnitsAction(): Promise<{
  success: boolean;
  units?: TTSUnit[];
  error?: string;
}> {
  try {
    const supabaseAdmin = await getEffectiveAdminClient();

    const starterUnits = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        unit_number: 1,
        title: 'Unit 1: Wawasan Nusantara',
        description: 'Pemanasan teka-teki seputar geografi, budaya, dan pengetahuan umum Indonesia.',
        theme_color: '#10b981',
        is_active: true,
        is_special_event: false,
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        unit_number: 2,
        title: 'Unit 2: Kuliner & Rempah',
        description: 'Uji keahlian rasa dan aroma kuliner legendaris nusantara.',
        theme_color: '#f59e0b',
        is_active: true,
        is_special_event: false,
      },
      {
        id: '33333333-3333-3333-3333-333333333333',
        unit_number: 3,
        title: 'Unit 3: Zona Siber & Teknologi',
        description: 'Zona ekstrem dengan pembusukan skor 2x lipat dan istilah teknologi masa depan!',
        theme_color: '#8b5cf6',
        is_active: true,
        is_special_event: false,
      },
    ];

    const { data: insertedUnits, error: unitErr } = await supabaseAdmin
      .from('tts_units')
      .upsert(starterUnits, { onConflict: 'unit_number' })
      .select();

    if (unitErr) {
      return { success: false, error: unitErr.message };
    }

    // Inisialisasi 3 level awal di Unit 1 jika belum ada
    const starterLevels = [
      {
        id: 'aaaaaaaa-1111-0000-0000-000000000001',
        unit_id: '11111111-1111-1111-1111-111111111111',
        level_number: 1,
        title: 'Langkah Pertama',
        grid_rows: 8,
        grid_cols: 8,
        is_hard_zone: false,
        branch_direction: 'main',
        status: 'published',
      },
      {
        id: 'aaaaaaaa-1111-0000-0000-000000000002',
        unit_id: '11111111-1111-1111-1111-111111111111',
        level_number: 2,
        title: 'Ibukota & Samudera',
        grid_rows: 9,
        grid_cols: 9,
        is_hard_zone: false,
        branch_direction: 'right',
        status: 'published',
      },
      {
        id: 'aaaaaaaa-1111-0000-0000-000000000003',
        unit_id: '11111111-1111-1111-1111-111111111111',
        level_number: 3,
        title: 'Suku & Bahasa',
        grid_rows: 9,
        grid_cols: 9,
        is_hard_zone: false,
        branch_direction: 'left',
        status: 'published',
      },
    ];

    await supabaseAdmin
      .from('tts_levels')
      .upsert(starterLevels, { onConflict: 'unit_id,level_number' });

    // Masukkan soal starter level 1 jika belum ada
    const starterWords = [
      {
        level_id: 'aaaaaaaa-1111-0000-0000-000000000001',
        word_number: 1,
        direction: 'across',
        start_row: 1,
        start_col: 0,
        word: 'NUSANTARA',
        clue: 'Sebutan gugusan kepulauan kepresidenan Indonesia dalam bahasa Sanskerta kuno',
        points: 100,
      },
      {
        level_id: 'aaaaaaaa-1111-0000-0000-000000000001',
        word_number: 2,
        direction: 'down',
        start_row: 0,
        start_col: 2,
        word: 'SUMATRA',
        clue: 'Pulau besar di barat Indonesia yang terkenal dengan Danau Toba & Danau Maninjau',
        points: 100,
      },
      {
        level_id: 'aaaaaaaa-1111-0000-0000-000000000001',
        word_number: 3,
        direction: 'across',
        start_row: 4,
        start_col: 2,
        word: 'MERAH',
        clue: 'Warna bagian atas bendera Indonesia yang melambangkan keberanian bangsa',
        points: 100,
      },
      {
        level_id: 'aaaaaaaa-1111-0000-0000-000000000001',
        word_number: 4,
        direction: 'down',
        start_row: 1,
        start_col: 6,
        word: 'RUPIAH',
        clue: 'Mata uang resmi Negara Kesatuan Republik Indonesia',
        points: 100,
      },
    ];

    await supabaseAdmin
      .from('tts_words')
      .upsert(starterWords, { onConflict: 'level_id,word_number,direction' })
      .select();

    return { success: true, units: (insertedUnits as TTSUnit[]) || [] };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Gagal mengeksekusi inisialisasi pulau.' };
  }
}

/**
 * Tambah Pulau Tematik Baru secara kustom.
 */
export async function createUnitAction(payload: {
  unit_number: number;
  title: string;
  description: string;
  theme_color: string;
  is_special_event: boolean;
}): Promise<{
  success: boolean;
  unit?: TTSUnit;
  error?: string;
}> {
  try {
    const supabaseAdmin = await getEffectiveAdminClient();
    const { data, error } = await supabaseAdmin
      .from('tts_units')
      .insert({
        unit_number: payload.unit_number,
        title: payload.title.trim(),
        description: payload.description.trim(),
        theme_color: payload.theme_color,
        is_active: true,
        is_special_event: payload.is_special_event,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, unit: data as TTSUnit };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Gagal membuat pulau baru.' };
  }
}


/**
 * Perbarui Data Pulau Tematik (Edit Unit).
 */
export async function updateUnitAction(payload: {
  id: string;
  unit_number: number;
  title: string;
  description: string;
  theme_color: string;
  is_special_event: boolean;
  is_active?: boolean;
}): Promise<{
  success: boolean;
  unit?: TTSUnit;
  error?: string;
}> {
  try {
    const supabaseAdmin = await getEffectiveAdminClient();
    const { data, error } = await supabaseAdmin
      .from('tts_units')
      .update({
        unit_number: payload.unit_number,
        title: payload.title.trim(),
        description: payload.description.trim(),
        theme_color: payload.theme_color,
        is_special_event: payload.is_special_event,
        is_active: payload.is_active !== undefined ? payload.is_active : true,
      })
      .eq('id', payload.id)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, unit: data as TTSUnit };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Gagal memperbarui data pulau.' };
  }
}

/**
 * Hapus Pulau Tematik (Cascade Hapus Level & Soal Terkait).
 */
export async function deleteUnitAction(unitId: string): Promise<{
  success: boolean;
  units?: TTSUnit[];
  error?: string;
}> {
  try {
    const supabaseAdmin = await getEffectiveAdminClient();
    const { error } = await supabaseAdmin
      .from('tts_units')
      .delete()
      .eq('id', unitId);

    if (error) {
      return { success: false, error: error.message };
    }

    // Ambil sisa pulau dan rapikan nomornya secara berurutan (1, 2, 3...)
    const { data: remainingUnits } = await supabaseAdmin
      .from('tts_units')
      .select('id')
      .order('unit_number', { ascending: true });

    if (remainingUnits && remainingUnits.length > 0) {
      const remainingIds = remainingUnits.map((u) => u.id);
      // Fase 1: Set negatif sementara agar tidak tabrakan unique constraint
      for (let i = 0; i < remainingIds.length; i++) {
        await supabaseAdmin.from('tts_units').update({ unit_number: -(i + 1) }).eq('id', remainingIds[i]);
      }
      // Fase 2: Set positif berurutan (1, 2, 3...)
      for (let i = 0; i < remainingIds.length; i++) {
        await supabaseAdmin.from('tts_units').update({ unit_number: i + 1 }).eq('id', remainingIds[i]);
      }
    }

    const { data: updatedUnits } = await supabaseAdmin
      .from('tts_units')
      .select('*')
      .order('unit_number', { ascending: true });

    return { success: true, units: (updatedUnits as TTSUnit[]) || [] };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Gagal menghapus pulau.' };
  }
}

/**
 * Menyusun ulang nomor urutan Pulau/Unit Tematik (Reorder / Drag & Drop).
 * Menggunakan pendekatan 2-fase (negatif lalu positif) untuk menghindari tabrakan
 * unique constraint "tts_units_unit_number_key" pada PostgreSQL.
 */
export async function reorderUnitsAction(unitIdsInOrder: string[]): Promise<{
  success: boolean;
  units?: TTSUnit[];
  error?: string;
}> {
  try {
    if (!unitIdsInOrder || unitIdsInOrder.length === 0) {
      return { success: false, error: 'Daftar ID pulau kosong' };
    }

    const supabaseAdmin = await getEffectiveAdminClient();

    // Fase 1: Ubah ke nilai negatif sementara agar tidak melanggar unique constraint
    for (let i = 0; i < unitIdsInOrder.length; i++) {
      const id = unitIdsInOrder[i];
      const tempNumber = -(i + 1);
      const { error: phase1Err } = await supabaseAdmin
        .from('tts_units')
        .update({ unit_number: tempNumber })
        .eq('id', id);

      if (phase1Err) {
        return { success: false, error: `Fase 1 gagal: ${phase1Err.message}` };
      }
    }

    // Fase 2: Tetapkan nomor urut baru yang rapi (1, 2, 3...)
    for (let i = 0; i < unitIdsInOrder.length; i++) {
      const id = unitIdsInOrder[i];
      const newNumber = i + 1;
      const { error: phase2Err } = await supabaseAdmin
        .from('tts_units')
        .update({ unit_number: newNumber })
        .eq('id', id);

      if (phase2Err) {
        return { success: false, error: `Fase 2 gagal: ${phase2Err.message}` };
      }
    }

    // Ambil daftar pulau terbaru yang sudah berurutan
    const { data: updatedUnits, error: fetchErr } = await supabaseAdmin
      .from('tts_units')
      .select('*')
      .order('unit_number', { ascending: true });

    if (fetchErr) {
      return { success: false, error: fetchErr.message };
    }

    return { success: true, units: (updatedUnits as TTSUnit[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal menyusun ulang urutan pulau.';
    return { success: false, error: msg };
  }
}

/**
 * Hapus Level TTS beserta seluruh kata soal dan progress user terkait.
 */
export async function deleteLevelAction(levelId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const supabaseAdmin = await getEffectiveAdminClient();
    await supabaseAdmin.from('tts_user_progress').delete().eq('level_id', levelId);
    await supabaseAdmin.from('tts_words').delete().eq('level_id', levelId);
    const { error } = await supabaseAdmin.from('tts_levels').delete().eq('id', levelId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Gagal menghapus level.' };
  }
}

/**
 * Mengambil daftar pemain yang diblokir oleh sistem Anti-Cheat.
 * Menggabungkan tabel banned_users dengan profiles yang ter-flag is_banned = true.
 */
export async function getBannedUsersAction(): Promise<{
  success: boolean;
  bannedUsers?: BannedUser[];
  error?: string;
}> {
  try {
    const supabaseAdmin = await getEffectiveAdminClient();

    // 1. Ambil dari tabel profiles yang ter-flag is_banned = true (Sumber utama status blokir)
    let bannedProfiles: Array<{
      id: string;
      username: string;
      total_score?: number;
      ban_count?: number;
      banned_reason?: string;
      banned_at?: string;
    }> = [];

    try {
      const { data: profs } = await supabaseAdmin
        .from('profiles')
        .select('id, username, total_score, ban_count, banned_reason, banned_at')
        .eq('is_banned', true)
        .order('banned_at', { ascending: false });
      if (profs) bannedProfiles = profs;
    } catch (profQueryErr) {
      console.warn('Gagal membaca profiles.is_banned:', profQueryErr);
    }

    // 2. Ambil dari tabel banned_users (Log audit pemblokiran)
    const { data: bannedRows } = await supabaseAdmin
      .from('banned_users')
      .select('*')
      .order('banned_at', { ascending: false });

    const mergedMap = new Map<string, BannedUser>();

    // Masukkan data dari profiles terlebih dahulu karena memuat total_score dan ban_count aktual
    bannedProfiles.forEach((p) => {
      const syntheticEmail = `${p.username.toLowerCase()}@player.kuisbattle.com`;
      mergedMap.set(p.id, {
        id: p.id,
        email: syntheticEmail,
        user_id: p.id,
        username: p.username,
        total_score: p.total_score ?? 0,
        ban_count: p.ban_count ?? 1,
        reason: p.banned_reason || 'Terdeteksi manipulasi game 3x (Anti-Cheat)',
        banned_at: p.banned_at || new Date().toISOString(),
      });
    });

    // Sinkronkan atau tambahkan jika ada entri di banned_users yang belum ada di map
    (bannedRows || []).forEach((b) => {
      const key = b.user_id || b.email.toLowerCase();
      const existing = b.user_id ? mergedMap.get(b.user_id) : undefined;

      if (existing) {
        if (!existing.reason && b.reason) existing.reason = b.reason;
        if (b.banned_at) existing.banned_at = b.banned_at;
      } else {
        const usernameGuess = b.email.replace('@player.kuisbattle.com', '').replace(/^@/, '');
        mergedMap.set(key, {
          id: b.id,
          email: b.email,
          user_id: b.user_id,
          username: usernameGuess,
          total_score: 0,
          ban_count: 1,
          reason: b.reason || 'Terdeteksi manipulasi game 3x (Anti-Cheat)',
          banned_at: b.banned_at || new Date().toISOString(),
        });
      }
    });

    const result = Array.from(mergedMap.values()).sort(
      (a, b) => new Date(b.banned_at).getTime() - new Date(a.banned_at).getTime()
    );

    return { success: true, bannedUsers: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal memuat daftar pemain diblokir.';
    return { success: false, error: msg };
  }
}

/**
 * Buka blokir satu pemain oleh Admin berdasarkan User ID:
 * 1. Mengubah is_banned = false di database.
 * 2. Hard Reset Skor: total_score = 0, coins = 0, lives = 5.
 * 3. Tetap mempertahankan ban_count (audit pelanggaran).
 * 4. Hapus user dari tts_user_progress, tts_leaderboard, dan banned_users.
 */
export async function unbanUserAction(userId: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  try {
    if (!userId) {
      return { success: false, error: 'User ID tidak valid.' };
    }

    const supabaseAdmin = await getEffectiveAdminClient();

    // 1. Ambil profil pemain
    const { data: prof } = await supabaseAdmin
      .from('profiles')
      .select('id, username')
      .eq('id', userId)
      .maybeSingle();

    const username = prof?.username || 'pemain';
    const email = `${username.toLowerCase()}@player.kuisbattle.com`;

    // 2. Eksekusi Unban & Hard Reset
    const { error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update({
        is_banned: false,
        banned_reason: null,
        banned_at: null,
        total_score: 0,
        coins: 0,
        lives: 5,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateErr) {
      return { success: false, error: `Gagal memperbarui profil: ${updateErr.message}` };
    }

    // 3. Hapus progres & klasemen
    await supabaseAdmin.from('tts_user_progress').delete().eq('user_id', userId);
    await supabaseAdmin.from('tts_leaderboard').delete().eq('user_id', userId);

    // 4. Hapus dari banned_users
    await supabaseAdmin
      .from('banned_users')
      .delete()
      .or(`user_id.eq.${userId},email.eq.${email}`);

    // 5. Catat riwayat poin
    try {
      await supabaseAdmin.from('point_history').insert({
        user_id: userId,
        amount: 0,
        description: 'Buka Blokir & Hard Reset Skor oleh Admin',
      });
    } catch {}

    // 6. Invalidate server cache Next.js
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
      message: `Akun @${username} berhasil dibuka blokirnya.`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal membuka blokir user.';
    return { success: false, error: msg };
  }
}

export const unbanUser = unbanUserAction;

/**
 * Buka blokir beberapa pemain sekaligus (Bulk Unban).
 * Melakukan Hard Reset Skor (total_score=0, coins=0, lives=5) dan Hard Reset Progres (kembali ke level 1).
 */
export async function unbanMultipleEmailsAction(emails: string[]): Promise<{
  success: boolean;
  count?: number;
  message?: string;
  error?: string;
}> {
  try {
    const cleanEmails = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (cleanEmails.length === 0) {
      return { success: false, error: 'Pilih minimal satu pemain untuk dibuka blokirnya.' };
    }

    const supabaseAdmin = await getEffectiveAdminClient();

    for (const email of cleanEmails) {
      // 1. Cari user_id
      const { data: bRow } = await supabaseAdmin
        .from('banned_users')
        .select('user_id')
        .eq('email', email)
        .maybeSingle();

      let targetUserId = bRow?.user_id;
      if (!targetUserId) {
        const usernameClean = email.replace('@player.kuisbattle.com', '').replace(/^@/, '');
        const { data: profRow } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .or(`username.ilike.${usernameClean},id.eq.${email}`)
          .maybeSingle();
        if (profRow) targetUserId = profRow.id;
      }

      // 2. Eksekusi Unban & Hard Reset
      if (targetUserId) {
        await supabaseAdmin
          .from('profiles')
          .update({
            is_banned: false,
            banned_reason: null,
            banned_at: null,
            total_score: 0,
            coins: 0,
            lives: 5,
            updated_at: new Date().toISOString(),
          })
          .eq('id', targetUserId);

        await supabaseAdmin.from('tts_user_progress').delete().eq('user_id', targetUserId);
        await supabaseAdmin.from('tts_leaderboard').delete().eq('user_id', targetUserId);
        await supabaseAdmin.from('banned_users').delete().or(`email.eq.${email},user_id.eq.${targetUserId}`);

        // Catat ke point_history (Tahap 2)
        try {
          await supabaseAdmin.from('point_history').insert({
            user_id: targetUserId,
            amount: 0,
            description: 'Buka Blokir & Hard Reset Skor oleh Admin',
          });
        } catch {}
      } else {
        await supabaseAdmin.from('banned_users').delete().eq('email', email);
      }
    }

    // 3. Revalidasi cache rute
    try {
      revalidatePath('/admin-hub');
      revalidatePath('/path');
      revalidatePath('/banned');
    } catch {}

    return {
      success: true,
      count: cleanEmails.length,
      message: `${cleanEmails.length} pemain berhasil dibuka blokirnya dan data di-reset murni ke Level 1.`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal membuka blokir pemain.';
    return { success: false, error: msg };
  }
}

/**
 * Mengambil daftar pemain untuk kelola koin dan poin.
 */
export async function getPlayersListAction(search = ''): Promise<{
  success: boolean;
  players?: Profile[];
  error?: string;
}> {
  try {
    const supabaseAdmin = await getEffectiveAdminClient();
    let query = supabaseAdmin
      .from('profiles')
      .select('*')
      .order('total_score', { ascending: false })
      .limit(100);

    if (search.trim()) {
      query = query.ilike('username', `%${search.trim()}%`);
    }

    const { data, error } = await query;
    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, players: (data as Profile[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal memuat daftar pemain.';
    return { success: false, error: msg };
  }
}

/**
 * Suntik / Atur Poin Skor, Koin, dan Nyawa Pemain (atau Admin Sendiri).
 */
export async function adjustPlayerResourcesAction(payload: {
  userId: string;
  addCoins?: number;
  addScore?: number;
  setCoins?: number;
  setScore?: number;
  setLives?: number;
}): Promise<{
  success: boolean;
  profile?: Profile;
  message?: string;
  error?: string;
}> {
  try {
    const supabaseAdmin = await getEffectiveAdminClient();

    // 1. Ambil profil user saat ini
    const { data: prof, error: getErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', payload.userId)
      .single();

    if (getErr || !prof) {
      return { success: false, error: 'Profil pemain tidak ditemukan.' };
    }

    const newCoins =
      payload.setCoins !== undefined
        ? Math.max(0, payload.setCoins)
        : Math.max(0, (prof.coins || 0) + (payload.addCoins || 0));

    const newScore =
      payload.setScore !== undefined
        ? Math.max(0, payload.setScore)
        : Math.max(0, (prof.total_score || 0) + (payload.addScore || 0));

    const maxLives = prof.max_lives || 5;
    const newLives =
      payload.setLives !== undefined
        ? Math.min(maxLives, Math.max(0, payload.setLives))
        : prof.lives;

    // 2. Simpan ke database
    const { data: updatedProf, error: updErr } = await supabaseAdmin
      .from('profiles')
      .update({
        coins: newCoins,
        total_score: newScore,
        lives: newLives,
        updated_at: new Date().toISOString(),
      })
      .eq('id', payload.userId)
      .select()
      .single();

    if (updErr || !updatedProf) {
      return { success: false, error: updErr?.message || 'Gagal menyimpan perubahan pemain.' };
    }

    // Catat ke point_history jika ada penyesuaian skor oleh Admin (Tahap 2)
    const diffScore = newScore - (prof.total_score || 0);
    if (diffScore !== 0) {
      try {
        await supabaseAdmin.from('point_history').insert({
          user_id: payload.userId,
          amount: diffScore,
          description: `Penyesuaian Skor oleh Admin (${diffScore > 0 ? '+' : ''}${diffScore})`,
        });
      } catch {}
    }

    // 3. Sinkronisasi ke tts_leaderboard jika skor berubah (HANYA UNTUK NON-ADMIN)
    if (payload.addScore || payload.setScore !== undefined) {
      const isPlayerAdmin =
        updatedProf.role === 'admin' ||
        updatedProf.username?.toLowerCase().includes('admin');

      if (isPlayerAdmin) {
        // Admin tidak boleh masuk ke leaderboard
        await supabaseAdmin
          .from('tts_leaderboard')
          .delete()
          .eq('user_id', payload.userId);
      } else {
        const { data: setts } = await supabaseAdmin
          .from('game_settings')
          .select('current_season')
          .eq('id', 1)
          .maybeSingle();

        const seasonNum = setts?.current_season || 1;

        await supabaseAdmin.from('tts_leaderboard').upsert(
          {
            user_id: payload.userId,
            season_number: seasonNum,
            total_score: newScore,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,season_number' }
        );
      }
    }

    return {
      success: true,
      profile: updatedProf as Profile,
      message: `Berhasil memperbarui data @${prof.username}: 🪙 ${newCoins} Koin, ⭐ ${newScore} Skor, ❤️ ${newLives} Nyawa.`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal menyesuaikan sumber daya pemain.';
    return { success: false, error: msg };
  }
}

/**
 * Mengambil statistik kata yang sudah ada untuk filter anti-duplikat.
 */
export async function getExistingWordsStatsAction(): Promise<{
  success: boolean;
  totalWords: number;
  publishedWords: number;
  wordList?: string[];
}> {
  try {
    const supabaseAdmin = await getEffectiveAdminClient();
    const { data: publishedLevels } = await supabaseAdmin
      .from('tts_levels')
      .select('id')
      .eq('status', 'published');

    const publishedIds = new Set((publishedLevels || []).map((l) => l.id));

    const { data: allWords } = await supabaseAdmin
      .from('tts_words')
      .select('word, level_id');

    const total = allWords?.length || 0;
    const published = (allWords || []).filter((w) => publishedIds.has(w.level_id)).length;
    const uniqueWords = Array.from(new Set((allWords || []).map((w) => w.word.toUpperCase().trim())));

    return {
      success: true,
      totalWords: total,
      publishedWords: published,
      wordList: uniqueWords,
    };
  } catch {
    return { success: false, totalWords: 0, publishedWords: 0 };
  }
}

/**
 * Menghapus akun dan data pemain secara permanen oleh Admin.
 */
export async function deletePlayerAction(targetUserId: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  try {
    const supabaseServer = await createHubServerClient();
    const {
      data: { user },
    } = await supabaseServer.auth.getUser();

    if (!user) return { success: false, error: 'Unauthorized: Sesi login tidak valid.' };

    // 1. Verifikasi bahwa penyeru adalah Admin
    const { data: adminProf } = await supabaseServer
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (adminProf?.role !== 'admin') {
      return { success: false, error: 'Akses Ditolak: Hanya Admin yang dapat menghapus pemain.' };
    }

    if (user.id === targetUserId) {
      return { success: false, error: 'Tidak dapat menghapus akun Anda sendiri.' };
    }

    // 2. Verifikasi apakah Service Role Key sudah dikonfigurasi
    // Supabase menerapkan Row Level Security (RLS) ketat yang melarang akun auth biasa menghapus akun user lain
    if (!isRealServiceRoleKey(process.env.SUPABASE_HUB_SERVICE_ROLE_KEY)) {
      return {
        success: false,
        error:
          'Gagal: Penghapusan pemain permanen memerlukan SUPABASE_HUB_SERVICE_ROLE_KEY di file .env.local. Ambil kunci "service_role" (secret) dari Supabase Dashboard > Project Settings > API agar server memiliki izin menghapus data pemain dari database.',
      };
    }

    const adminAuth = createHubAdminClient();

    // Dapatkan username target menggunakan admin client (bypass RLS)
    const { data: targetProf } = await adminAuth
      .from('profiles')
      .select('username')
      .eq('id', targetUserId)
      .maybeSingle();

    const targetUsername = targetProf?.username || 'pemain';

    // 3. Hapus data game dan profil pemain dengan hak Service Role (Bypass RLS)
    await adminAuth.from('tts_user_progress').delete().eq('user_id', targetUserId);
    await adminAuth.from('tts_leaderboard').delete().eq('user_id', targetUserId);
    const { error: delErr } = await adminAuth
      .from('profiles')
      .delete()
      .eq('id', targetUserId);

    if (delErr) {
      return { success: false, error: delErr.message };
    }

    // 4. Eksekusi penghapusan akun Auth
    const { error: authDelErr } = await adminAuth.auth.admin.deleteUser(targetUserId);
    if (authDelErr && !authDelErr.message?.toLowerCase().includes('not found') && !authDelErr.message?.toLowerCase().includes('user not found')) {
      console.warn('Auth user delete warning:', authDelErr.message);
    }

    return {
      success: true,
      message: `Pemain @${targetUsername} berhasil dihapus permanen dari sistem.`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal menghapus pemain.';
    return { success: false, error: msg };
  }
}

/**
 * Sinkronisasi klasemen: memastikan profil pemain yang memiliki skor tercatat di tabel tts_leaderboard.
 */
export async function syncLeaderboardAction(): Promise<{
  success: boolean;
  syncedCount?: number;
  error?: string;
}> {
  try {
    const supabaseAdmin = await getEffectiveAdminClient();

    // 1. Ambil Season aktif
    const { data: setts } = await supabaseAdmin
      .from('game_settings')
      .select('current_season')
      .eq('id', 1)
      .maybeSingle();

    const currentSeason = setts?.current_season || 1;

    // 2. Ambil seluruh profil pemain (kecuali admin)
    const { data: profs } = await supabaseAdmin
      .from('profiles')
      .select('id, username, total_score, role');

    if (!profs || profs.length === 0) {
      return { success: true, syncedCount: 0 };
    }

    // Bersihkan akun admin dari tts_leaderboard agar tidak masuk klasemen pemain
    const adminIds = (profs || [])
      .filter((p) => p.role === 'admin' || p.username?.toLowerCase().includes('admin'))
      .map((p) => p.id);

    if (adminIds.length > 0) {
      await supabaseAdmin.from('tts_leaderboard').delete().in('user_id', adminIds);
    }

    const nonAdminProfs = profs.filter(
      (p) => p.role !== 'admin' && !p.username?.toLowerCase().includes('admin')
    );

    let count = 0;
    for (const p of nonAdminProfs) {
      const score = p.total_score || 0;
      await supabaseAdmin.from('tts_leaderboard').upsert(
        {
          user_id: p.id,
          season_number: currentSeason,
          total_score: score,
          levels_completed: score > 0 ? 1 : 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,season_number' }
      );
      count++;
    }

    return { success: true, syncedCount: count };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal menyinkronkan klasemen.';
    return { success: false, error: msg };
  }
}
