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
  Volume2
} from 'lucide-react';

export default function OperatorProjectorPage() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [joinUrl, setJoinUrl] = useState('');
  const [showQrModal, setShowQrModal] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  // Local mirror of the timer to provide smooth counting
  const [remainingTime, setRemainingTime] = useState(30);
  const prevRemainingRef = useRef<number>(30);

  // Set Join URL from browser origin (LAN IP laptop)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}/peserta`;
      setJoinUrl(url);
    }
  }, []);

  // Fetch initial session & teams data
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

        // Fetch question
        if (sessionData.current_question_id) {
          const { data: qData } = await supabase
            .from('questions')
            .select('*')
            .eq('id', sessionData.current_question_id)
            .single();
          if (qData) setCurrentQuestion(qData);
        }

        // Fetch teams
        const { data: teamsData } = await supabase
          .from('teams')
          .select('*')
          .eq('session_id', sessionData.id);
        if (teamsData) setTeams(teamsData);
      }
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
                if (qData) setCurrentQuestion(qData);
              } else {
                setCurrentQuestion(null);
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

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col p-6 select-none overflow-hidden relative">
      {/* Background glow effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* TOP BAR: Room info, Controls & Live Status */}
      <header className="flex items-center justify-between pb-4 border-b border-slate-800/80 z-10">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-blue-600/20 border border-blue-500/30 rounded-2xl text-blue-400">
            <Tv className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-wide text-white uppercase">
              {session?.title || 'Kuis Battle Panggung'}
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
          {/* Unlock Audio Button for browser auto-play policy */}
          {!audioUnlocked && (
            <button
              onClick={unlockAudio}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold hover:bg-amber-500/30 transition-all"
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

      {/* MAIN ARENA: 2-Column Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 pt-6 z-10 min-h-0">
        {/* Kolom Kiri (3/4 Lebar): Timer & Pertanyaan */}
        <section className="lg:col-span-3 flex flex-col justify-between space-y-6">
          {/* Header Soal & Countdown */}
          <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 rounded-3xl p-6 backdrop-blur-md">
            <div>
              <span className="text-xs uppercase font-extrabold tracking-widest text-slate-400">
                Panggung Perlombaan
              </span>
              <h2 className="text-2xl font-black text-white mt-1">
                {currentQuestion ? 'Pertanyaan Aktif' : 'Persiapan Babak'}
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
          />
        </section>

        {/* Kolom Kanan (1/4 Lebar): Live Leaderboard */}
        <section className="lg:col-span-1 h-full min-h-[400px]">
          <Leaderboard teams={teams} />
        </section>
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
