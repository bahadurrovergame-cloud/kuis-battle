'use client';

import { useEffect } from 'react';
import { applyThemeToDom } from '@/lib/supabase';

export default function ThemeInitializer() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname;

      // Isolasi Tema: Game Hub, The Path, TTS, dan Admin Hub selalu menggunakan Dark Gaming Theme
      const isBattleRoute =
        pathname.startsWith('/battle') ||
        pathname.startsWith('/operator') ||
        pathname.startsWith('/control') ||
        pathname.startsWith('/peserta') ||
        pathname.startsWith('/admin/soal');

      if (!isBattleRoute) {
        document.documentElement.setAttribute('data-theme', 'default');
        return;
      }

      const saved = localStorage.getItem('app_theme');
      applyThemeToDom(saved || 'default');
    }
  }, []);

  return null;
}
