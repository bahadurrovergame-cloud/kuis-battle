'use client';

import { useCompletion } from '@ai-sdk/react';
import { useState, useEffect } from 'react';
import { Sparkles, RefreshCw, Lightbulb, BookOpen, Copy, Check } from 'lucide-react';

interface AiTutorProps {
  questionId?: string;
  question: string;
  correctAnswer: string;
  userAnswer?: string;
  optionsText?: string;
  isAnswerRevealed?: boolean;
  defaultMode?: 'hint' | 'explanation';
}

export default function AiTutor({
  questionId,
  question,
  correctAnswer,
  userAnswer = 'Peserta menjawab salah / tidak terjawab',
  optionsText = '',
  isAnswerRevealed = false,
  defaultMode,
}: AiTutorProps) {
  // Mode aktif: 'hint' (saat soal berjalan) atau 'explanation' (setelah kunci dibuka)
  const [activeTab, setActiveTab] = useState<'hint' | 'explanation'>(
    defaultMode || (isAnswerRevealed ? 'explanation' : 'hint')
  );
  const [hintStep, setHintStep] = useState<number>(1);
  const [copied, setCopied] = useState(false);
  // Cache per tingkat petunjuk (Hint 1 vs Hint 2) untuk butir soal aktif
  const [hintsByStep, setHintsByStep] = useState<Record<number, string>>({});

  // Completion hook untuk penjelasan (explanation) - tanpa static ID agar tidak terkontaminasi SWR cache soal lain
  const {
    completion: expCompletion,
    complete: completeExp,
    isLoading: isExpLoading,
    error: expError,
    setCompletion: setExpCompletion,
  } = useCompletion({
    api: '/api/tutor',
    streamProtocol: 'text',
  });

  // Completion hook untuk petunjuk (hint) - tanpa static ID agar tidak mempertahankan hint soal sebelumnya
  const {
    completion: hintCompletion,
    complete: completeHint,
    isLoading: isHintLoading,
    error: hintError,
    setCompletion: setHintCompletion,
  } = useCompletion({
    api: '/api/tutor',
    streamProtocol: 'text',
    onFinish: (_prompt, completion) => {
      if (completion) {
        setHintsByStep((prev) => ({ ...prev, [hintStep]: completion }));
      }
    },
  });



  // Otomatis sinkron tab saat status isAnswerRevealed berubah jika pengguna belum memilih manual
  useEffect(() => {
    if (isAnswerRevealed) {
      queueMicrotask(() => {
        setActiveTab('explanation');
      });
    }
  }, [isAnswerRevealed]);

  // Trigger pemanggilan penjelasan jika tab explanation dibuka dan belum ada teks
  useEffect(() => {
    if (activeTab === 'explanation' && question && correctAnswer && !expCompletion && !isExpLoading) {
      completeExp('', {
        body: {
          mode: 'explanation',
          question,
          correctAnswer,
          userAnswer,
        },
      });
    }
  }, [activeTab, question, correctAnswer, userAnswer, expCompletion, isExpLoading, completeExp]);

  const handleRequestHint = (stepNum: number, forceRefresh = false) => {
    setHintStep(stepNum);

    // Jika sudah pernah dibuat sebelumnya dan tidak dipaksa refresh, tampilkan langsung
    if (!forceRefresh && hintsByStep[stepNum]) {
      setHintCompletion(hintsByStep[stepNum]);
      return;
    }

    // Bersihkan buffer tampilan agar loader langsung aktif tanpa residual teks sebelumnya
    setHintCompletion('');
    completeHint('', {
      body: {
        mode: 'hint',
        question,
        correctAnswer,
        optionsText,
        step: stepNum,
      },
    });
  };

  const handleCopy = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayedHint = hintCompletion || hintsByStep[hintStep] || '';

  return (
    <div className="mt-3 p-4 bg-gradient-to-br from-slate-900/90 to-blue-950/60 border border-blue-500/30 rounded-2xl shadow-xl backdrop-blur-md">
      {/* Header & Tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-500/20 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          </div>
          <span className="text-xs font-black tracking-wider uppercase text-blue-300">
            AI Tutor & Assistant MC
          </span>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-blue-500/20">
          <button
            type="button"
            onClick={() => setActiveTab('hint')}
            className={`px-3 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all ${
              activeTab === 'hint'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Lightbulb className="w-3 h-3 text-amber-400" />
            <span>Hint Bertahap</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('explanation')}
            className={`px-3 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all ${
              activeTab === 'explanation'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-3 h-3" />
            <span>Penjelasan Edukatif</span>
          </button>
        </div>
      </div>

      {/* Konten Tab 1: HINT BERTAHAP */}
      {activeTab === 'hint' && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-[11px] text-slate-400">
              Pilih tingkat petunjuk tanpa membocorkan jawaban:
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleRequestHint(1)}
                disabled={isHintLoading}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                  hintStep === 1 && (displayedHint || hintsByStep[1])
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                }`}
              >
                1. Hint Konseptual
              </button>
              <button
                type="button"
                onClick={() => handleRequestHint(2)}
                disabled={isHintLoading}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                  hintStep === 2 && (displayedHint || hintsByStep[2])
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                }`}
              >
                2. Hint Karakteristik
              </button>
            </div>
          </div>

          <div className="p-3 bg-slate-950/70 border border-amber-500/20 rounded-xl min-h-[56px] flex flex-col justify-center">
            {isHintLoading ? (
              <p className="animate-pulse text-xs italic text-amber-300 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 animate-spin" />
                <span>AI sedang meramu petunjuk yang pas...</span>
              </p>
            ) : displayedHint ? (
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-200 leading-relaxed font-medium">
                    {displayedHint}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleRequestHint(hintStep, true)}
                    className="text-slate-400 hover:text-amber-300 p-1 transition-colors"
                    title="Buat ulang petunjuk ini"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(displayedHint)}
                    className="text-slate-400 hover:text-amber-300 p-1 transition-colors"
                    title="Salin untuk dibacakan MC"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            ) : hintError ? (
              <div className="flex items-center justify-between text-xs text-rose-400">
                <span>Gagal meramu petunjuk: {hintError.message}</span>
                <button
                  type="button"
                  onClick={() => handleRequestHint(hintStep, true)}
                  className="underline text-[11px] text-amber-400 hover:text-amber-200"
                >
                  Coba lagi
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 italic text-center">
                Klik salah satu tombol petunjuk di atas untuk membantu peserta yang kesulitan.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Konten Tab 2: PENJELASAN EDUKATIF */}
      {activeTab === 'explanation' && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-blue-300/80 font-medium">
              Bahan Edukasi / Konsep Materi:
            </span>
            {!isExpLoading && (
              <button
                type="button"
                onClick={() =>
                  completeExp('', {
                    body: { mode: 'explanation', question, correctAnswer, userAnswer },
                  })
                }
                className="text-[10px] text-blue-400 hover:text-blue-200 flex items-center gap-1 bg-blue-900/40 px-2 py-0.5 rounded border border-blue-700/40 transition-all"
                title="Buat ulang penjelasan AI"
              >
                <RefreshCw className="w-2.5 h-2.5" />
                <span>Ulangi</span>
              </button>
            )}
          </div>

          <div className="p-3 bg-slate-950/70 border border-blue-500/20 rounded-xl min-h-[56px] text-slate-200 text-xs leading-relaxed">
            {isExpLoading ? (
              <p className="animate-pulse italic text-blue-400/80 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 animate-spin" />
                <span>AI sedang menyusun penjelasan konsep materi...</span>
              </p>
            ) : expCompletion ? (
              <div className="flex items-start justify-between gap-2">
                <p className="whitespace-pre-wrap leading-relaxed">{expCompletion}</p>
                <button
                  type="button"
                  onClick={() => handleCopy(expCompletion)}
                  className="text-slate-400 hover:text-blue-300 p-1 shrink-0"
                  title="Salin Penjelasan"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            ) : expError ? (
              <div className="flex items-center justify-between text-xs text-rose-400">
                <span>Gagal memuat penjelasan: {expError.message}</span>
                <button
                  type="button"
                  onClick={() =>
                    completeExp('', {
                      body: { mode: 'explanation', question, correctAnswer, userAnswer },
                    })
                  }
                  className="underline text-[11px] text-blue-400 hover:text-blue-200"
                >
                  Coba lagi
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 italic text-center">
                Penjelasan akan dimuat otomatis saat jawaban selesai diuji.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}