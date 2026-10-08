'use client';

import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Team } from '@/lib/supabase';
import { Trophy, Medal, Sparkles, RefreshCcw } from 'lucide-react';
import { sounds } from '@/lib/sound';

interface VictoryPodiumProps {
  teams: Team[];
  onRestart?: () => void;
}

export default function VictoryPodium({ teams, onRestart }: VictoryPodiumProps) {
  // Sort teams descending
  const sorted = [...teams].sort((a, b) => b.score - a.score);
  const first = sorted[0];
  const second = sorted[1];
  const third = sorted[2];

  useEffect(() => {
    // Play fanfare
    sounds.playVictory();

    // Fire fireworks confetti
    const duration = 6 * 1000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#f59e0b', '#3b82f6', '#10b981', '#ef4444'],
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#f59e0b', '#3b82f6', '#10b981', '#ef4444'],
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-slate-100">
      <div className="text-center mb-10 animate-bounce">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 font-bold text-sm uppercase tracking-widest mb-3">
          <Sparkles className="w-4 h-4" /> Grand Final Result
        </div>
        <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-white uppercase drop-shadow-md">
          Juara Kuis Battle
        </h1>
      </div>

      {/* 3D-styled Podium Pillars */}
      <div className="flex items-end justify-center gap-4 sm:gap-8 max-w-4xl w-full mb-10">
        {/* JUARA 2 (PERAK) */}
        {second && (
          <div className="flex-1 flex flex-col items-center max-w-[200px]">
            <Medal className="w-10 h-10 text-slate-300 mb-2" />
            <div className="text-center mb-3">
              <span className="font-extrabold text-slate-200 text-base sm:text-lg block truncate max-w-[150px]">
                {second.name}
              </span>
              <span className="font-mono text-sm text-slate-400 font-bold">
                {second.score} PTS
              </span>
            </div>
            <div className="w-full h-44 bg-gradient-to-t from-slate-700 to-slate-500 rounded-t-3xl flex flex-col items-center justify-start pt-4 shadow-xl border-t border-slate-400/50">
              <span className="text-3xl sm:text-4xl font-black text-slate-900">2</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">PERAK</span>
            </div>
          </div>
        )}

        {/* JUARA 1 (EMAS) */}
        {first && (
          <div className="flex-1 flex flex-col items-center max-w-[240px] -mt-10">
            <Trophy className="w-16 h-16 text-amber-400 mb-2 animate-pulse" />
            <div className="text-center mb-3">
              <span className="font-black text-amber-300 text-lg sm:text-2xl block truncate max-w-[180px]">
                {first.name}
              </span>
              <span className="font-mono text-base text-amber-400 font-extrabold">
                {first.score} PTS
              </span>
            </div>
            <div className="w-full h-60 bg-gradient-to-t from-amber-600 via-amber-500 to-amber-400 rounded-t-3xl flex flex-col items-center justify-start pt-6 shadow-2xl border-t-2 border-yellow-200">
              <span className="text-5xl sm:text-6xl font-black text-slate-950">1</span>
              <span className="text-xs font-black uppercase tracking-widest text-slate-950">EMAS</span>
            </div>
          </div>
        )}

        {/* JUARA 3 (PERUNGGU) */}
        {third && (
          <div className="flex-1 flex flex-col items-center max-w-[200px]">
            <Medal className="w-8 h-8 text-amber-700 mb-2" />
            <div className="text-center mb-3">
              <span className="font-extrabold text-amber-200 text-base sm:text-lg block truncate max-w-[150px]">
                {third.name}
              </span>
              <span className="font-mono text-sm text-slate-400 font-bold">
                {third.score} PTS
              </span>
            </div>
            <div className="w-full h-32 bg-gradient-to-t from-amber-900 to-amber-700 rounded-t-3xl flex flex-col items-center justify-start pt-4 shadow-lg border-t border-amber-600/50">
              <span className="text-3xl sm:text-4xl font-black text-white">3</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-200">PERUNGGU</span>
            </div>
          </div>
        )}
      </div>

      {onRestart && (
        <button
          onClick={onRestart}
          className="mt-4 px-6 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 hover:text-white font-semibold flex items-center gap-2 transition-all shadow-md text-sm"
        >
          <RefreshCcw className="w-4 h-4" />
          Tutup Layar Podium
        </button>
      )}
    </div>
  );
}
