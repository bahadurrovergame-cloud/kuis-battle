import { streamAiTutor } from '@/lib/gemini';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      question,
      userAnswer,
      correctAnswer,
      mode = 'explanation',
      step = 1,
      optionsText,
    } = body;

    if (!question || !correctAnswer) {
      return new Response('Parameter question dan correctAnswer diperlukan.', {
        status: 400,
      });
    }

    const streamResult = await streamAiTutor({
      mode,
      question,
      correctAnswer,
      userAnswer,
      optionsText,
      step: Number(step) || 1,
    });

    return streamResult.toTextStreamResponse();
  } catch (error: unknown) {
    console.error('AI Tutor API Error:', error);
    const message = error instanceof Error ? error.message : 'Terjadi kendala memanggil AI Tutor.';
    return new Response(`Catatan AI Tutor: ${message}`, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}