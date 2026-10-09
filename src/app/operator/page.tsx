'use client';

import { useState, useEffect, useRef } from 'react';
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
  Tag
} from 'lucide-react';

export default function OperatorProjectorPage() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [questionsList, setQuestionsList] = useState<Question[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [joinUrl, setJoinUrl] = useState('');
  const [showQrModal, setShowQrModal] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  // Floating Leaderboard Auto-Fade state
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Set Join URL from browser origin
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}/peserta`;
      setJoinUrl(url);
    }
  }, []);

  // Fetch initial data (session, questions, teams)
  const fetchInitialData = async () => {
    try {
      // 1. Fetch Game Session
      const { data: sessionData } = await supabase
        .from('game_sessions')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (sessionData) {
        setSession(sessionData);
        setRemainingTime(sessionData.timer_remaining);

        // Load opened boxes
        try {
          const saved = localStorage.getItem(`opened_boxes_${sessionData.id}`);
          if (saved) setOpenedBoxIds(JSON.parse(saved));
        } catch {}

        // 2. Fetch Teams
        const { data: teamsData } = await supabase
          .from('teams')
          .select('*')
          .eq('session_id', sessionData.id)
          .order('score', { ascending: false });
        if (teamsData) setTeams(teamsData);
      }

      // 3. Fetch Questions
      const { data: qDataList } = await supabase
        .from('questions')
        .select('*')
        .order('created_at', { ascending: true });
      if (qDataList) setQuestionsList(qDataList.map(parseQuestionMeta));

      // 4. Fetch Categories
      const { data: catList } = await supabase.from('categories').select('*').order('name');
      if (catList) setCategories(catList);
    } catch {
      // Quiet fail
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  // Sync openedBoxIds from localStorage and whenever a question is activated
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
            // Sound effect ketika kunci jawaban dibuka
            if (newSession.is_answer_revealed && !prevRevealedRef.current) {
              sounds.playCorrect();
            }
            prevRevealedRef.current = newSession.is_answer_revealed;

            setSession(newSession);
          }
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
        { event: '*', schema: 'public', table: 'questions' },
        async () => {
          const { data: qDataList } = await supabase
            .from('questions')
            .select('*')
            .order('created_at', { ascending: true });
          if (qDataList) setQuestionsList(qDataList.map(parseQuestionMeta));
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
  }, [session?.id]);

  // Safety Auto-Sync Polling setiap 2.5 detik
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
            latestSession.title !== session.title
          ) {
            if (latestSession.is_answer_revealed && !session.is_answer_revealed) {
              sounds.playCorrect();
            }
            setSession(latestSession);
          }
        }
      } catch {
        // Quiet fail
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [session?.id, session?.current_question_id, session?.is_answer_revealed, session?.is_timer_running, session?.status, session?.title]);

  // SYNCHRONIZED COUNTDOWN TIMER (Presisi tinggi berbasis Server Timestamp)
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

  // Cari Soal Aktif dari daftar pertanyaan
  const currentQuestion = session?.current_question_id
    ? questionsList.find((q) => q.id === session.current_question_id) || null
    : null;

  // Tentukan jenis permainan / tipe soal yang aktif (default pilihan_ganda)
  let activeGameType: 'pilihan_ganda' | 'benar_salah' | 'essay' = 'pilihan_ganda';
  if (session?.status === 'box_benar_salah') {
    activeGameType = 'benar_salah';
  } else if (session?.status === 'box_essay') {
    activeGameType = 'essay';
  } else if (session?.status === 'box_pilihan_ganda') {
    activeGameType = 'pilihan_ganda';
  }

  // Filter daftar soal sesuai jenis permainan yang aktif
  const filteredQuestions = questionsList.filter((q) => q.type === activeGameType);

  // Hitung jumlah kotak dan judul panggung dari metadata sesi
  const { cleanTitle, boxCount: totalBoxes } = parseSessionMeta(session);

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

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col p-6 select-none overflow-hidden relative">
      {/* Background glow effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* TOP BAR: Room info, Judul Dinamis, Controls & Live Status */}
      <header className="flex items-center justify-between pb-4 border-b border-slate-800/80 z-20">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-blue-600/20 border border-blue-500/30 rounded-2xl text-blue-400">
            <Tv className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-wide text-white uppercase flex items-center gap-2">
              <span>{cleanTitle}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase tracking-widest">
                STAGE LIVE
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

        <div className="flex items-center gap-3">
          {/* Unlock Audio Button */}
          {!audioUnlocked && (
            <button
              onClick={unlockAudio}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold hover:bg-amber-500/30 transition-all animate-pulse"
            >
              <Volume2 className="w-4 h-4" />
              <span>Aktifkan Audio SFX</span>
            </button>
          )}

          {/* QR Code toggle */}
          <button
            onClick={() => setShowQrModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs font-semibold hover:border-slate-700 transition-all"
          >
            <QrCode className="w-4 h-4 text-emerald-400" />
            <span>QR Masuk</span>
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-all"
            title="Layar Penuh (F11)"
          >
            <Maximize className="w-4 h-4" />
          </button>

          {/* Connection Status */}
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
        </div>
      </header>

      {/* FLOATING LEADERBOARD BUTTON (AUTO-FADE SAAT MOUSE DIAM) */}
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

      {/* DRAWER SLIDE-IN LEADERBOARD */}
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
      <div className="flex-1 flex flex-col justify-center items-center pt-4 z-10 min-h-0 relative w-full">
        {/* TAMPILAN 1: DASHBOARD SAMBUTAN ARENA (Ketika status === 'waiting') */}
        {session?.status === 'waiting' && !session?.current_question_id && (
          <div className="max-w-5xl w-full text-center py-10 px-8 bg-slate-900/60 border border-slate-800 rounded-3xl backdrop-blur-xl shadow-2xl relative overflow-hidden flex flex-col items-center justify-center">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-purple-600 to-blue-500 flex items-center justify-center text-white mb-5 shadow-xl shadow-purple-600/30">
              <Sparkles className="w-10 h-10 animate-bounce" />
            </div>

            <span className="text-xs uppercase font-extrabold tracking-widest text-purple-400 bg-purple-500/10 px-4 py-1.5 rounded-full border border-purple-500/20 mb-3">
              Selamat Datang di Arena
            </span>

            <h2 className="text-4xl md:text-6xl font-black text-white tracking-tight uppercase mb-4 drop-shadow-md">
              {cleanTitle}
            </h2>

            <p className="text-sm md:text-base text-slate-400 max-w-xl mx-auto mb-6 font-medium">
              Siapkan strategi regu Anda! Jawab pertanyaan dengan cepat, kumpulkan poin maksimal, dan rebut gelar juara panggung!
            </p>

            {/* Status Panggung */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-bold uppercase tracking-wider mb-8 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
              <span>Menunggu Operator Membuka Babak Kuis...</span>
            </div>

            {/* PREVIEW KLASEMEN REGUS DI PANGGUNG SAMBUTAN */}
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
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: t.color }}
                        />
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

        {/* TAMPILAN 2: PILIH JENIS PERMAINAN / FORMAT TANTANGAN (Ketika status === 'type_select') */}
        {session?.status === 'type_select' && !session?.current_question_id && (
          <div className="max-w-5xl w-full flex flex-col items-center justify-center text-center space-y-8 animate-in fade-in duration-500">
            <div className="space-y-2">
              <span className="text-xs uppercase font-extrabold tracking-widest text-purple-400 bg-purple-500/10 px-4 py-1.5 rounded-full border border-purple-500/20 inline-block shadow-sm">
                TAHAPAN PERTANDINGAN
              </span>
              <h2 className="text-3xl sm:text-5xl font-black text-white uppercase tracking-tight drop-shadow-md">
                Format Tantangan Kuis
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 font-medium max-w-xl mx-auto">
                Operator panggung sedang memilih jenis babak perlombaan yang akan dimainkan
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full pt-2">
              {/* Card 1: Pilihan Ganda */}
              <div className="p-8 rounded-3xl bg-slate-900/80 border-2 border-blue-500/40 shadow-xl shadow-blue-500/10 flex flex-col items-center text-center relative overflow-hidden group">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-600 flex items-center justify-center text-white mb-6 shadow-lg shadow-blue-600/30">
                  <BookOpen className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-black text-white uppercase mb-2">
                  Pilihan Ganda
                </h3>
                <p className="text-xs text-slate-400 font-medium mb-6">
                  4 Opsi Jawaban (A, B, C, D) dengan Smart Shuffle & Countdown Cepat
                </p>
                <span className="mt-auto text-[11px] font-bold text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">
                  {questionsList.filter((q) => q.type === 'pilihan_ganda').length} Soal Tersedia
                </span>
              </div>

              {/* Card 2: Benar / Salah */}
              <div className="p-8 rounded-3xl bg-slate-900/80 border-2 border-amber-500/40 shadow-xl shadow-amber-500/10 flex flex-col items-center text-center relative overflow-hidden group">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-600 to-orange-600 flex items-center justify-center text-white mb-6 shadow-lg shadow-amber-600/30">
                  <HelpCircle className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-black text-white uppercase mb-2">
                  Benar / Salah
                </h3>
                <p className="text-xs text-slate-400 font-medium mb-6">
                  Tantangan kilat menguji ketangkasan & logika peserta di panggung
                </p>
                <span className="mt-auto text-[11px] font-bold text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                  {questionsList.filter((q) => q.type === 'benar_salah').length} Soal Tersedia
                </span>
              </div>

              {/* Card 3: Essay / Rebutan */}
              <div className="p-8 rounded-3xl bg-slate-900/80 border-2 border-purple-500/40 shadow-xl shadow-purple-500/10 flex flex-col items-center text-center relative overflow-hidden group">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-600 flex items-center justify-center text-white mb-6 shadow-lg shadow-purple-600/30">
                  <Layers className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-black text-white uppercase mb-2">
                  Rebutan / Lisan
                </h3>
                <p className="text-xs text-slate-400 font-medium mb-6">
                  Pertanyaan eksploratif lisan dinilai langsung oleh dewan juri
                </p>
                <span className="mt-auto text-[11px] font-bold text-purple-400 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20">
                  {questionsList.filter((q) => q.type === 'essay').length} Soal Tersedia
                </span>
              </div>
            </div>
          </div>
        )}

        {/* TAMPILAN 3: PAPAN KOTAK BLINK BOX (Sesuai Jenis Permainan yang Dipilih) */}
        {session?.status !== 'waiting' && session?.status !== 'type_select' && !session?.current_question_id && (
          <div className="max-w-5xl w-full flex flex-col items-center justify-between space-y-6 animate-in fade-in duration-500">
            {/* Header Papan Kotak */}
            <div className="text-center space-y-2">
              <span className="text-xs uppercase font-extrabold tracking-widest text-indigo-400 bg-indigo-500/10 px-4 py-1.5 rounded-full border border-indigo-500/20 inline-block shadow-sm">
                BABAK: {activeGameType === 'pilihan_ganda' ? 'PILIHAN GANDA' : activeGameType === 'benar_salah' ? 'BENAR ATAU SALAH' : 'REBUTAN / ESSAY'}
              </span>
              <h2 className="text-3xl sm:text-5xl font-black text-white uppercase tracking-tight drop-shadow-md">
                Pilih Kotak Tantangan
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 font-medium max-w-xl mx-auto">
                Silakan regu yang bertanding memilih salah satu nomor kotak yang tersedia di layar!
              </p>
            </div>

            {/* Grid Kotak Blink Box (Bisa Custom Jumlah Kotak) */}
            <div
              className={`w-full grid gap-4 sm:gap-6 ${
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
                  : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 max-w-6xl'
              }`}
            >
              {Array.from({ length: totalBoxes }).map((_, idx) => {
                const boxNum = idx + 1;
                const matchedQ = filteredQuestions.find((q) => q.box_number === boxNum) || filteredQuestions[idx];
                const isOpened = matchedQ && openedBoxIds.includes(matchedQ.id);
                const boxCatName = categories.find((c) => c.id === matchedQ?.category_id)?.name;

                return (
                  <div
                    key={boxNum}
                    className={`${totalBoxes > 9 ? 'h-28 sm:h-36' : 'h-36 sm:h-44'} rounded-3xl font-black flex flex-col items-center justify-center gap-2 transition-all duration-500 relative overflow-hidden select-none border-2 shadow-2xl ${
                      isOpened
                        ? 'bg-slate-950/60 border-slate-800/80 text-slate-600 opacity-40 scale-95'
                        : matchedQ
                        ? 'bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 border-indigo-500/70 text-white shadow-indigo-600/30'
                        : 'bg-slate-950/40 border-slate-800 text-slate-700'
                    }`}
                  >
                    {/* Glowing neon aura */}
                    {!isOpened && matchedQ && (
                      <span className="absolute -top-10 -right-10 w-28 h-28 bg-indigo-500/25 rounded-full blur-2xl animate-pulse" />
                    )}

                    {/* Box Number */}
                    <span className="text-4xl sm:text-5xl font-black font-mono tracking-wider drop-shadow-md text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-300">
                      #{boxNum}
                    </span>

                    {/* Category badge */}
                    {boxCatName && (
                      <span className="text-[10px] text-emerald-300 font-bold uppercase tracking-wider truncate max-w-[130px] px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-700/50 flex items-center gap-1 shadow-sm">
                        <Tag className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                        <span className="truncate">{boxCatName}</span>
                      </span>
                    )}

                    {/* Status Badge */}
                    <span
                      className={`text-[11px] sm:text-xs uppercase tracking-widest font-black px-3 py-1 rounded-full border ${
                        isOpened
                          ? 'bg-slate-800/60 border-slate-700 text-slate-500'
                          : matchedQ
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 animate-pulse'
                          : 'bg-slate-900 border-slate-800 text-slate-600'
                      }`}
                    >
                      {isOpened ? '✓ Sudah Dibuka' : matchedQ ? '★ Tersedia' : 'Kosong'}
                    </span>

                    {/* Point Hint */}
                    {!isOpened && matchedQ && (
                      <span className="text-[10px] font-bold text-indigo-300/80 uppercase tracking-wider">
                        +{matchedQ.points || 100} Poin
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Live Teams Bar di Bawah Kotak */}
            {teams.length > 0 && (
              <div className="w-full border-t border-slate-800/80 pt-4 flex flex-wrap items-center justify-center gap-3">
                {teams.map((t) => (
                  <div
                    key={t.id}
                    className="px-4 py-2 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center gap-2.5 shadow-sm"
                  >
                    <span className="w-3 h-3 rounded-full shadow" style={{ backgroundColor: t.color }} />
                    <span className="text-xs font-black text-white">{t.name}:</span>
                    <span className="text-sm font-black font-mono text-amber-400">{t.score} PTS</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAMPILAN 4: SOAL AKTIF DI PANGGUNG */}
        {session?.current_question_id && (
          <div className="w-full flex-1 flex flex-col justify-between space-y-6 animate-in fade-in duration-300">
            {/* Header Soal & Countdown */}
            <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 rounded-3xl p-6 backdrop-blur-md">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs uppercase font-extrabold tracking-widest text-slate-400">
                    Panggung Perlombaan
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

              {/* Circular Timer Display */}
              <CircularTimer
                duration={currentQuestion?.timer_duration || 30}
                remaining={remainingTime}
                isRunning={session?.is_timer_running ?? false}
              />
            </div>

            {/* Dynamic Question Renderer */}
            <QuestionDisplay
              question={currentQuestion}
              isAnswerRevealed={session?.is_answer_revealed ?? false}
              categoryName={categories.find((c) => c.id === currentQuestion?.category_id)?.name}
            />
          </div>
        )}
      </div>

      {/* QR CODE MODAL OVERLAY */}
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

      {/* VICTORY PODIUM OVERLAY (Jika status session selesai) */}
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
