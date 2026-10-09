'use client';

import { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase, GameSession, Question, Team } from '@/lib/supabase';
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
  LayoutGrid,
  ChevronRight,
  RotateCcw,
  BookOpen,
  HelpCircle,
  Layers,
  ChevronLeft
} from 'lucide-react';

interface Category {
  id: string;
  name: string;
}

export default function OperatorProjectorPage() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [questionsList, setQuestionsList] = useState<Question[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [joinUrl, setJoinUrl] = useState('');
  const [showQrModal, setShowQrModal] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  // Flow State di Panggung: 'welcome' | 'type_select' | 'cat_select' | 'box_select' | 'question_active'
  const [stageView, setStageView] = useState<'welcome' | 'type_select' | 'cat_select' | 'box_select' | 'question_active'>('welcome');
  const [selectedType, setSelectedType] = useState<string>('pilihan_ganda');
  const [selectedCatId, setSelectedCatId] = useState<string>('');

  // Floating Leaderboard Auto-Fade state
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Local mirror of the timer to provide smooth counting
  const [remainingTime, setRemainingTime] = useState(30);
  const prevRemainingRef = useRef<number>(30);

  // Deteksi Gerakan Mouse untuk Auto-Fade Floating Button (pudar setelah 3 detik diam)
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

  // Set Join URL from browser origin (LAN IP laptop)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}/peserta`;
      setJoinUrl(url);
    }
  }, []);

  // Fetch initial session & teams & questions data
  const fetchData = async () => {
    try {
      const { data: sessionData } = await supabase
        .from('game_sessions')
        .select('*')
        .limit(1)
        .single();

      if (sessionData) {
        setSession(sessionData);
        setRemainingTime(sessionData.timer_remaining);
        prevRemainingRef.current = sessionData.timer_remaining;

        // Fetch question jika sudah ada yang aktif
        if (sessionData.current_question_id) {
          const { data: qData } = await supabase
            .from('questions')
            .select('*')
            .eq('id', sessionData.current_question_id)
            .single();
          if (qData) {
            setCurrentQuestion(qData);
            setStageView('question_active');
          } else {
            setStageView('welcome');
          }
        } else {
          // Tetap di Welcome Screen jika belum ada soal yang dipilih oleh operator
          setCurrentQuestion(null);
          setStageView('welcome');
        }

        // Fetch teams
        const { data: teamsData } = await supabase
          .from('teams')
          .select('*')
          .eq('session_id', sessionData.id);
        if (teamsData) setTeams(teamsData);
      }

      // Fetch Categories
      const { data: catData } = await supabase.from('categories').select('*').order('name');
      if (catData) setCategories(catData);

      // Fetch Questions
      const { data: qDataList } = await supabase.from('questions').select('*');
      if (qDataList) setQuestionsList(qDataList);
    } catch {
      // Quiet fail
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Realtime Supabase Subscription
  useEffect(() => {
    if (!session?.id) return;

    const channel = supabase
      .channel('projector_live_channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_sessions', filter: `id=eq.${session.id}` },
        async (payload) => {
          const newSession = payload.new as GameSession;
          if (newSession) {
            // Trigger sound when answer revealed
            if (newSession.is_answer_revealed && !session.is_answer_revealed) {
              sounds.playCorrect();
            }

            // Sync current question if changed
            if (newSession.current_question_id !== session.current_question_id) {
              if (newSession.current_question_id) {
                const { data: qData } = await supabase
                  .from('questions')
                  .select('*')
                  .eq('id', newSession.current_question_id)
                  .single();
                if (qData) {
                  setCurrentQuestion(qData);
                  setStageView('question_active');
                }
              } else {
                // Operator mengembalikan proyektor ke Welcome Screen
                setCurrentQuestion(null);
                setStageView('welcome');
              }
            }

            setSession(newSession);
            setRemainingTime(newSession.timer_remaining);
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
            .eq('session_id', session.id);
          if (teamsData) setTeams(teamsData);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'questions' },
        async () => {
          const { data: qDataList } = await supabase.from('questions').select('*');
          if (qDataList) setQuestionsList(qDataList);
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.id, session?.is_answer_revealed, session?.current_question_id]);

  // Audio & Timer tick effect
  useEffect(() => {
    if (!session?.is_timer_running || remainingTime <= 0) return;

    const interval = setInterval(() => {
      setRemainingTime((prev) => {
        const next = Math.max(0, prev - 1);
        if (next > 0) {
          sounds.playTick(next <= 5);
        } else if (next === 0 && prevRemainingRef.current > 0) {
          sounds.playTimeUp();
        }
        prevRemainingRef.current = next;
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [session?.is_timer_running, remainingTime]);

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

  // Handler memilih kotak Blink Box langsung dari layar proyektor / operator
  const handleSelectBox = async (boxIndex: number, question: Question | undefined) => {
    if (!question || !session) return;
    sounds.playScoreUp(); // Bunyi klik animasi kuis
    setCurrentQuestion(question);
    setStageView('question_active');

    // Sync ke database & langsung jalankan timer
    const dur = question.timer_duration || 30;
    setRemainingTime(dur);
    await supabase
      .from('game_sessions')
      .update({
        current_question_id: question.id,
        is_answer_revealed: false,
        timer_remaining: dur,
        is_timer_running: true,
        status: 'active',
      })
      .eq('id', session.id);
  };

  // Hitung jumlah kotak berdasarkan setting sesi (6 atau 9)
  const totalBoxes = session?.blink_box_count === 9 ? 9 : 6;

  // Filter daftar soal sesuai tipe & kategori yang dipilih
  const currentCategoryQuestions = questionsList.filter(
    (q) => q.type === selectedType && (selectedCatId ? q.category_id === selectedCatId : true)
  );

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
              <span>{session?.title || 'Kuis Battle Panggung'}</span>
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

          {/* Navigasi Cepat Tahapan Panggung */}
          <div className="hidden md:flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
            <button
              onClick={() => setStageView('welcome')}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                stageView === 'welcome' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Beranda
            </button>
            <button
              onClick={() => setStageView('type_select')}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                stageView === 'type_select' || stageView === 'cat_select' || stageView === 'box_select'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Pilih Kotak
            </button>
            {currentQuestion && (
              <button
                onClick={() => setStageView('question_active')}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  stageView === 'question_active' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Soal Aktif
              </button>
            )}
          </div>

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

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col justify-center items-center pt-6 z-10 min-h-0 relative">
        {/* VIEW 1: WELCOME SCREEN (SAY HELLO TO AUDIENCE) */}
        {stageView === 'welcome' && (
          <div className="max-w-4xl w-full text-center py-12 px-6 bg-slate-900/60 border border-slate-800 rounded-3xl backdrop-blur-xl shadow-2xl relative overflow-hidden flex flex-col items-center justify-center">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-purple-600 to-blue-500 flex items-center justify-center text-white mb-6 shadow-xl shadow-purple-600/30">
              <Sparkles className="w-10 h-10 animate-bounce" />
            </div>

            <span className="text-xs uppercase font-extrabold tracking-widest text-purple-400 bg-purple-500/10 px-4 py-1 rounded-full border border-purple-500/20 mb-3">
              Selamat Datang di Arena
            </span>

            <h2 className="text-4xl md:text-6xl font-black text-white tracking-tight uppercase mb-4 drop-shadow-md">
              {session?.title || 'Kuis Battle Panggung'}
            </h2>

            <p className="text-sm md:text-base text-slate-400 max-w-xl mx-auto mb-8 font-medium">
              Siapkan strategi regu Anda! Pilih kotak misteri, jawab pertanyaan dengan cepat, dan kumpulkan skor tertinggi untuk menjadi juara!
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4">
              <button
                onClick={() => setStageView('type_select')}
                className="flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-sm uppercase tracking-wider shadow-xl shadow-blue-600/30 transition-all transform hover:scale-105 active:scale-95"
              >
                <LayoutGrid className="w-5 h-5" />
                <span>Mulai Pilih Soal Panggung</span>
                <ChevronRight className="w-5 h-5" />
              </button>

              <button
                onClick={() => setShowQrModal(true)}
                className="flex items-center gap-2 px-6 py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm uppercase tracking-wider border border-slate-700 transition-all"
              >
                <QrCode className="w-5 h-5 text-emerald-400" />
                <span>Pindai QR Peserta</span>
              </button>
            </div>
          </div>
        )}

        {/* VIEW 2: STEP 1 - PILIH TIPE SOAL */}
        {stageView === 'type_select' && (
          <div className="max-w-4xl w-full text-center space-y-6">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStageView('welcome')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-400 hover:text-white"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Kembali</span>
              </button>
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Langkah 1 dari 3: Pilih Tipe Soal
              </span>
              <div className="w-20" />
            </div>

            <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-wide">
              Pilih Format Tantangan
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
              {[
                {
                  type: 'pilihan_ganda',
                  title: 'Pilihan Ganda',
                  desc: '4 Opsi Jawaban (A, B, C, D) dengan Smart Shuffle',
                  icon: BookOpen,
                  color: 'from-blue-600 to-cyan-600',
                  border: 'border-blue-500/40',
                },
                {
                  type: 'benar_salah',
                  title: 'Benar / Salah',
                  desc: 'Tantangan kilat menguji ketangkasan & logika',
                  icon: HelpCircle,
                  color: 'from-amber-600 to-orange-600',
                  border: 'border-amber-500/40',
                },
                {
                  type: 'essay',
                  title: 'Rebutan / Lisan',
                  desc: 'Pertanyaan eksploratif dinilai langsung oleh dewan juri',
                  icon: Layers,
                  color: 'from-purple-600 to-pink-600',
                  border: 'border-purple-500/40',
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.type}
                    onClick={() => {
                      setSelectedType(item.type);
                      setStageView('cat_select');
                    }}
                    className={`p-8 rounded-3xl bg-slate-900/80 border ${item.border} hover:scale-105 active:scale-95 transition-all text-left flex flex-col justify-between shadow-xl group`}
                  >
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-tr ${item.color} flex items-center justify-center text-white mb-6 shadow-lg group-hover:scale-110 transition-transform`}>
                      <Icon className="w-7 h-7" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-white uppercase mb-2">
                        {item.title}
                      </h3>
                      <p className="text-xs text-slate-400 font-medium">{item.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW 3: STEP 2 - PILIH KATEGORI */}
        {stageView === 'cat_select' && (
          <div className="max-w-4xl w-full text-center space-y-6">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStageView('type_select')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-400 hover:text-white"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Kembali</span>
              </button>
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Langkah 2 dari 3: Pilih Tema Kategori
              </span>
              <div className="w-20" />
            </div>

            <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-wide">
              Pilih Kategori Bidang
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
              <button
                onClick={() => {
                  setSelectedCatId('');
                  setStageView('box_select');
                }}
                className="p-6 rounded-2xl bg-slate-900/80 border border-slate-700 hover:border-blue-500 hover:scale-105 transition-all text-center font-bold text-sm text-slate-200"
              >
                🌐 Semua Kategori (Campuran)
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedCatId(c.id);
                    setStageView('box_select');
                  }}
                  className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-purple-500 hover:scale-105 transition-all text-center font-bold text-sm text-white"
                >
                  📚 {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 4: STEP 3 - BLINK BOX GRID DENGAN NEON GLOW (6 ATAU 9 KOTAK) */}
        {stageView === 'box_select' && (
          <div className="max-w-4xl w-full text-center space-y-6">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStageView('cat_select')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-400 hover:text-white"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Kembali</span>
              </button>
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Langkah 3 dari 3: Pilih Kotak Tantangan ({totalBoxes} Kotak)
              </span>
              <div className="w-20" />
            </div>

            <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-wide flex items-center justify-center gap-2">
              <Sparkles className="w-6 h-6 text-amber-400 animate-pulse" />
              <span>Blink Box Arena</span>
            </h2>

            <div
              className={`grid gap-4 pt-4 ${
                totalBoxes === 9
                  ? 'grid-cols-3 max-w-2xl mx-auto'
                  : 'grid-cols-2 md:grid-cols-3 max-w-2xl mx-auto'
              }`}
            >
              {Array.from({ length: totalBoxes }).map((_, idx) => {
                const boxNum = idx + 1;
                // Cocokkan soal: utamakan yang memiliki slot box_number sesuai, atau fallback ke urutan array
                const matchedQ =
                  currentCategoryQuestions.find((q) => q.box_number === boxNum) ||
                  currentCategoryQuestions[idx];
                const isOpened = matchedQ?.id === currentQuestion?.id && session?.current_question_id === matchedQ?.id;

                return (
                  <div
                    key={boxNum}
                    className={`h-32 sm:h-36 rounded-3xl font-black flex flex-col items-center justify-center gap-2 transition-all duration-300 relative overflow-hidden select-none ${
                      isOpened
                        ? 'bg-slate-900/40 border border-slate-800 text-slate-600 opacity-50'
                        : matchedQ
                        ? 'bg-gradient-to-br from-indigo-900/60 via-slate-900 to-purple-900/60 border-2 border-indigo-500/60 shadow-lg shadow-indigo-600/20 text-white animate-pulse'
                        : 'bg-slate-950/40 border border-slate-800 text-slate-700'
                    }`}
                  >
                    {/* Glowing pulse aura */}
                    {!isOpened && matchedQ && (
                      <span className="absolute -top-10 -right-10 w-24 h-24 bg-indigo-500/20 rounded-full blur-xl" />
                    )}

                    <span className="text-3xl sm:text-4xl font-black font-mono tracking-wider drop-shadow-md">
                      #{boxNum}
                    </span>

                    <span className="text-[11px] uppercase tracking-wider font-bold text-slate-400">
                      {isOpened
                        ? 'Sudah Dibuka'
                        : matchedQ
                        ? 'Menunggu Operator'
                        : 'Kosong'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW 5: QUESTION ACTIVE ARENA */}
        {stageView === 'question_active' && (
          <div className="w-full flex-1 flex flex-col justify-between space-y-6">
            {/* Header Soal & Countdown */}
            <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 rounded-3xl p-6 backdrop-blur-md">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setStageView('box_select')}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 flex items-center gap-1.5 transition-all"
                  title="Kembali ke Kotak Panggung"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Pilih Kotak Lain</span>
                </button>
                <div>
                  <span className="text-xs uppercase font-extrabold tracking-widest text-slate-400">
                    Panggung Perlombaan
                  </span>
                  <h2 className="text-2xl font-black text-white mt-1">
                    {currentQuestion ? 'Pertanyaan Aktif' : 'Persiapan Babak'}
                  </h2>
                </div>
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

