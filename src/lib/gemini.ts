import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText, streamText } from 'ai';

export interface GeneratedQuestionOption {
  key: string;
  text: string;
}

export type GeneratedQuestionType = 'pilihan_ganda' | 'benar_salah' | 'essay';

export interface GeneratedQuestion {
  type: GeneratedQuestionType;
  question_text: string;
  options: GeneratedQuestionOption[];
  correct_answer: string;
  explanation: string;
  points: number;
  timer_duration: number;
  category_id?: string | null;
  package_name?: string;
}

export function getGeminiModel(customModel?: string) {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    '';

  const google = createGoogleGenerativeAI({
    apiKey,
  });

  // PERBAIKAN: Default ke gemini-1.5-flash yang valid, cepat, dan stabil di API Google AI
  const modelName =
    customModel ||
    process.env.GEMINI_MODEL ||
    'gemini-1.5-flash';

  return google(modelName);
}

/**
 * AI Tutor: Menghasilkan Petunjuk Bertahap (Hint) atau Penjelasan Edukatif (Explanation)
 */
export async function streamAiTutor({
  mode = 'explanation',
  question,
  correctAnswer,
  userAnswer,
  optionsText,
  step = 1,
}: {
  mode?: 'hint' | 'explanation';
  question: string;
  correctAnswer: string;
  userAnswer?: string;
  optionsText?: string;
  step?: number;
}) {
  const model = getGeminiModel();

  if (mode === 'hint') {
    const systemPrompt = `Kamu adalah AI Quiz Tutor cerdas untuk kuis battle panggung cerdas cermat.
Tugasmu memberikan "HINT" (petunjuk cerdas bertahap) kepada peserta yang sedang bertanding di panggung.

ATURAN PALING PENTING:
1. JANGAN PERNAH membocorkan huruf jawaban (misal: "Jawabannya adalah A") atau menyebut langsung kata kunci jawaban persis!
2. Jika Hint level 1: Berikan petunjuk konseptual / analogi umum untuk memancing cara berpikir peserta.
3. Jika Hint level 2: Berikan petunjuk karakteristik penting yang lebih terarah tanpa menyebut nama jawaban.
4. Tulis dalam bahasa Indonesia yang ringkas, cerdas, bersahabat, dan memotivasi (maksimal 2 kalimat).`;

    const userPrompt = `Soal: ${question}
${optionsText ? `Pilihan Opsi:\n${optionsText}` : ''}
KUNCI JAWABAN RAHASIA (INGAT: DILARANG MEMBOCORKAN INI): ${correctAnswer}
Tingkat Petunjuk: Hint #${step} (${step === 1 ? 'Arah Berpikir / Konseptual' : 'Ciri Khas / Karakteristik'})

Berikan Hint #${step}:`;

    return streamText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
    });
  }

  // Mode 'explanation'
  const systemPrompt = `Kamu adalah AI Tutor & Asisten Juri untuk Kuis Battle Panggung Cerdas Cermat.
Tugasmu memberikan ulasan edukatif dan ringkas (1-2 paragraf padat) kenapa kunci jawaban tersebut benar dan apa konsep utamanya.
Ulasan ini akan dibacakan oleh MC atau juri ke peserta setelah ronde selesai. Gunakan gaya bahasa Indonesia yang energetik, cerdas, dan menyenangkan.`;

  const userPrompt = `Soal: ${question}
Kunci Jawaban Benar: ${correctAnswer}
Kondisi Jawaban Peserta: ${userAnswer || 'Peserta menjawab salah / tidak terjawab'}

Berikan penjelasan edukatif:`;

  return streamText({
    model,
    system: systemPrompt,
    prompt: userPrompt,
  });
}

/**
 * Membersihkan JSON dari markdown fences dan trailing commas sebelum parsing
 */
function cleanAndParseJson<T>(raw: string): T {
  let cleaned = raw.replace(/^```(?:json)?\s*/gi, '').replace(/\s*```$/gi, '').trim();
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    cleaned = cleaned.slice(firstBracket, lastBracket + 1);
  }

  // Bersihkan trailing commas (koma sebelum ']' atau '}') secara berulang
  let prev = '';
  while (prev !== cleaned) {
    prev = cleaned;
    cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Normalisasi spasi dan baris baru jika terjadi kesalahan pemformatan
    const normalized = cleaned.replace(/[\r\n\t]+/g, ' ');
    return JSON.parse(normalized) as T;
  }
}

/**
 * AI Assistant: Generator Soal Berbasis Topik, Kesulitan, dan Jenis Soal
 */
export async function generateQuizQuestions({
  topic,
  difficulty = 'sedang',
  count = 3,
  points = 100,
  timerDuration = 30,
  questionType = 'pilihan_ganda',
  existingQuestions = [],
}: {
  topic: string;
  difficulty?: 'mudah' | 'sedang' | 'sulit' | 'campuran';
  count?: number;
  points?: number;
  timerDuration?: number;
  questionType?: 'pilihan_ganda' | 'benar_salah' | 'essay' | 'campuran';
  existingQuestions?: string[];
}): Promise<GeneratedQuestion[]> {
  const model = getGeminiModel();
  const safeCount = Math.min(Math.max(1, count), 10);

  let typeInstruction = '';
  if (questionType === 'pilihan_ganda') {
    typeInstruction = `SEMUA ${safeCount} butir soal HARUS bertipe "pilihan_ganda".
Setiap butir soal memiliki 4 opsi (A, B, C, D):
"options": [
  { "key": "A", "text": "Opsi A" },
  { "key": "B", "text": "Opsi B" },
  { "key": "C", "text": "Opsi C" },
  { "key": "D", "text": "Opsi D" }
]
"correct_answer": "A" atau "B" atau "C" atau "D" (bervariasi).`;
  } else if (questionType === 'benar_salah') {
    typeInstruction = `SEMUA ${safeCount} butir soal HARUS bertipe "benar_salah".
Pertanyaan berupa pernyataan fakta yang diuji kebenarannya.
"options": [
  { "key": "true", "text": "BENAR" },
  { "key": "false", "text": "SALAH" }
]
"correct_answer": "true" (jika pernyataan benar) atau "false" (jika pernyataan salah).`;
  } else if (questionType === 'essay') {
    typeInstruction = `SEMUA ${safeCount} butir soal HARUS bertipe "essay" (pertanyaan lisan / rebutan cerdas cermat).
"options": [] (array kosong).
"correct_answer": "Tuliskan rujukan jawaban singkat, padat, dan jelas untuk acuan penilaian juri".`;
  } else {
    typeInstruction = `Buatkan ${safeCount} butir soal dengan variasi campuran:
- Sebagian bertipe "pilihan_ganda" (4 opsi A/B/C/D).
- Sebagian bertipe "benar_salah" (options: [{"key":"true","text":"BENAR"},{"key":"false","text":"SALAH"}], correct_answer: "true" atau "false").
- Sebagian bertipe "essay" (options: [], correct_answer berupa rujukan jawaban singkat dewan juri).`;
  }

  let avoidanceInstruction = '';
  if (existingQuestions && existingQuestions.length > 0) {
    const sampleExisting = existingQuestions
      .filter(Boolean)
      .slice(0, 15)
      .map((q) => `- ${q}`)
      .join('\n');
    avoidanceInstruction = `\nFILTER HINDARI DUPLIKASI:\nJangan membuat soal yang menanyakan hal yang sama dengan soal-soal berikut yang sudah ada:\n${sampleExisting}\n`;
  }

  const prompt = `Kamu adalah Master Pembuat Soal Kuis Panggung Cerdas Cermat Profesional.
Tugasmu: Buatkan ${safeCount} butir soal kuis dengan topik "${topic}" dan tingkat kesulitan "${difficulty}".

KETENTUAN JENIS SOAL:
${typeInstruction}
${avoidanceInstruction}
SYARAT FORMAT OUTPUT (WAJIB DIPATUHI SECARA KETAT):
1. Kembalikan HANYA format JSON murni berupa Array of Objects.
2. JANGAN sertakan awalan (\`\`\`json) atau akhiran (\`\`\`) markdown, dan JANGAN ada komentar di luar array JSON.
3. PENTING: JANGAN ada trailing comma (tanda koma sebelum tanda ']' atau '}').
4. Struktur setiap elemen soal HARUS persis seperti ini:
[
  {
    "type": "pilihan_ganda" | "benar_salah" | "essay",
    "question_text": "Tuliskan teks pertanyaan/pernyataan yang jelas dan tidak ambigu",
    "options": [...],
    "correct_answer": "...",
    "explanation": "Penjelasan ringkas 1-2 kalimat kenapa jawaban tersebut benar",
    "points": ${points},
    "timer_duration": ${timerDuration}
  }
]`;

  const result = await generateText({
    model,
    prompt,
  });

  const parsed = cleanAndParseJson<GeneratedQuestion[]>(result.text);

  if (!Array.isArray(parsed)) {
    throw new Error('Hasil AI bukan berupa array JSON yang valid');
  }

  // Validasi dan normalisasi tiap butir soal
  return parsed.map((item, index) => {
    let resolvedType: GeneratedQuestionType = 'pilihan_ganda';
    if (item.type === 'benar_salah' || questionType === 'benar_salah') {
      resolvedType = 'benar_salah';
    } else if (item.type === 'essay' || questionType === 'essay') {
      resolvedType = 'essay';
    }

    let validOptions: GeneratedQuestionOption[] = [];
    let validCorrect = String(item.correct_answer || '').trim();

    if (resolvedType === 'benar_salah') {
      validOptions = [
        { key: 'true', text: 'BENAR' },
        { key: 'false', text: 'SALAH' },
      ];
      const lower = validCorrect.toLowerCase();
      validCorrect = lower === 'benar' || lower === 'true' ? 'true' : 'false';
    } else if (resolvedType === 'essay') {
      validOptions = [];
      if (!validCorrect) validCorrect = 'Jawaban rujukan juri';
    } else {
      validOptions = (item.options || []).map((opt, oIdx) => ({
        key: opt.key || ['A', 'B', 'C', 'D'][oIdx] || `Opt${oIdx}`,
        text: String(opt.text || '').trim(),
      }));
      if (validOptions.length === 0) {
        validOptions = [
          { key: 'A', text: 'Opsi A' },
          { key: 'B', text: 'Opsi B' },
          { key: 'C', text: 'Opsi C' },
          { key: 'D', text: 'Opsi D' },
        ];
      }
      validCorrect = validCorrect.toUpperCase() || 'A';
    }

    return {
      type: resolvedType,
      question_text: String(item.question_text || `Soal ${index + 1}`).trim(),
      options: validOptions,
      correct_answer: validCorrect,
      explanation: String(item.explanation || '').trim(),
      points: Number(item.points) || points,
      timer_duration: Number(item.timer_duration) || timerDuration,
    };
  });
}
