'use client';

import React, { useState, useEffect } from 'react';
import {
  supabase,
  GameSession,
  ThemeKey,
  THEME_PRESETS,
  applyThemeToDom,
  parseSessionMeta,
  buildSessionTitleWithMeta,
} from '@/lib/supabase';
import { Palette, Check, Sparkles, X, Sun, Moon, Shield } from 'lucide-react';

interface ThemeSelectorProps {
  session?: GameSession | null;
  onThemeChange?: (newTheme: ThemeKey) => void;
  className?: string;
  variant?: 'compact' | 'button' | 'pill';
}

export default function ThemeSelector({
  session,
  onThemeChange,
  className = '',
  variant = 'button',
}: ThemeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<ThemeKey>('default');
  const [saving, setSaving] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);

  // Sync theme dari session atau localStorage
  useEffect(() => {
    if (session) {
      const { theme } = parseSessionMeta(session);
      setCurrentTheme(theme);
      applyThemeToDom(theme);
    } else if (typeof window !== 'undefined') {
      const saved = (localStorage.getItem('app_theme') as ThemeKey) || 'default';
      setCurrentTheme(saved);
      applyThemeToDom(saved);
    }
  }, [session]);

  const handleSelectTheme = async (themeKey: ThemeKey) => {
    setCurrentTheme(themeKey);
    applyThemeToDom(themeKey);
    onThemeChange?.(themeKey);

    const activePreset = THEME_PRESETS.find((t) => t.id === themeKey);

    if (session?.id) {
      setSaving(true);
      try {
        const { cleanTitle, boxCount, activeCategoryId } = parseSessionMeta(session);
        const newTitle = buildSessionTitleWithMeta(
          cleanTitle,
          boxCount,
          activeCategoryId,
          themeKey
        );

        const { error } = await supabase
          .from('game_sessions')
          .update({ title: newTitle })
          .eq('id', session.id);

        if (error) throw error;

        setStatusText(`Tema "${activePreset?.name}" aktif di seluruh panggung!`);
        setTimeout(() => setStatusText(null), 3000);
      } catch (err: unknown) {
        console.error('Failed to sync theme to room session:', err);
      } finally {
        setSaving(false);
      }
    } else {
      setStatusText(`Tema "${activePreset?.name}" aktif secara lokal!`);
      setTimeout(() => setStatusText(null), 2500);
    }

    setIsOpen(false);
  };

  const activeThemeObj = THEME_PRESETS.find((t) => t.id === currentTheme) || THEME_PRESETS[0];

  return (
    <div className={`relative inline-block ${className}`}>
      {/* TRIGGER BUTTON */}
      {variant === 'pill' ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white transition-all shadow-sm"
          title="Ganti Tema Visual Panggung"
        >
          <span
            className="w-2.5 h-2.5 rounded-full border border-white/30"
            style={{ backgroundColor: activeThemeObj.accentHex }}
          />
          <span>{activeThemeObj.name}</span>
          <Palette className="w-3 h-3 text-slate-400 ml-0.5" />
        </button>
      ) : variant === 'compact' ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-600 transition-all flex items-center justify-center shadow-sm"
          title={`Ganti Tema Panggung (Saat ini: ${activeThemeObj.name})`}
        >
          <Palette className="w-4 h-4 text-purple-400" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-purple-500/60 text-slate-200 hover:text-white text-xs font-bold transition-all shadow-sm"
        >
          <div className="flex items-center gap-1">
            <span
              className="w-3 h-3 rounded-full border border-white/40 shadow-sm"
              style={{ backgroundColor: activeThemeObj.accentHex }}
            />
          </div>
          <span className="hidden sm:inline">Tema:</span>
          <span className="text-purple-300">{activeThemeObj.name}</span>
          <Palette className="w-3.5 h-3.5 text-slate-400" />
        </button>
      )}

      {/* TOAST FEEDBACK NOTIFICATION */}
      {statusText && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-2xl bg-slate-900 border border-emerald-500/60 text-emerald-300 text-xs font-bold shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span>{statusText}</span>
        </div>
      )}

      {/* MODAL PILIH TEMA */}
      {isOpen && (
        <div className="fixed inset-0 z-[99] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 max-w-lg w-full shadow-2xl relative animate-in fade-in zoom-in-95">
            {/* Header Modal */}
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  <Palette className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-wider">
                    Pilih Tema Panggung
                  </h3>
                  <p className="text-xs text-slate-400">
                    {session?.room_code
                      ? `Tema akan otomatis tersinkron ke Proyektor & HP Peserta di room [${session.room_code}]`
                      : 'Sesuaikan kontras visual dengan kondisi cahaya ruangan lomba'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List Pilihan Tema */}
            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
              {THEME_PRESETS.map((t) => {
                const isSelected = t.id === currentTheme;
                const isDaylight = t.id === 'daylight';

                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleSelectTheme(t.id)}
                    className={`w-full p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'border-purple-500 bg-purple-950/30 ring-2 ring-purple-500/40 shadow-lg'
                        : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-950'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Swatch Preview Circles */}
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center p-1 border shadow-inner shrink-0"
                        style={{
                          backgroundColor: t.bgHex,
                          borderColor: t.accentHex,
                        }}
                      >
                        <span
                          className="w-4 h-4 rounded-full border border-white/50 shadow-md"
                          style={{ backgroundColor: t.accentHex }}
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-white text-sm">
                            {t.name}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                              isDaylight
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : t.id === 'royal-gold'
                                ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
                                : t.id === 'cyberpunk'
                                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                                : t.id === 'emerald'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                            }`}
                          >
                            {t.badge}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">
                          {t.description}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isSelected ? (
                        <div className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center shadow">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full border border-slate-700" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Footer Modal */}
            <div className="pt-4 mt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Otomatis berganti seketika (Realtime)</span>
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition-all"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

