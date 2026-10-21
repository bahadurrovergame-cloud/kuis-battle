import { NextResponse } from 'next/server';
import { generateQuizQuestions } from '@/lib/gemini';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      topic,
      difficulty = 'sedang',
      count = 3,
      categoryId = null,
      packageName = 'Umum / Bebas',
      points = 100,
      timerDuration = 30,
      questionType = 'pilihan_ganda',
      existingQuestions = [],
    } = body;

    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      return NextResponse.json(
        { success: false, message: 'Topik soal wajib diisi!' },
        { status: 400 }
      );
    }

    const generated = await generateQuizQuestions({
      topic: topic.trim(),
      difficulty,
      count: Number(count) || 3,
      points: Number(points) || 100,
      timerDuration: Number(timerDuration) || 30,
      questionType,
      existingQuestions: Array.isArray(existingQuestions) ? existingQuestions : [],
    });

    // Tempelkan categoryId dan packageName ke masing-masing soal
    const enriched = generated.map((q) => ({
      ...q,
      category_id: categoryId || null,
      package_name: packageName || 'Umum / Bebas',
    }));

    return NextResponse.json({
      success: true,
      topic,
      difficulty,
      count: enriched.length,
      questions: enriched,
    });
  } catch (error: unknown) {
    console.error('API generate-soal error:', error);
    const message = error instanceof Error ? error.message : 'Gagal membuat soal otomatis dengan AI.';
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}

