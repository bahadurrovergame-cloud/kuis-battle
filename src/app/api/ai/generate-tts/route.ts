import { NextResponse } from 'next/server';
import { getGeminiModel } from '@/lib/gemini';
import { generateObject } from 'ai';
import { z } from 'zod';
import { createHubServerClient } from '@/lib/supabase-hub-server';

const TTSGenerationSchema = z.object({
  title: z.string().describe('Judul level yang menarik'),
  gridRows: z.number().int().default(10),
  gridCols: z.number().int().default(10),
  words: z.array(
    z.object({
      word_number: z.number().int(),
      direction: z.enum(['across', 'down']),
      start_row: z.number().int(),
      start_col: z.number().int(),
      word: z.string(),
      clue: z.string(),
      points: z.number().int().default(100),
    })
  ).min(3).max(5),
});

export async function POST(req: Request) {
  try {
    const supabase = await createHubServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { theme, levelNumber, isHardZone } = body;
    const topic = theme?.trim() || 'Pengetahuan Umum';

    // SISTEM PENGACAK (RANDOMIZER) TULANG PUNGGUNG
    // 50% peluang mendatar, 50% peluang menurun
    const isSpineAcross = Math.random() > 0.5;
    const spineDirection = isSpineAcross ? 'across' : 'down';
    const branchDirection = isSpineAcross ? 'down' : 'across';
    
    // Acak posisi mulainya (antara indeks 1 sampai 4) biar nggak selalu di tempat yang sama
    const randomStartRow = Math.floor(Math.random() * 4) + 1;
    const randomStartCol = Math.floor(Math.random() * 4) + 1;

    // PROMPT AJAIB: Pola "Tulang Punggung" Dinamis
    const prompt = `Buatlah teka-teki silang (TTS) topik: "${topic}".
Tingkat Kesulitan: ${isHardZone ? 'Sulit' : 'Sedang'}.

KARENA KAMU AI, KAMU SERING SALAH MENGHITUNG KOORDINAT TITIK POTONG. MAKA KAMU WAJIB MEMATUHI POLA "TULANG PUNGGUNG" INI SECARA KETAT:

1. KATA PERTAMA (Tulang Punggung):
   - Arah: "${spineDirection}" (${isSpineAcross ? 'mendatar' : 'menurun'})
   - Koordinat: start_row: ${randomStartRow}, start_col: ${randomStartCol}
   - Buat kata yang panjang (minimal 6-8 huruf).

2. KATA KEDUA, KETIGA, KEEMPAT (Cabang):
   - Arah: SEMUANYA "${branchDirection}" (${isSpineAcross ? 'menurun' : 'mendatar'}).
   - Kata-kata ini HARUS memotong/menempel pada KATA PERTAMA.
   - PENTING: Hitung mundur start_row dan start_col dengan benar agar titik potong hurufnya sama persis!
   - JANGAN ADA kata cabang yang berdekatan atau bersinggungan satu sama lain (beri jarak kolom/baris).

Buat total 4 kata saja (1 tulang punggung, 3 cabang). Kata jawaban HURUF KAPITAL. Buat petunjuk (clue) yang seru!`;

    // Gunakan Gemini 1.5 Flash
    const result = await generateObject({
      model: getGeminiModel('gemini-1.5-flash'),
      schema: TTSGenerationSchema,
      prompt,
    });

    if (!result || !result.object) {
      throw new Error('Gagal menghasilkan format TTS.');
    }

    return NextResponse.json({ success: true, data: result.object });
  } catch (err: unknown) {
    console.error('Error generating TTS with AI:', err);
    return NextResponse.json({ error: 'Gagal meracik soal TTS' }, { status: 500 });
  }
}
