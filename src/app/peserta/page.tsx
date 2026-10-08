'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase, Team, GameSession } from '@/lib/supabase';
import { useWakeLock } from '@/hooks/useWakeLock';
import { 
  Trophy, 
  Wifi, 
  WifiOff, 
  Sun, 
  LogOut, 
  Users, 
  Sparkles, 
  ArrowRight,
  TrendingUp,
  RefreshCw
} from 'lucide-react';

export default function PesertaPage() {
  const { isLocked, requestWakeLock } = useWakeLock();

  // Registration / Join states
  const [joined, setJoined] = useState(false);
  const [roomCode, setRoomCode] = useState('KUIS88');
  const [teamName, setTeamName] = useState('');
  const [availableTeams, setAvailableTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('new');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Active game states
  const [session, setSession] = useState<GameSession | null>(null);
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [scoreFlash, setScoreFlash] = useState<'increase' | 'decrease' | null>(null);
  const prevScoreRef = useRef<number | null>(null);

  // Auto-restore session from localStorage on mount
  useEffect(() => {
    const savedRoom = localStorage.getItem('peserta_room');
    const savedTeamId = localStorage.getItem('peserta_team_id');

    if (savedRoom && savedTeamId) {
      setRoomCode(savedRoom);
      restoreTeam(savedRoom, savedTeamId);
    }
  }, []);

  // Fetch teams when room code is typed
  const fetchRoomTeams = async (code: string) => {
    if (!code) return;
    try {
      const { data: sessionData } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('room_code', code.toUpperCase().trim())
        .single();

      if (sessionData) {
        setSession(sessionData);
        const { data: teamsData } = await supabase
          .from('teams')
          .select('*')
          .eq('session_id', sessionData.id)
          .order('name');
        if (teamsData) setAvailableTeams(teamsData);
      } else {
        setAvailableTeams([]);
      }
    } catch {
      // Quiet fail on typing
    }
  };

  useEffect(() => {
    if (!joined && roomCode.length >= 4) {
      fetchRoomTeams(roomCode);
    }
  }, [roomCode, joined]);

  // Realtime subscription for available teams in Join screen
  useEffect(() => {
    if (joined || !session?.id) return;

    const channel = supabase
      .channel(`available_teams_${session.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'teams', filter: `session_id=eq.${session.id}` },
        async () => {
          const { data: teamsData } = await supabase
            .from('teams')
            .select('*')
            .eq('session_id', session.id)
            .order('name');
          if (teamsData) setAvailableTeams(teamsData);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [joined, session?.id]);

  const restoreTeam = async (room: string, teamId: string) => {
    try {
      const { data: sessionData } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('room_code', room.toUpperCase().trim())
        .single();

      if (!sessionData) return;
      setSession(sessionData);

      const { data: teamData } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .single();

      if (teamData) {
        setCurrentTeam(teamData);
        prevScoreRef.current = teamData.score;
        setJoined(true);
      }
    } catch {
      localStorage.removeItem('peserta_team_id');
    }
  };

  // Join or Create team
  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      // 1. Cari session
      const { data: sessionData, error: sessionErr } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('room_code', roomCode.toUpperCase().trim())
        .single();

      if (sessionErr || !sessionData) {
        setErrorMsg('Room Code tidak ditemukan!');
        setLoading(false);
        return;
      }

      setSession(sessionData);

      let targetTeam: Team | null = null;

      // 2. Pilih tim yang sudah ada atau buat tim baru
      if (selectedTeamId !== 'new') {
        const found = availableTeams.find((t) => t.id === selectedTeamId);
        if (found) targetTeam = found;
      } else {
        if (!teamName.trim()) {
          setErrorMsg('Masukkan nama regu!');
          setLoading(false);
          return;
        }

        const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];

        const { data: newTeam, error: createErr } = await supabase
          .from('teams')
          .insert({
            session_id: sessionData.id,
            name: teamName.trim(),
            color: randomColor,
            score: 0,
            rank: 1,
          })
          .select()
          .single();

        if (createErr) {
          setErrorMsg('Gagal mendaftarkan regu (mungkin nama sudah ada)');
          setLoading(false);
          return;
        }
        targetTeam = newTeam;
      }

      if (targetTeam) {
        setCurrentTeam(targetTeam);
        prevScoreRef.current = targetTeam.score;
        setJoined(true);
        localStorage.setItem('peserta_room', roomCode.toUpperCase().trim());
        localStorage.setItem('peserta_team_id', targetTeam.id);
        requestWakeLock();
      }
    } catch (err: unknown) {
      console.error('Join error:', err);
      const message = err instanceof Error ? err.message : JSON.stringify(err);
      setErrorMsg(`Gagal terhubung: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  // Realtime subscription for team updates and ranks
  useEffect(() => {
    if (!joined || !currentTeam || !session) return;

    setIsConnected(true);

    const channel = supabase
      .channel(`team_live_${currentTeam.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'teams',
          filter: `session_id=eq.${session.id}`,
        },
        async (payload) => {
          // Check if payload updated our team or another team
          const updatedRow = payload.new as Team;

          // Re-fetch all teams to recalculate relative rank & my score
          const { data: allTeams } = await supabase
            .from('teams')
            .select('*')
            .eq('session_id', session.id)
            .order('score', { ascending: false });

          if (allTeams) {
            const myIndex = allTeams.findIndex((t) => t.id === currentTeam.id);
            const myUpdated = allTeams.find((t) => t.id === currentTeam.id);

            if (myUpdated) {
              // Only trigger score flash if OUR team score actually changed
              if (
                updatedRow &&
                updatedRow.id === currentTeam.id &&
                prevScoreRef.current !== null &&
                myUpdated.score !== prevScoreRef.current
              ) {
                if (myUpdated.score > prevScoreRef.current) {
                  setScoreFlash('increase');
                } else {
                  setScoreFlash('decrease');
                }
                setTimeout(() => setScoreFlash(null), 1200);
              }

              prevScoreRef.current = myUpdated.score;
              setCurrentTeam({
                ...myUpdated,
                rank: myIndex !== -1 ? myIndex + 1 : myUpdated.rank,
              });
            }
          }
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [joined, currentTeam?.id, session?.id]);

  const handleLeave = () => {
    localStorage.removeItem('peserta_room');
    localStorage.removeItem('peserta_team_id');
    setJoined(false);
    setCurrentTeam(null);
  };

  // VIEW 1: JOIN FORM JIKA BELUM TERDAFTAR
  if (!joined) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center text-emerald-400">
              <Users className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white uppercase">Meja Peserta</h1>
            <p className="text-xs text-slate-400 mt-1">Sambungkan layar smartphone ke panggung lomba</p>
          </div>

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Kode Ruangan (Room Code)
              </label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="CONTOH: KUIS88"
                className="w-full text-center uppercase tracking-widest text-xl font-bold bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>

            {availableTeams.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Pilih Regu Terdaftar
                </label>
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="new">+ Daftarkan Regu Baru</option>
                  {availableTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.members ? `(${t.members})` : `(Skor: ${t.score})`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedTeamId === 'new' && (
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Nama Regu Baru
                </label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Contoh: Regu Rajawali"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required={selectedTeamId === 'new'}
                />
              </div>
            )}

            {errorMsg && (
              <p className="text-xs text-red-400 bg-red-950/50 border border-red-800/60 p-3 rounded-xl text-center">
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !roomCode}
              className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
            >
              <ArrowRight className="w-5 h-5" />
              {loading ? 'Menghubungkan...' : 'Masuk Meja Perlombaan'}
            </button>
          </form>
        </div>
      </main>
    );
  }

  // VIEW 2: PERSONAL LIVE SCOREBOARD (WAKE LOCK AKTIF)
  return (
    <main
      className={`min-h-screen flex flex-col justify-between p-6 select-none transition-colors duration-500 ${
        scoreFlash === 'increase'
          ? 'bg-emerald-950 text-white'
          : scoreFlash === 'decrease'
          ? 'bg-red-950 text-white'
          : 'bg-slate-950 text-slate-100'
      }`}
    >
      {/* Top Header: Nama Regu & Status Dot */}
      <header className="flex items-center justify-between border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-4 h-4 rounded-full shadow-md"
            style={{ backgroundColor: currentTeam?.color || '#3b82f6' }}
          />
          <div>
            <h2 className="text-xl font-black tracking-wide text-white uppercase">
              {currentTeam?.name}
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 font-mono tracking-wider">
                ROOM: {roomCode}
              </span>
              {currentTeam?.members && (
                <span className="text-[10px] text-slate-400 font-medium truncate max-w-[150px]">
                  &bull; {currentTeam.members}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Wake Lock Status Badge */}
          <div
            onClick={requestWakeLock}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border cursor-pointer ${
              isLocked
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
            title="Screen Wake Lock Status"
          >
            <Sun className="w-3.5 h-3.5" />
            <span>{isLocked ? 'Layar Terjaga' : 'Ketuk Jaga Layar'}</span>
          </div>

          {/* Connection Dot */}
          <div
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
              isConnected
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}
          >
            {isConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isConnected ? 'Live' : 'Terputus'}</span>
          </div>
        </div>
      </header>

      {/* Middle Section: Giant Score Display */}
      <section className="flex-1 flex flex-col items-center justify-center my-6 text-center">
        <span className="text-xs uppercase tracking-[0.3em] text-slate-400 font-semibold mb-2">
          Akumulasi Poin
        </span>

        {/* Skor Raksasa */}
        <div className="relative">
          <h1
            className={`text-8xl sm:text-9xl font-black font-mono tracking-tighter transition-transform duration-300 ${
              scoreFlash ? 'scale-110' : 'scale-100'
            }`}
            style={{ color: currentTeam?.color || '#ffffff' }}
          >
            {currentTeam?.score ?? 0}
          </h1>

          {scoreFlash === 'increase' && (
            <span className="absolute -top-6 right-0 text-2xl font-black text-emerald-400 flex items-center gap-1 animate-bounce">
              <Sparkles className="w-6 h-6" /> UP!
            </span>
          )}
          {scoreFlash === 'decrease' && (
            <span className="absolute -top-6 right-0 text-2xl font-black text-rose-400 flex items-center gap-1 animate-bounce">
              DOWN!
            </span>
          )}
        </div>

        {/* Peringkat Sementara */}
        <div className="mt-8 flex items-center gap-2 bg-slate-900 border border-slate-800 px-6 py-3 rounded-2xl shadow-inner">
          <Trophy className="w-5 h-5 text-amber-400" />
          <span className="text-sm font-medium text-slate-300">Peringkat Sementara:</span>
          <span className="text-lg font-black text-white ml-1">
            #{currentTeam?.rank ?? 1}
          </span>
        </div>
      </section>

      {/* Bottom Footer: Info Pasif & Tombol Keluar */}
      <footer className="pt-4 border-t border-slate-900 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-slate-400" />
          <span>Fokus pada mikrofon & layar proyektor</span>
        </div>

        <button
          onClick={handleLeave}
          className="flex items-center gap-1 text-slate-500 hover:text-rose-400 transition-colors py-1 px-2"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Keluar</span>
        </button>
      </footer>
    </main>
  );
}
