/**
 * ==============================================================================
 * ANTI-DEVTOOLS & CONSOLE GUARDIAN (ANTI-CHEAT TIER 1)
 * ==============================================================================
 * Fitur:
 * 1. Blokir inspect element via Klik Kanan (contextmenu).
 * 2. Blokir shortcut DevTools (F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+U).
 * 3. Sensor deteksi pembukaan DevTools via window dimension delta & getter evaluation.
 * 4. Pembungkaman console.log/info/debug & banner peringatan Anti-Cheat resmi.
 * 5. Auto-clear konsol browser secara berkala saat bermain.
 */

export function setupConsoleGuardian({
  onDevToolsDetected,
  strictMode = true,
}: {
  onDevToolsDetected?: (reason: string) => void;
  strictMode?: boolean;
}) {
  if (typeof window === 'undefined') return () => {};

  // 1. Tampilkan Banner Anti-Cheat Resmi di Konsol
  const displayAntiCheatBanner = () => {
    try {
      console.clear();
      const styleTitle =
        'color: #ef4444; font-size: 20px; font-weight: 900; background: #1e1b4b; padding: 6px 12px; border-radius: 8px; border: 2px solid #ef4444;';
      const styleDesc =
        'color: #fbbf24; font-size: 12px; font-weight: bold; line-height: 1.5;';
      const styleWarn =
        'color: #94a3b8; font-size: 11px; font-style: italic;';

      console.log('%c⛔ PERINGATAN SISTEM KEAMANAN & ANTI-CHEAT ⛔', styleTitle);
      console.log(
        '%cPenggunaan DevTools, modifikasi memori, atau injeksi script dilarang keras saat bermain TTS.\nSeluruh aktivitas token sesi dan anomali gameplay dipantau realtime oleh Server.',
        styleDesc
      );
      console.log(
        '%cUpaya curang terdeteksi akan mengakibatkan akun dibanned permanen seketika.',
        styleWarn
      );
    } catch {
      // Abaikan jika console.clear diblokir browser
    }
  };

  // Jalankan banner saat awal
  displayAntiCheatBanner();

  // 2. Cegah Klik Kanan (Context Menu)
  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    displayAntiCheatBanner();
    return false;
  };

  // 3. Blokir Shortcut Keyboard DevTools
  const handleKeyDown = (e: KeyboardEvent) => {
    // F12
    if (e.key === 'F12' || e.keyCode === 123) {
      e.preventDefault();
      e.stopPropagation();
      displayAntiCheatBanner();
      onDevToolsDetected?.('Menekan tombol F12 (Buka DevTools)');
      return false;
    }

    // Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C (Windows/Linux)
    // Cmd+Option+I, Cmd+Option+J, Cmd+Option+C (Mac)
    const isCtrlOrMeta = e.ctrlKey || e.metaKey;
    const isShiftOrAlt = e.shiftKey || e.altKey;

    if (
      (isCtrlOrMeta && isShiftOrAlt && (e.key === 'I' || e.key === 'i' || e.keyCode === 73)) ||
      (isCtrlOrMeta && isShiftOrAlt && (e.key === 'J' || e.key === 'j' || e.keyCode === 74)) ||
      (isCtrlOrMeta && isShiftOrAlt && (e.key === 'C' || e.key === 'c' || e.keyCode === 67)) ||
      (isCtrlOrMeta && (e.key === 'U' || e.key === 'u' || e.keyCode === 85)) // View Source
    ) {
      e.preventDefault();
      e.stopPropagation();
      displayAntiCheatBanner();
      onDevToolsDetected?.('Membuka DevTools via shortcut keyboard');
      return false;
    }
  };

  // 4. Deteksi DevTools via Perubahan Dimensi Window (Docked DevTools)
  let lastDevToolsState = false;
  const checkDevToolsDimensions = () => {
    const widthThreshold = window.outerWidth - window.innerWidth > 160;
    const heightThreshold = window.outerHeight - window.innerHeight > 160;

    if (widthThreshold || heightThreshold) {
      if (!lastDevToolsState) {
        lastDevToolsState = true;
        displayAntiCheatBanner();
        if (strictMode) {
          onDevToolsDetected?.('Terdeteksi panel DevTools aktif / terbuka di jendela');
        }
      }
    } else {
      lastDevToolsState = false;
    }
  };

  // 5. Sensor Deteksi DevTools via Getter Evaluation (Console Open Trigger)
  const devtoolsDetector = {
    isOpen: false,
    orientation: undefined,
  };

  const detectorElement = new Image();
  Object.defineProperty(detectorElement, 'id', {
    get: function () {
      if (!devtoolsDetector.isOpen) {
        devtoolsDetector.isOpen = true;
        displayAntiCheatBanner();
        if (strictMode) {
          onDevToolsDetected?.('Konsol DevTools terdeteksi dibuka');
        }
      }
    },
  });

  const intervalId = setInterval(() => {
    try {
      checkDevToolsDimensions();
      // Memicu getter jika konsol aktif
      console.log(detectorElement);
      console.clear();
    } catch {
      // Abaikan
    }
  }, 2500);

  // Pasang Event Listeners
  window.addEventListener('contextmenu', handleContextMenu);
  window.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('resize', checkDevToolsDimensions);

  // Return Cleanup Function
  return () => {
    clearInterval(intervalId);
    window.removeEventListener('contextmenu', handleContextMenu);
    window.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('resize', checkDevToolsDimensions);
  };
}

