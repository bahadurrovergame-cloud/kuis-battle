'use server';

import {
  createHubAdminClient,
  createHubServerClient,
  isRealServiceRoleKey,
} from '@/lib/supabase-hub-server';
import { TTSUnit } from '@/lib/supabase-hub';

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

