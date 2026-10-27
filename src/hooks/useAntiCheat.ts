'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { setupConsoleGuardian } from '@/lib/anti-devtools';

export interface UseAntiCheatOptions {
  /**
   * Apakah pengawasan anti-cheat sedang aktif (false saat loading, game over, victory, atau modal sedang terbuka)
   */
  isEnabled?: boolean;

  /**
   * Callback yang dipanggil saat pelanggaran heuristik anti-cheat terdeteksi
   */
  onViolation: (reason: string) => void;

  /**
   * Cooldown antar pelanggaran untuk mencegah double-trigger dari blur & visibilitychange bersamaan (ms)
   */
  cooldownMs?: number;

  /**
   * Apakah ingin mengaktifkan deteksi devtools (console guardian)
   */
  enableDevToolsDetection?: boolean;
}

export interface UseAntiCheatReturn {
  isScreenCovered: boolean;
  clearClipboard: () => void;
  triggerViolation: (reason: string) => void;
}

/**
 * Custom Hook Anti-Cheat Lanjutan:
 * 1. Pemblokiran & Deteksi Screenshot Keyboard Shortcuts (PrintScreen, Snipping Tool, Mac OS Cmd+Shift+3/4/5, Ctrl+P)
 * 2. Pembersihan Otomatis Clipboard Sistem saat tombol tangkapan layar ditekan
 * 3. Deteksi Print Dialog (beforeprint event)
 * 4. Pengetatan Window Blur & Visibility API (Anti-Tab Switch & Sensor Screenshot Mobile)
 * 5. Integrasi Console Guardian & Anti-DevTools
 */
export function useAntiCheat({
  isEnabled = true,
  onViolation,
  cooldownMs = 3000,
  enableDevToolsDetection = true,
}: UseAntiCheatOptions): UseAntiCheatReturn {
  const [isScreenCovered, setIsScreenCovered] = useState(false);
  const isScreenCoveredRef = useRef(false);
  const lastViolationTimeRef = useRef<number>(0);

  // Bersihkan clipboard seketika jika ada upaya penyalinan layar
  const clearClipboard = useCallback(() => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText('').catch(() => {});
      }
    } catch {
      // Abaikan jika permission ditolak browser
    }
  }, []);

  // Eksekusi pelanggaran dengan perlindungan cooldown anti-burst
  const triggerViolation = useCallback(
    (reason: string) => {
      const now = Date.now();
      if (now - lastViolationTimeRef.current < cooldownMs) {
        return;
      }
      lastViolationTimeRef.current = now;
      onViolation(reason);
    },
    [cooldownMs, onViolation]
  );

  useEffect(() => {
    if (!isEnabled || typeof window === 'undefined') return;

    // ========================================================================
    // 1. PEMBLOKIRAN SHORTCUT KEYBOARD SCREENSHOT, PRINT & DEVTOOLS
    // ========================================================================
    const isScreenshotShortcut = (e: KeyboardEvent): boolean => {
      // 1a. PrintScreen / Snapshot (Windows / Linux)
      if (e.key === 'PrintScreen' || e.key === 'Snapshot' || e.code === 'PrintScreen') {
        return true;
      }

      // 1b. Mac OS Screenshot Shortcuts:
      // Cmd + Shift + 3 (Seluruh Layar)
      // Cmd + Shift + 4 (Area Terpilih)
      // Cmd + Shift + 5 (Panel Screenshot & Rekam Layar)
      const isMacScreenshot =
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        (['3', '4', '5', '#', '$', '%'].includes(e.key) ||
          ['Digit3', 'Digit4', 'Digit5', 'Numpad3', 'Numpad4', 'Numpad5'].includes(e.code));
      if (isMacScreenshot) return true;

      // 1c. Windows Snipping Tool: Ctrl + Shift + S atau Win + Shift + S
      if (e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's' || e.code === 'KeyS')) {
        return true;
      }

      // 1d. Print & Save as PDF: Ctrl + P / Cmd + P
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P' || e.code === 'KeyP')) {
        return true;
      }

      // 1e. Simpan Halaman Web: Ctrl + S / Cmd + S (bukan snipping)
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S' || e.code === 'KeyS') && !e.shiftKey) {
        return true;
      }

      // 1f. Inspect Elements / DevTools: F12 atau Ctrl+Shift+I/J/C
      if (
        e.key === 'F12' ||
        ((e.ctrlKey || e.metaKey) &&
          e.shiftKey &&
          ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key))
      ) {
        return true;
      }

      return false;
    };

    const handleKeyDownCapture = (e: KeyboardEvent) => {
      if (isScreenshotShortcut(e)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // Kosongkan clipboard seketika agar gambar tidak tersimpan di buffer OS
        clearClipboard();

        // Tutup layar instan dengan blackout pekat
        isScreenCoveredRef.current = true;
        setIsScreenCovered(true);

        const reason =
          e.key === 'PrintScreen' || e.code === 'PrintScreen'
            ? 'Terdeteksi penekanan tombol PrintScreen (Tangkapan Layar)'
            : (e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')
            ? 'Terdeteksi percobaan mencetak / menyimpan PDF (Ctrl/Cmd + P)'
            : 'Terdeteksi tombol pintasan tangkapan layar (Screenshot Shortcut)';

        triggerViolation(reason);

        // Buka kembali cover setelah jeda singkat jika masih di dalam layar
        setTimeout(() => {
          if (document.hasFocus() && !document.hidden) {
            isScreenCoveredRef.current = false;
            setIsScreenCovered(false);
          }
        }, 800);
      }
    };

    // Banyak browser di Windows (Chrome/Edge) menembakkan PrintScreen pada event keyup
    const handleKeyUpCapture = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen' || e.key === 'Snapshot' || e.code === 'PrintScreen') {
        e.preventDefault();
        e.stopPropagation();
        clearClipboard();
        triggerViolation('Terdeteksi penekanan tombol PrintScreen (Tangkapan Layar)');
      }
    };

    // ========================================================================
    // 2. DETEKSI PRINT DIALOG BROWSER (WINDOW.BEFOREPRINT)
    // ========================================================================
    const handleBeforePrint = () => {
      isScreenCoveredRef.current = true;
      setIsScreenCovered(true);
      triggerViolation('Terdeteksi percobaan mencetak / menyimpan dokumen (Print Dialog)');
    };

    const handleAfterPrint = () => {
      isScreenCoveredRef.current = false;
      setIsScreenCovered(false);
    };

    // ========================================================================
    // 3. SENSOR PAGE VISIBILITY & WINDOW BLUR (MOBILE SCREENSHOT & TAB SWITCH)
    // ========================================================================
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // REAKSI INSTAN: Seketika tutup seluruh layar dengan blackout overlay pekat
        isScreenCoveredRef.current = true;
        setIsScreenCovered(true);
      } else {
        // Pemain kembali ke tab / layar
        if (isScreenCoveredRef.current) {
          isScreenCoveredRef.current = false;
          setIsScreenCovered(false);
          triggerViolation('Terdeteksi meninggalkan layar pengerjaan kuis / beralih tab');
        }
      }
    };

    const handleWindowBlur = () => {
      // REAKSI INSTAN: Window kehilangan fokus (split-screen / tangkapan layar / notification drawer)
      isScreenCoveredRef.current = true;
      setIsScreenCovered(true);
    };

    const handleWindowFocus = () => {
      if (isScreenCoveredRef.current) {
        isScreenCoveredRef.current = false;
        setIsScreenCovered(false);
        triggerViolation('Terdeteksi kehilangan fokus jendela (split-screen / tangkapan layar)');
      }
    };

    // ========================================================================
    // 4. PENCEGAHAN COPY / CLIPBOARD CAPTURE
    // ========================================================================
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      clearClipboard();
      if (e.clipboardData) {
        e.clipboardData.setData('text/plain', '');
      }
      triggerViolation('Terdeteksi percobaan menyalin konten (Copying Content)');
    };

    // Pasang listener di level capture tertinggi window
    window.addEventListener('keydown', handleKeyDownCapture, { capture: true, passive: false });
    window.addEventListener('keyup', handleKeyUpCapture, { capture: true, passive: false });
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('copy', handleCopy);

    // ========================================================================
    // 5. DEVTOOLS GUARDIAN
    // ========================================================================
    let cleanupGuardian: (() => void) | null = null;
    if (enableDevToolsDetection) {
      cleanupGuardian = setupConsoleGuardian({
        onDevToolsDetected: (reason) => {
          triggerViolation(reason);
        },
        strictMode: false,
      });
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDownCapture, { capture: true });
      window.removeEventListener('keyup', handleKeyUpCapture, { capture: true });
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('copy', handleCopy);
      if (cleanupGuardian) cleanupGuardian();
    };
  }, [isEnabled, triggerViolation, clearClipboard, enableDevToolsDetection]);

  return {
    isScreenCovered,
    clearClipboard,
    triggerViolation,
  };
}

