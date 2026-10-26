'use client';

import React, { useState, useEffect, useCallback, useTransition } from 'react';
import { History, X, RefreshCw, TrendingUp, TrendingDown, Sparkles, Award } from 'lucide-react';
import { PointHistory } from '@/lib/supabase-hub';
import { getUserPointHistoryAction } from '@/app/path/actions';

interface PointHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTotalScore?: number;
}

export function PointHistoryModal({
  isOpen,
  onClose,
  currentTotalScore,
}: PointHistoryModalProps) {
  const [history, setHistory] = useState<PointHistory[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const fetchHistory = useCallback(() => {
    startTransition(async () => {
      setErrorMsg(null);
      try {
        const res = await getUserPointHistoryAction();
        if (res.success && res.history) {
          setHistory(res.history);
        } else {
          setErrorMsg(res.error || 'Gagal memuat riwayat poin.');
        }
      } catch {
        setErrorMsg('Terjadi kesalahan jaringan.');
      }
    });
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen, fetchHistory]);

  if (!isOpen) return null;

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md rounded-3xl p-5 bg-[#0f172a] border-2 border-emerald-500/40 shadow-2xl text-slate-200 animate-in zoom-in-95 duration-200 flex flex-col max-h-[85svh]">
        {/* HEADER MODAL */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-inner shrink-0">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-sm uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                Riwayat Poin
              </h3>
              <p className="text-[10px] text-slate-400 font-medium">
                Transparansi perolehan & mutasi skor
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={fetchHistory}
              disabled={isPending}
              title="Segarkan Riwayat"
              className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isPending ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* SUMMARY BADGE: TOTAL SKOR SAAT INI */}
        <div className="mt-3.5 px-3.5 py-2.5 rounded-2xl bg-[#1e293b]/70 border border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-slate-300">Total Skor Saat Ini</span>
          </div>
          <span className="font-mono font-black text-emerald-400 text-sm">
            {(currentTotalScore ?? 0).toLocaleString()} Pts
          </span>
        </div>

        {/* ERROR STATE */}
        {errorMsg && (
          <div className="mt-3 p-3 rounded-2xl bg-rose-950/70 border border-rose-800/80 text-rose-300 text-xs text-center shrink-0">
            {errorMsg}
          </div>
        )}

        {/* SCROLLABLE LIST RIWAYAT */}
        <div className="mt-3 flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
          {isPending && history.length === 0 ? (
            <div className="space-y-2.5 py-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="p-3 rounded-2xl bg-slate-800/40 border border-slate-800/60 animate-pulse flex items-center justify-between"
                >
                  <div className="space-y-1.5 w-2/3">
                    <div className="h-3 bg-slate-700/60 rounded-md w-3/4" />
                    <div className="h-2.5 bg-slate-700/40 rounded-md w-1/2" />
                  </div>
                  <div className="h-6 w-16 bg-slate-700/50 rounded-xl" />
                </div>
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="py-10 px-4 text-center flex flex-col items-center justify-center text-slate-400">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-2xl mb-3 shadow">
                📜
              </div>
              <p className="font-black text-xs text-slate-200 uppercase tracking-wide">
                Belum Ada Riwayat
              </p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-[260px] leading-relaxed">
                Selesaikan level TTS di The Path untuk mulai mengumpulkan poin dan mencatat riwayat skor kamu!
              </p>
            </div>
          ) : (
            history.map((item) => {
              const isPositive = item.amount > 0;
              const isNegative = item.amount < 0;

              return (
                <div
                  key={item.id}
                  className="p-3 rounded-2xl bg-[#111726] border border-slate-800/90 hover:border-slate-700 flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border ${
                        isPositive
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                          : isNegative
                          ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                          : 'bg-slate-700/20 border-slate-700/40 text-slate-400'
                      }`}
                    >
                      {isPositive ? (
                        <TrendingUp className="w-3.5 h-3.5" />
                      ) : isNegative ? (
                        <TrendingDown className="w-3.5 h-3.5" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="font-bold text-xs text-slate-100 truncate leading-snug">
                        {item.description}
                      </p>
                      <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                        {formatDate(item.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* AMOUNT BADGE */}
                  <span
                    className={`shrink-0 px-2.5 py-1 rounded-xl text-xs font-mono font-black border ${
                      isPositive
                        ? 'bg-emerald-950/70 text-emerald-400 border-emerald-600/40'
                        : isNegative
                        ? 'bg-rose-950/70 text-rose-400 border-rose-600/40'
                        : 'bg-slate-800/70 text-slate-400 border-slate-700/40'
                    }`}
                  >
                    {isPositive ? `+${item.amount.toLocaleString()}` : item.amount.toLocaleString()} Pts
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* FOOTER ACTION */}
        <div className="mt-3.5 pt-3 border-t border-slate-800 flex flex-col gap-2 shrink-0">
          <p className="text-[10px] text-slate-400 text-center font-medium">
            💡 Poin dihitung dari kecepatan waktu, combo multiplier, dan bonus level.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-black text-xs transition-colors active:translate-y-0.5"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

