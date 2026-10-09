'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, GameSession, Question, Team } from '@/lib/supabase';
import {
  Play,
  Pause,
  RotateCcw,
  Eye,
  SkipForward,
  Trophy,
  Plus,
  Minus,
  Sparkles,
  Tv,
  BookOpen,
  Wifi,
  WifiOff,
  LogOut,
  AlertCircle,
  UserPlus,
  Edit2,
  Trash2,
  X,
  Check,
  LayoutGrid
} from 'lucide-react';
import { sounds } from '@/lib/sound';

export default function OperatorControlPage() {
  const router = useRouter();

  // State utama
  const [session, setSession] = useState<GameSession | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [questionsList, setQuestionsList] = useState<Question[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);

  // Custom score input per regu: { [teamId]: number }
  const [customScores, setCustomScores] = useState<Record<string, string>>({});
  const [appliedTeamId, setAppliedTeamId] = useState<string | null>(null);

  // Team management modal states
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [teamFormName, setTeamFormName] = useState('');
  const [teamFormColor, setTeamFormColor] = useState('#3b82f6');
  const [teamFormScore, setTeamFormScore] = useState<number>(0);

  // Live timer countdown state
  const [remainingTime, setRemainingTime] = useState<number>(30);
  const prevRemainingRef = useRef<number>(30);

  // Auth gate check
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);

  useEffect(() => {
    const role = sessionStorage.getItem('auth_role');
    if (!role) {
      router.push('/login');
    } else {
      setIsAuthorized(true);
    }
  }, [router]);

  // Load initial data
  const loadData = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase
        .from('game_sessions')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (sessionData) {
        setSession(sessionData);

        // Fetch questions
        const { data: qList } = await supabase
          .from('questions')
          .select('*')
          .order('created_at', { ascending: true });
        if (qList) setQuestionsList(qList);

        // Current question
        if (sessionData.current_question_id) {
          const foundQ = qList?.find((q) => q.id === sessionData.current_question_id);
          if (foundQ) setCurrentQuestion(foundQ);
        } else {
          setCurrentQuestion(null);
        }

        // Teams
        const { data: teamsData } = await supabase
          .from('teams')
          .select('*')
          .eq('session_id', sessionData.id)
          .order('score', { ascending: false });
        if (teamsData) setTeams(teamsData);
      }
    } catch {
      // Quiet fail
    }
  }, []);

  useEffect(() => {
    loadData();

    // Auto-polling 2.5 detik sebagai jaring pengaman sinkronisasi
    const interval = setInterval(() => {
      loadData();
    }, 2500);

    return () => clearInterval(interval);
  }, [loadData]);

  // Realtime subscription
  useEffect(() => {
    if (!session?.id) return;

    const channelName = `room_sync_${session.id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_sessions', filter: `id=eq.${session.id}` },
        async (payload) => {
          const updated = payload.new as GameSession;
          if (updated) {
            setSession(updated);

            // Selaraskan currentQuestion di panel control dengan database
            if (updated.current_question_id) {
              const { data: qData } = await supabase
                .from('questions')
                .select('*')
                .eq('id', updated.current_question_id)
                .single();
              if (qData) setCurrentQuestion(qData);
            } else {
              setCurrentQuestion(null);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'teams', filter: `session_id=eq.${session.id}` },
        async () => {
          const { data: updatedTeams } = await supabase
            .from('teams')
            .select('*')
            .eq('session_id', session.id)
            .order('score', { ascending: false });
          if (updatedTeams) setTeams(updatedTeams);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'questions' },
        async () => {
          const { data: qList } = await supabase
            .from('questions')
            .select('*')
            .order('created_at', { ascending: true });
          if (qList) setQuestionsList(qList);
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.id]);

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

  // Handle timer toggle (Play/Pause)
  const toggleTimer = async () => {
    if (!session) return;
    const nextState = !session.is_timer_running;
    const nowIso = new Date().toISOString();

    setSession({
      ...session,
      is_timer_running: nextState,
      timer_remaining: remainingTime,
      updated_at: nowIso,
    });

    await supabase
      .from('game_sessions')
      .update({
        is_timer_running: nextState,
        timer_remaining: remainingTime,
        updated_at: nowIso,
        status: nextState ? 'active' : 'paused',
      })
      .eq('id', session.id);
  };

  // Reset timer to current question duration
  const resetTimer = async () => {
    if (!session || !currentQuestion) return;
    const dur = currentQuestion.timer_duration || 30;
    const nowIso = new Date().toISOString();

    setRemainingTime(dur);
    setSession({
      ...session,
      timer_remaining: dur,
      is_timer_running: false,
      updated_at: nowIso,
    });

    await supabase
      .from('game_sessions')
      .update({
        timer_remaining: dur,
        is_timer_running: false,
        updated_at: nowIso,
      })
      .eq('id', session.id);
  };

  // Quick preset duration: [15s], [20s], [30s], [45s], [60s]
  const handleSetDuration = async (seconds: number) => {
    if (!session) return;
    const nowIso = new Date().toISOString();

    setRemainingTime(seconds);
    setSession({
      ...session,
      timer_remaining: seconds,
      is_timer_running: false,
      updated_at: nowIso,
    });

    await supabase
      .from('game_sessions')
      .update({
        timer_remaining: seconds,
        is_timer_running: false,
        updated_at: nowIso,
      })
      .eq('id', session.id);
  };

  // Ubah Tampilan Layar Proyektor dari Panel Control Operator ('welcome' | 'question_active')
  const handleSetProjectorView = async (view: 'welcome' | 'question_active') => {
    if (!session) return;
    const nowIso = new Date().toISOString();

    if (view === 'welcome') {
      setCurrentQuestion(null);
      setSession({
        ...session,
        current_question_id: null,
        is_timer_running: false,
        is_answer_revealed: false,
        updated_at: nowIso,
      });

      await supabase
        .from('game_sessions')
        .update({
          current_question_id: null,
          is_timer_running: false,
          is_answer_revealed: false,
          updated_at: nowIso,
        })
        .eq('id', session.id);
    } else if (view === 'question_active' && currentQuestion) {
      setSession({
        ...session,
        current_question_id: currentQuestion.id,
        updated_at: nowIso,
        status: 'active',
      });

      await supabase
        .from('game_sessions')
        .update({
          current_question_id: currentQuestion.id,
          updated_at: nowIso,
          status: 'active',
        })
        .eq('id', session.id);
    }
  };

  // Toggle reveal answer
  const toggleRevealAnswer = async () => {
    if (!session) return;
    const nextState = !session.is_answer_revealed;
    setSession({ ...session, is_answer_revealed: nextState });

    await supabase
      .from('game_sessions')
      .update({ is_answer_revealed: nextState })
      .eq('id', session.id);
  };

  // Select Question & Auto-Start Timer
  const handleSelectQuestion = async (q: Question, autoStartTimer = false) => {
    if (!session) return;
    setLoadingAction(true);
    setCurrentQuestion(q);
    const dur = q.timer_duration || 30;
    const nowIso = new Date().toISOString();

    setRemainingTime(dur);
    setSession({
      ...session,
      current_question_id: q.id,
      is_answer_revealed: false,
      timer_remaining: dur,
      is_timer_running: autoStartTimer,
      updated_at: nowIso,
      status: 'active',
    });

    await supabase
      .from('game_sessions')
      .update({
        current_question_id: q.id,
        is_answer_revealed: false,
        timer_remaining: dur,
        is_timer_running: autoStartTimer,
        updated_at: nowIso,
        status: 'active',
      })
      .eq('id', session.id);

    setLoadingAction(false);
  };

  const handleNextQuestion = async () => {
    if (!questionsList.length || !currentQuestion) return;
    const currentIndex = questionsList.findIndex((q) => q.id === currentQuestion.id);
    const nextIndex = (currentIndex + 1) % questionsList.length;
    handleSelectQuestion(questionsList[nextIndex], false);
  };

  // Finish Match (Trigger victory podium)
  const handleFinishMatch = async () => {
    if (!session) return;
    const confirmed = window.confirm('Apakah Anda yakin ingin menyelesaikan pertandingan & menampilkan Podium Juara di Proyektor?');
    if (!confirmed) return;

    const nowIso = new Date().toISOString();
    setSession({ ...session, status: 'finished', is_timer_running: false, updated_at: nowIso });

    await supabase
      .from('game_sessions')
      .update({ status: 'finished', is_timer_running: false, updated_at: nowIso })
      .eq('id', session.id);
  };

  // Quick Score Adjustment
  const handleAdjustScore = async (teamId: string, delta: number) => {
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;

    if (delta > 0) {
      sounds.playScoreUp();
    } else {
      sounds.playScoreDown();
    }

    const newScore = team.score + delta;
    setTeams(teams.map((t) => (t.id === teamId ? { ...t, score: newScore } : t)));

    await supabase
      .from('teams')
      .update({ score: newScore })
      .eq('id', teamId);
  };

  // Custom Score Add
  const handleCustomScore = async (teamId: string) => {
    const rawVal = customScores[teamId];
    if (!rawVal) return;

    const val = parseInt(rawVal, 10);
    if (isNaN(val) || val === 0) return;

    if (val > 0) {
      sounds.playScoreUp();
    } else {
      sounds.playScoreDown();
    }

    const team = teams.find((t) => t.id === teamId);
    if (!team) return;

    const newScore = team.score + val;
    setTeams(teams.map((t) => (t.id === teamId ? { ...t, score: newScore } : t)));

    // Feedback visual berhasil diterapkan
    setAppliedTeamId(teamId);
    setTimeout(() => setAppliedTeamId(null), 1200);

    // Reset input custom score
    setCustomScores((prev) => ({ ...prev, [teamId]: '' }));

    await supabase
      .from('teams')
      .update({ score: newScore })
      .eq('id', teamId);
  };

  // Handle Team Modals (Add / Edit / Delete)
  const handleOpenAddTeam = () => {
    setEditingTeam(null);
    setTeamFormName('');
    setTeamFormColor('#3b82f6');
    setTeamFormScore(0);
    setIsTeamModalOpen(true);
  };

  const handleOpenEditTeam = (t: Team) => {
    setEditingTeam(t);
    setTeamFormName(t.name);
    setTeamFormColor(t.color);
    setTeamFormScore(t.score);
    setIsTeamModalOpen(true);
  };

  const handleDeleteTeam = async (teamId: string) => {
    const confirmDelete = window.confirm('Hapus regu ini dari pertandingan?');
    if (!confirmDelete) return;

    setTeams(teams.filter((t) => t.id !== teamId));
    await supabase.from('teams').delete().eq('id', teamId);
  };

  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !teamFormName.trim()) return;

    if (editingTeam) {
      // Update
      const { data: updated } = await supabase
        .from('teams')
        .update({
          name: teamFormName.trim(),
          color: teamFormColor,
          score: Number(teamFormScore),
        })
        .eq('id', editingTeam.id)
        .select()
        .single();

      if (updated) {
        setTeams(teams.map((t) => (t.id === editingTeam.id ? updated : t)));
      }
    } else {
      // Insert
      const { data: created } = await supabase
        .from('teams')
        .insert({
          session_id: session.id,
          name: teamFormName.trim(),
          color: teamFormColor,
          score: Number(teamFormScore),
          rank: teams.length + 1,
        })
        .select()
        .single();

      if (created) {
        setTeams([...teams, created]);
      }
    }
    setIsTeamModalOpen(false);
  };

  // SHORTCUT KEYBOARD: SPACEBAR untuk Pause / Resume Timer seketika
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        toggleTimer();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [session?.is_timer_running, session?.id, remainingTime]);

  const handleLogout = () => {
    sessionStorage.clear();
    router.push('/login');
  };

  if (!isAuthorized) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col p-4 sm:p-6">
      {/* HEADER CONTROL BAR */}
      <header className="flex flex-wrap items-center justify-between pb-4 border-b border-slate-800 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-600/20 border border-blue-500/30 rounded-xl text-blue-400">
            <Tv className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-wide text-white uppercase">
              Control Panggung Operator
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-mono font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                ROOM: {session?.room_code || '---'}
              </span>
              <span className="text-xs text-slate-400 hidden sm:inline">
                Status: {session?.status}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
              isConnected
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}
          >
            {isConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isConnected ? 'Live Sync' : 'Offline'}</span>
          </div>

          <a
            href="/operator"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-700 hover:border-blue-500 text-xs font-semibold rounded-xl text-slate-300 transition-all"
          >
            <Tv className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Buka Layar Proyektor</span>
          </a>

          <a
            href="/admin/soal"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-700 hover:border-purple-500 text-xs font-semibold rounded-xl text-slate-300 transition-all"
          >
            <BookOpen className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Bank Soal</span>
          </a>

          <button
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-rose-400 rounded-xl bg-slate-900 border border-slate-800 transition-all"
            title="Keluar"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* KONTROL STATUS TAMPILAN PROYEKTOR OLEH OPERATOR */}
      <div className="my-3 bg-slate-900/90 border border-purple-500/30 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-2">
          <Tv className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            Tampilan Layar Proyektor Saat Ini:
          </span>
          <span
            className={`text-xs font-black uppercase px-2.5 py-0.5 rounded-full ${
              !session?.current_question_id
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
            }`}
          >
            {!session?.current_question_id ? 'Dashboard Sambutan (Arena)' : 'Soal Aktif'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSetProjectorView('welcome')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              !session?.current_question_id
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 border border-purple-400'
                : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Tampilkan Dashboard Sambutan</span>
          </button>

          {currentQuestion && (
            <button
              onClick={() => handleSetProjectorView('question_active')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                session?.current_question_id
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 border border-emerald-400'
                  : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              <span>Tampilkan Soal Aktif di Proyektor</span>
            </button>
          )}
        </div>
      </div>

      {/* SHORTCUT SPACEBAR BANNER */}
      <div className="mb-4 bg-blue-950/40 border border-blue-800/60 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-blue-300">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
          <span>
            Shortcut Cepat: Tekan tombol <strong>[SPACEBAR / SPASI]</strong> pada keyboard untuk Pause / Resume timer seketika!
          </span>
        </div>
        <span className="hidden md:inline font-mono bg-blue-900/60 px-2 py-0.5 rounded text-[11px] font-bold">
          {session?.is_timer_running ? 'TIMER BERJALAN' : 'TIMER DIJEDA'}
        </span>
      </div>

      {/* MAIN CONTROL ARENA: 2-COLUMN */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* KOLOM KIRI (7/12): SOAL AKTIF & KONTROL TIMER & NAVIGASI */}
        <section className="lg:col-span-7 space-y-6 flex flex-col justify-between">
          {/* TAMPILAN JIKA PROYEKTOR SEDANG MENAMPILKAN DASHBOARD SAMBUTAN */}
          {!session?.current_question_id ? (
            <div className="bg-slate-900/90 border border-purple-500/30 rounded-2xl p-6 sm:p-8 shadow-xl backdrop-blur-md text-center flex flex-col items-center justify-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400 mb-1">
                <Sparkles className="w-7 h-7 animate-bounce" />
              </div>
              <span className="text-[11px] font-black uppercase tracking-widest text-purple-400 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20">
                Panggung Sambutan Aktif
              </span>
              <h2 className="text-lg sm:text-xl font-black text-white uppercase">
                Layar Proyektor Menampilkan Sambutan Panggung
              </h2>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Layar proyektor saat ini bersih menyambut hadirin. Pilih salah satu kotak Blink Box atau daftar soal di bawah untuk langsung menampilkannya di proyektor panggung!
              </p>
            </div>
          ) : (
            /* KOTAK SOAL AKTIF & KUNCI CONTEKAN OPERATOR */
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md">
              <div className="flex items-center justify-between mb-3">
                <span className="px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  {currentQuestion?.type.replace('_', ' ') || 'Belum ada soal'}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-semibold">
                    Bobot: +{currentQuestion?.points || 100} Poin
                  </span>
                  {/* Live Realtime Timer Badge */}
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-black font-mono tracking-wider flex items-center gap-1 border ${
                      remainingTime <= 5 && session?.is_timer_running
                        ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse'
                        : remainingTime <= 10
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                        : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                    }`}
                  >
                    ⏱ {remainingTime}s
                  </span>
                </div>
              </div>

              <h2 className="text-lg sm:text-xl font-bold text-white mb-4">
                {currentQuestion?.question_text || 'Pilih soal dari daftar di bawah'}
              </h2>

              {/* Kotak Contekan Kunci Jawaban Operator */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                    Kunci Jawaban (Contekan Operator):
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      session?.is_answer_revealed
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {session?.is_answer_revealed ? 'Terbuka di Proyektor' : 'Tertutup'}
                  </span>
                </div>
                <p className="text-base font-extrabold text-emerald-400 font-mono">
                  {currentQuestion?.correct_answer || '-'}
                </p>
                {currentQuestion?.explanation && (
                  <p className="text-xs text-slate-400 mt-1 italic">
                    Penjelasan: {currentQuestion.explanation}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* PRESET DURASI CEPAT TIMER (Hanya jika ada soal aktif) */}
          {session?.current_question_id && (
            <>
              <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 p-2.5 rounded-xl">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
                  Preset Timer:
                </span>
                <div className="flex flex-wrap gap-1.5 flex-1">
                  {[15, 20, 30, 45, 60].map((sec) => (
                    <button
                      key={sec}
                      onClick={() => handleSetDuration(sec)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                        remainingTime === sec
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>

              {/* ACTION BUTTONS: TIMER, BUKA KUNCI, SOAL BERIKUTNYA */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Play / Pause Timer */}
                <button
                  onClick={toggleTimer}
                  className={`p-4 rounded-2xl font-bold flex flex-col items-center justify-center gap-1.5 transition-all shadow-lg ${
                    session?.is_timer_running
                      ? 'bg-amber-600 hover:bg-amber-500 text-slate-950 shadow-amber-600/20'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                  }`}
                >
                  {session?.is_timer_running ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                  <span className="text-xs uppercase tracking-wider font-bold">
                    {session?.is_timer_running ? `Jeda (${remainingTime}s)` : `Jalankan (${remainingTime}s)`}
                  </span>
                </button>

                {/* Reset Timer */}
                <button
                  onClick={resetTimer}
                  className="p-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold flex flex-col items-center justify-center gap-1.5 transition-all"
                >
                  <RotateCcw className="w-6 h-6 text-slate-400" />
                  <span className="text-xs uppercase tracking-wider">Reset Timer</span>
                </button>

                {/* Buka / Tutup Kunci Jawaban */}
                <button
                  onClick={toggleRevealAnswer}
                  className={`p-4 rounded-2xl font-bold flex flex-col items-center justify-center gap-1.5 transition-all shadow-lg ${
                    session?.is_answer_revealed
                      ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/20'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  }`}
                >
                  <Eye className="w-6 h-6 text-amber-400" />
                  <span className="text-xs uppercase tracking-wider">
                    {session?.is_answer_revealed ? 'Tutup Kunci' : 'Buka Kunci'}
                  </span>
                </button>

                {/* Soal Berikutnya */}
                <button
                  onClick={handleNextQuestion}
                  disabled={loadingAction}
                  className="p-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold flex flex-col items-center justify-center gap-1.5 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50"
                >
                  <SkipForward className="w-6 h-6" />
                  <span className="text-xs uppercase tracking-wider">Soal Selanjutnya</span>
                </button>
              </div>
            </>
          )}

          {/* SELEKTOR KOTAK BLINK BOX INTERAKTIF OPERATOR */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-md">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-black uppercase tracking-wider text-white">
                  Pilih Kotak Blink Box ({session?.blink_box_count === 9 ? '9 Kotak' : '6 Kotak'}):
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Klik kotak untuk langsung membuka soal di proyektor
              </span>
            </div>

            <div
              className={`grid gap-2.5 ${
                session?.blink_box_count === 9 ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-6'
              }`}
            >
              {Array.from({ length: session?.blink_box_count === 9 ? 9 : 6 }).map((_, idx) => {
                const boxNum = idx + 1;
                const matchedQ =
                  questionsList.find((q) => q.box_number === boxNum) || questionsList[idx];
                const isActive = currentQuestion?.id === matchedQ?.id && session?.current_question_id === matchedQ?.id;

                return (
                  <button
                    key={boxNum}
                    disabled={!matchedQ}
                    onClick={() => matchedQ && handleSelectQuestion(matchedQ, true)}
                    className={`p-3 rounded-xl font-bold flex flex-col items-center justify-center transition-all ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-400'
                        : matchedQ
                        ? 'bg-slate-950 border border-slate-800 hover:border-blue-500 text-slate-200 hover:text-white'
                        : 'bg-slate-950/40 border border-slate-800 text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    <span className="text-base font-mono font-black">#{boxNum}</span>
                    <span className="text-[9px] uppercase tracking-wider truncate max-w-[80px]">
                      {matchedQ ? matchedQ.question_text.slice(0, 10) + '...' : 'Kosong'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* LIST PEMILIHAN SOAL CEPAT */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-2">
              Daftar Bank Soal Lengkap ({questionsList.length} Soal)
            </span>
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {questionsList.map((q, idx) => {
                const isActive = currentQuestion?.id === q.id && session?.current_question_id === q.id;
                return (
                  <button
                    key={q.id}
                    onClick={() => handleSelectQuestion(q, false)}
                    className={`w-full text-left p-2.5 rounded-xl text-xs font-medium flex items-center justify-between border transition-all ${
                      isActive
                        ? 'bg-blue-600/20 border-blue-500 text-white font-bold'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span className="truncate pr-2">
                      #{idx + 1}. {q.question_text}
                    </span>
                    <span className="shrink-0 uppercase text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400">
                      {q.type.replace('_', ' ')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* KOLOM KANAN (5/12): KONTROL SKOR CEPAT PER REGU */}
        <section className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col h-fit">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-wider">
                Panel Skor Cepat Regu
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleOpenAddTeam}
                className="flex items-center gap-1 px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-bold transition-all"
                title="Tambah Regu Baru"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>+ Regu</span>
              </button>
              <span className="text-xs text-slate-500 font-mono">
                {teams.length} Regu
              </span>
            </div>
          </div>

          {/* List Tim dengan Kontrol Skor Cepat */}
          <div className="space-y-3 overflow-y-auto max-h-[480px] pr-1">
            {teams.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-xs">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                Belum ada regu yang bergabung di room ini.
                <button
                  onClick={handleOpenAddTeam}
                  className="mt-3 block mx-auto px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold"
                >
                  + Daftarkan Regu Sekarang
                </button>
              </div>
            ) : (
              teams.map((t) => (
                <div
                  key={t.id}
                  className="p-3 sm:p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5 shadow-sm"
                >
                  {/* Header Tim & Skor Saat Ini */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full shrink-0 shadow"
                        style={{ backgroundColor: t.color }}
                      />
                      <span className="font-extrabold text-white text-xs sm:text-sm">
                        {t.name}
                      </span>
                      {/* Tombol Edit & Hapus Regu */}
                      <div className="flex items-center gap-0.5 ml-1">
                        <button
                          onClick={() => handleOpenEditTeam(t)}
                          className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                          title="Edit Nama / Warna / Skor Regu"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteTeam(t.id)}
                          className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
                          title="Hapus Regu"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <span
                      className={`font-mono font-black text-xl sm:text-2xl ${
                        t.score < 0 ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {t.score} <span className="text-[10px] text-slate-500 font-normal">PTS</span>
                    </span>
                  </div>

                  {/* Tombol Cepat: +100, +50, -50, -100 */}
                  <div className="grid grid-cols-4 gap-1 sm:gap-1.5">
                    <button
                      onClick={() => handleAdjustScore(t.id, 100)}
                      className="py-1 px-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-bold transition-all text-center"
                    >
                      +100
                    </button>
                    <button
                      onClick={() => handleAdjustScore(t.id, 50)}
                      className="py-1 px-1.5 bg-emerald-600/10 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-bold transition-all text-center"
                    >
                      +50
                    </button>
                    <button
                      onClick={() => handleAdjustScore(t.id, -50)}
                      className="py-1 px-1.5 bg-rose-600/10 hover:bg-rose-600/30 text-rose-400 border border-rose-500/20 rounded-lg text-xs font-bold transition-all text-center"
                    >
                      -50
                    </button>
                    <button
                      onClick={() => handleAdjustScore(t.id, -100)}
                      className="py-1 px-1.5 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold transition-all text-center"
                    >
                      -100
                    </button>
                  </div>

                  {/* Input Custom Nilai Tambah / Kurang Skor */}
                  <div className="flex items-center gap-1.5 pt-1 border-t border-slate-900">
                    <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider shrink-0">
                      Nilai Kustom:
                    </span>
                    <input
                      type="number"
                      placeholder="Contoh: 15 / -20"
                      value={customScores[t.id] ?? ''}
                      onChange={(e) =>
                        setCustomScores({ ...customScores, [t.id]: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleCustomScore(t.id);
                        }
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white placeholder-slate-600 font-mono focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={() => handleCustomScore(t.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1 ${
                        appliedTeamId === t.id
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/40 scale-105'
                          : 'bg-blue-600 hover:bg-blue-500 text-white'
                      }`}
                    >
                      {appliedTeamId === t.id ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Berhasil!</span>
                        </>
                      ) : (
                        <span>Terapkan</span>
                      )}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* FINISH MATCH TRIGGER PODIUM */}
          <div className="pt-4 mt-auto border-t border-slate-800">
            <button
              onClick={handleFinishMatch}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
            >
              <Trophy className="w-4 h-4 text-slate-950" />
              <span>Selesaikan Pertandingan & Buka Podium Juara</span>
            </button>
          </div>
        </section>
      </div>

      {/* MODAL TAMBAH / EDIT REGU */}
      {isTeamModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full relative shadow-2xl">
            <button
              onClick={() => setIsTeamModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-black text-white uppercase mb-1">
              {editingTeam ? 'Edit Data Regu' : 'Daftarkan Regu Baru'}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Konfigurasi nama, warna identitas, dan skor awal regu
            </p>

            <form onSubmit={handleSaveTeam} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  Nama Regu:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Regu A / Garuda"
                  value={teamFormName}
                  onChange={(e) => setTeamFormName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  Warna Identitas:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={teamFormColor}
                    onChange={(e) => setTeamFormColor(e.target.value)}
                    className="w-10 h-10 rounded-xl bg-transparent cursor-pointer border-0"
                  />
                  <span className="text-xs font-mono text-slate-400 uppercase">
                    {teamFormColor}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  Skor Awal (Poin):
                </label>
                <input
                  type="number"
                  value={teamFormScore}
                  onChange={(e) => setTeamFormScore(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTeamModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/30"
                >
                  Simpan Regu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
