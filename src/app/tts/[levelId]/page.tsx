'use client';

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
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
  submitWordAction,
  saveProgressDebouncedAction,
  useHintAction,
  useFreezeAction,
  completeLevelAction,
  triggerAntiCheatExecution,
  deductLifeOnGameOverAction,
} from '../actions';
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
  const [sessionToken, setSessionToken] = useState<string>('');
  const [isEvaluatingWord, setIsEvaluatingWord] = useState(false);
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

  const updateCheatModalType = useCallback((type: 1 | 2 | 3 | null) => {
    cheatModalTypeRef.current = type;
    setCheatModalType(type);
    if (type === null) {
      lastViolationTimeRef.current = Date.now();
    }
  }, []);

  // 1. Fetch Inisialisasi Data Level & User
  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        const supabase = createHubBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push(`/login?redirect=/tts/${levelId}`);
          return;
        }

        // Inisialisasi Sesi Game Terenkripsi (HMAC-SHA256 Token)
        const sessionRes = await startLevelSessionAction({ levelId });
        if (!sessionRes.success || !sessionRes.sessionToken) {
          showNotice(sessionRes.error || 'Gagal memulai sesi level game.', 'error');
          setTimeout(() => router.push('/path'), 2500);
          return;
        }
        if (isMounted) {
          setSessionToken(sessionRes.sessionToken);
        }

        // Profil
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (prof && isMounted) setProfile(prof as Profile);

        // Settings
        const { data: setts } = await supabase.from('game_settings').select('*').eq('id', 1).maybeSingle();
        if (setts && isMounted) setSettings(setts as GameSettings);

        // Level
        const { data: lvl } = await supabase.from('tts_levels').select('*').eq('id', levelId).maybeSingle();
        if (lvl && isMounted) {
          setLevel(lvl as TTSLevel);
          if (lvl.is_hard_zone) {
            setHardTimerRemaining(lvl.hard_timer_override || setts?.hard_timer_seconds || 60);
          }
        }

        // Words & Existing Progress
        const { data: dbWords } = await supabase
          .from('tts_words')
          .select('*')
          .eq('level_id', levelId)
          .order('word_number', { ascending: true });

        const { data: prog } = await supabase
          .from('tts_user_progress')
          .select('*')
          .eq('user_id', user.id)
          .eq('level_id', levelId)
          .maybeSingle();

        let actualWords: TTSWord[] = [];

        // 1. Cek apakah pemain sudah memiliki tata letak aktif tersimpan (Skema 1: Bank Dinamis)
        const savedActiveWords = (prog?.grid_state as any)?._active_words;
        if (Array.isArray(savedActiveWords) && savedActiveWords.length >= 3) {
          actualWords = savedActiveWords as TTSWord[];
        } else if (dbWords && dbWords.length > 5) {
          // Level ini memiliki Bank Kosakata (> 5 kata). Susun kisi-kisi dinamis unik untuk user ini!
          const layout = buildCrosswordLayout(
            lvl?.title || 'Level TTS',
            dbWords.map((w) => ({
              id: w.id,
              word: w.word,
              clue: w.clue,
              points: w.points || 100,
            })),
            4
          );

          if (layout && layout.words.length >= 3) {
            actualWords = layout.words.map((w, idx) => ({
              id: w.id || `w-${idx}`,
              level_id: levelId,
              word_number: w.word_number,
              direction: w.direction,
              start_row: w.start_row,
              start_col: w.start_col,
              word: w.word,
              clue: w.clue,
              points: w.points || 100,
              created_at: new Date().toISOString(),
            }));

            // Simpan susunan unik ini ke progress pemain di database agar konsisten saat refresh
            const updatedGridState = {
              ...(prog?.grid_state || {}),
              _active_words: actualWords,
              _active_word_ids: actualWords.map((w) => w.id),
            };

            await supabase.from('tts_user_progress').upsert(
              {
                user_id: user.id,
                level_id: levelId,
                status: prog?.status || 'in_progress',
                grid_state: updatedGridState,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'user_id,level_id' }
            );
          } else {
            actualWords = (dbWords.slice(0, 4) as TTSWord[]);
          }
        } else {
          // Level standar (<= 5 kata): gunakan kata-kata yang ada
          actualWords = dbWords && dbWords.length > 0 ? (dbWords as TTSWord[]) : FALLBACK_WORDS;
        }

        if (isMounted) {
          setWords(actualWords);
          wordsRef.current = actualWords;
          if (actualWords.length > 0) {
            setSelectedWordId(actualWords[0].id);
            setSelectedCell({ r: actualWords[0].start_row, c: actualWords[0].start_col });
          }
        }

        if (prog && isMounted) {
          if (prog.grid_state) setGridState(prog.grid_state as Record<string, string>);
          const completed: string[] = Array.isArray(prog.completed_words) ? prog.completed_words : [];
          setCompletedWordIds(completed);
          completedWordIdsRef.current = completed;
          if (prog.score_earned) setScoreEarned(prog.score_earned);
          if (prog.combo_multiplier) setComboMultiplier(prog.combo_multiplier);
          if (prog.time_taken_seconds) setElapsedSeconds(prog.time_taken_seconds);

          // Cek apakah seluruh kata pada level ini sudah berhasil dijawab
          const allWordsDone =
            actualWords.length > 0 &&
            actualWords.every((w) => completed.includes(w.id));

          if (allWordsDone) {
            setIsVictory(true);
            if (sessionRes.sessionToken) {
              completeLevelAction({
                levelId,
                sessionToken: sessionRes.sessionToken,
              }).then((vRes) => {
                if (vRes.success) {
                  setVictoryData({
                    score: vRes.scoreEarned ?? prog.score_earned ?? 0,
                    coins: vRes.coinsEarned ?? 20,
                    nextLevelId: vRes.nextLevelId,
                  });
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
  }, [levelId, router]);

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
  // ============================================================================
  const queueAutoSave = useCallback(
    (newGrid: Record<string, string>) => {
      if (!sessionToken) return;
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

      autoSaveTimerRef.current = setTimeout(() => {
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
        });
      }, 3000); // Debounce minimal 3 detik untuk mencegah spam request
    },
    [levelId, sessionToken]
  );

  // ============================================================================
  // 7. EVALUASI JAWABAN KATA (SERVER VALIDATION, ANTI-SPEEDHACK & ANTI-REPLAY)
  // ============================================================================
  const checkWordSubmission = useCallback(
    async (word: TTSWord, currentGrid: Record<string, string>) => {
      if (!sessionToken || isGameOver || isVictory || isAccountTerminated) return;
      if (evaluatingWordIdsRef.current.has(word.id)) return;
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
        if (!char) return; // Belum lengkap
        assembled += char;
      }

      // Kunci anti-spam submit paralel untuk kata yang sama
      const submissionKey = `${word.id}:${assembled}`;
      if (evaluatedSubmissionsRef.current.has(submissionKey)) return;

      evaluatingWordIdsRef.current.add(word.id);
      setIsEvaluatingWord(evaluatingWordIdsRef.current.size > 0);
      try {
        const res = await submitWordAction({
          levelId,
          wordId: word.id,
          submittedWord: assembled,
          sessionToken,
        });

        // Deteksi Anomali Cheat / Tampering dari Server
        if (res.isCheatDetected) {
          triggerCheatViolation();
          return;
        }

        if (res.success && res.isCorrect) {
          evaluatedSubmissionsRef.current.add(submissionKey);
          sounds.playScoreUp();
          if (res.newCombo) setComboMultiplier(res.newCombo);
          if (res.totalScoreNow !== undefined) setScoreEarned(res.totalScoreNow);

          const currentCompleted = completedWordIdsRef.current;
          const nextCompleted = currentCompleted.includes(word.id)
            ? currentCompleted
            : [...currentCompleted, word.id];
          completedWordIdsRef.current = nextCompleted;
          setCompletedWordIds(nextCompleted);

          // Cek apakah seluruh kata pada level ini telah selesai
          if (nextCompleted.length === words.length && !isCompletingLevel) {
            setIsCompletingLevel(true);
            setIsVictory(true);
            sounds.playCorrect();
            confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });

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
                    score: vRes.scoreEarned ?? 0,
                    coins: vRes.coinsEarned ?? 20,
                    nextLevelId: vRes.nextLevelId,
                  });
                } else if (vRes.error) {
                  showNotice(vRes.error, 'error');
                }
              })
              .finally(() => {
                setIsCompletingLevel(false);
              });
          }

          // Simpan langsung state kata benar
          queueAutoSave(currentGrid);
        } else {
          // Salah: efek shake & suara salah
          sounds.playWrong();
          setComboMultiplier(1.0);
          setShakingWordId(word.id);
          setTimeout(() => setShakingWordId(null), 600);
        }
      } catch (err) {
        console.error('Error submitting word:', err);
      } finally {
        evaluatingWordIdsRef.current.delete(word.id);
        setIsEvaluatingWord(evaluatingWordIdsRef.current.size > 0);
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
      queueAutoSave,
      triggerCheatViolation,
      showNotice,
    ]
  );

  // ============================================================================
  // 8. INPUT HURUF PER KOTAK & NAVIGASI KEYBOARD
  // ============================================================================
  const handleCellInput = (char: string) => {
    if (!selectedCell || !currentWord) return;
    const clean = char.slice(-1).toUpperCase();
    if (!/^[A-Z]$/.test(clean)) return;

    const cellKey = `${selectedCell.r},${selectedCell.c}`;
    const cellData = activeCellsMap[cellKey];

    // Jika kotak ini sudah menjadi bagian dari kata yang selesai (hijau),
    // lindungi agar huruf yang sudah diverifikasi benar tidak dirusak!
    const isCompletedCell = cellData && cellData.wordIds.some((wid) => completedWordIds.includes(wid));

    let newGrid = { ...gridState };
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

    for (let step = 1; idxInWord + step < currentWord.word.length; step++) {
      const nextR = currentWord.direction === 'across' ? selectedCell.r : selectedCell.r + step;
      const nextC = currentWord.direction === 'across' ? selectedCell.c + step : selectedCell.c;
      const nextKey = `${nextR},${nextC}`;
      const nextData = activeCellsMap[nextKey];
      const isNextCompleted = nextData && nextData.wordIds.some((wid) => completedWordIds.includes(wid));
      
      setSelectedCell({ r: nextR, c: nextC });
      if (!isNextCompleted) {
        break; // Berhenti di kotak kosong/belum selesai berikutnya
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!selectedCell || !currentWord) return;

    if (e.key === 'Backspace') {
      e.preventDefault();
      const cellKey = `${selectedCell.r},${selectedCell.c}`;
      const cellData = activeCellsMap[cellKey];
      const isCompletedCell = cellData && cellData.wordIds.some((wid) => completedWordIds.includes(wid));

      if (gridState[cellKey] && !isCompletedCell) {
        const newGrid = { ...gridState, [cellKey]: '' };
        setGridState(newGrid);
        queueAutoSave(newGrid);
      } else {
        // Mundur ke kotak sebelumnya jika kotak saat ini sudah kosong atau kotak selesai
        const idxInWord =
          currentWord.direction === 'across'
            ? selectedCell.c - currentWord.start_col
            : selectedCell.r - currentWord.start_row;

        if (idxInWord > 0) {
          const prevR = currentWord.direction === 'across' ? selectedCell.r : selectedCell.r - 1;
          const prevC = currentWord.direction === 'across' ? selectedCell.c - 1 : selectedCell.c;
          setSelectedCell({ r: prevR, c: prevC });
        }
      }
    }
  };

  // Fokuskan invisible input saat cell diklik
  const handleCellClick = (r: number, c: number) => {
    const key = `${r},${c}`;
    const cellData = activeCellsMap[key];
    if (!cellData) return;

    setSelectedCell({ r, c });

    // Jika kata yang aktif tidak mengandung kotak ini, alihkan kata aktif
    if (!cellData.wordIds.includes(selectedWordId)) {
      setSelectedWordId(cellData.wordIds[0]);
    }

    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Navigasi Soal Sebelumnya / Selanjutnya
  const handleCycleClue = (direction: 'next' | 'prev') => {
    const currentIndex = words.findIndex((w) => w.id === selectedWordId);
    let nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex >= words.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = words.length - 1;

    const nextWord = words[nextIndex];
    setSelectedWordId(nextWord.id);
    setSelectedCell({ r: nextWord.start_row, c: nextWord.start_col });
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

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
      const res = await useHintAction({ levelId, sessionToken });

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
      const res = await useFreezeAction({ levelId, sessionToken });

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
      className={`min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between relative overflow-hidden select-none pb-4 transition-colors duration-500 ${
        freezeRemaining > 0 ? 'ring-8 ring-cyan-500/40 ring-inset bg-slate-950' : ''
      }`}
    >
      {/* Invisible Input untuk Menangkap Karakter Mobile & Desktop tanpa Mengganggu Layout */}
      <input
        ref={inputRef}
        type="text"
        inputMode="text"
        autoCapitalize="characters"
        onPaste={(e) => e.preventDefault()} // ANTI-COPAS MUTLAK
        onChange={(e) => handleCellInput(e.target.value)}
        onKeyDown={handleKeyDown}
        className="opacity-0 absolute -top-10 left-0 w-1 h-1 pointer-events-none"
        autoFocus
      />

      {/* ==================================================================== */}
      {/* TOP HUD: BACK, LEVEL INFO, TIMER/DECAY, STATS                        */}
      {/* ==================================================================== */}
      <header className="w-full max-w-md bg-[#0f172a] border-b-2 border-slate-800 px-4 py-2.5 flex items-center justify-between shadow-md sticky top-0 z-30">
        <button
          onClick={() => router.push('/path')}
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
      {/* TTS BOARD GRID (RESPONSIF MOBILE-FIRST)                              */}
      {/* ==================================================================== */}
      <section className="flex-1 w-full max-w-md flex flex-col items-center justify-center p-3 relative">
        <div
          className="grid gap-1.5 p-3 bg-[#111726] rounded-2xl border-2 border-slate-800 shadow-[0_6px_0_#070a12] relative"
          style={{
            gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
            width: '100%',
            maxWidth: '380px',
            aspectRatio: `${gridCols}/${gridRows}`,
          }}
        >
          {Array.from({ length: gridRows }).map((_, r) =>
            Array.from({ length: gridCols }).map((__, c) => {
              const cellKey = `${r},${c}`;
              const cellData = activeCellsMap[cellKey];

              if (!cellData) {
                // Kotak Kosong / Hitam
                return (
                  <div
                    key={cellKey}
                    className="w-full h-full bg-[#070a12] rounded-lg pointer-events-none"
                  />
                );
              }

              const isSelectedWord = currentWord && cellData.wordIds.includes(currentWord.id);
              const isSelectedCell = selectedCell?.r === r && selectedCell?.c === c;
              const isWordCompleted = cellData.wordIds.some((wid) => completedWordIds.includes(wid));
              const isShaking = shakingWordId && cellData.wordIds.includes(shakingWordId);
              const charValue = isWordCompleted ? cellData.letter : (gridState[cellKey] || '');

              return (
                <div
                  key={cellKey}
                  onClick={() => handleCellClick(r, c)}
                  className={`w-full h-full rounded-xl relative flex items-center justify-center font-mono font-black text-sm sm:text-base cursor-pointer transition-all ${
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
                  {/* Start Word Number */}
                  {cellData.startNumber && (
                    <span className="absolute top-0.5 left-1 text-[8px] font-mono font-black text-slate-300">
                      {cellData.startNumber}
                    </span>
                  )}

                  {/* Character Value */}
                  <span>{charValue}</span>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* ==================================================================== */}
      {/* FLOATING CLUE CARD & POWER-UPS BAR                                   */}
      {/* ==================================================================== */}
      <footer className="w-full max-w-md px-4 flex flex-col gap-2.5 relative z-20">
        {/* Power-Ups Buttons Bar (Chunky physical game buttons) */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={handleUseHint}
              disabled={isGameOver || isVictory || isPendingHint}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black border-b-4 border-amber-700 active:translate-y-0.5 active:border-b-0 transition-all shadow disabled:opacity-50"
              title={`Buka 1 huruf acak di kata ini (${settings?.hint_price_coins || 15} Koin)`}
            >
              <Lightbulb className="w-3.5 h-3.5 fill-current" />
              <span>{isPendingHint ? 'Membuka...' : `Hint (${settings?.hint_price_coins || 15}🪙)`}</span>
            </button>

            <button
              onClick={handleUseFreeze}
              disabled={isGameOver || isVictory || freezeRemaining > 0 || isPendingFreeze}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-black border-b-4 border-cyan-700 active:translate-y-0.5 active:border-b-0 transition-all shadow disabled:opacity-50"
              title={`Bekukan waktu & pembusukan skor selama ${settings?.freeze_duration_seconds || 10} detik (${settings?.freeze_price_coins || 25} Koin)`}
            >
              <Snowflake className="w-3.5 h-3.5 fill-current" />
              <span>{isPendingFreeze ? 'Membekukan...' : `Freeze (${settings?.freeze_price_coins || 25}🪙)`}</span>
            </button>
          </div>

          {/* Progress Indicator */}
          <span className="text-xs font-mono font-black text-slate-300 bg-[#111726] px-3 py-1.5 rounded-xl border border-slate-700">
            {completedWordIds.length}/{words.length} Kata
          </span>
        </div>

        {/* Floating Clue Box */}
        {currentWord && (
          <div className="w-full bg-[#111726] border-2 border-slate-700 rounded-2xl p-3.5 shadow-[0_4px_0_#070a12] flex items-center justify-between gap-3">
            <button
              onClick={() => handleCycleClue('prev')}
              className="p-2.5 rounded-xl bg-slate-800 border-b-2 border-slate-950 text-slate-200 hover:bg-slate-700 active:translate-y-0.5 transition-all"
            >
              ←
            </button>

            <div className="flex-1 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <span className="text-[10px] font-mono font-black uppercase px-2.5 py-0.5 rounded-lg bg-emerald-500 text-slate-950">
                  {currentWord.word_number} {currentWord.direction === 'across' ? 'Mendatar' : 'Menurun'}
                </span>
                <span className="text-[10px] text-slate-300 font-mono font-bold">
                  ({currentWord.word.length} Huruf)
                </span>
              </div>
              <p className="text-xs font-bold text-white leading-snug line-clamp-2">
                {currentWord.clue}
              </p>
            </div>

            <button
              onClick={() => handleCycleClue('next')}
              className="p-2.5 rounded-xl bg-slate-800 border-b-2 border-slate-950 text-slate-200 hover:bg-slate-700 active:translate-y-0.5 transition-all"
            >
              →
            </button>
          </div>
        )}
      </footer>

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
                  onClick={() => router.push('/path')}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs transition-all shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
                >
                  <span>🎉 Selesai! Kembali ke Peta</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}

              <button
                onClick={() => router.push('/path')}
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
                onClick={() => router.push('/path')}
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

