'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createHubBrowserClient, Profile } from '@/lib/supabase-hub';
import {
  Gamepad2,
  Swords,
  Flame,
  Trophy,
  Coins,
  Heart,
  ArrowRight,
  User,
  Shield,
  Layers,
  Zap,
  Globe2,
  Crown,
  Play,
  Compass,
} from 'lucide-react';

export default function GameHubLobby() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const supabase = createHubBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();

          if (prof) {
            setProfile(prof as Profile);
          }
        }
      } catch (err) {
        console.error('Error fetching user status:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  return (
    <main className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col justify-between relative select-none">
      {/* ==================================================================== */}
      {/* TOP TACTILE HUD HEADER                                               */}
      {/* ==================================================================== */}
      <header className="w-full bg-[#111726] border-b-2 border-slate-800 px-4 py-3 sm:px-6 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 border-b-4 border-emerald-700 flex items-center justify-center text-slate-950 font-black shadow-md">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 block -mb-0.5">
                ARENA KOMPETISI
              </span>
              <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-1.5">
                GAME HUB <span className="text-slate-500 font-bold text-xs">v2.0</span>
              </h1>
            </div>
          </div>

          {/* User Stats / Auth Button */}
          {loading ? (
            <div className="h-8 w-24 bg-slate-800 rounded-xl animate-pulse" />
          ) : profile ? (
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Nyawa */}
              <div className="flex items-center gap-1 bg-[#090d16] border border-slate-700 px-2.5 py-1.5 rounded-xl text-xs font-mono font-black text-rose-400">
                <Heart className="w-3.5 h-3.5 fill-current" />
                <span>{profile.lives}</span>
              </div>

              {/* Koin */}
              <div className="flex items-center gap-1 bg-[#090d16] border border-slate-700 px-2.5 py-1.5 rounded-xl text-xs font-mono font-black text-amber-400">
                <Coins className="w-3.5 h-3.5 fill-amber-400" />
                <span>{profile.coins}</span>
              </div>

              {/* Skor & Papan Peringkat */}
              <a
                href="/path"
                className="flex items-center gap-1 bg-[#090d16] hover:bg-slate-900 border border-slate-700 hover:border-emerald-500 px-2.5 py-1.5 rounded-xl text-xs font-mono font-black text-emerald-400 transition-all"
                title="Buka Peta & Papan Peringkat"
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>{profile.total_score ?? 0}</span>
              </a>

              {/* Admin Quick Portal Badge */}
              {profile.role === 'admin' && (
                <a
                  href="/admin-hub"
                  className="hidden sm:flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-1.5 rounded-xl text-xs font-black border-b-2 border-amber-700 active:translate-y-0.5 transition-all shadow"
                >
                  <Crown className="w-3.5 h-3.5" />
                  <span>PANEL ADMIN</span>
                </a>
              )}

              {/* Profile Link */}
              <a
                href="/account"
                className="flex items-center gap-2 bg-[#1b2438] hover:bg-[#232f48] border-2 border-emerald-500 px-3 py-1.5 rounded-xl transition-all active:translate-y-0.5 shadow-sm"
              >
                <span className="text-base">{profile.avatar_url || '⚡'}</span>
                <span className="text-xs font-black text-white hidden sm:inline">
                  @{profile.username}
                </span>
              </a>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <a
                href="/login"
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition-all border-b-4 border-emerald-700 active:translate-y-1 active:border-b-0 shadow-md flex items-center gap-1.5"
              >
                <User className="w-3.5 h-3.5" />
                <span>MASUK / DAFTAR</span>
              </a>
            </div>
          )}
        </div>
      </header>

      {/* ==================================================================== */}
      {/* HERO SECTION                                                         */}
      {/* ==================================================================== */}
      <section className="max-w-4xl mx-auto w-full px-4 py-8 sm:py-12 flex flex-col items-center text-center relative z-10">
        {/* Season Pill */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#111726] border-2 border-slate-700 text-amber-400 text-xs font-black mb-6 shadow-[0_3px_0_#070a12]">
          <Trophy className="w-3.5 h-3.5 text-amber-400" />
          <span>SEASON 1: KLASEMEN NASIONAL AKTIF</span>
        </div>

        <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white max-w-2xl leading-tight">
          PILIH ARENA PERMAINAN
        </h2>
        <p className="text-slate-400 text-xs sm:text-sm max-w-lg mt-3 leading-relaxed font-medium">
          Taklukkan petualangan teka-teki silang solo dengan sistem anti-cheat dan leaderboard langsung, atau bertanding secara regu di panggung Kuis Battle.
        </p>

        {/* Admin Callout Banner (if admin) */}
        {profile?.role === 'admin' && (
          <div className="w-full mt-6 p-4 rounded-2xl bg-amber-950/40 border-2 border-amber-500/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-left shadow-[0_4px_0_#451a03]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 font-black flex items-center justify-center shrink-0 shadow">
                <Crown className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-black text-amber-300 block">AKUN ADMINISTRATOR AKTIF</span>
                <span className="text-[11px] text-slate-300">
                  Anda dapat mengonfigurasi poin, timer, generator AI soal TTS, dan reset klasemen di Panel Sultan.
                </span>
              </div>
            </div>
            <a
              href="/admin-hub"
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs border-b-4 border-amber-700 active:translate-y-0.5 active:border-b-0 whitespace-nowrap shadow"
            >
              Buka Panel Sultan →
            </a>
          </div>
        )}

        {/* ==================================================================== */}
        {/* GAME CARTRIDGES / STAGE CARDS                                        */}
        {/* ==================================================================== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full mt-8 text-left">
          {/* MODE 1: TTS ADVENTURE (SOLO + LEADERBOARD) */}
          <div className="bg-[#111726] border-2 border-slate-700 hover:border-emerald-500 rounded-3xl p-6 sm:p-7 shadow-[0_6px_0_#070a12] flex flex-col justify-between transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-slate-950 font-black flex items-center justify-center border-b-4 border-emerald-700 shadow-md">
                  <Compass className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-xl bg-emerald-950 border border-emerald-600 text-emerald-400">
                  MODE UTAMA
                </span>
              </div>

              <h3 className="text-xl font-black text-white">
                TTS ADVENTURE
              </h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Jelajahi Peta Perjalanan (The Path). Taklukkan <b>Zona Hard</b>, pertahankan combo streak, dan bersaing di <b>Live Leaderboard</b> mingguan!
              </p>

              {/* Tangible Badges */}
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                <span className="text-[11px] font-bold text-slate-200 bg-[#090d16] px-2.5 py-1 rounded-xl border border-slate-700">
                  🗺️ The Path (Level Map)
                </span>
                <span className="text-[11px] font-bold text-slate-200 bg-[#090d16] px-2.5 py-1 rounded-xl border border-slate-700">
                  ⚡ Anti-Cheat Server
                </span>
                <span className="text-[11px] font-bold text-slate-200 bg-[#090d16] px-2.5 py-1 rounded-xl border border-slate-700">
                  🏆 Klasemen Live
                </span>
              </div>
            </div>

            <button
              onClick={() => router.push('/path')}
              className="mt-8 w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider border-b-4 border-emerald-700 active:translate-y-1 active:border-b-0 transition-all flex items-center justify-center gap-2 shadow-md"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>JELAJAHI THE PATH</span>
            </button>
          </div>

          {/* MODE 2: KUIS BATTLE (MULTIPLAYER & PROYEKTOR) */}
          <div className="bg-[#111726] border-2 border-slate-700 hover:border-blue-500 rounded-3xl p-6 sm:p-7 shadow-[0_6px_0_#070a12] flex flex-col justify-between transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-500 text-slate-950 font-black flex items-center justify-center border-b-4 border-blue-700 shadow-md">
                  <Swords className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-xl bg-blue-950 border border-blue-600 text-blue-400">
                  PANGGUNG & REGU
                </span>
              </div>

              <h3 className="text-xl font-black text-white">
                KUIS BATTLE MULTIPLAYER
              </h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Mode cerdas cermat antar-regu. Dilengkapi layar operator zero-delay, animasi proyektor panggung, PIN akses, dan QR code peserta lomba.
              </p>

              {/* Tangible Badges */}
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                <span className="text-[11px] font-bold text-slate-200 bg-[#090d16] px-2.5 py-1 rounded-xl border border-slate-700">
                  📺 Layar Proyektor
                </span>
                <span className="text-[11px] font-bold text-slate-200 bg-[#090d16] px-2.5 py-1 rounded-xl border border-slate-700">
                  🎮 Kontrol Operator
                </span>
                <span className="text-[11px] font-bold text-slate-200 bg-[#090d16] px-2.5 py-1 rounded-xl border border-slate-700">
                  👥 Pertandingan Regu
                </span>
              </div>
            </div>

            <button
              onClick={() => router.push('/battle')}
              className="mt-8 w-full py-3.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-slate-950 font-black text-xs uppercase tracking-wider border-b-4 border-blue-700 active:translate-y-1 active:border-b-0 transition-all flex items-center justify-center gap-2 shadow-md"
            >
              <Gamepad2 className="w-4 h-4" />
              <span>MASUK RUANG BATTLE</span>
            </button>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* TACTILE FOOTER                                                       */}
      {/* ==================================================================== */}
      <footer className="w-full bg-[#111726] border-t-2 border-slate-800 px-4 py-4 sm:px-6 mt-12 text-xs text-slate-400">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="font-bold">© 2026 Game Hub & TTS Kompetitif.</span>
          <div className="flex items-center gap-3 font-black">
            <a href="/path" className="hover:text-emerald-400 transition-colors">
              Peta TTS
            </a>
            <span className="text-slate-600">•</span>
            <a href="/battle" className="hover:text-blue-400 transition-colors">
              Kuis Battle
            </a>
            <span className="text-slate-600">•</span>
            <a href="/battle/login" className="hover:text-slate-200 transition-colors">
              Operator PIN
            </a>
            <span className="text-slate-600">•</span>
            <a href="/admin-hub" className="text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1">
              <Crown className="w-3.5 h-3.5" />
              <span>Panel Sultan Admin</span>
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
