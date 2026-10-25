import { NextResponse } from 'next/server';
import { getGeminiModel } from '@/lib/gemini';
import { generateObject } from 'ai';
import { z } from 'zod';
import { createHubServerClient } from '@/lib/supabase-hub-server';

// Skema output Zod ketat dan hemat token
const TTSGenerationSchema = z.object({
  title: z.string().describe('Judul level yang menarik dan singkat'),
  gridRows: z.number().int().min(6).max(12).describe('Jumlah baris grid (rekomendasi 8-10)'),
  gridCols: z.number().int().min(6).max(12).describe('Jumlah kolom grid (rekomendasi 8-10)'),
  words: z.array(
    z.object({
      word_number: z.number().int().describe('Nomor urut petunjuk (1, 2, 3...)'),
      direction: z.enum(['across', 'down']).describe('Arah: across (mendatar) atau down (menurun)'),
      start_row: z.number().int().describe('Indeks baris awal mulai 0'),
      start_col: z.number().int().describe('Indeks kolom awal mulai 0'),
      word: z.string().describe('Kata jawaban dalam huruf kapital tanpa spasi'),
      clue: z.string().describe('Teks petunjuk soal teka-teki silang yang menarik dan relevan'),
      points: z.number().int().default(100),
    })
  ).min(3).max(8).describe('Daftar kata yang berpotongan di grid TTS'),
});

export async function POST(req: Request) {
  try {
    // 1. Verifikasi Hak Akses Admin
    const supabase = await createHubServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Harap login terlebih dahulu' }, { status: 401 });
    }

    const { data: prof } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (prof?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden: Hanya akun Administrator yang dapat generate soal TTS' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { theme, levelNumber, isHardZone } = body;

    const topic = theme?.trim() || 'Pengetahuan Umum Populer';
    const lvlNum = Number(levelNumber) || 1;

    // 2. Prompt Pintar & Hemat Token
    const prompt = `Buatlah teka-teki silang (TTS) ringkas berbahasa Indonesia dengan topik: "${topic}".
Level Nomor: ${lvlNum}.
Tingkat Kesulitan: ${isHardZone ? 'ZONA HARD (Ekstrem & Menjebak, gunakan pelesetan/logika tongkrongan unik)' : 'Standar & Menyenangkan'}.

Syarat Desain Papan:
1. Buat antara 4 sampai 6 kata yang saling berpotongan (interlocking) di koordinat baris dan kolom.
2. Ukuran grid antara 8x8 hingga 10x10.
3. Kata jawaban harus HURUF KAPITAL tanpa spasi atau tanda baca.
4. Pastikan huruf pada titik potong antara kata mendatar dan menurun bernilai sama persis.
5. Buat teks clue/petunjuk soal yang seru, cerdas, dan tidak kaku.`;

    // 3. Eksekusi AI Generator dengan Resilient Model Fallback
    const candidateModels = [
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
      'gemini-flash-latest',
    ];

    let lastError: unknown = null;
    let generatedData = null;

    for (const modelName of candidateModels) {
      try {
        const result = await generateObject({
          model: getGeminiModel(modelName),
          schema: TTSGenerationSchema,
          prompt,
        });
        if (result && result.object) {
          generatedData = result.object;
          break;
        }
      } catch (modelErr: unknown) {
        console.warn(`[AI TTS Generator] Model ${modelName} gagal atau sibuk:`, modelErr);
        lastError = modelErr;
      }
    }

    if (!generatedData) {
      throw lastError || new Error('Seluruh model Gemini AI sedang sibuk. Silakan coba sesaat lagi.');
    }

    return NextResponse.json({ success: true, data: generatedData });
  } catch (err: unknown) {
    console.error('Error generating TTS with AI:', err);
    const msg = err instanceof Error ? err.message : 'Gagal menghasilkan soal dengan AI';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


