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
  X
} from 'lucide-react';

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

  // Team management modal states
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [teamFormName, setTeamFormName] = useState('');
  const [teamFormColor, setTeamFormColor] = useState('#3b82f6');
  const [teamFormScore, setTeamFormScore] = useState<number>(0);

  // Live timer countdown state
  const [remainingTime, setRemainingTime] = useState<number>(30);

  // Auth gate check
  useEffect(() => {
    const role = sessionStorage.getItem('auth_role');
    if (!role) {
      router.push('/login');
    }
  }, [router]);

  // Load initial data
  const loadData = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase
        .from('game_sessions')
        .select('*')
        .limit(1)
        .single();

      if (sessionData) {
        setSession(sessionData);
        setRemainingTime(sessionData.timer_remaining);

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
        } else if (qList && qList.length > 0) {
          setCurrentQuestion(qList[0]);
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
  }, [loadData]);

  // Realtime subscription
  useEffect(() => {
    if (!session?.id) return;

    const channel = supabase
      .channel('operator_control_channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_sessions', filter: `id=eq.${session.id}` },
        (payload) => {
          const updated = payload.new as GameSession;
          if (updated) {
            setSession(updated);
            setRemainingTime(updated.timer_remaining);
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
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.id]);

  // Realtime timer countdown effect in control dashboard
  useEffect(() => {
    if (!session?.is_timer_running || remainingTime <= 0) return;

    const interval = setInterval(() => {
      setRemainingTime((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [session?.is_timer_running, remainingTime]);

  // Handle timer toggle (Play/Pause)
  const toggleTimer = async () => {
    if (!session) return;
    const nextState = !session.is_timer_running;
    setSession({ ...session, is_timer_running: nextState });

    await supabase
      .from('game_sessions')
      .update({ is_timer_running: nextState, status: nextState ? 'active' : 'paused' })
      .eq('id', session.id);
  };

  // Reset timer to current question duration
  const resetTimer = async () => {
    if (!session || !currentQuestion) return;
    const dur = currentQuestion.timer_duration || 30;
    setSession({ ...session, timer_remaining: dur, is_timer_running: false });

    await supabase
      .from('game_sessions')
      .update({ timer_remaining: dur, is_timer_running: false })
      .eq('id', session.id);
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

  // Next Question
  const handleSelectQuestion = async (q: Question) => {
    if (!session) return;
    setLoadingAction(true);
    setCurrentQuestion(q);

    await supabase
      .from('game_sessions')
      .update({
        current_question_id: q.id,
        is_answer_revealed: false,
        timer_remaining: q.timer_duration || 30,
        is_timer_running: false,
        status: 'active',
      })
      .eq('id', session.id);

    setLoadingAction(false);
  };

  const handleNextQuestion = async () => {
    if (!questionsList.length || !currentQuestion) return;
    const currentIndex = questionsList.findIndex((q) => q.id === currentQuestion.id);
    const nextIndex = (currentIndex + 1) % questionsList.length;
    handleSelectQuestion(questionsList[nextIndex]);
  };

  // Finish Match (Trigger victory podium)
  const handleFinishMatch = async () => {
    if (!session) return;
    const confirmed = window.confirm('Apakah Anda yakin ingin menyelesaikan pertandingan & menampilkan Podium Juara?');
    if (!confirmed) return;

    await supabase
      .from('game_sessions')
      .update({ status: 'finished', is_timer_running: false })
      .eq('id', session.id);
  };

  // Quick Score Adjustment
  const handleAdjustScore = async (teamId: string, delta: number) => {
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;

    const newScore = team.score + delta;
    setTeams(teams.map((t) => (t.id === teamId ? { ...t, score: newScore } : t)));

    await supabase
      .from('teams')
      .update({ score: newScore })
      .eq('id', teamId);
  };

  // Custom Score Add
  const handleCustomScore = async (teamId: string) => {
    const val = parseInt(customScores[teamId] || '0', 10);
    if (isNaN(val) || val === 0) return;

    handleAdjustScore(teamId, val);
    setCustomScores((prev) => ({ ...prev, [teamId]: '' }));
  };

  // Team Management Handlers
  const handleOpenAddTeam = () => {
    setEditingTeam(null);
    setTeamFormName('');
    setTeamFormColor('#3b82f6');
    setTeamFormScore(0);
    setIsTeamModalOpen(true);
  };

  const handleOpenEditTeam = (team: Team) => {
    setEditingTeam(team);
    setTeamFormName(team.name);
    setTeamFormColor(team.color || '#3b82f6');
    setTeamFormScore(team.score);
    setIsTeamModalOpen(true);
  };

  const handleDeleteTeam = async (teamId: string) => {
    if (!window.confirm('Hapus regu ini dari pertandingan?')) return;
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
      // Don't trigger if user is currently typing in an input
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
  }, [session?.is_timer_running, session?.id]);

  const handleLogout = () => {
    sessionStorage.clear();
    router.push('/login');
  };

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

      {/* SHORTCUT SPACEBAR BANNER */}
      <div className="my-4 bg-blue-950/40 border border-blue-800/60 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-blue-300">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
          <span>
            Shortcut Cepat: Tekan tombol <strong>[SPACEBAR / SPASI]</strong> pada keyboard untuk Pause / Resume timer saat peserta berbicara!
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
          {/* KOTAK SOAL AKTIF & KUNCI CONTEKAN */}
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
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
            >
              <Eye className="w-6 h-6" />
              <span className="text-xs uppercase tracking-wider">
                {session?.is_answer_revealed ? 'Sembunyikan Kunci' : 'Buka Kunci'}
              </span>
            </button>

            {/* Soal Selanjutnya */}
            <button
              onClick={handleNextQuestion}
              disabled={loadingAction}
              className="p-4 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold flex flex-col items-center justify-center gap-1.5 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50"
            >
              <SkipForward className="w-6 h-6" />
              <span className="text-xs uppercase tracking-wider">Soal Selanjutnya</span>
            </button>
          </div>

          {/* LIST PEMILIHAN SOAL CEPAT */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-2">
              Daftar Bank Soal ({questionsList.length} Soal)
            </span>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {questionsList.map((q, idx) => {
                const isActive = currentQuestion?.id === q.id;
                return (
                  <button
                    key={q.id}
                    onClick={() => handleSelectQuestion(q)}
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
        <section className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-black text-white uppercase tracking-wider">
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
            <div className="space-y-4 max-h-[460px] overflow-y-auto pr-1">
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
                    className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3"
                  >
                    {/* Header Tim & Skor Saat Ini */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 shadow"
                          style={{ backgroundColor: t.color }}
                        />
                        <span className="font-extrabold text-white text-sm">
                          {t.name}
                        </span>
                        {/* Tombol Edit & Hapus Regu */}
                        <div className="flex items-center gap-1 ml-1">
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
                        className={`font-mono font-black text-2xl ${
                          t.score < 0 ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        {t.score} <span className="text-xs text-slate-500 font-normal">PTS</span>
                      </span>
                    </div>

                    {/* Tombol Cepat: +100, +50, -50, -100 */}
                    <div className="grid grid-cols-4 gap-1.5">
                      <button
                        onClick={() => handleAdjustScore(t.id, 100)}
                        className="py-1.5 px-2 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-bold transition-all"
                      >
                        +100
                      </button>
                      <button
                        onClick={() => handleAdjustScore(t.id, 50)}
                        className="py-1.5 px-2 bg-emerald-600/10 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-bold transition-all"
                      >
                        +50
                      </button>
                      <button
                        onClick={() => handleAdjustScore(t.id, -50)}
                        className="py-1.5 px-2 bg-rose-600/10 hover:bg-rose-600/30 text-rose-400 border border-rose-500/20 rounded-lg text-xs font-bold transition-all"
                      >
                        -50
                      </button>
                      <button
                        onClick={() => handleAdjustScore(t.id, -100)}
                        className="py-1.5 px-2 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold transition-all"
                      >
                        -100
                      </button>
                    </div>

                    {/* Input Custom Nilai */}
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="number"
                        placeholder="Nilai custom (+/-)"
                        value={customScores[t.id] || ''}
                        onChange={(e) =>
                          setCustomScores({ ...customScores, [t.id]: e.target.value })
                        }
                        className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                      />
                      <button
                        onClick={() => handleCustomScore(t.id)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all"
                      >
                        Terapkan
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* TOMBOL SELESAIKAN PERTANDINGAN */}
          <div className="pt-4 border-t border-slate-800 mt-4">
            <button
              onClick={handleFinishMatch}
              className="w-full py-3.5 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-slate-950 font-black rounded-xl text-xs uppercase tracking-widest transition-all shadow-lg shadow-amber-600/20 flex items-center justify-center gap-2"
            >
              <Trophy className="w-4 h-4 text-slate-950" />
              Selesaikan Pertandingan & Tampilkan Juara
            </button>
          </div>
        </section>
      </div>

      {/* MODAL TAMBAH / EDIT REGU */}
      {isTeamModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
              <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-400" />
                {editingTeam ? 'Edit Data Regu' : 'Tambah Regu Baru'}
              </h3>
              <button
                onClick={() => setIsTeamModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTeam} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Nama Regu
                </label>
                <input
                  type="text"
                  required
                  value={teamFormName}
                  onChange={(e) => setTeamFormName(e.target.value)}
                  placeholder="Contoh: Regu Cendrawasih"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Warna Identitas Regu
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={teamFormColor}
                    onChange={(e) => setTeamFormColor(e.target.value)}
                    className="w-12 h-10 bg-transparent rounded-lg cursor-pointer border border-slate-700 p-0.5"
                  />
                  <input
                    type="text"
                    value={teamFormColor}
                    onChange={(e) => setTeamFormColor(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Skor Awal / Saat Ini (Bisa Negatif)
                </label>
                <input
                  type="number"
                  value={teamFormScore}
                  onChange={(e) => setTeamFormScore(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsTeamModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30"
                >
                  {editingTeam ? 'Simpan Perubahan' : 'Tambahkan Regu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
