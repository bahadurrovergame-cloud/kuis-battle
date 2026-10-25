import { NextResponse } from 'next/server';
import { getGeminiModel } from '@/lib/gemini';
import { generateObject } from 'ai';
import { z } from 'zod';
import {
  createHubServerClient,
  createHubAdminClient,
  isRealServiceRoleKey,
} from '@/lib/supabase-hub-server';
import { buildCrosswordLayout } from '@/lib/crossword-generator';

// Skema output dari AI: Meminta bank kosakata kaya dan petunjuk teka-teki silang
const CandidateWordsSchema = z.object({
  title: z.string().describe('Judul level yang menarik sesuai topik'),
  words: z.array(
    z.object({
      word: z.string().describe('Kata jawaban dalam HURUF KAPITAL tanpa spasi atau tanda baca (3-8 huruf)'),
      clue: z.string().describe('Petunjuk teka-teki silang yang seru, edukatif, dan akurat'),
    })
  ).min(8).max(20),
});

export async function POST(req: Request) {
  try {
    // 1. Cek sesi auth secara fleksibel
    try {
      const supabase = await createHubServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const isDev = process.env.NODE_ENV !== 'production';
      if (!user && !isDev) {
        return NextResponse.json({ error: 'Sesi login telah berakhir. Silakan login kembali.' }, { status: 401 });
      }
    } catch {
      // Abaikan error cookie jika Route Handler diakses dari klien lokal
    }

    const body = await req.json();
    const { theme, isHardZone, wordCount, levelNumber, filterPublishedOnly = false } = body;
    const topic = theme?.trim() || 'Pengetahuan Umum Populer';
    const targetWordCount = Math.min(Math.max(Number(wordCount) || 4, 3), 6);
    const lvlNum = Number(levelNumber) || 1;

    // 2. Ambil data kata yang sudah pernah dibuat/dipublish dari database untuk Filter Anti-Duplikat
    const dbClient = isRealServiceRoleKey(process.env.SUPABASE_HUB_SERVICE_ROLE_KEY)
      ? createHubAdminClient()
      : await createHubServerClient();

    // Query level yang sudah published
    const { data: publishedLevels } = await dbClient
      .from('tts_levels')
      .select('id')
      .eq('status', 'published');

    const publishedLevelIds = new Set((publishedLevels || []).map((l) => l.id));

    // Query seluruh kata yang ada di database
    const { data: allDbWordsRows } = await dbClient
      .from('tts_words')
      .select('word, clue, level_id');

    const allDbWords = (allDbWordsRows || []).map((w) => ({
      word: String(w.word).toUpperCase().replace(/[^A-Z]/g, ''),
      clue: String(w.clue || '').trim(),
      isPublished: publishedLevelIds.has(w.level_id),
    }));

    // Tentukan daftar kata yang dilarang (anti-duplikat)
    const wordsToExcludeSet = new Set<string>();
    allDbWords.forEach((item) => {
      if (filterPublishedOnly) {
        if (item.isPublished) wordsToExcludeSet.add(item.word);
      } else {
        wordsToExcludeSet.add(item.word);
      }
    });

    const excludedWordsList = Array.from(wordsToExcludeSet);

    // 3. Susun instruksi ketat anti-duplikat untuk prompt AI Gemini
    const antiDuplicatePromptSection =
      excludedWordsList.length > 0
        ? `\n\nATURAN KETAT ANTI-DUPLIKAT (KATA YANG DILARANG KARENA SUDAH ADA DI LEVEL LAIN):
Terdapat ${excludedWordsList.length} kata yang SUDAH PERNAH digunakan pada level sebelumnya:
[${excludedWordsList.slice(0, 100).join(', ')}]
DILARANG KERAS menghasilkan kata-kata di atas atau sinonim persisnya!
Buatkan kosakata BARU yang edukatif, relevan dengan topik, dan BELUM PERNAH muncul di daftar larangan di atas.`
        : '';

    const prompt = `Kamu adalah Ahli Pembuat Teka-Teki Silang (TTS) Indonesia Profesional.
Topik: "${topic}".
Tingkat Kesulitan: ${isHardZone ? 'Sulit (Zona Hard)' : 'Sedang / Menyenangkan'}.

Tugasmu:
Buatkan daftar 14 sampai 18 kosakata bahasa Indonesia yang relevan, edukatif, dan sangat cocok untuk teka-teki silang seputar topik "${topic}".

PANDUAN KATA AGAR BERPOTONGAN ALAMI (TIDAK MAKSA):
1. Pilih kata-kata populer/baku dengan panjang 4 sampai 7 huruf.
2. Pastikan kata-kata tersebut saling memiliki huruf vokal dan konsonan umum (seperti A, E, I, N, R, S, T, K, L, M) agar bisa bersilangan secara simetris, rapi, dan saling mengunci.
3. Jawaban kata WAJIB dalam HURUF KAPITAL tanpa spasi atau tanda baca.
4. Tulis petunjuk (clue) teka-teki silang yang akurat, menarik, dan informatif untuk tiap kata.
5. Buat judul level yang tematik dan menarik.${antiDuplicatePromptSection}`;

    const candidateModels = [
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash',
      'gemini-flash-latest',
    ];

    let generatedCandidates = null;
    let lastError: unknown = null;

    for (const m of candidateModels) {
      try {
        const result = await generateObject({
          model: getGeminiModel(m),
          schema: CandidateWordsSchema,
          prompt,
          abortSignal: AbortSignal.timeout(12000),
        });
        if (result?.object && result.object.words?.length >= 6) {
          generatedCandidates = result.object;
          break;
        }
      } catch (err) {
        lastError = err;
      }
    }

    if (!generatedCandidates || !generatedCandidates.words || generatedCandidates.words.length === 0) {
      throw lastError || new Error('Gagal mendapatkan daftar kata dari AI');
    }

    // 4. Filter Programatis Tingkat Kode: Buang setiap kata yang cocok dengan kata yang sudah ada
    const candidateList = generatedCandidates.words || [];
    const freshWords = candidateList.filter((w) => {
      const clean = String(w.word).toUpperCase().replace(/[^A-Z]/g, '');
      return !wordsToExcludeSet.has(clean);
    });

    // Gunakan freshWords jika jumlahnya mencukupi minimal targetWordCount
    const wordsForLayout = freshWords.length >= targetWordCount ? freshWords : candidateList;

    // 5. Tata letak grid TTS menggunakan engine interlocking asli
    const layout = buildCrosswordLayout(
      generatedCandidates.title || `Level ${lvlNum}: ${topic}`,
      wordsForLayout,
      targetWordCount
    );

    if (!layout || layout.words.length < 3) {
      throw new Error('Gagal menemukan persilangan kata yang cocok. Silakan klik Generate lagi.');
    }

    return NextResponse.json({
      success: true,
      data: layout,
      meta: {
        isAntiDuplicateActive: true,
        excludedWordsCount: excludedWordsList.length,
        totalWordsInDb: allDbWords.length,
        publishedWordsCount: allDbWords.filter((w) => w.isPublished).length,
        filteredOutCount: candidateList.length - freshWords.length,
      },
    });
  } catch (err: unknown) {
    console.error('Error TTS Generator:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `AI Error: ${msg}` }, { status: 500 });
  }
}
