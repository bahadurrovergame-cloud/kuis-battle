'use client';

import { useEffect } from 'react';
import { applyThemeToDom } from '@/lib/supabase';

export default function ThemeInitializer() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('app_theme');
      applyThemeToDom(saved || 'default');
    }
  }, []);

  return null;
}

