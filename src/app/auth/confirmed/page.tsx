'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ShieldAlert, ArrowRight, Gamepad2, Sparkles, Trophy, Heart } from 'lucide-react';
import { createHubBrowserClient } from '@/lib/supabase-hub';

export default function EmailConfirmedPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    const checkUser = async () => {
      try {
        const supabase = createHubBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          setIsAuthenticated(true);
          const { data: prof } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', user.id)
            .maybeSingle();

          if (prof?.username) {
            setUsername(prof.username);
          }
        }
      } catch (err) {
        console.error('Error checking user session:', err);
      }
    };

    checkUser();
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/90 border-2 border-emerald-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative z-10 animate-in zoom-in-95 duration-300">
        {/* Verification Success Badge */}
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-4">
            <div className="w-20 h-20 rounded-2xl bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-slate-950 text-xs font-black shadow">
              <Sparkles className="w-4 h-4 fill-current" />
            </div>
          </div>

          <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-950/80 px-3 py-1 rounded-full border border-emerald-800/80 mb-2">
            Status Akun: Terverifikasi
          </span>

          <h1 className="text-2xl font-black text-white tracking-tight">
            Email Berhasil Dikonfirmasi!
          </h1>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
            {username ? `Halo, @${username}! ` : ''}Selamat datang di petualangan teka-teki silang{' '}
            <b className="text-emerald-400">Kuis TTS: The Path</b>.
          </p>
        </div>

        {/* Anti-Cheat & Fairplay Warning Card */}
        <div className="mt-6 p-4 rounded-2xl bg-rose-950/40 border-2 border-rose-500/40 text-left relative overflow-hidden">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/50 flex items-center justify-center text-rose-400 shrink-0 mt-0.5">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xs font-black text-rose-300 uppercase tracking-wider">
                Peringatan Integritas & Fairplay
              </h2>
              <p className="text-xs text-rose-200/90 mt-1 leading-relaxed">
                Selamat bermain! <b>Mainlah dengan jujur</b>. Sistem Anti-Cheat kami aktif memantau
                aktivitas selama kuis berlangsung.
              </p>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-rose-500/20 text-[11px] text-rose-300/80 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              <span>Dilarang berpindah tab / keluar layar untuk mencontek AI.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              <span>Dilarang menggunakan bot atau injeksi script penembak skor.</span>
            </div>
            <div className="flex items-center gap-2 text-rose-400 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              <span>Jika tidak jujur, akun, email, & skor Anda akan dimusnahkan seketika!</span>
            </div>
          </div>
        </div>

        {/* Starter Benefits Info */}
        <div className="grid grid-cols-2 gap-2 mt-4 text-center">
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-bold flex items-center justify-center gap-1">
              <Heart className="w-3 h-3 fill-rose-500 text-rose-500" /> Nyawa Awal
            </span>
            <span className="text-sm font-black text-rose-400 mt-0.5 block">5 / 5 Hati</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-bold flex items-center justify-center gap-1">
              <Trophy className="w-3 h-3 text-amber-400" /> Bonus Modal
            </span>
            <span className="text-sm font-black text-amber-400 mt-0.5 block">50 Koin 🪙</span>
          </div>
        </div>

        {/* Action Button: Lanjut Bermain */}
        <div className="mt-6">
          <Link
            href={isAuthenticated ? '/path' : '/login'}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm tracking-wide shadow-xl shadow-emerald-600/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 border-b-4 border-emerald-800 active:border-b-0"
          >
            <Gamepad2 className="w-5 h-5" />
            <span>{isAuthenticated ? 'Lanjut Bermain Sekarang' : 'Masuk ke Game (Login)'}</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </div>
      </div>
    </main>
  );
}

