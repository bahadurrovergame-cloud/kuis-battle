'use client';

import React from 'react';
import { Question } from '@/lib/supabase';
import { CheckCircle2, XCircle, HelpCircle, Lightbulb } from 'lucide-react';

interface QuestionDisplayProps {
  question: Question | null;
  isAnswerRevealed: boolean;
}

export default function QuestionDisplay({ question, isAnswerRevealed }: QuestionDisplayProps) {
  if (!question) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-slate-900/60 rounded-3xl border border-slate-800">
        <HelpCircle className="w-16 h-16 text-slate-600 mb-4 animate-bounce" />
        <h3 className="text-2xl font-bold text-slate-300">Menunggu Soal dari Operator...</h3>
        <p className="text-sm text-slate-500 mt-2">Operator panggung akan segera menampilkan nomor soal berikutnya.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col justify-between space-y-6">
      {/* Pertanyaan Utama */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 lg:p-10 shadow-2xl relative overflow-hidden backdrop-blur-md">
        <div className="flex items-center gap-3 mb-4">
          <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
            {question.type.replace('_', ' ')}
          </span>
          <span className="text-xs font-semibold text-slate-400">
            Nilai: +{question.points} Poin
          </span>
        </div>

        <h2 className="text-2xl lg:text-4xl font-extrabold text-white leading-snug tracking-tight">
          {question.question_text}
        </h2>
      </div>

      {/* Render Berdasarkan Tipe Soal */}
      {/* 1. PILIHAN GANDA */}
      {question.type === 'pilihan_ganda' && question.options && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6">
          {question.options.map((opt) => {
            const isCorrect = question.correct_answer.trim().toUpperCase() === opt.key.trim().toUpperCase();
            const showAsCorrect = isAnswerRevealed && isCorrect;

            return (
              <div
                key={opt.key}
                className={`flex items-center gap-4 p-5 lg:p-6 rounded-2xl border-2 transition-all duration-500 ${
                  showAsCorrect
                    ? 'bg-emerald-950/90 border-emerald-400 text-white shadow-lg shadow-emerald-500/30 scale-[1.02]'
                    : isAnswerRevealed
                    ? 'bg-slate-900/40 border-slate-800 text-slate-500 opacity-60'
                    : 'bg-slate-900/80 border-slate-800 text-slate-200 hover:border-slate-700'
                }`}
              >
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl shrink-0 transition-colors ${
                    showAsCorrect
                      ? 'bg-emerald-500 text-slate-950 shadow-md'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {opt.key}
                </div>
                <div className="text-lg lg:text-xl font-bold flex-1">
                  {opt.text}
                </div>
                {showAsCorrect && (
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 2. BENAR / SALAH */}
      {question.type === 'benar_salah' && (
        <div className="grid grid-cols-2 gap-6">
          {/* OPSI BENAR */}
          {(() => {
            const isCorrect = question.correct_answer.toLowerCase() === 'true';
            const showAsCorrect = isAnswerRevealed && isCorrect;
            return (
              <div
                className={`flex flex-col items-center justify-center p-8 rounded-3xl border-2 transition-all duration-500 ${
                  showAsCorrect
                    ? 'bg-emerald-950/90 border-emerald-400 shadow-xl shadow-emerald-500/30 scale-[1.03]'
                    : isAnswerRevealed
                    ? 'bg-slate-900/40 border-slate-800 opacity-50'
                    : 'bg-slate-900/80 border-slate-800'
                }`}
              >
                <CheckCircle2 className={`w-16 h-16 mb-3 ${showAsCorrect ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span className="text-3xl font-black text-white uppercase tracking-wider">BENAR</span>
                {showAsCorrect && (
                  <span className="mt-2 text-xs font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/20 px-3 py-1 rounded-full">
                    Jawaban Tepat
                  </span>
                )}
              </div>
            );
          })()}

          {/* OPSI SALAH */}
          {(() => {
            const isCorrect = question.correct_answer.toLowerCase() === 'false';
            const showAsCorrect = isAnswerRevealed && isCorrect;
            return (
              <div
                className={`flex flex-col items-center justify-center p-8 rounded-3xl border-2 transition-all duration-500 ${
                  showAsCorrect
                    ? 'bg-rose-950/90 border-rose-400 shadow-xl shadow-rose-500/30 scale-[1.03]'
                    : isAnswerRevealed
                    ? 'bg-slate-900/40 border-slate-800 opacity-50'
                    : 'bg-slate-900/80 border-slate-800'
                }`}
              >
                <XCircle className={`w-16 h-16 mb-3 ${showAsCorrect ? 'text-rose-400' : 'text-slate-400'}`} />
                <span className="text-3xl font-black text-white uppercase tracking-wider">SALAH</span>
                {showAsCorrect && (
                  <span className="mt-2 text-xs font-bold text-rose-400 uppercase tracking-widest bg-rose-500/20 px-3 py-1 rounded-full">
                    Jawaban Tepat
                  </span>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* 3. ESSAY */}
      {question.type === 'essay' && (
        <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 lg:p-8">
          <div className="flex items-center gap-2 text-slate-400 mb-3 text-sm font-semibold uppercase tracking-wider">
            <Lightbulb className="w-4 h-4 text-amber-400" />
            <span>Format Jawaban Lisan (Diskusi Mikrofon)</span>
          </div>

          {isAnswerRevealed ? (
            <div className="bg-emerald-950/70 border border-emerald-500/40 p-6 rounded-2xl animate-fade-in">
              <span className="text-xs uppercase font-extrabold tracking-widest text-emerald-400 block mb-2">
                Kunci Jawaban Rujukan Juri:
              </span>
              <p className="text-xl lg:text-2xl font-bold text-white">
                {question.correct_answer}
              </p>
              {question.explanation && (
                <p className="mt-3 text-sm text-slate-300 italic border-t border-emerald-800/60 pt-3">
                  Keterangan: {question.explanation}
                </p>
              )}
            </div>
          ) : (
            <div className="p-8 text-center border-2 border-dashed border-slate-800 rounded-2xl">
              <p className="text-slate-500 font-medium text-lg">
                Peserta berdiskusi dan memberikan jawaban di panggung. Kunci rujukan akan dibuka oleh Operator.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
