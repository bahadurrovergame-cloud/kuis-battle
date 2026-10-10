'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase, GameSession, Question, Team, parseQuestionMeta, parseSessionMeta } from '@/lib/supabase';
import CircularTimer from '@/components/CircularTimer';
import QuestionDisplay from '@/components/QuestionDisplay';
import Leaderboard from '@/components/Leaderboard';
import VictoryPodium from '@/components/VictoryPodium';
import { sounds } from '@/lib/sound';
import { 
  Tv, 
  Wifi, 
  WifiOff, 
  Maximize, 
  QrCode, 
  X,
  Volume2,
  Sparkles,
  Trophy,
  Users,
  LayoutGrid,
  BookOpen,
  HelpCircle,
  Layers,
  Tag,
  ChevronUp,
  ChevronDown
} from 'lucide-react';

export default function OperatorProjectorPage() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [questionsList, setQuestionsList] = useState<Question[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string; description?: string | null }[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [joinUrl, setJoinUrl] = useState('');
  const [showQrModal, setShowQrModal] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  // Header Collapse state
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);

  // Floating Leaderboard Auto-Fade state
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Keyboard shortcut 'H'
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'h' || e.key === 'H') {
        setIsHeaderCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Local synced countdown timer
  const [remainingTime, setRemainingTime] = useState<number>(30);
  const prevRemainingRef = useRef<number>(30);
  const prevRevealedRef = useRef<boolean>(false);

  // Opened Box tracking
  const [openedBoxIds, setOpenedBoxIds] = useState<string[]>([]);

  // Auto-Fade floating controls saat mouse diam 3 detik
  useEffect(() => {
    const handleMouseMove = () => {
      setIsIdle(false);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        setIsIdle(true);
      }, 3000);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  // Set Join URL from browser origin & active room_code
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const rCode = session?.room_code;
      const url = rCode
        ? `${window.location.origin}/peserta?room=${encodeURIComponent(rCode)}`
        : `${window.location.origin}/peserta`;
      setJoinUrl(url);
    }
  }, [session?.room_code]);

  // Fetch initial data dengan dukungan Paket Soal per Room
  const fetchInitialData = useCallback(async () => {
    try {
      const roomFromUrl =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('room')?.toUpperCase().trim() || null
          : null;
      const roomFromStorage =
        typeof window !== 'undefined' ? localStorage.getItem('active_room_code') : null;
      const targetRoom = roomFromUrl || roomFromStorage;

      let sessionQuery = supabase.from('game_sessions').select('*');
      if (targetRoom) {
        sessionQuery = sessionQuery.eq('room_code', targetRoom);
      } else {
        sessionQuery = sessionQuery.order('created_at', { ascending: true }).limit(1);
      }

      let { data: sessionData } = await sessionQuery.single();

      if (!sessionData && targetRoom) {
        const { data: fallbackData } = await supabase
          .from('game_sessions')
          .select('*')
          .order('created_at', { ascending: true })
          .limit(1)
          .single();
        sessionData = fallbackData;
      }

      if (sessionData) {
        setSession(sessionData);
        setRemainingTime(sessionData.timer_remaining);

        if (typeof window !== 'undefined') {
          localStorage.setItem('active_room_code', sessionData.room_code);
        }

        const currentRound = sessionData.active_round || 'Babak 1';
        const { data: sqData } = await supabase
          .from('session_questions')
          .select('*, question:questions(*)')
          .eq('session_id', sessionData.id)
          .eq('round_name', currentRound)
          .order('box_number', { ascending: true, nullsFirst: false });

        if (sqData && sqData.length > 0) {
          const openedFromDb = sqData.filter((s) => s.is_opened).map((s) => s.question_id);
          setOpenedBoxIds((prev) => Array.from(new Set([...prev, ...openedFromDb])));

          const parsed = sqData
            .filter((s) => s.question)
            .map((s) => ({
              ...parseQuestionMeta(s.question!),
              box_number: s.box_number ?? null,
              is_opened: s.is_opened,
            }));
          setQuestionsList(parsed);
        } else {
          const { data: qDataList } = await supabase
            .from('questions')
            .select('*')
            .order('created_at', { ascending: true });
          if (qDataList) setQuestionsList(qDataList.map(parseQuestionMeta));
        }

        try {
          const saved = localStorage.getItem(`opened_boxes_${sessionData.id}`);
          if (saved) {
            const parsedSaved = JSON.parse(saved);
            setOpenedBoxIds((prev) => Array.from(new Set([...prev, ...parsedSaved])));
          }
        } catch {}

        const { data: teamsData } = await supabase
          .from('teams')
          .select('*')
          .eq('session_id', sessionData.id)
          .order('score', { ascending: false });
        if (teamsData) setTeams(teamsData);
      }

      const { data: catList } = await supabase.from('categories').select('*').order('name');
      if (catList) setCategories(catList);
    } catch {
      // Quiet fail
    }
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // Sync openedBoxIds whenever a question is activated
  useEffect(() => {
    if (!session?.id || !session?.current_question_id) return;
    setOpenedBoxIds((prev) => {
      if (prev.includes(session.current_question_id!)) return prev;
      const next = [...prev, session.current_question_id!];
      try {
        localStorage.setItem(`opened_boxes_${session.id}`, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [session?.id, session?.current_question_id]);

  // Listen to storage event across tabs for opened boxes
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (session?.id && e.key === `opened_boxes_${session.id}` && e.newValue) {
        try {
          setOpenedBoxIds(JSON.parse(e.newValue));
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [session?.id]);

  // Realtime Supabase Subscription
  useEffect(() => {
    if (!session?.id) return;

    const channelName = `room_sync_${session.id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_sessions', filter: `id=eq.${session.id}` },
        (payload) => {
          const newSession = payload.new as GameSession;
          if (newSession) {
            if (newSession.is_answer_revealed && !prevRevealedRef.current) {
              sounds.playCorrect();
            }
            prevRevealedRef.current = newSession.is_answer_revealed;

            if (newSession.active_round !== session.active_round) {
              fetchInitialData();
            }

            setSession(newSession);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'session_questions', filter: `session_id=eq.${session.id}` },
        () => {
          fetchInitialData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'teams', filter: `session_id=eq.${session.id}` },
        async () => {
          const { data: teamsData } = await supabase
            .from('teams')
            .select('*')
            .eq('session_id', session.id)
            .order('score', { ascending: false });
          if (teamsData) setTeams(teamsData);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categories' },
        async () => {
          const { data: catList } = await supabase.from('categories').select('*').order('name');
          if (catList) setCategories(catList);
        }
      )
      .on('broadcast', { event: 'reset_boxes' }, () => {
        setOpenedBoxIds([]);
        if (session?.id) {
          try {
            localStorage.removeItem(`opened_boxes_${session.id}`);
          } catch {}
        }
      })
      .on('broadcast', { event: 'box_count_sync' }, () => {
        fetchInitialData();
      })
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.id, session?.active_round, fetchInitialData]);

  // Safety Auto-Sync Polling
  useEffect(() => {
    if (!session?.id) return;

    const interval = setInterval(async () => {
      try {
        const { data: latestSession } = await supabase
          .from('game_sessions')
          .select('*')
          .eq('id', session.id)
          .single();

        if (latestSession) {
          if (
            latestSession.current_question_id !== session.current_question_id ||
            latestSession.is_answer_revealed !== session.is_answer_revealed ||
            latestSession.is_timer_running !== session.is_timer_running ||
            latestSession.status !== session.status ||
            latestSession.title !== session.title ||
            latestSession.active_round !== session.active_round
          ) {
            if (latestSession.is_answer_revealed && !session.is_answer_revealed) {
              sounds.playCorrect();
            }
            if (latestSession.active_round !== session.active_round) {
              fetchInitialData();
            }
            setSession(latestSession);
          }
        }
      } catch {
        // Quiet fail
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [
    session?.id,
    session?.current_question_id,
    session?.is_answer_revealed,
    session?.is_timer_running,
    session?.status,
    session?.title,
    session?.active_round,
    fetchInitialData
  ]);

  // Countdown Timer
  useEffect(() => {
    if (!session?.is_timer_running || !session?.updated_at) {
      if (session) {
        setRemainingTime(session.timer_remaining);
        prevRemainingRef.current = session.timer_remaining;
      }
      return;
    }

    const calcTime = () => {
      const elapsed = (Date.now() - new Date(session.updated_at!).getTime()) / 1000;
      const left = Math.max(0, Math.ceil(session.timer_remaining - elapsed));
      setRemainingTime((prev) => {
        if (left !== prev) {
          if (left <= 5 && left > 0) {
            sounds.playTick(true);
          } else if (left > 5) {
            sounds.playTick(false);
          } else if (left === 0 && prevRemainingRef.current > 0) {
            sounds.playTimeUp();
          }
          prevRemainingRef.current = left;
        }
        return left;
      });
    };

    calcTime();
    const timerInterval = setInterval(calcTime, 250);

    return () => clearInterval(timerInterval);
  }, [session?.is_timer_running, session?.updated_at, session?.timer_remaining]);

  const currentQuestion = session?.current_question_id
    ? questionsList.find((q) => q.id === session.current_question_id) || null
    : null;

  let activeGameType: 'pilihan_ganda' | 'benar_salah' | 'essay' = 'pilihan_ganda';
  if (session?.status?.includes('benar_salah')) {
    activeGameType = 'benar_salah';
  } else if (session?.status?.includes('essay')) {
    activeGameType = 'essay';
  } else if (session?.status?.includes('pilihan_ganda')) {
    activeGameType = 'pilihan_ganda';
  }

  const { cleanTitle, boxCount: totalBoxes, activeCategoryId } = parseSessionMeta(session);
  const activeCategory = activeCategoryId ? categories.find((c) => c.id === activeCategoryId) : null;

  const filteredQuestions = questionsList.filter((q) => {
    const matchType = q.type === activeGameType;
    const matchCat = !activeCategoryId || activeCategoryId === 'all' || q.category_id === activeCategoryId;
    return matchType && matchCat;
  });

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const unlockAudio = () => {
    sounds.playTick();
    setAudioUnlocked(true);
  };

  const activeRoundName = session?.active_round || 'Babak 1';

  // Kepadatan layout dinamis untuk 30 kotak panggung
  const isUltraDense = totalBoxes > 20;
  const isDense = totalBoxes > 12 && totalBoxes <= 20;

  const gridColsClass =
    totalBoxes <= 3
      ? 'grid-cols-3 max-w-3xl'
      : totalBoxes <= 4
      ? 'grid-cols-2 sm:grid-cols-4 max-w-4xl'
      : totalBoxes <= 6
      ? 'grid-cols-2 md:grid-cols-3 max-w-5xl'
      : totalBoxes <= 9
      ? 'grid-cols-3 max-w-5xl'
      : totalBoxes <= 12
      ? 'grid-cols-3 sm:grid-cols-4 max-w-6xl'
      : totalBoxes <= 16
      ? 'grid-cols-4 sm:grid-cols-4 max-w-6xl'
      : totalBoxes <= 20
      ? 'grid-cols-4 sm:grid-cols-5 max-w-6xl'
      : 'grid-cols-4 sm:grid-cols-5 md:grid-cols-6 max-w-7xl';

  return (
    <main className="h-screen max-h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 flex flex-col p-3 sm:p-4 select-none relative">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* FLOATING RESTORE HEADER BUTTON */}
      {isHeaderCollapsed && (
        <div className="fixed top-3 right-4 z-50 flex items-center gap-2 animate-in fade-in">
          <button
            onClick={() => setIsHeaderCollapsed(false)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 hover:bg-slate-900 border border-slate-700/80 text-slate-300 hover:text-white text-xs font-bold shadow-2xl backdrop-blur-md transition-all hover:scale-105"
            title="Buka kembali header panggung (Tekan tombol 'H' di keyboard)"
          >
            <span className="font-mono text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20 text-[10px]">
              ROOM: {session?.room_code || '---'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[11px]">Buka Header (H)</span>
          </button>
        </div>
      )}

      {/* TOP BAR */}
      {!isHeaderCollapsed && (
        <header className="flex items-center justify-between pb-2 sm:pb-3 border-b border-slate-800/80 z-20 shrink-0 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="p-2 sm:p-2.5 bg-blue-600/20 border border-blue-500/30 rounded-2xl text-blue-400">
              <Tv className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black tracking-wide text-white uppercase flex items-center gap-2">
                <span>{cleanTitle}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase tracking-widest">
                  {activeRoundName}
                </span>
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-mono font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                  ROOM: {session?.room_code || '---'}
                </span>
                <span className="text-xs text-slate-400">Layar Utama Proyektor</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!audioUnlocked && (
              <button
                onClick={unlockAudio}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold hover:bg-amber-500/30 transition-all animate-pulse"
              >
                <Volume2 className="w-4 h-4" />
                <span>Aktifkan Audio SFX</span>
              </button>
            )}

            <button
              onClick={() => setShowQrModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs font-semibold hover:border-slate-700 transition-all"
            >
              <QrCode className="w-4 h-4 text-emerald-400" />
              <span>QR Masuk</span>
            </button>

            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-all"
              title="Layar Penuh (F11)"
            >
              <Maximize className="w-4 h-4" />
            </button>

            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                isConnected
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              }`}
            >
              {isConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
              <span>{isConnected ? 'Realtime Live' : 'Menghubungkan...'}</span>
            </div>

            <button
              onClick={() => setIsHeaderCollapsed(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-xs font-semibold transition-all shadow-sm"
              title="Sembunyikan Header (Tekan tombol 'H' di keyboard)"
            >
              <ChevronUp className="w-4 h-4 text-purple-400" />
              <span className="hidden sm:inline text-[11px]">Tutup Header</span>
            </button>
          </div>
        </header>
      )}

      {/* FLOATING LEADERBOARD BUTTON */}
      <div
        className={`fixed bottom-6 right-6 z-50 transition-opacity duration-700 ${
          isIdle ? 'opacity-20 hover:opacity-100' : 'opacity-100'
        }`}
      >
        <button
          onClick={() => setIsLeaderboardOpen(!isLeaderboardOpen)}
          className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-2xl shadow-amber-500/40 border border-amber-300/60 backdrop-blur-md transition-all transform hover:scale-105 active:scale-95"
        >
          <Trophy className="w-5 h-5 text-slate-950" />
          <span>{isLeaderboardOpen ? 'Tutup Papan Skor' : 'Buka Papan Skor'}</span>
        </button>
      </div>

      {/* DRAWER LEADERBOARD */}
      {isLeaderboardOpen && (
        <div className="fixed inset-y-0 right-0 w-80 md:w-96 bg-slate-950/95 border-l border-slate-800 p-6 z-40 backdrop-blur-xl shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-300">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              <h3 className="text-base font-black text-white uppercase tracking-wider">
                Klasemen Sementara
              </h3>
            </div>
            <button
              onClick={() => setIsLeaderboardOpen(false)}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <Leaderboard teams={teams} />
          </div>
        </div>
      )}

      {/* MAIN STAGE CONTENT AREA */}
      <div className="flex-1 flex flex-col justify-center items-center pt-1 sm:pt-2 z-10 min-h-0 relative w-full">
        {/* TAMPILAN 1: SAMBUTAN */}
        {session?.status === 'waiting' && !session?.current_question_id && (
          <div className="max-w-5xl w-full text-center py-10 px-8 bg-slate-900/60 border border-slate-800 rounded-3xl backdrop-blur-xl shadow-2xl relative overflow-hidden flex flex-col items-center justify-center">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-purple-600 to-blue-500 flex items-center justify-center text-white mb-5 shadow-xl shadow-purple-600/30">
              <Sparkles className="w-10 h-10 animate-bounce" />
            </div>

            <span className="text-xs uppercase font-extrabold tracking-widest text-purple-400 bg-purple-500/10 px-4 py-1.5 rounded-full border border-purple-500/20 mb-3">
              Selamat Datang di Arena • {activeRoundName}
            </span>

            <h2 className="text-4xl md:text-6xl font-black text-white tracking-tight uppercase mb-4 drop-shadow-md">
              {cleanTitle}
            </h2>

            <p className="text-sm md:text-base text-slate-400 max-w-xl mx-auto mb-6 font-medium">
              Siapkan strategi regu Anda! Jawab pertanyaan dengan cepat, kumpulkan poin maksimal, dan rebut gelar juara panggung!
            </p>

            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-bold uppercase tracking-wider mb-8 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
              <span>Menunggu Operator Membuka Babak Kuis...</span>
            </div>

            {teams.length > 0 && (
              <div className="w-full max-w-3xl border-t border-slate-800/80 pt-6 mt-2">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <Users className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
                    Regu Peserta yang Bertanding ({teams.length} Regu)
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {teams.map((t) => (
                    <div
                      key={t.id}
                      className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col items-center justify-center gap-1 shadow"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                        <span className="text-xs font-black text-white truncate max-w-[100px]">
                          {t.name}
                        </span>
                      </div>
                      <span className="text-base font-black font-mono text-amber-400">
                        {t.score} <span className="text-[10px] text-slate-500 font-normal">PTS</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAMPILAN 2: PILIHAN FORMAT */}
        {session?.status === 'type_select' && !session?.current_question_id && (
          <div className="max-w-5xl w-full flex flex-col items-center justify-center text-center space-y-4 sm:space-y-6 animate-in fade-in duration-500 max-h-[82vh]">
            <div className="space-y-1.5 shrink-0">
              <span className="text-xs uppercase font-extrabold tracking-widest text-purple-400 bg-purple-500/10 px-4 py-1 rounded-full border border-purple-500/20 inline-block shadow-sm">
                TAHAPAN 1 • FORMAT TANTANGAN ({activeRoundName})
              </span>
              <h2 className="text-2xl sm:text-4xl font-black text-white uppercase tracking-tight drop-shadow-md">
                Format Tantangan Kuis
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 font-medium max-w-xl mx-auto">
                Operator panggung sedang memilih jenis babak perlombaan yang akan dimainkan
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 w-full pt-1">
              <div className="p-5 sm:p-6 rounded-3xl bg-slate-900/80 border-2 border-blue-500/40 shadow-xl shadow-blue-500/10 flex flex-col items-center text-center relative overflow-hidden group">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-600 flex items-center justify-center text-white mb-3 sm:mb-4 shadow-lg shadow-blue-600/30">
                  <BookOpen className="w-6 h-6 sm:w-7 sm:h-7" />
                </div>
                <h3 className="text-lg sm:text-xl font-black text-white uppercase mb-1">
                  Pilihan Ganda
                </h3>
                <p className="text-xs text-slate-400 font-medium mb-4 line-clamp-2">
                  4 Opsi Jawaban (A, B, C, D) dengan Smart Shuffle & Countdown Cepat
                </p>
                <span className="mt-auto text-[11px] font-bold text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">
                  {questionsList.filter((q) => q.type === 'pilihan_ganda').length} Soal Tersedia
                </span>
              </div>

              <div className="p-5 sm:p-6 rounded-3xl bg-slate-900/80 border-2 border-amber-500/40 shadow-xl shadow-amber-500/10 flex flex-col items-center text-center relative overflow-hidden group">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-amber-600 to-orange-600 flex items-center justify-center text-white mb-3 sm:mb-4 shadow-lg shadow-amber-600/30">
                  <HelpCircle className="w-6 h-6 sm:w-7 sm:h-7" />
                </div>
                <h3 className="text-lg sm:text-xl font-black text-white uppercase mb-1">
                  Benar / Salah
                </h3>
                <p className="text-xs text-slate-400 font-medium mb-4 line-clamp-2">
                  Tantangan kilat menguji ketangkasan & logika peserta di panggung
                </p>
                <span className="mt-auto text-[11px] font-bold text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                  {questionsList.filter((q) => q.type === 'benar_salah').length} Soal Tersedia
                </span>
              </div>

              <div className="p-5 sm:p-6 rounded-3xl bg-slate-900/80 border-2 border-purple-500/40 shadow-xl shadow-purple-500/10 flex flex-col items-center text-center relative overflow-hidden group">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-600 flex items-center justify-center text-white mb-3 sm:mb-4 shadow-lg shadow-purple-600/30">
                  <Layers className="w-6 h-6 sm:w-7 sm:h-7" />
                </div>
                <h3 className="text-lg sm:text-xl font-black text-white uppercase mb-1">
                  Rebutan / Lisan
                </h3>
                <p className="text-xs text-slate-400 font-medium mb-4 line-clamp-2">
                  Pertanyaan eksploratif lisan dinilai langsung oleh dewan juri
                </p>
                <span className="mt-auto text-[11px] font-bold text-purple-400 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20">
                  {questionsList.filter((q) => q.type === 'essay').length} Soal Tersedia
                </span>
              </div>
            </div>
          </div>
        )}

        {/* TAMPILAN 3: PILIHAN KATEGORI */}
        {(session?.status?.startsWith('category_') || session?.status === 'category_select') && !session?.current_question_id && (
          <div className="max-w-5xl w-full flex flex-col items-center justify-center text-center space-y-3 sm:space-y-4 animate-in fade-in duration-500 flex-1 min-h-0">
            <div className="space-y-1 shrink-0">
              <span className="text-xs uppercase font-extrabold tracking-widest text-pink-400 bg-pink-500/10 px-4 py-1 rounded-full border border-pink-500/20 inline-block shadow-sm">
                TAHAPAN 2 • PILIH KATEGORI ({activeGameType === 'pilihan_ganda' ? 'PILIHAN GANDA' : activeGameType === 'benar_salah' ? 'BENAR ATAU SALAH' : 'REBUTAN / ESSAY'})
              </span>
              <h2 className="text-2xl sm:text-4xl font-black text-white uppercase tracking-tight drop-shadow-md">
                Pilih Kategori Tantangan
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 font-medium max-w-xl mx-auto">
                Silakan regu yang bertanding memilih salah satu kategori soal di panggung!
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4 w-full pt-1 max-h-[62vh] overflow-y-auto pr-1 pb-2">
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-indigo-950/90 via-slate-900 to-purple-950/90 border-2 border-indigo-500/50 shadow-xl flex flex-col justify-between text-left transition-all hover:border-indigo-400">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400 mb-2 sm:mb-3 shadow-md shrink-0">
                  <LayoutGrid className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-wide leading-snug mb-1">
                    Semua Kategori
                  </h3>
                  <p className="text-[11px] sm:text-xs font-bold text-indigo-300">
                    {questionsList.filter((q) => q.type === activeGameType).length} Soal Tersedia
                  </p>
                </div>
              </div>

              {categories.map((cat) => {
                const count = questionsList.filter(
                  (q) => q.type === activeGameType && q.category_id === cat.id
                ).length;
                return (
                  <div
                    key={cat.id}
                    className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border-2 border-pink-500/40 shadow-xl flex flex-col justify-between text-left transition-all hover:border-pink-400"
                  >
                    <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-pink-600/25 border border-pink-500/40 flex items-center justify-center text-pink-400 mb-2 sm:mb-3 shadow-md shrink-0">
                      <Tag className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-wide leading-snug mb-1">
                        {cat.name}
                      </h3>
                      <p className="text-[11px] sm:text-xs font-bold text-pink-300">
                        {count} Soal Tersedia
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAMPILAN 4: PAPAN KOTAK (MUAT UTUH HINGGA 30 KOTAK DALAM SATU LAYAR PENUH) */}
        {!['waiting', 'type_select'].includes(session?.status || '') &&
          !session?.status?.startsWith('category_') &&
          session?.status !== 'category_select' &&
          !session?.current_question_id && (
            <div className={`max-w-7xl w-full flex flex-col items-center justify-between ${isUltraDense ? 'space-y-1 sm:space-y-2' : 'space-y-3 sm:space-y-4'} animate-in fade-in duration-500 max-h-[88vh]`}>
              <div className="text-center space-y-0.5 shrink-0">
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <span className="text-[10px] sm:text-[11px] uppercase font-extrabold tracking-widest text-indigo-400 bg-indigo-500/10 px-3 py-0.5 rounded-full border border-indigo-500/20 shadow-sm">
                    {activeRoundName} • {activeGameType === 'pilihan_ganda' ? 'PILIHAN GANDA' : activeGameType === 'benar_salah' ? 'BENAR ATAU SALAH' : 'REBUTAN / ESSAY'}
                  </span>
                  {activeCategory && (
                    <span className="text-[10px] sm:text-[11px] uppercase font-extrabold tracking-widest text-pink-400 bg-pink-500/10 px-3 py-0.5 rounded-full border border-pink-500/20 flex items-center gap-1 shadow-sm">
                      <Tag className="w-3 h-3 text-pink-400" />
                      KATEGORI: {activeCategory.name}
                    </span>
                  )}
                </div>
                <h2 className={`${isUltraDense ? 'text-lg sm:text-2xl' : 'text-2xl sm:text-4xl'} font-black text-white uppercase tracking-tight drop-shadow-md`}>
                  Pilih Kotak Tantangan
                </h2>
                <p className="text-[11px] sm:text-xs text-slate-400 font-medium max-w-xl mx-auto">
                  Silakan regu yang bertanding memilih salah satu nomor kotak yang tersedia di layar!
                </p>
              </div>

              {/* GRID KOTAK: 6 KOLOM DENGAN TINGGI PROPORSIAL AGAR 30 KOTAK TIDAK TERPOTONG */}
              <div
                className={`w-full grid gap-1.5 sm:gap-2 ${gridColsClass} overflow-y-auto max-h-[72vh] px-1 py-1`}
              >
                {Array.from({ length: totalBoxes }).map((_, idx) => {
                  const boxNum = idx + 1;
                  const matchedQ = filteredQuestions.find((q) => q.box_number === boxNum) || filteredQuestions[idx];
                  const isOpened = (matchedQ && openedBoxIds.includes(matchedQ.id)) || matchedQ?.is_opened;
                  const boxCatName = categories.find((c) => c.id === matchedQ?.category_id)?.name;

                  return (
                    <div
                      key={boxNum}
                      className={`${
                        isUltraDense
                          ? 'h-14 sm:h-16 md:h-20'
                          : isDense
                          ? 'h-20 sm:h-22 md:h-24'
                          : totalBoxes > 9
                          ? 'h-20 sm:h-24 md:h-28'
                          : 'h-24 sm:h-28 md:h-32'
                      } rounded-xl sm:rounded-2xl font-black flex flex-col items-center justify-center gap-0.5 sm:gap-1 transition-all duration-300 relative overflow-hidden select-none border-2 shadow-xl ${
                        isOpened
                          ? 'bg-slate-950/60 border-slate-800/80 text-slate-600 opacity-40 scale-95'
                          : matchedQ
                          ? 'bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 border-indigo-500/70 text-white shadow-indigo-600/30'
                          : 'bg-slate-950/40 border-slate-800 text-slate-700'
                      }`}
                    >
                      {!isOpened && matchedQ && (
                        <span className="absolute -top-10 -right-10 w-20 h-20 bg-indigo-500/25 rounded-full blur-xl animate-pulse" />
                      )}

                      {/* Nomor Kotak */}
                      <span className={`${isUltraDense ? 'text-xl sm:text-2xl md:text-3xl' : 'text-3xl sm:text-4xl'} font-black font-mono tracking-wider drop-shadow-md text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-300`}>
                        #{boxNum}
                      </span>

                      {/* Tag Kategori */}
                      {boxCatName && (
                        <span className={`${isUltraDense ? 'text-[7px] sm:text-[8px] px-1 py-0' : 'text-[9px] px-2 py-0.5'} text-pink-300 font-bold uppercase tracking-wider truncate max-w-[85px] sm:max-w-[110px] rounded-full bg-pink-950/70 border border-pink-700/50 flex items-center gap-1 shadow-sm`}>
                          <Tag className="w-2 h-2 text-pink-400 shrink-0" />
                          <span className="truncate">{boxCatName}</span>
                        </span>
                      )}

                      {/* Status Kotak */}
                      <span
                        className={`${isUltraDense ? 'text-[8px] sm:text-[9px] px-1.5 py-0' : 'text-[10px] sm:text-[11px] px-2.5 py-0.5'} uppercase tracking-widest font-black rounded-full border ${
                          isOpened
                            ? 'bg-slate-800/60 border-slate-700 text-slate-500'
                            : matchedQ
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 animate-pulse'
                            : 'bg-slate-900 border-slate-800 text-slate-600'
                        }`}
                      >
                        {isOpened ? '✓ Dibuka' : matchedQ ? '★ Tersedia' : 'Kosong'}
                      </span>

                      {/* Poin Hint */}
                      {!isOpened && matchedQ && (
                        <span className={`${isUltraDense ? 'text-[7px] sm:text-[8px]' : 'text-[9px]'} font-bold text-indigo-300/80 uppercase tracking-wider`}>
                          +{matchedQ.points || 100} Poin
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* LIVE TEAMS BAR BAWAH */}
              {teams.length > 0 && (
                <div className="w-full border-t border-slate-800/80 pt-1.5 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 shrink-0">
                  {teams.map((t) => (
                    <div
                      key={t.id}
                      className="px-2.5 py-1 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-1.5 shadow-sm"
                    >
                      <span className="w-2 h-2 rounded-full shadow" style={{ backgroundColor: t.color }} />
                      <span className="text-[11px] font-black text-white">{t.name}:</span>
                      <span className="text-[11px] font-black font-mono text-amber-400">{t.score} PTS</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        {/* TAMPILAN 5: SOAL AKTIF */}
        {session?.current_question_id && (
          <div className="w-full flex-1 flex flex-col justify-between space-y-6 animate-in fade-in duration-300">
            <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 rounded-3xl p-6 backdrop-blur-md">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs uppercase font-extrabold tracking-widest text-slate-400">
                    Panggung Perlombaan • {activeRoundName}
                  </span>
                  {(() => {
                    const currentCategoryName = categories.find((c) => c.id === currentQuestion?.category_id)?.name;
                    return currentCategoryName ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        <Tag className="w-3 h-3 text-emerald-400" />
                        Kategori: {currentCategoryName}
                      </span>
                    ) : null;
                  })()}
                </div>
                <h2 className="text-2xl font-black text-white">
                  {currentQuestion ? 'Pertanyaan Aktif' : 'Memuat Pertanyaan...'}
                </h2>
              </div>

              <CircularTimer
                duration={currentQuestion?.timer_duration || 30}
                remaining={remainingTime}
                isRunning={session?.is_timer_running ?? false}
              />
            </div>

            <QuestionDisplay
              question={currentQuestion}
              isAnswerRevealed={session?.is_answer_revealed ?? false}
              categoryName={categories.find((c) => c.id === currentQuestion?.category_id)?.name}
            />
          </div>
        )}
      </div>

      {/* QR MODAL */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-sm w-full text-center relative shadow-2xl">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-black text-white uppercase mb-1">Pindai QR Peserta</h3>
            <p className="text-xs text-slate-400 mb-6">Pindai dengan kamera smartphone peserta meja</p>

            <div className="bg-white p-4 rounded-2xl inline-block shadow-inner mb-4">
              {joinUrl && <QRCodeSVG value={joinUrl} size={200} />}
            </div>

            <p className="text-xs font-mono text-slate-300 break-all bg-slate-950 p-2.5 rounded-xl border border-slate-800">
              {joinUrl}
            </p>
            <span className="block mt-2 text-[10px] text-amber-400 font-semibold uppercase tracking-wider">
              Room Code: {session?.room_code}
            </span>
          </div>
        </div>
      )}

      {/* VICTORY PODIUM */}
      {session?.status === 'finished' && (
        <VictoryPodium
          teams={teams}
          onRestart={() => {
            if (session) {
              setSession({ ...session, status: 'active' });
            }
          }}
        />
      )}
    </main>
  );
}
