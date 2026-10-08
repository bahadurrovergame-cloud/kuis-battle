'use client';

import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase, GameSession, Team } from '@/lib/supabase';
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
  RotateCcw
} from 'lucide-react';

export default function AdminHubPage() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState('');

  // Deteksi baseUrl dari browser saat ini
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBaseUrl(window.location.origin);
    }
  }, []);

  // Fetch data sesi dan tim
  const fetchData = async () => {
    try {
      const { data: sData } = await supabase
        .from('game_sessions')
        .select('*')
        .limit(1)
        .single();

      if (sData) {
        setSession(sData);
        const { data: tData } = await supabase
          .from('teams')
          .select('*')
          .eq('session_id', sData.id)
          .order('score', { ascending: false });
        if (tData) setTeams(tData);
      }
    } catch {
      // Quiet fail
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Realtime subscription
  useEffect(() => {
    if (!session?.id) return;

    const channel = supabase
      .channel('admin_hub_channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_sessions', filter: `id=eq.${session.id}` },
        (payload) => {
          const updated = payload.new as GameSession;
          if (updated) setSession(updated);
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

  const copyToClipboard = (url: string, key: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(key);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const proyektorUrl = baseUrl ? `${baseUrl}/operator` : '';
  const operatorUrl = baseUrl ? `${baseUrl}/control` : '';
  const pesertaUrl = baseUrl ? `${baseUrl}/peserta` : '';

  // Reset skor semua tim
  const handleResetScores = async () => {
    if (!session) return;
    const confirmed = window.confirm('Reset semua skor regu menjadi 0 untuk babak baru?');
    if (!confirmed) return;

    await supabase.from('teams').update({ score: 0 }).eq('session_id', session.id);
    await supabase.from('game_sessions').update({ status: 'active', is_answer_revealed: false }).eq('id', session.id);
    fetchData();
  };

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
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white mt-2 uppercase">
            {session?.title || 'Kuis Battle Panggung'}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Pusat distribusi QR Code perangkat panggung & manajemen sesi perlombaan
          </p>
        </div>

        {/* Room Info & Quick Admin Nav */}
        <div className="flex items-center gap-3">
          <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-2xl text-center">
            <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-widest">
              Kode Ruangan
            </span>
            <span className="font-mono font-black text-xl text-amber-400">
              {session?.room_code || 'KUIS88'}
            </span>
          </div>

          <a
            href="/admin/soal"
            className="flex items-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl text-xs font-bold transition-all shadow-lg shadow-purple-600/30"
          >
            <BookOpen className="w-4 h-4" />
            <span>Bank Soal</span>
          </a>

          <button
            onClick={handleResetScores}
            className="p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-2xl text-slate-300 hover:text-amber-400 transition-all"
            title="Reset Skor Semua Regu"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 3 KARTU UTAMA HUB PERANGKAT (PROYEKTOR, OPERATOR, PESERTA) */}
      <section className="max-w-7xl mx-auto w-full grid grid-cols-1 md:grid-cols-3 gap-6 my-8 flex-1">
        {/* KARTU 1: LAYAR PROYEKTOR PANGGUNG */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 flex flex-col justify-between shadow-2xl relative group hover:border-cyan-500/50 transition-all">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl text-cyan-400">
                <Tv className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                Layar Penonton
              </span>
            </div>
            <h2 className="text-xl font-black text-white">Layar Proyektor</h2>
            <p className="text-xs text-slate-400 mt-1 mb-6">
              Buka di laptop panggung yang terhubung ke proyektor / TV utama panggung (F11 Fullscreen + Audio SFX).
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
              href="/operator"
              target="_blank"
              className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-cyan-600/20"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Buka Layar Proyektor (Tab Baru)</span>
            </a>
            <button
              onClick={() => copyToClipboard(proyektorUrl, 'proyektor')}
              className="w-full py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs text-slate-300 flex items-center justify-center gap-1.5 transition-all"
            >
              {copiedLink === 'proyektor' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
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
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
                Remote 1 Operator
              </span>
            </div>
            <h2 className="text-xl font-black text-white">Kontrol Operator</h2>
            <p className="text-xs text-slate-400 mt-1 mb-6">
              Buka di laptop operator teknis: Shortcut Spasi untuk jeda timer, panel skor cepat [+100/-50], & navigasi soal.
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
              href="/control"
              target="_blank"
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/20"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Buka Kontrol Operator</span>
            </a>
            <button
              onClick={() => copyToClipboard(operatorUrl, 'operator')}
              className="w-full py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs text-slate-300 flex items-center justify-center gap-1.5 transition-all"
            >
              {copiedLink === 'operator' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
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
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                Scan Smartphone Peserta
              </span>
            </div>
            <h2 className="text-xl font-black text-white">Meja HP Peserta</h2>
            <p className="text-xs text-slate-400 mt-1 mb-6">
              Pindai dengan kamera HP peserta di meja masing-masing. Layar HP otomatis menyala tanpa sleep (Wake Lock).
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
              href="/peserta"
              target="_blank"
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/20"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Simulasi Meja Peserta</span>
            </a>
            <button
              onClick={() => copyToClipboard(pesertaUrl, 'peserta')}
              className="w-full py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs text-slate-300 flex items-center justify-center gap-1.5 transition-all"
            >
              {copiedLink === 'peserta' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
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
            Regu Terdaftar di Panggung ({teams.length}):
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
          Stage Battle Realtime Hub &bull; Ready for Vercel Deploy
        </div>
      </footer>
    </main>
  );
}
