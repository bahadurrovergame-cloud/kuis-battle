import { NextResponse } from 'next/server';
import { getGeminiModel } from '@/lib/gemini';
import { generateObject } from 'ai';
import { z } from 'zod';
import { createHubServerClient } from '@/lib/supabase-hub-server';

// SKEMA DIPERMUDAH: Hapus .default() dan batasan ketat biar AI tidak bingung
const TTSGenerationSchema = z.object({
  title: z.string(),
  gridRows: z.number(),
  gridCols: z.number(),
  words: z.array(
    z.object({
      word_number: z.number(),
      direction: z.enum(['across', 'down']),
      start_row: z.number(),
      start_col: z.number(),
      word: z.string(),
      clue: z.string(),
      points: z.number(),
    })
  ),
});

export async function POST(req: Request) {
  try {
    const supabase = await createHubServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { theme, levelNumber, isHardZone } = body;
    const topic = theme?.trim() || 'Pengetahuan Umum';

    // PENGACAK ARAH TULANG PUNGGUNG
    const isSpineAcross = Math.random() > 0.5;
    const spineDirection = isSpineAcross ? 'across' : 'down';
    const branchDirection = isSpineAcross ? 'down' : 'across';
    
    const randomStartRow = Math.floor(Math.random() * 3) + 1;
    const randomStartCol = Math.floor(Math.random() * 3) + 1;

    const prompt = `Buatlah teka-teki silang (TTS) topik: "${topic}".
Tingkat Kesulitan: ${isHardZone ? 'Sulit' : 'Sedang'}.

ATURAN KETAT POLA "TULANG PUNGGUNG" (CEGAH TABRAKAN):
1. KATA PERTAMA (Tulang Punggung):
   - Arah: "${spineDirection}"
   - start_row: ${randomStartRow}, start_col: ${randomStartCol}
   - Panjang kata 6-8 huruf.
2. KATA KEDUA, KETIGA, KEEMPAT (Cabang):
   - Arah: SEMUANYA "${branchDirection}".
   - Menempel pada KATA PERTAMA (koordinat huruf potong harus akurat).
   - Beri jarak agar sesama kata cabang tidak saling bersinggungan.

Tentukan gridRows dan gridCols sekitar 10.
Buat persis 4 kata. Kata jawaban HURUF KAPITAL. 
Berikan nilai "points": 100 untuk setiap kata.`;

    const result = await generateObject({
      model: getGeminiModel('gemini-1.5-flash'),
      schema: TTSGenerationSchema,
      prompt,
    });

    return NextResponse.json({ success: true, data: result.object });
  } catch (err: unknown) {
    console.error('Error TTS:', err);
    // BONGKAR ERROR ASLI KE FRONTEND: Biar ketahuan kalau AI gagal parsing
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `AI Error: ${msg}` }, { status: 500 });
  }
}
