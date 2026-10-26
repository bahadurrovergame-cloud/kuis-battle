'use client';

import { useState, useEffect, useRef, useCallback, useMemo, Suspense, memo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  createHubBrowserClient,
  TTSLevel,
  TTSWord,
  TTSUserProgress,
  Profile,
  GameSettings,
} from '@/lib/supabase-hub';
import {
  startLevelSessionAction,
  initTTSGameAction,
  submitWordAction,
  saveProgressDebouncedAction,
  useHintAction as executeHintAction,
  useFreezeAction as executeFreezeAction,
  completeLevelAction,
  triggerAntiCheatExecution,
  deductLifeOnGameOverAction,
} from '../actions';
import { updatePathOptimisticCompletion } from '@/lib/path-store';
import { sounds } from '@/lib/sound';
import confetti from 'canvas-confetti';
import { setupConsoleGuardian } from '@/lib/anti-devtools';
import { buildCrosswordLayout } from '@/lib/crossword-generator';
import {
  ArrowLeft,
  Flame,
  Heart,
  Coins,
  Trophy,
  Zap,
  Lightbulb,
  Snowflake,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  HelpCircle,
  RotateCcw,
  Play,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

// Fallback Puzzle Data jika database belum memiliki kata untuk level ini
const FALLBACK_WORDS: TTSWord[] = [
  {
    id: 'w-1',
    level_id: 'fallback',
    word_number: 1,
    direction: 'across',
    start_row: 1,
    start_col: 0,
    word: 'NUSANTARA',
    clue: 'Sebutan gugusan kepulauan kepresidenan Indonesia dalam bahasa Sanskerta kuno',
    points: 100,
    created_at: new Date().toISOString(),
  },
  {
    id: 'w-2',
    level_id: 'fallback',
    word_number: 2,
    direction: 'down',
    start_row: 0,
    start_col: 2,
    word: 'SUMATRA',
    clue: 'Pulau besar di barat Indonesia yang terkenal dengan Danau Toba & Danau Maninjau',
    points: 100,
    created_at: new Date().toISOString(),
  },
  {
    id: 'w-3',
    level_id: 'fallback',
    word_number: 3,
    direction: 'across',
    start_row: 4,
    start_col: 2,
    word: 'MERAH',
    clue: 'Warna bagian atas bendera Indonesia yang melambangkan keberanian bangsa',
    points: 100,
    created_at: new Date().toISOString(),
  },
  {
    id: 'w-4',
    level_id: 'fallback',
    word_number: 4,
    direction: 'down',
    start_row: 1,
    start_col: 6,
    word: 'RUPIAH',
    clue: 'Mata uang resmi Negara Kesatuan Republik Indonesia',
    points: 100,
    created_at: new Date().toISOString(),
  },
];

// ============================================================================
// MEMOIZED CROSSWORD CELL COMPONENT (ANTI-LAG 60FPS RE-RENDER)
// Mengetik satu huruf HANYA me-render sel yang berubah, bukan seluruh 100 sel!
// ============================================================================
interface CrosswordCellProps {
  r: number;
  c: number;
  cellData?: {
    letter: string;
    wordIds: string[];
    startNumber?: number;
  };
  isSelectedWord: boolean;
  isSelectedCell: boolean;
  isWordCompleted: boolean;
  isShaking: boolean;
  charValue: string;
  onClick: (r: number, c: number) => void;
}

const CrosswordCell = memo(
  function CrosswordCell({
    r,
    c,
    cellData,
    isSelectedWord,
    isSelectedCell,
    isWordCompleted,
    isShaking,
    charValue,
    onClick,
  }: CrosswordCellProps) {
    if (!cellData) {
      return (
        <div className="w-full h-full bg-[#070a12] rounded-lg pointer-events-none" />
      );
    }

    return (
      <div
        onClick={() => onClick(r, c)}
        className={`w-full h-full rounded-xl relative flex items-center justify-center font-mono font-black text-xs sm:text-base cursor-pointer transition-all select-none ${
          isShaking
            ? 'bg-rose-600 border-2 border-rose-800 text-white shadow-[0_3px_0_#881337] animate-bounce'
            : isWordCompleted
            ? 'bg-emerald-600 border-2 border-emerald-500 text-white shadow-[0_2px_0_#065f46]'
            : isSelectedCell
            ? 'bg-amber-400 text-slate-950 border-2 border-amber-600 shadow-[0_3px_0_#92400e] scale-105 z-10'
            : isSelectedWord
            ? 'bg-[#064e3b] border-2 border-emerald-500 text-white shadow-[0_2px_0_#022c22]'
            : 'bg-[#1a2336] border-2 border-slate-700 text-white hover:bg-[#222e46] shadow-[0_2px_0_#0b101b]'
        }`}
      >
        {cellData.startNumber && (
          <span className="absolute top-0.5 left-1 text-[8px] font-mono font-black text-slate-300 pointer-events-none">
            {cellData.startNumber}
          </span>
        )}
        <span className="pointer-events-none">{charValue}</span>
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.isSelectedWord === next.isSelectedWord &&
      prev.isSelectedCell === next.isSelectedCell &&
      prev.isWordCompleted === next.isWordCompleted &&
      prev.isShaking === next.isShaking &&
      prev.charValue === next.charValue &&
      prev.cellData?.letter === next.cellData?.letter &&
      prev.cellData?.startNumber === next.cellData?.startNumber &&
      prev.onClick === next.onClick
    );
  }
);

function TTSGameContent() {
  const router = useRouter();
  const params = useParams();
  const levelId = (params?.levelId as string) || '';

  // Data Game & User
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [level, setLevel] = useState<TTSLevel | null>(null);
  const [words, setWords] = useState<TTSWord[]>(FALLBACK_WORDS);
  const wordsRef = useRef<TTSWord[]>(FALLBACK_WORDS);
  const [loading, setLoading] = useState(true);

  // Grid State: key "row,col" => char
  const [gridState, setGridState] = useState<Record<string, string>>({});
  const [completedWordIds, setCompletedWordIds] = useState<string[]>([]);
  const completedWordIdsRef = useRef<string[]>([]);
  const [scoreEarned, setScoreEarned] = useState(0);
  const [comboMultiplier, setComboMultiplier] = useState(1.0);

  // Active Selection
  const [selectedWordId, setSelectedWordId] = useState<string>('');
  const [selectedCell, setSelectedCell] = useState<{ r: number; c: number } | null>(null);

  // Timers & Decay
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [hardTimerRemaining, setHardTimerRemaining] = useState<number | null>(null);
  const [freezeRemaining, setFreezeRemaining] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isVictory, setIsVictory] = useState(false);
  const [victoryData, setVictoryData] = useState<{ score: number; coins: number; nextLevelId?: string } | null>(null);

  // Anti-Cheat Cryptographic Session Token & Execution Locks (Spam-Click Defense)
  const sessionTokenRef = useRef<string>('');
  const [sessionToken, setSessionToken] = useState<string>('');
  const evaluatingWordIdsRef = useRef<Set<string>>(new Set());
  const [isPendingHint, setIsPendingHint] = useState(false);
  const [isPendingFreeze, setIsPendingFreeze] = useState(false);
  const [isCompletingLevel, setIsCompletingLevel] = useState(false);
  const evaluatedSubmissionsRef = useRef<Set<string>>(new Set());

  // Anti-Cheat Sensor States & Refs
  const [cheatViolationCount, setCheatViolationCount] = useState(0);
  const [showCoinModal, setShowCoinModal] = useState(false);
  // In-Game Toast / Notice (Menggantikan alert bawaan agar tidak memicu window blur)
  const [gameNotice, setGameNotice] = useState<{ message: string; type: 'error' | 'warning' | 'info' } | null>(null);
  const noticeTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showNotice = useCallback((message: string, type: 'error' | 'warning' | 'info' = 'warning') => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setGameNotice({ message, type });
    noticeTimerRef.current = setTimeout(() => {
      setGameNotice(null);
    }, 4500);
  }, []);

  const [cheatModalType, setCheatModalType] = useState<1 | 2 | 3 | null>(null);
  const [isAccountTerminated, setIsAccountTerminated] = useState(false);
  const cheatViolationRef = useRef(0);
  const cheatModalTypeRef = useRef<1 | 2 | 3 | null>(null);
  const lastViolationTimeRef = useRef(0);
  const isExecutingTerminationRef = useRef(false);

  // Visual Effects
  const [shakingWordId, setShakingWordId] = useState<string | null>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastInputTimestampRef = useRef<number>(0);
  const lastInputCharRef = useRef<string>('');

  const updateCheatModalType = useCallback((type: 1 | 2 | 3 | null) => {
    cheatModalTypeRef.current = type;
    setCheatModalType(type);
    if (type === null) {
      lastViolationTimeRef.current = Date.now();
    }
  }, []);

  // 1. Fetch Inisialisasi Data Level & User (High-Speed Unified Action)
  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        const res = await initTTSGameAction({ levelId });
        if (!res.success) {
          showNotice(res.error || 'Gagal mempersiapkan papan TTS.', 'error');
          setTimeout(() => router.push('/path'), 2500);
          return;
        }

        if (!isMounted) return;

        if (res.sessionToken) setSessionToken(res.sessionToken);
        if (res.profile) setProfile(res.profile);
        if (res.settings) setSettings(res.settings);

        if (res.level) {
          setLevel(res.level);
          if (res.level.is_hard_zone) {
            setHardTimerRemaining(res.level.hard_timer_override || res.settings?.hard_timer_seconds || 60);
          }
        }

        const actualWords = res.words && res.words.length > 0 ? res.words : FALLBACK_WORDS;
        setWords(actualWords);
        wordsRef.current = actualWords;
        if (actualWords.length > 0) {
          setSelectedWordId(actualWords[0].id);
          setSelectedCell({ r: actualWords[0].start_row, c: actualWords[0].start_col });
        }

        const prog = res.progress;
        if (prog) {
          if (prog.grid_state) setGridState(prog.grid_state as Record<string, string>);
          const completed: string[] = Array.isArray(prog.completed_words) ? prog.completed_words : [];
          setCompletedWordIds(completed);
          completedWordIdsRef.current = completed;
          if (prog.score_earned) setScoreEarned(prog.score_earned);
          if (prog.combo_multiplier) setComboMultiplier(prog.combo_multiplier);
          if (prog.time_taken_seconds) setElapsedSeconds(prog.time_taken_seconds);

          const allWordsDone = actualWords.length > 0 && actualWords.every((w) => completed.includes(w.id));
          if (allWordsDone) {
            setIsVictory(true);
            if (res.sessionToken) {
              completeLevelAction({
                levelId,
                sessionToken: res.sessionToken,
              }).then((vRes) => {
                if (vRes.success) {
                  setVictoryData({
                    score: vRes.scoreEarned ?? prog.score_earned ?? 0,
                    coins: vRes.coinsEarned ?? 20,
                    nextLevelId: vRes.nextLevelId,
                  });
                  updatePathOptimisticCompletion(
                    levelId,
                    vRes.scoreEarned ?? prog.score_earned ?? 0,
                    vRes.coinsEarned ?? 20
                  );
                }
              });
            }
          }
        }
      } catch (err) {
        console.error('Error loading TTS game:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    init();
    return () => {
      isMounted = false;
    };
  }, [levelId, router, showNotice]);

  // 2. Active Word Helper
  const currentWord = useMemo(() => {
    return words.find((w) => w.id === selectedWordId) || words[0] || null;
  }, [words, selectedWordId]);

  // 3. Grid Dimensions & Cell Map
  const { gridRows, gridCols, activeCellsMap } = useMemo(() => {
    const rows = level?.grid_rows || 10;
    const cols = level?.grid_cols || 10;
    const map: Record<string, { letter: string; wordIds: string[]; startNumber?: number }> = {};

    words.forEach((w) => {
      for (let i = 0; i < w.word.length; i++) {
        const r = w.direction === 'across' ? w.start_row : w.start_row + i;
        const c = w.direction === 'across' ? w.start_col + i : w.start_col;
        const key = `${r},${c}`;

        if (!map[key]) {
          map[key] = { letter: w.word[i], wordIds: [] };
        }
        if (!map[key].wordIds.includes(w.id)) {
          map[key].wordIds.push(w.id);
        }
        if (i === 0) {
          map[key].startNumber = w.word_number;
        }
      }
    });

    return { gridRows: rows, gridCols: cols, activeCellsMap: map };
  }, [level, words]);

  // 4. Timer Loop: Elapsed Seconds, Hard Timer & Freeze Countdown
  useEffect(() => {
    if (loading || isGameOver || isVictory || isAccountTerminated) return;

    const interval = setInterval(() => {
      // Jika Freeze aktif, bekukan waktu dan penyusutan poin
      if (freezeRemaining > 0) {
        setFreezeRemaining((prev) => prev - 1);
        return;
      }

      // Ticker Waktu Bermain
      setElapsedSeconds((prev) => prev + 1);

      // Hard Timer Countdown (Khusus Zona Hard)
      if (hardTimerRemaining !== null) {
        if (hardTimerRemaining <= 1) {
          // Waktu habis -> GAME OVER!
          setIsGameOver(true);
          sounds.playTimeUp();
          deductLifeOnGameOverAction().catch((err) =>
            console.error('Failed to deduct life on game over:', err)
          );
          setHardTimerRemaining(0);
        } else {
          if (hardTimerRemaining <= 10) {
            sounds.playTick(true);
          }
          setHardTimerRemaining((prev) => (prev !== null ? prev - 1 : null));
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [loading, isGameOver, isVictory, isAccountTerminated, freezeRemaining, hardTimerRemaining]);

  // ============================================================================
  // 5. TRIO ANTI-CHEAT: SENSOR PINDAH LAYAR / KELUAR TAB (ZERO-TOLERANCE)
  // ============================================================================
  const triggerCheatViolation = useCallback(
    async (reason?: string) => {
      // Abaikan jika game belum mulai / sudah selesai / modal sedang tampil / proses terminasi sedang jalan
      if (
        loading ||
        isGameOver ||
        isVictory ||
        isAccountTerminated ||
        cheatModalTypeRef.current !== null ||
        isExecutingTerminationRef.current
      ) {
        return;
      }

      // Cooldown 3.5 detik untuk cegah duplicate event blur & visibilitychange bersamaan
      const now = Date.now();
      if (now - lastViolationTimeRef.current < 3500) {
        return;
      }
      lastViolationTimeRef.current = now;

      cheatViolationRef.current += 1;
      const currentCount = cheatViolationRef.current;
      setCheatViolationCount(currentCount);

      if (currentCount === 1) {
        sounds.playWrong();
        updateCheatModalType(1);
      } else if (currentCount === 2) {
        sounds.playWrong();
        updateCheatModalType(2);
      } else if (currentCount >= 3) {
        // PELANGGARAN KE-3: CASCADE DELETE USER SEKETIKA!
        isExecutingTerminationRef.current = true;
        sounds.playTimeUp();
        updateCheatModalType(3);
        setIsAccountTerminated(true);

        try {
          await triggerAntiCheatExecution(reason || 'Terdeteksi manipulasi game/pindah layar 3x');
        } catch (err) {
          console.error('[Anti-Cheat Client] Gagal mengeksekusi pemusnahan akun:', err);
        } finally {
          setTimeout(() => {
            router.push('/login?error=account_terminated');
          }, 3500);
        }
      }
    },
    [loading, isGameOver, isVictory, isAccountTerminated, router, updateCheatModalType]
  );

  useEffect(() => {
    // HANYA gunakan document.visibilitychange (document.hidden === true).
    // JANGAN gunakan window.onblur karena dialog/alert, klik ekstensi, atau popup browser
    // akan memicu window.blur secara salah (false positive).
    const handleVisibilityChange = () => {
      if (document.hidden) {
        triggerCheatViolation('Pindah tab / membuka aplikasi lain saat bermain');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Aktifkan Console Guardian & Anti-DevTools
    const cleanupGuardian = setupConsoleGuardian({
      onDevToolsDetected: (reason) => {
        triggerCheatViolation(reason);
      },
      strictMode: false,
    });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cleanupGuardian();
    };
  }, [triggerCheatViolation]);

  // ============================================================================
  // 6. DEBOUNCED CLOUD AUTO-SAVE (ANTI-SPAM DATABASE DENGAN TOKEN SESI)
  // Mengetik tidak membanjiri jaringan: auto-save di-debounce 2 detik setelah user
  // berhenti mengetik, atau seketika saat satu kata selesai dijawab.
  // ============================================================================
  const queueAutoSave = useCallback(
    (newGrid: Record<string, string>, immediate: boolean = false) => {
      if (!sessionToken) return;
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

      const doSave = () => {
        const currentActiveWords = wordsRef.current;
        const gridToSave = {
          ...newGrid,
          ...(currentActiveWords && currentActiveWords.length > 0
            ? {
                _active_words: currentActiveWords,
                _active_word_ids: currentActiveWords.map((w) => w.id),
              }
            : {}),
        };

        saveProgressDebouncedAction({
          levelId,
          gridState: gridToSave,
          sessionToken,
        }).catch((err) => console.error('Background auto-save error:', err));
      };

      if (immediate) {
        doSave();
      } else {
        autoSaveTimerRef.current = setTimeout(doSave, 2000);
      }
    },
    [levelId, sessionToken]
  );

  // ============================================================================
  // 7. OPTIMISTIC GAMEPLAY UI: EVALUASI JAWABAN KATA
  // - 0ms Instant Client-Side Validation: Validasi kebenaran jawaban murni di frontend
  // - 0ms Zero-Latency Visual: Ubah sel jadi hijau, putar audio skor, dan update progres secara sinkron
  // - Background Sync (Fire-and-Forget): Simpan skor dan progres ke database di latar belakang
  // ============================================================================
  const checkWordSubmission = useCallback(
    (word: TTSWord, currentGrid: Record<string, string>) => {
      if (!sessionToken || isGameOver || isVictory || isAccountTerminated) return;
      if (completedWordIdsRef.current.includes(word.id)) return;

      // Susun kata dari kotak
      let assembled = '';
      for (let i = 0; i < word.word.length; i++) {
        const r = word.direction === 'across' ? word.start_row : word.start_row + i;
        const c = word.direction === 'across' ? word.start_col + i : word.start_col;
        const key = `${r},${c}`;
        const cellInfo = activeCellsMap[key];
        const isCellCompleted = cellInfo && cellInfo.wordIds.some((wid) => completedWordIdsRef.current.includes(wid));
        // Jika kotak sudah menjadi bagian dari kata yang selesai, selalu gunakan huruf asli yang valid
        const char = isCellCompleted ? cellInfo.letter : (currentGrid[key] || '');
        if (!char) return; // Belum lengkap (pemain masih mengetik)
        assembled += char;
      }

      const cleanAssembled = assembled.trim().toUpperCase();
      const cleanTargetWord = word.word.trim().toUpperCase();

      // Kunci anti-spam submit paralel untuk kata yang sama persis
      const submissionKey = `${word.id}:${cleanAssembled}`;
      if (evaluatedSubmissionsRef.current.has(submissionKey)) return;
      evaluatedSubmissionsRef.current.add(submissionKey);

      // 1. INSTANT CLIENT-SIDE VALIDATION (0ms)
      const isWordCorrect = cleanAssembled === cleanTargetWord;

      if (isWordCorrect) {
        // ======================================================================
        // 2. ZERO-LATENCY VISUAL UPDATE (0ms Sinkron tanpa menunggu server)
        // ======================================================================
        sounds.playScoreUp();

        // Hitung skor & combo lokal seketika
        const currentCombo = comboMultiplier;
        const nextCombo = Math.min(3.0, +(currentCombo + 0.2).toFixed(1));
        setComboMultiplier(nextCombo);

        const earnedPoints = Math.round((word.points || 100) * currentCombo);
        setScoreEarned((prev) => prev + earnedPoints);

        const currentCompleted = completedWordIdsRef.current;
        const nextCompleted = currentCompleted.includes(word.id)
          ? currentCompleted
          : [...currentCompleted, word.id];
        completedWordIdsRef.current = nextCompleted;
        setCompletedWordIds(nextCompleted);

        // Auto-Save background progress seketika
        queueAutoSave(currentGrid, true);

        // Cek apakah seluruh kata pada level ini telah selesai (Victory 0ms)
        if (nextCompleted.length === words.length && !isCompletingLevel) {
          setIsCompletingLevel(true);
          setIsVictory(true);
          sounds.playCorrect();
          confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });

          // OPTIMISTIC UPDATE: Update status level tamat di cache Path seketika (0 ms)
          const optimisticTotalScore = scoreEarned + earnedPoints;
          updatePathOptimisticCompletion(levelId, optimisticTotalScore, 20);

          // Background complete level action (Fire-and-Forget)
          completeLevelAction({
            levelId,
            sessionToken,
          })
            .then((vRes) => {
              if (vRes.isCheatDetected) {
                triggerCheatViolation('Integritas skor level tidak valid');
                return;
              }
              if (vRes.success) {
                setVictoryData({
                  score: vRes.scoreEarned ?? optimisticTotalScore,
                  coins: vRes.coinsEarned ?? 20,
                  nextLevelId: vRes.nextLevelId,
                });
                updatePathOptimisticCompletion(
                  levelId,
                  vRes.scoreEarned ?? optimisticTotalScore,
                  vRes.coinsEarned ?? 20
                );
              } else if (vRes.error) {
                showNotice(vRes.error, 'error');
              }
            })
            .catch((err) => console.error('Error completing level in background:', err))
            .finally(() => {
              setIsCompletingLevel(false);
            });
        }

        // ======================================================================
        // 3. BACKGROUND SYNC (Fire-and-Forget ke Supabase)
        // ======================================================================
        submitWordAction({
          levelId,
          wordId: word.id,
          submittedWord: cleanAssembled,
          sessionToken,
        })
          .then((res) => {
            if (res.isCheatDetected) {
              triggerCheatViolation();
              return;
            }
            if (res.success) {
              if (res.newCombo) setComboMultiplier(res.newCombo);
              if (res.totalScoreNow !== undefined) setScoreEarned(res.totalScoreNow);
            }
          })
          .catch((err) => console.error('Background word submit error:', err));
      } else {
        // Jawaban Salah: Efek getar (shake) & audio seketika (0ms)
        sounds.playWrong();
        setComboMultiplier(1.0);
        setShakingWordId(word.id);
        setTimeout(() => setShakingWordId(null), 600);

        // Kirim log kata salah ke server di latar belakang (Fire-and-Forget)
        submitWordAction({
          levelId,
          wordId: word.id,
          submittedWord: cleanAssembled,
          sessionToken,
        })
          .then((res) => {
            if (res.isCheatDetected) {
              triggerCheatViolation();
            }
          })
          .catch((err) => console.error('Background wrong word log error:', err));
      }
    },
    [
      levelId,
      sessionToken,
      isGameOver,
      isVictory,
      isAccountTerminated,
      isCompletingLevel,
      words.length,
      activeCellsMap,
      comboMultiplier,
      scoreEarned,
      queueAutoSave,
      triggerCheatViolation,
      showNotice,
    ]
  );

  // ============================================================================
  // 8. INPUT HURUF PER KOTAK & NAVIGASI KEYBOARD
  // ============================================================================
  const handleCellInput = useCallback(
    (char: string) => {
      if (!selectedCell || !currentWord) return;
      const clean = char.slice(-1).toUpperCase();
      if (!/^[A-Z]$/.test(clean)) return;

      // Debounce anti-burst input (Mencegah Android Gboard IME loop mengirim huruf kembar cepat seperti 'A A A')
      const now = Date.now();
      if (clean === lastInputCharRef.current && now - lastInputTimestampRef.current < 90) {
        return;
      }
      lastInputTimestampRef.current = now;
      lastInputCharRef.current = clean;

      // Bersihkan buffer input seketika agar tidak menumpuk karakter lama
      if (inputRef.current) {
        inputRef.current.value = '';
      }

      const cellKey = `${selectedCell.r},${selectedCell.c}`;
      const cellData = activeCellsMap[cellKey];

      // Jika kotak ini sudah menjadi bagian dari kata yang selesai (hijau),
      // lindungi agar huruf yang sudah diverifikasi benar tidak dirusak!
      const isCompletedCell = cellData && cellData.wordIds.some((wid) => completedWordIds.includes(wid));

      const newGrid = { ...gridState };
      if (!isCompletedCell) {
        newGrid[cellKey] = clean;
        setGridState(newGrid);
        queueAutoSave(newGrid);
      }

      // 1. Cek kata aktif saat ini
      checkWordSubmission(currentWord, newGrid);

      // 2. Cek semua kata yang bersinggungan di kotak ini (mendatar / menurun)
      const intersectingWords = words.filter((w) => {
        if (w.id === currentWord.id) return false;
        if (w.direction === 'across') {
          return (
            selectedCell.r === w.start_row &&
            selectedCell.c >= w.start_col &&
            selectedCell.c < w.start_col + w.word.length
          );
        } else {
          return (
            selectedCell.c === w.start_col &&
            selectedCell.r >= w.start_row &&
            selectedCell.r < w.start_row + w.word.length
          );
        }
      });

      intersectingWords.forEach((w) => {
        checkWordSubmission(w, newGrid);
      });

      // Auto-advance ke kotak berikutnya dalam kata aktif
      const idxInWord =
        currentWord.direction === 'across'
          ? selectedCell.c - currentWord.start_col
          : selectedCell.r - currentWord.start_row;

      let advanced = false;
      for (let step = 1; idxInWord + step < currentWord.word.length; step++) {
        const nextR = currentWord.direction === 'across' ? selectedCell.r : selectedCell.r + step;
        const nextC = currentWord.direction === 'across' ? selectedCell.c + step : selectedCell.c;
        const nextKey = `${nextR},${nextC}`;
        const nextData = activeCellsMap[nextKey];
        const isNextCompleted = nextData && nextData.wordIds.some((wid) => completedWordIdsRef.current.includes(wid));

        setSelectedCell({ r: nextR, c: nextC });
        if (!isNextCompleted) {
          advanced = true;
          break; // Berhenti di kotak kosong/belum selesai berikutnya
        }
      }

      // Jika kata aktif ini sudah selesai/terisi penuh dan tidak ada sel kosong berikutnya,
      // otomatis pindahkan kursor ke kata lain yang belum selesai (0 ms transition)
      if (!advanced) {
        const remainingWord = words.find((w) => !completedWordIdsRef.current.includes(w.id));
        if (remainingWord && remainingWord.id !== currentWord.id) {
          let targetR = remainingWord.start_row;
          let targetC = remainingWord.start_col;
          for (let step = 0; step < remainingWord.word.length; step++) {
            const checkR = remainingWord.direction === 'across' ? remainingWord.start_row : remainingWord.start_row + step;
            const checkC = remainingWord.direction === 'across' ? remainingWord.start_col + step : remainingWord.start_col;
            const checkKey = `${checkR},${checkC}`;
            const checkData = activeCellsMap[checkKey];
            const isCompleted = checkData && checkData.wordIds.some((wid) => completedWordIdsRef.current.includes(wid));
            if (!isCompleted && !newGrid[checkKey]) {
              targetR = checkR;
              targetC = checkC;
              break;
            }
          }
          setSelectedWordId(remainingWord.id);
          setSelectedCell({ r: targetR, c: targetC });
        }
      }
    },
    [selectedCell, currentWord, activeCellsMap, completedWordIds, gridState, queueAutoSave, checkWordSubmission, words]
  );

  const handleBackspace = useCallback(() => {
    if (!selectedCell || !currentWord) return;
    const cellKey = `${selectedCell.r},${selectedCell.c}`;
    const cellData = activeCellsMap[cellKey];
    const isCompletedCell = cellData && cellData.wordIds.some((wid) => completedWordIds.includes(wid));

    if (gridState[cellKey] && !isCompletedCell) {
      const newGrid = { ...gridState, [cellKey]: '' };
      setGridState(newGrid);
      queueAutoSave(newGrid);
    } else {
      // Mundur ke kotak sebelumnya yang belum completed lalu kosongkan
      const idxInWord =
        currentWord.direction === 'across'
          ? selectedCell.c - currentWord.start_col
          : selectedCell.r - currentWord.start_row;

      for (let step = 1; idxInWord - step >= 0; step++) {
        const prevR = currentWord.direction === 'across' ? selectedCell.r : selectedCell.r - step;
        const prevC = currentWord.direction === 'across' ? selectedCell.c - step : selectedCell.c;
        const prevKey = `${prevR},${prevC}`;
        const prevData = activeCellsMap[prevKey];
        const isPrevCompleted = prevData && prevData.wordIds.some((wid) => completedWordIds.includes(wid));

        if (!isPrevCompleted) {
          setSelectedCell({ r: prevR, c: prevC });
          const newGrid = { ...gridState, [prevKey]: '' };
          setGridState(newGrid);
          queueAutoSave(newGrid);
          break;
        }
      }
    }
  }, [selectedCell, currentWord, activeCellsMap, completedWordIds, gridState, queueAutoSave]);

  const handleArrowNavigation = useCallback(
    (dir: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown') => {
      if (!selectedCell) return;
      let deltaR = 0;
      let deltaC = 0;
      if (dir === 'ArrowLeft') deltaC = -1;
      if (dir === 'ArrowRight') deltaC = 1;
      if (dir === 'ArrowUp') deltaR = -1;
      if (dir === 'ArrowDown') deltaR = 1;

      const newR = selectedCell.r + deltaR;
      const newC = selectedCell.c + deltaC;
      const newKey = `${newR},${newC}`;
      const cellData = activeCellsMap[newKey];
      if (cellData) {
        setSelectedCell({ r: newR, c: newC });
        if (!cellData.wordIds.includes(selectedWordId)) {
          setSelectedWordId(cellData.wordIds[0]);
        }
      }
    },
    [selectedCell, activeCellsMap, selectedWordId]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      handleBackspace();
    } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      handleArrowNavigation(e.key as 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown');
    }
  };

  // Fokuskan invisible input saat cell diklik (stabil dengan useCallback)
  const handleCellClick = useCallback(
    (r: number, c: number) => {
      const key = `${r},${c}`;
      const cellData = activeCellsMap[key];
      if (!cellData) return;

      setSelectedCell((prevSelected) => {
        // Jika mengklik kotak yang sama dan itu persilangan (> 1 kata), toggle arah Mendatar <-> Menurun
        if (prevSelected?.r === r && prevSelected?.c === c && cellData.wordIds.length > 1) {
          setSelectedWordId((prevWordId) => {
            const otherWordId = cellData.wordIds.find((wid) => wid !== prevWordId);
            return otherWordId || prevWordId;
          });
        } else {
          setSelectedWordId((prevWordId) => {
            if (!cellData.wordIds.includes(prevWordId)) {
              return cellData.wordIds[0];
            }
            return prevWordId;
          });
        }
        return { r, c };
      });

      if (inputRef.current) {
        inputRef.current.value = '';
        inputRef.current.focus();
      }
    },
    [activeCellsMap]
  );

  // Transisi Peta Optimistik (0 ms) & Force Clear Modal Level
  const handleReturnToPath = useCallback(() => {
    updatePathOptimisticCompletion(
      levelId,
      victoryData?.score || scoreEarned,
      victoryData?.coins || 20
    );
    // Force refresh client router cache Next.js agar /path langsung render state terbaru
    router.refresh();
    router.replace('/path');
  }, [levelId, victoryData, scoreEarned, router]);

  // Navigasi Soal Sebelumnya / Selanjutnya
  const handleCycleClue = useCallback(
    (direction: 'next' | 'prev') => {
      const currentIndex = words.findIndex((w) => w.id === selectedWordId);
      let nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
      if (nextIndex >= words.length) nextIndex = 0;
      if (nextIndex < 0) nextIndex = words.length - 1;

      const nextWord = words[nextIndex];
      setSelectedWordId(nextWord.id);
      setSelectedCell({ r: nextWord.start_row, c: nextWord.start_col });
      if (inputRef.current) {
        inputRef.current.value = '';
        inputRef.current.focus();
      }
    },
    [words, selectedWordId]
  );

  // Global Keyboard Listener untuk Desktop Hardware Keyboard
  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if (isGameOver || isVictory || isAccountTerminated || cheatModalType || showCoinModal) return;
      // Jika inputRef sedang aktif, biarkan elemen input menanganinya langsung tanpa duplikasi
      if (e.target === inputRef.current) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
        return;
      }

      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        handleArrowNavigation(e.key as any);
        return;
      }

      if (e.key === ' ') {
        e.preventDefault();
        if (selectedCell) {
          const key = `${selectedCell.r},${selectedCell.c}`;
          const cellData = activeCellsMap[key];
          if (cellData && cellData.wordIds.length > 1) {
            const other = cellData.wordIds.find((wid) => wid !== selectedWordId);
            if (other) setSelectedWordId(other);
          } else {
            handleCycleClue('next');
          }
        }
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        handleCycleClue(e.shiftKey ? 'prev' : 'next');
        return;
      }

      if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        handleCellInput(e.key.toUpperCase());
        if (inputRef.current) {
          inputRef.current.value = '';
        }
      }
    };

    window.addEventListener('keydown', onGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', onGlobalKeyDown);
    };
  }, [
    isGameOver,
    isVictory,
    isAccountTerminated,
    cheatModalType,
    showCoinModal,
    selectedCell,
    selectedWordId,
    activeCellsMap,
    handleCellInput,
    handleBackspace,
    handleArrowNavigation,
    handleCycleClue,
  ]);

  // ============================================================================
  // 9. POWER-UP: BUKA HINT & BEKUKAN WAKTU (DENGAN LOCK SPAM-CLICK & SESI AMAN)
  // ============================================================================
  const handleUseHint = async () => {
    if (!currentWord || !profile || !sessionToken || isPendingHint || isGameOver || isVictory) return;

    const hintPrice = settings?.hint_price_coins || 15;
    if ((profile.coins ?? 0) < hintPrice) {
      showNotice(
        `🪙 Koin tidak cukup (${profile.coins ?? 0}/${hintPrice})! Selesaikan level untuk mendapatkan +${settings?.coins_per_level || 20} Koin per level.`,
        'warning'
      );
      setShowCoinModal(true);
      return;
    }

    setIsPendingHint(true);

    try {
      const res = await executeHintAction({ levelId, sessionToken });

      if (res.success && res.newCoins !== undefined) {
        setProfile((prev) => (prev ? { ...prev, coins: res.newCoins ?? prev.coins } : null));

        // Cari huruf yang belum terisi di kata ini
        for (let i = 0; i < currentWord.word.length; i++) {
          const r = currentWord.direction === 'across' ? currentWord.start_row : currentWord.start_row + i;
          const c = currentWord.direction === 'across' ? currentWord.start_col + i : currentWord.start_col;
          const key = `${r},${c}`;

          if (!gridState[key]) {
            const targetChar = currentWord.word[i];
            const newGrid = { ...gridState, [key]: targetChar };
            setGridState(newGrid);
            queueAutoSave(newGrid);
            checkWordSubmission(currentWord, newGrid);
            sounds.playScoreUp();
            break;
          }
        }
      } else {
        showNotice(res.error || 'Gagal menggunakan bantuan Hint.', 'warning');
        if (res.error?.includes('Koin')) {
          setShowCoinModal(true);
        }
      }
    } catch {
      showNotice('Terjadi kesalahan jaringan.', 'error');
    } finally {
      setIsPendingHint(false);
    }
  };

  const handleUseFreeze = async () => {
    if (!profile || !sessionToken || isPendingFreeze || freezeRemaining > 0 || isGameOver || isVictory) return;

    const freezePrice = settings?.freeze_price_coins || 25;
    if ((profile.coins ?? 0) < freezePrice) {
      showNotice(
        `🪙 Koin tidak cukup (${profile.coins ?? 0}/${freezePrice})! Selesaikan level untuk mendapatkan +${settings?.coins_per_level || 20} Koin per level.`,
        'warning'
      );
      setShowCoinModal(true);
      return;
    }

    setIsPendingFreeze(true);

    try {
      const res = await executeFreezeAction({ levelId, sessionToken });

      if (res.success && res.newCoins !== undefined) {
        setProfile((prev) => (prev ? { ...prev, coins: res.newCoins ?? prev.coins } : null));
        setFreezeRemaining(res.durationSeconds || 10);
        sounds.playScoreUp();
      } else {
        showNotice(res.error || 'Gagal membekukan waktu.', 'warning');
        if (res.error?.includes('Koin')) {
          setShowCoinModal(true);
        }
      }
    } catch {
      showNotice('Terjadi kesalahan jaringan.', 'error');
    } finally {
      setIsPendingFreeze(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 animate-spin">
          <Zap className="w-6 h-6 fill-current" />
        </div>
        <span className="text-xs font-bold tracking-wider">Mempersiapkan Papan TTS...</span>
      </main>
    );
  }

  return (
    <main
      className={`min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-start relative overflow-hidden select-none pb-2 transition-colors duration-500 ${
        freezeRemaining > 0 ? 'ring-8 ring-cyan-500/40 ring-inset bg-slate-950' : ''
      }`}
    >
      {/* Invisible Input untuk Menangkap Karakter Mobile & Desktop tanpa Mengganggu Layout */}
      <input
        ref={inputRef}
        type="text"
        defaultValue=""
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="one-time-code"
        autoCorrect="off"
        spellCheck="false"
        onPaste={(e) => e.preventDefault()} // ANTI-COPAS MUTLAK
        onBeforeInput={(e: React.FormEvent<HTMLInputElement>) => {
          const nativeEvt = e.nativeEvent as InputEvent;
          if (nativeEvt.inputType === 'deleteContentBackward') {
            e.preventDefault();
            handleBackspace();
            return;
          }
          if (nativeEvt.data && /^[a-zA-Z]$/.test(nativeEvt.data)) {
            e.preventDefault();
            handleCellInput(nativeEvt.data);
          }
        }}
        onChange={(e) => {
          const val = e.target.value;
          e.target.value = '';
          if (val) {
            handleCellInput(val);
          }
        }}
        onKeyDown={handleKeyDown}
        className="opacity-0 absolute top-0 left-0 w-px h-px pointer-events-none"
        autoFocus
      />

      {/* ==================================================================== */}
      {/* TOP HUD: BACK, LEVEL INFO, TIMER/DECAY, STATS                        */}
      {/* ==================================================================== */}
      <header className="w-full max-w-md bg-[#0f172a] border-b-2 border-slate-800 px-4 py-2.5 flex items-center justify-between shadow-md sticky top-0 z-30">
        <button
          onClick={handleReturnToPath}
          className="w-9 h-9 rounded-xl bg-slate-800 border-b-2 border-slate-950 hover:bg-slate-700 flex items-center justify-center text-slate-200 active:translate-y-0.5 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        {/* Info Level & Hard Timer */}
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1">
            {level?.is_hard_zone ? (
              <span className="text-rose-400 flex items-center gap-1 font-mono">
                <Flame className="w-3.5 h-3.5 fill-rose-500 text-rose-500 animate-bounce" /> ZONA HARD
              </span>
            ) : (
              <span>LEVEL {level?.level_number || 1}</span>
            )}
          </span>

          {/* Hard Timer Countdown */}
          {hardTimerRemaining !== null ? (
            <div
              className={`text-sm font-mono font-black ${
                hardTimerRemaining <= 15 ? 'text-rose-400 animate-pulse' : 'text-amber-400'
              }`}
            >
              ⏱️ {hardTimerRemaining}s
            </div>
          ) : (
            <span className="text-xs font-mono font-bold text-slate-400">{elapsedSeconds}s</span>
          )}
        </div>

        {/* Combo Multiplier & Stats */}
        <div className="flex items-center gap-2">
          {comboMultiplier > 1.0 && (
            <div className="px-2 py-1 rounded-xl bg-amber-500 text-slate-950 text-[10px] font-mono font-black shadow-sm">
              🔥 x{comboMultiplier.toFixed(1)}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowCoinModal(true)}
            className="flex items-center gap-1.5 bg-[#1e293b] hover:bg-slate-800 border-b-2 border-slate-950 px-3 py-1.5 rounded-xl text-xs font-mono font-black text-amber-400 active:translate-y-0.5 transition-all cursor-pointer group"
            title="Klik untuk melihat info koin & cara mendapatkannya"
          >
            <Coins className="w-3.5 h-3.5 fill-amber-400 group-hover:scale-110 transition-transform" />
            <span>{profile?.coins ?? 0}</span>
            <HelpCircle className="w-3 h-3 text-amber-400/70 ml-0.5" />
          </button>
        </div>
      </header>

      {/* ==================================================================== */}
      {/* IN-GAME FLOATING TOAST NOTIFICATION (MENGGANTIKAN ALERT JENDELA)     */}
      {/* ==================================================================== */}
      {gameNotice && (
        <div className="fixed top-14 z-50 px-4 w-full max-w-md animate-in slide-in-from-top-3 fade-in duration-200">
          <div
            className={`px-4 py-2.5 rounded-2xl border shadow-xl flex items-center justify-between gap-3 text-xs font-bold backdrop-blur-md ${
              gameNotice.type === 'error'
                ? 'bg-rose-950/90 border-rose-600 text-rose-200 shadow-rose-950/50'
                : gameNotice.type === 'info'
                ? 'bg-cyan-950/90 border-cyan-500 text-cyan-200 shadow-cyan-950/50'
                : 'bg-amber-950/90 border-amber-500 text-amber-200 shadow-amber-950/50'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className="text-base shrink-0">
                {gameNotice.type === 'error' ? '🚫' : gameNotice.type === 'info' ? 'ℹ️' : '⚠️'}
              </span>
              <span className="leading-snug">{gameNotice.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setGameNotice(null)}
              className="text-slate-400 hover:text-white shrink-0 p-1 rounded-lg hover:bg-slate-800/50"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Freeze Timer Active Banner */}
      {freezeRemaining > 0 && (
        <div className="w-full bg-cyan-500 text-slate-950 text-xs font-black py-1.5 px-4 text-center flex items-center justify-center gap-2 shadow-sm">
          <Snowflake className="w-4 h-4 fill-slate-950" />
          <span>WAKTU MEMBEKU: Pembusukan skor dihentikan ({freezeRemaining}s)</span>
        </div>
      )}

      {/* ==================================================================== */}
      {/* CLUE CARD & POWER-UPS BAR (DI ATAS PAPAN - ANTI KETUTUP KEYBOARD HP) */}
      {/* ==================================================================== */}
      <div className="w-full max-w-md px-3 pt-2 pb-1 flex flex-col gap-2 shrink-0 z-20">
        {/* Floating Clue Box */}
        {currentWord && (
          <div className="w-full bg-[#111726] border-2 border-slate-700 rounded-2xl p-2.5 sm:p-3 shadow-[0_3px_0_#070a12] flex items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={() => handleCycleClue('prev')}
              className="p-2 sm:p-2.5 rounded-xl bg-slate-800 border-b-2 border-slate-950 text-slate-200 hover:bg-slate-700 active:translate-y-0.5 transition-all shrink-0"
              title="Soal Sebelumnya"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="flex-1 text-center min-w-0">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <span className="text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded-md bg-emerald-500 text-slate-950 shrink-0">
                  {currentWord.word_number} {currentWord.direction === 'across' ? 'Mendatar' : 'Menurun'}
                </span>
                <span className="text-[10px] text-slate-300 font-mono font-bold shrink-0">
                  ({currentWord.word.length} Huruf)
                </span>
              </div>
              <p className="text-xs sm:text-sm font-bold text-white leading-snug line-clamp-2">
                {currentWord.clue}
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleCycleClue('next')}
              className="p-2 sm:p-2.5 rounded-xl bg-slate-800 border-b-2 border-slate-950 text-slate-200 hover:bg-slate-700 active:translate-y-0.5 transition-all shrink-0"
              title="Soal Selanjutnya"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Power-Ups Buttons Bar (Chunky physical game buttons) */}
        <div className="flex items-center justify-between gap-2 px-0.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleUseHint}
              disabled={isGameOver || isVictory || isPendingHint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black border-b-2 border-amber-700 active:translate-y-0.5 active:border-b-0 transition-all shadow disabled:opacity-50"
              title={`Buka 1 huruf acak di kata ini (${settings?.hint_price_coins || 15} Koin)`}
            >
              <Lightbulb className="w-3.5 h-3.5 fill-current" />
              <span>{isPendingHint ? 'Membuka...' : `Hint (${settings?.hint_price_coins || 15}🪙)`}</span>
            </button>

            <button
              type="button"
              onClick={handleUseFreeze}
              disabled={isGameOver || isVictory || freezeRemaining > 0 || isPendingFreeze}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-black border-b-2 border-cyan-700 active:translate-y-0.5 active:border-b-0 transition-all shadow disabled:opacity-50"
              title={`Bekukan waktu & pembusukan skor selama ${settings?.freeze_duration_seconds || 10} detik (${settings?.freeze_price_coins || 25} Koin)`}
            >
              <Snowflake className="w-3.5 h-3.5 fill-current" />
              <span>{isPendingFreeze ? 'Membekukan...' : `Freeze (${settings?.freeze_price_coins || 25}🪙)`}</span>
            </button>
          </div>

          {/* Progress Indicator */}
          <span className="text-xs font-mono font-black text-slate-300 bg-[#111726] px-2.5 py-1 rounded-xl border border-slate-700 shrink-0">
            {completedWordIds.length}/{words.length} Kata
          </span>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* TTS BOARD GRID (RESPONSIF MOBILE-FIRST)                              */}
      {/* ==================================================================== */}
      <section className="flex-1 w-full max-w-md flex flex-col items-center justify-center p-2 relative min-h-0">
        <div
          className="grid gap-1 sm:gap-1.5 p-2 sm:p-3 bg-[#111726] rounded-2xl border-2 border-slate-800 shadow-[0_4px_0_#070a12] relative max-h-[46svh] sm:max-h-[56svh]"
          style={{
            gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
            width: '100%',
            maxWidth: '360px',
            aspectRatio: `${gridCols}/${gridRows}`,
          }}
        >
          {Array.from({ length: gridRows }).map((_, r) =>
            Array.from({ length: gridCols }).map((__, c) => {
              const cellKey = `${r},${c}`;
              const cellData = activeCellsMap[cellKey];

              const isSelectedWord = Boolean(currentWord && cellData?.wordIds.includes(currentWord.id));
              const isSelectedCell = Boolean(selectedCell?.r === r && selectedCell?.c === c);
              const isWordCompleted = Boolean(cellData && cellData.wordIds.some((wid) => completedWordIds.includes(wid)));
              const isShaking = Boolean(shakingWordId && cellData?.wordIds.includes(shakingWordId));
              const charValue = isWordCompleted ? (cellData?.letter || '') : (gridState[cellKey] || '');

              return (
                <CrosswordCell
                  key={cellKey}
                  r={r}
                  c={c}
                  cellData={cellData}
                  isSelectedWord={isSelectedWord}
                  isSelectedCell={isSelectedCell}
                  isWordCompleted={isWordCompleted}
                  isShaking={isShaking}
                  charValue={charValue}
                  onClick={handleCellClick}
                />
              );
            })
          )}
        </div>
      </section>

      {/* ==================================================================== */}
      {/* MODAL 1 & 2: PERINGATAN KECURANGAN PINDAH LAYAR (SENSOR ANTI-CHEAT)   */}
      {/* ==================================================================== */}
      {cheatModalType && cheatModalType < 3 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl p-6 bg-slate-900 border-2 border-rose-600 shadow-2xl text-center animate-in zoom-in-95">
            <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-rose-500/20 border-2 border-rose-500 flex items-center justify-center text-rose-400 text-3xl">
              ⚠️
            </div>

            <h3 className="text-xl font-black text-white">
              {cheatModalType === 1 ? 'Peringatan Curang (1/3)' : 'Peringatan Terakhir (2/3)'}
            </h3>

            <p className="text-xs text-rose-200 mt-2 leading-relaxed">
              {cheatModalType === 1 ? (
                <>
                  Anda terdeteksi <b>berpindah tab / keluar dari aplikasi</b>. Dilarang mencari
                  jawaban menggunakan AI atau browser lain!
                  <br />
                  <span className="text-rose-400 font-bold block mt-2">
                    Tersisa 2 kesempatan sebelum akun dan data Anda dimusnahkan permanen.
                  </span>
                </>
              ) : (
                <>
                  <b className="text-rose-400 block font-black">🚨 PERINGATAN KERAS!</b>
                  Ini adalah peringatan terakhir Anda. <b>Satu kali lagi</b> Anda keluar dari layar
                  permainan, akun beserta email Anda akan langsung <b>dihapus otomatis</b>!
                </>
              )}
            </p>

            <button
              onClick={() => updateCheatModalType(null)}
              className="w-full mt-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all shadow-lg shadow-rose-600/40"
            >
              Saya Mengerti & Lanjut Bermain
            </button>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 3: EKSEKUSI PEMUSNAHAN AKUN OTOMATIS (CASCADE DELETE EXECUTED) */}
      {/* ==================================================================== */}
      {cheatModalType === 3 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl">
          <div className="w-full max-w-sm rounded-3xl p-6 bg-slate-950 border-2 border-rose-700 shadow-2xl text-center">
            <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-rose-950 border-2 border-rose-600 flex items-center justify-center text-3xl animate-pulse">
              💀
            </div>

            <h3 className="text-xl font-black text-rose-400 uppercase tracking-wider">
              Akun Dimusnahkan
            </h3>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              Anda terdeteksi melakukan kecurangan sebanyak 3 kali (berpindah layar / tab).
              <br />
              <b className="text-rose-400 block mt-2">
                Seluruh data profil, skor, koin, dan email Anda telah dihapus permanen dari sistem
                untuk menghemat memori.
              </b>
            </p>

            <div className="mt-5 text-[11px] text-slate-500 font-mono">
              Mengalihkan ke halaman login...
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 4: VICTORY MODAL (LEVEL COMPLETED + COIN REWARDS)              */}
      {/* ==================================================================== */}
      {isVictory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl p-6 bg-slate-900 border-2 border-emerald-500 shadow-2xl text-center animate-in zoom-in-95">
            <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-4xl shadow-lg shadow-emerald-500/20">
              🏆
            </div>

            <h3 className="text-2xl font-black text-white">LEVEL SELESAI!</h3>
            <p className="text-xs text-slate-400 mt-1">
              Selamat! Seluruh teka-teki silang berhasil dituntaskan dengan sempurna.
            </p>

            {/* Statistik Hadiah */}
            <div className="grid grid-cols-2 gap-3 my-5">
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Skor Diraih</span>
                <span className="font-mono font-black text-xl text-emerald-400">
                  +{victoryData?.score || scoreEarned}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Hadiah Koin</span>
                <span className="font-mono font-black text-xl text-amber-400">
                  +{victoryData?.coins || 20} 🪙
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {victoryData?.nextLevelId ? (
                <button
                  onClick={() => router.push(`/tts/${victoryData.nextLevelId}`)}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs transition-all shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
                >
                  <span>Lanjut ke Level Berikutnya</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleReturnToPath}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs transition-all shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
                >
                  <span>🎉 Selesai! Kembali ke Peta</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}

              <button
                onClick={handleReturnToPath}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition flex items-center justify-center gap-2"
              >
                <span>Lihat Peta The Path</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* FLOATING LEVEL COMPLETED BAR (JIKA MODAL DITUTUP ATAU RESUME)       */}
      {/* ==================================================================== */}
      {completedWordIds.length === words.length && words.length > 0 && !isVictory && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-11/12 max-w-md p-3.5 rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-800 border-2 border-emerald-400 shadow-2xl flex items-center justify-between gap-3 animate-bounce">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🏆</span>
            <div className="text-left">
              <div className="text-xs font-black text-white uppercase tracking-wider">LEVEL SELESAI!</div>
              <div className="text-[10px] text-emerald-200">Seluruh kata berhasil dijawab</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsVictory(true)}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-emerald-100 text-slate-950 font-black text-xs transition shadow flex items-center gap-1.5"
            >
              <span>Lanjut</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 5: GAME OVER (WAKTU HABIS PADA ZONA HARD)                     */}
      {/* ==================================================================== */}
      {isGameOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl p-6 bg-slate-900 border-2 border-rose-600 shadow-2xl text-center animate-in zoom-in-95">
            <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-rose-500/20 border-2 border-rose-500 flex items-center justify-center text-3xl">
              ⏱️
            </div>

            <h3 className="text-xl font-black text-white">WAKTU HABIS!</h3>
            <p className="text-xs text-rose-300 mt-1">
              Batas waktu Hard Timer telah berakhir. Anda kehilangan 1 Nyawa.
            </p>

            <div className="my-5 p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">Sisa Nyawa Anda:</span>
              <span className="font-mono font-black text-rose-400 flex items-center gap-1">
                <Heart className="w-3.5 h-3.5 fill-current" />
                {Math.max(0, (profile?.lives ?? 1) - 1)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleReturnToPath}
                className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
              >
                Peta
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Coba Lagi</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 6: INFO KOIN & SISTEM EKONOMI (PANDUAN PEMAIN)                */}
      {/* ==================================================================== */}
      {showCoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl p-5 bg-[#0f172a] border-2 border-amber-500/50 shadow-2xl text-slate-200 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 text-xl shadow-inner">
                  🪙
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Panduan Koin & Power-Up</h3>
                  <p className="text-[11px] text-amber-400 font-bold">
                    Koin Anda Saat Ini: <span className="font-mono">{profile?.coins ?? 0}</span> 🪙
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCoinModal(false)}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="py-3 text-xs space-y-3">
              {/* Jawaban Refill Koin */}
              <div className="bg-slate-900/90 p-3 rounded-2xl border border-slate-800">
                <div className="flex items-center gap-1.5 text-amber-300 font-black mb-1">
                  <span className="text-sm">❓</span>
                  <span>Apakah Koin Refill Otomatis?</span>
                </div>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  <b>Tidak.</b> Koin <i>tidak</i> bertambah otomatis per detik atau per menit. Koin adalah <b>mata uang hadiah prestasi</b> pemain.
                </p>
              </div>

              {/* Cara Dapatkan Koin */}
              <div className="bg-slate-900/90 p-3 rounded-2xl border border-slate-800 space-y-1.5">
                <div className="flex items-center gap-1.5 text-emerald-400 font-black">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Cara Mendapatkan Koin:</span>
                </div>
                <ul className="text-[11px] text-slate-300 space-y-1 pl-1">
                  <li className="flex items-start gap-1.5">
                    <span className="text-emerald-400 font-bold">✓</span>
                    <span>
                      <b>Menamatkan level di peta:</b> Hadiah{' '}
                      <span className="text-amber-400 font-black">+{settings?.coins_per_level || 20} Koin</span> setiap level selesai!
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-emerald-400 font-bold">✓</span>
                    <span>Menyelesaikan bab/pulau dan event spesial akhir pekan.</span>
                  </li>
                </ul>
              </div>

              {/* Kegunaan Koin */}
              <div className="bg-slate-900/90 p-3 rounded-2xl border border-slate-800 space-y-1.5">
                <div className="flex items-center gap-1.5 text-cyan-400 font-black">
                  <Zap className="w-4 h-4 text-cyan-400" />
                  <span>Kegunaan Koin:</span>
                </div>
                <ul className="text-[11px] text-slate-300 space-y-1 pl-1">
                  <li>💡 <b>Hint ({settings?.hint_price_coins || 15}🪙)</b>: Buka 1 huruf acak pada kata aktif.</li>
                  <li>❄️ <b>Freeze ({settings?.freeze_price_coins || 25}🪙)</b>: Bekukan pembusukan skor & timer ({settings?.freeze_duration_seconds || 10}s).</li>
                  <li>❤️ <b>Refill Nyawa ({settings?.coins_refill_lives_price || 50}🪙)</b>: Isi penuh 5 nyawa di peta tanpa menunggu cooldown.</li>
                </ul>
              </div>

              {/* Penjelasan Nyawa yang Otomatis Refill */}
              <div className="bg-rose-950/30 p-2.5 rounded-xl border border-rose-800/40 text-[11px] text-rose-200 flex items-start gap-2">
                <Heart className="w-4 h-4 text-rose-500 fill-rose-500 shrink-0 mt-0.5" />
                <div>
                  <b className="text-rose-400">Pemberitahuan Regenerasi Nyawa:</b>
                  <p className="mt-0.5 text-slate-300">
                    Yang terisi otomatis adalah <b>Nyawa (❤️)</b>, yaitu <b>+1 nyawa setiap {settings?.life_regen_minutes || 15} menit</b> jika berkurang atau habis.
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowCoinModal(false)}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-md transition-all active:translate-y-0.5 border-b-2 border-amber-700 active:border-b-0"
            >
              Saya Mengerti & Lanjut Main
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

export default function TTSGamePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 animate-spin">
            <Zap className="w-6 h-6 fill-current" />
          </div>
          <span className="text-xs font-bold tracking-wider">Mempersiapkan Papan TTS...</span>
        </div>
      }
    >
      <TTSGameContent />
    </Suspense>
  );
}

