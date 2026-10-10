'use client';

import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  supabase,
  GameSession,
  Team,
  parseSessionMeta,
  buildSessionTitleWithBoxes,
} from '@/lib/supabase';
import {
  Tv,
  MonitorPlay,
  Users,
  BookOpen,
  Copy,
  Check,
  ExternalLink,
  Wifi,
  WifiOff,
  Sparkles,
  Trophy,
  ShieldCheck,
  RotateCcw,
  Plus,
  Layers,
  X,
  CheckCircle2,
  AlertCircle,
  Trash2,
} from 'lucide-react';

export default function AdminHubPage() {
  const [allSessions, setAllSessions] = useState<GameSession[]>([]);
  const [session, setSession] = useState<GameSession | null>(null);
  const [selectedRoomCode, setSelectedRoomCode] = useState<string>('KUIS88');
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsCountMap, setTeamsCountMap] = useState<Record<string, number>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(
    null
  );

  // Modal Buat Ruangan Baru
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newRoomCode, setNewRoomCode] = useState('');
  const [newRoomTitle, setNewRoomTitle] = useState('Kuis Battle Ruangan Baru');
  const [newRoomBoxCount, setNewRoomBoxCount] = useState<number>(10);
  const [autoCreateTeams, setAutoCreateTeams] = useState<boolean>(true);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

  // Deteksi baseUrl dari browser saat ini
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBaseUrl(window.location.origin);
    }
  }, []);

  // Fetch seluruh sesi ruangan & tim
  const fetchData = useCallback(async () => {
    try {
      const { data: sList } = await supabase
        .from('game_sessions')
        .select('*')
        .order('created_at', { ascending: true });

      if (sList && sList.length > 0) {
        setAllSessions(sList);

        // Ambil data tim untuk semua ruangan
        const { data: allTeamsData } = await supabase.from('teams').select('*');
        if (allTeamsData) {
          const map: Record<string, number> = {};
          allTeamsData.forEach((t) => {
            map[t.session_id] = (map[t.session_id] || 0) + 1;
          });
          setTeamsCountMap(map);
        }

        // Tentukan ruangan yang aktif dipilih
        const savedRoom =
          typeof window !== 'undefined'
            ? localStorage.getItem('active_room_code')?.toUpperCase().trim()
            : null;

        const currentActive =
          sList.find((s) => s.room_code.toUpperCase() === savedRoom) || sList[0];

        setSession(currentActive);
        setSelectedRoomCode(currentActive.room_code);

        // Ambil tim khusus untuk ruangan aktif
        const activeRoomTeams = (allTeamsData || []).filter(
          (t) => t.session_id === currentActive.id
        );
        setTeams(activeRoomTeams.sort((a, b) => b.score - a.score));
      }
    } catch {
      // Quiet fail
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscription untuk sesi ruangan yang sedang aktif
  useEffect(() => {
    if (!session?.id) return;

    const channel = supabase
      .channel(`admin_hub_channel_${session.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_sessions', filter: `id=eq.${session.id}` },
        (payload) => {
          const updated = payload.new as GameSession;
          if (updated) {
            setSession(updated);
            setAllSessions((prev) =>
              prev.map((item) => (item.id === updated.id ? updated : item))
            );
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

  // Pilih ruangan aktif
  const handleSelectRoom = async (targetSession: GameSession) => {
    setSession(targetSession);
    setSelectedRoomCode(targetSession.room_code);
    if (typeof window !== 'undefined') {
      localStorage.setItem('active_room_code', targetSession.room_code);
    }

    const { data: tData } = await supabase
      .from('teams')
      .select('*')
      .eq('session_id', targetSession.id)
      .order('score', { ascending: false });
    if (tData) setTeams(tData);

    setStatusMsg({
      text: `Ruangan aktif dialihkan ke: [ROOM: ${targetSession.room_code}] ${parseSessionMeta(targetSession).cleanTitle}`,
      type: 'success',
    });
  };

  // Buat ruangan panggung baru (Multi-Room)
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = newRoomCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!cleanCode) {
      setStatusMsg({ text: 'Kode ruangan wajib diisi (huruf & angka)', type: 'error' });
      return;
    }

    if (allSessions.some((s) => s.room_code.toUpperCase() === cleanCode)) {
      setStatusMsg({
        text: `Kode ruangan "${cleanCode}" sudah digunakan. Silakan gunakan kode lain.`,
        type: 'error',
      });
      return;
    }

    setIsCreatingRoom(true);
    try {
      const titleWithBoxes = buildSessionTitleWithBoxes(
        newRoomTitle.trim() || 'Kuis Battle Panggung',
        newRoomBoxCount
      );

      const newSessionPayload = {
        room_code: cleanCode,
        title: titleWithBoxes,
        status: 'type_select',
        is_answer_revealed: false,
        timer_remaining: 30,
        is_timer_running: false,
        current_question_id: null,
      };

      const { data: createdSession, error: sErr } = await supabase
        .from('game_sessions')
        .insert(newSessionPayload)
        .select()
        .single();

      if (sErr) throw sErr;

      // Otomatis buatkan 3 regu default jika dicentang
      if (autoCreateTeams && createdSession) {
        const defaultTeams = [
          { session_id: createdSession.id, name: 'Regu A', color: '#3b82f6', score: 0, rank: 1 },
          { session_id: createdSession.id, name: 'Regu B', color: '#10b981', score: 0, rank: 2 },
          { session_id: createdSession.id, name: 'Regu C', color: '#f59e0b', score: 0, rank: 3 },
        ];
        await supabase.from('teams').insert(defaultTeams);
      }

      setStatusMsg({
        text: `Sukses! Ruangan baru [${cleanCode}] "${newRoomTitle.trim()}" berhasil dibuat dan siap digunakan!`,
        type: 'success',
      });

      setIsCreateModalOpen(false);
      setNewRoomCode('');
      setNewRoomTitle('Kuis Battle Ruangan Baru');

      if (typeof window !== 'undefined') {
        localStorage.setItem('active_room_code', cleanCode);
      }

      await fetchData();
    } catch (err: unknown) {
      console.error('Create room error:', err);
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setStatusMsg({ text: `Gagal membuat ruangan: ${msg}`, type: 'error' });
    } finally {
      setIsCreatingRoom(false);
    }
  };

  // Hapus ruangan ekstra jika sudah tidak dipakai
  const handleDeleteRoom = async (s: GameSession) => {
    if (allSessions.length <= 1) {
      alert('Tidak dapat menghapus ruangan terakhir. Sistem membutuhkan minimal 1 ruangan.');
      return;
    }

    const { cleanTitle } = parseSessionMeta(s);
    if (
      !window.confirm(
        `Hapus ruangan "${s.room_code}" (${cleanTitle})?\nPerhatian: Seluruh data regu di ruangan ini akan ikut terhapus.`
      )
    ) {
      return;
    }

    try {
      await supabase.from('teams').delete().eq('session_id', s.id);
      await supabase.from('game_sessions').delete().eq('id', s.id);

      setStatusMsg({ text: `Ruangan "${s.room_code}" berhasil dihapus.`, type: 'success' });

      if (selectedRoomCode === s.room_code) {
        const other = allSessions.find((item) => item.id !== s.id);
        if (other && typeof window !== 'undefined') {
          localStorage.setItem('active_room_code', other.room_code);
        }
      }
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setStatusMsg({ text: `Gagal menghapus ruangan: ${msg}`, type: 'error' });
    }
  };

  const copyToClipboard = (url: string, key: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(key);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  // URL dinamis berbasis room_code yang sedang dipilih
  const currentRoomParam = session?.room_code
    ? `?room=${encodeURIComponent(session.room_code)}`
    : '';
  const proyektorUrl = baseUrl ? `${baseUrl}/operator${currentRoomParam}` : '';
  const operatorUrl = baseUrl ? `${baseUrl}/control${currentRoomParam}` : '';
  const pesertaUrl = baseUrl ? `${baseUrl}/peserta${currentRoomParam}` : '';

  // Reset skor semua tim di ruangan aktif
  const handleResetScores = async () => {
    if (!session) return;
    const confirmed = window.confirm(
      `Reset skor seluruh regu di ruangan [ROOM: ${session.room_code}] menjadi 0 untuk babak baru?`
    );
    if (!confirmed) return;

    await supabase.from('teams').update({ score: 0 }).eq('session_id', session.id);
    await supabase
      .from('game_sessions')
      .update({ status: 'active', is_answer_revealed: false })
      .eq('id', session.id);
    fetchData();
    setStatusMsg({
      text: `Skor seluruh regu di ruangan ${session.room_code} berhasil direset ke 0!`,
      type: 'success',
    });
  };

  const { cleanTitle, boxCount } = parseSessionMeta(session);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 flex flex-col justify-between">
      {/* HEADER UTAMA */}
      <header className="max-w-7xl mx-auto w-full pb-6 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Dashboard Pusat Panggung
            </span>
            <div
              className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                isConnected
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              }`}
            >
              {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span>{isConnected ? 'Realtime Aktif' : 'Menghubungkan...'}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 mt-2">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white uppercase">
              {cleanTitle}
            </h1>
            <span className="px-2.5 py-1 rounded-xl bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-mono font-bold">
              {boxCount} Kotak
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-bold">
              {allSessions.length} Ruangan Aktif
            </span>
          </div>

          <p className="text-xs text-slate-400 mt-1">
            Pusat distribusi QR Code perangkat panggung & manajemen sesi perlombaan
          </p>
        </div>

        {/* Room Info & Quick Nav */}
        <div className="flex items-center gap-3">
          <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-2xl text-center">
            <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-widest">
              Ruangan Dipilih
            </span>
            <span className="font-mono font-black text-xl text-amber-400">
              {session?.room_code || '---'}
            </span>
          </div>

          <a
            href={session?.room_code ? `/admin/soal?room=${encodeURIComponent(session.room_code)}` : '/admin/soal'}
            className="flex items-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl text-xs font-bold transition-all shadow-lg shadow-purple-600/30"
          >
            <BookOpen className="w-4 h-4" />
            <span>Bank Soal</span>
          </a>

          <button
            onClick={handleResetScores}
            className="p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-2xl text-slate-300 hover:text-amber-400 transition-all"
            title="Reset Skor Seluruh Regu di Ruangan Ini"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* NOTIFIKASI STATUS */}
      {statusMsg && (
        <div
          className={`max-w-7xl mx-auto w-full my-4 p-3 rounded-2xl flex items-center justify-between text-xs border ${
            statusMsg.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/60 border-rose-800 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            <span>{statusMsg.text}</span>
          </div>
          <button onClick={() => setStatusMsg(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* SECTION PILIH & KELOLA RUANGAN PANGGUNG (MULTI-ROOM) */}
      <section className="max-w-7xl mx-auto w-full my-6 bg-slate-900/60 border border-slate-800 p-5 rounded-3xl shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-3 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-400" />
              <h2 className="text-base font-black text-white uppercase tracking-wider">
                Pilihan Ruangan Panggung (Multi-Room)
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Jalankan kuis di beberapa kelas atau panggung berbeda secara bersamaan tanpa saling mengganggu
            </p>
          </div>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-600/20 hover:scale-105"
          >
            <Plus className="w-4 h-4" />
            <span>+ Buat Ruangan Baru</span>
          </button>
        </div>

        {/* DAFTAR KARTU RUANGAN */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {allSessions.map((s) => {
            const isCurrentActive = s.id === session?.id;
            const { cleanTitle: roomCleanTitle, boxCount: roomBoxes } = parseSessionMeta(s);
            const teamCount = teamsCountMap[s.id] || 0;

            return (
              <div
                key={s.id}
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                  isCurrentActive
                    ? 'bg-purple-950/40 border-purple-500/80 shadow-lg shadow-purple-600/20 ring-1 ring-purple-500/50'
                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-mono font-black text-xs text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded-lg border border-amber-400/30">
                      ROOM: {s.room_code}
                    </span>

                    {isCurrentActive ? (
                      <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-purple-600 text-white uppercase tracking-wider shadow">
                        ✓ Aktif Dipilih
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSelectRoom(s)}
                        className="text-[10px] font-bold text-slate-300 hover:text-white px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 hover:border-purple-500 transition-all"
                      >
                        Pilih Ruangan
                      </button>
                    )}
                  </div>

                  <h3 className="font-extrabold text-white text-sm line-clamp-1">
                    {roomCleanTitle}
                  </h3>

                  <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-400">
                    <span className="px-2 py-0.5 rounded bg-blue-950/70 text-blue-300 font-mono font-bold border border-blue-800/40">
                      {roomBoxes} Kotak
                    </span>
                    <span>&bull;</span>
                    <span className="font-semibold text-slate-300">{teamCount} Regu Terdaftar</span>
                  </div>
                </div>

                <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-1">
                    <a
                      href={`/operator?room=${encodeURIComponent(s.room_code)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="py-1 px-2.5 bg-slate-900 hover:bg-cyan-950 text-cyan-300 border border-cyan-800/40 hover:border-cyan-500 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-all flex-1"
                      title="Buka Layar Proyektor untuk ruangan ini"
                    >
                      <Tv className="w-3 h-3" />
                      <span>Proyektor</span>
                    </a>
                    <a
                      href={`/control?room=${encodeURIComponent(s.room_code)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="py-1 px-2.5 bg-slate-900 hover:bg-blue-950 text-blue-300 border border-blue-800/40 hover:border-blue-500 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-all flex-1"
                      title="Buka Kontrol Operator untuk ruangan ini"
                    >
                      <MonitorPlay className="w-3 h-3" />
                      <span>Operator</span>
                    </a>
                  </div>

                  {allSessions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteRoom(s)}
                      className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/50 transition-all"
                      title="Hapus Ruangan Ini"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3 KARTU UTAMA HUB PERANGKAT UNTUK RUANGAN YANG DIPILIH */}
      <section className="max-w-7xl mx-auto w-full grid grid-cols-1 md:grid-cols-3 gap-6 my-4 flex-1">
        {/* KARTU 1: LAYAR PROYEKTOR PANGGUNG */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 flex flex-col justify-between shadow-2xl relative group hover:border-cyan-500/50 transition-all">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl text-cyan-400">
                <Tv className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-mono">
                ROOM: {session?.room_code}
              </span>
            </div>
            <h2 className="text-xl font-black text-white">Layar Proyektor</h2>
            <p className="text-xs text-slate-400 mt-1 mb-6">
              Buka di laptop panggung yang terhubung ke proyektor / TV utama (Header bisa buka-tutup dengan tombol H).
            </p>

            {/* QR CODE PROYEKTOR */}
            <div className="bg-white p-3 rounded-2xl inline-block shadow-inner mb-4 mx-auto w-fit">
              {proyektorUrl ? <QRCodeSVG value={proyektorUrl} size={150} /> : null}
            </div>
            <span className="block text-[11px] font-mono text-slate-500 truncate">
              {proyektorUrl}
            </span>
          </div>

          <div className="space-y-2 pt-6">
            <a
              href={proyektorUrl || '/operator'}
              target="_blank"
              className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-cyan-600/20"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Buka Layar Proyektor ({session?.room_code})</span>
            </a>
            <button
              onClick={() => copyToClipboard(proyektorUrl, 'proyektor')}
              className="w-full py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs text-slate-300 flex items-center justify-center gap-1.5 transition-all"
            >
              {copiedLink === 'proyektor' ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedLink === 'proyektor' ? 'Link Tersalin!' : 'Salin URL Proyektor'}</span>
            </button>
          </div>
        </div>

        {/* KARTU 2: KONTROL OPERATOR PANGGUNG */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 flex flex-col justify-between shadow-2xl relative group hover:border-blue-500/50 transition-all">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-2xl text-blue-400">
                <MonitorPlay className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20 font-mono">
                ROOM: {session?.room_code}
              </span>
            </div>
            <h2 className="text-xl font-black text-white">Kontrol Operator</h2>
            <p className="text-xs text-slate-400 mt-1 mb-6">
              Buka di laptop operator teknis: Stepper panggung 5 tahap, kelola nilai regu, timer spasi, dan buka kotak.
            </p>

            {/* QR CODE OPERATOR */}
            <div className="bg-white p-3 rounded-2xl inline-block shadow-inner mb-4 mx-auto w-fit">
              {operatorUrl ? <QRCodeSVG value={operatorUrl} size={150} /> : null}
            </div>
            <span className="block text-[11px] font-mono text-slate-500 truncate">
              {operatorUrl}
            </span>
          </div>

          <div className="space-y-2 pt-6">
            <a
              href={operatorUrl || '/control'}
              target="_blank"
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/20"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Buka Kontrol Operator ({session?.room_code})</span>
            </a>
            <button
              onClick={() => copyToClipboard(operatorUrl, 'operator')}
              className="w-full py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs text-slate-300 flex items-center justify-center gap-1.5 transition-all"
            >
              {copiedLink === 'operator' ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedLink === 'operator' ? 'Link Tersalin!' : 'Salin URL Operator'}</span>
            </button>
          </div>
        </div>

        {/* KARTU 3: MEJA PESERTA (HP PESERTA) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 flex flex-col justify-between shadow-2xl relative group hover:border-emerald-500/50 transition-all">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400">
                <Users className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono">
                ROOM: {session?.room_code}
              </span>
            </div>
            <h2 className="text-xl font-black text-white">Meja HP Peserta</h2>
            <p className="text-xs text-slate-400 mt-1 mb-6">
              Pindai dengan kamera HP peserta di meja masing-masing. Kode ruangan otomatis terisi saat QR discan!
            </p>

            {/* QR CODE PESERTA */}
            <div className="bg-white p-3 rounded-2xl inline-block shadow-inner mb-4 mx-auto w-fit">
              {pesertaUrl ? <QRCodeSVG value={pesertaUrl} size={150} /> : null}
            </div>
            <span className="block text-[11px] font-mono text-slate-500 truncate">
              {pesertaUrl}
            </span>
          </div>

          <div className="space-y-2 pt-6">
            <a
              href={pesertaUrl || '/peserta'}
              target="_blank"
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/20"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Simulasi Meja Peserta ({session?.room_code})</span>
            </a>
            <button
              onClick={() => copyToClipboard(pesertaUrl, 'peserta')}
              className="w-full py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs text-slate-300 flex items-center justify-center gap-1.5 transition-all"
            >
              {copiedLink === 'peserta' ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedLink === 'peserta' ? 'Link Tersalin!' : 'Salin URL Peserta'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* QUICK STATUS BAR: REGISTED TEAMS OVERVIEW */}
      <footer className="max-w-7xl mx-auto w-full bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-slate-300">
            Regu di Ruangan {session?.room_code} ({teams.length}):
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {teams.length === 0 ? (
              <span className="text-xs text-slate-500 italic">Belum ada regu terhubung</span>
            ) : (
              teams.map((t) => (
                <span
                  key={t.id}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-950 border border-slate-800 flex items-center gap-1.5"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: t.color }}
                  />
                  <span>{t.name}</span>
                  <span className="font-mono text-emerald-400 font-bold ml-1">
                    {t.score} pts
                  </span>
                </span>
              ))
            )}
          </div>
        </div>

        <div className="text-xs text-slate-500 font-mono">
          Stage Battle Multi-Room Hub &bull; Ready for Vercel Deploy
        </div>
      </footer>

      {/* MODAL BUAT RUANGAN BARU */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
              <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" />
                <span>Buat Ruangan Panggung Baru</span>
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Kode Ruangan (Contoh: RUANG02, KELAS8A, FINAL01)
                </label>
                <input
                  type="text"
                  required
                  maxLength={10}
                  value={newRoomCode}
                  onChange={(e) =>
                    setNewRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))
                  }
                  placeholder="RUANG02"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-amber-400 font-mono font-black uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  autoFocus
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Huruf & angka tanpa spasi. Peserta dan operator akan terhubung lewat kode ini.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Judul Acara / Panggung
                </label>
                <input
                  type="text"
                  required
                  value={newRoomTitle}
                  onChange={(e) => setNewRoomTitle(e.target.value)}
                  placeholder="Kuis Battle Ruangan 2"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Jumlah Kotak Blink Box
                </label>
                <div className="flex items-center gap-2">
                  {[6, 8, 9, 10, 12].map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setNewRoomBoxCount(cnt)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        newRoomBoxCount === cnt
                          ? 'bg-blue-600 text-white shadow'
                          : 'bg-slate-950 border border-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      {cnt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoCreateTeams}
                    onChange={(e) => setAutoCreateTeams(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Buat 3 Regu Awal Otomatis (Regu A, Regu B, Regu C)</span>
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isCreatingRoom}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isCreatingRoom ? 'Membuat...' : 'Buat Ruangan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
