'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createHubBrowserClient, Profile } from '@/lib/supabase-hub';
import { ShieldAlert, LogOut, ArrowRight, CheckCircle2, RefreshCw } from 'lucide-react';

export default function BannedPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const supabase = createHubBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.replace('/login');
          return;
        }

        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (prof) {
          setProfile(prof as Profile);
          // Jika akun sudah tidak dibanned (misal sudah dibuka oleh Admin), arahkan kembali ke peta
          if (!prof.is_banned) {
            router.replace('/path');
          }
        }
      } catch (err) {
        console.error('Error checking ban status:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [router]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      const supabase = createHubBrowserClient();
      await supabase.auth.signOut();
      router.replace('/login');
    } catch {
      router.replace('/login');
    }
  };

  const handleRecheck = async () => {
    setLoading(true);
    try {
      const supabase = createHubBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/login');
        return;
      }

      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (prof) {
        setProfile(prof as Profile);
        if (!prof.is_banned) {
          router.replace('/path');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-400 gap-3">
        <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 animate-spin">
          <RefreshCw className="w-5 h-5" />
        </div>
        <span className="text-xs font-mono font-bold tracking-wider">Memeriksa Status Akun...</span>
      </main>
    );
  }

  // Jika akun ternyata bersih / sudah di-unban oleh Admin
  if (profile && !profile.is_banned) {
    return (
      <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
        <div className="w-full max-w-md bg-[#111726] border-2 border-emerald-500 rounded-3xl p-6 shadow-2xl animate-in zoom-in-95">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-white">Blokir Telah Dibuka!</h2>
          <p className="text-xs text-slate-300 mt-2 leading-relaxed">
            Administrator telah membuka blokir akun Anda. Skor dan level Anda telah di-reset ke Level 1.
          </p>
          <button
            onClick={() => router.replace('/path')}
            className="w-full mt-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition-all shadow flex items-center justify-center gap-2"
          >
            <span>Masuk ke The Path</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 relative select-none">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-rose-950/30 via-slate-950 to-slate-950 pointer-events-none" />

      <div className="w-full max-w-md bg-[#0f1422] border-2 border-rose-600/80 rounded-3xl p-6 shadow-2xl relative z-10 text-center animate-in zoom-in-95">
        {/* Pulsing Warning Icon */}
        <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-rose-950/80 border-2 border-rose-500 flex items-center justify-center text-rose-400 shadow-lg shadow-rose-950/60 animate-pulse">
          <ShieldAlert className="w-10 h-10" />
        </div>

        {/* Status Badge */}
        <span className="inline-block px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-[10px] font-mono font-black uppercase tracking-wider text-rose-400 mb-2">
          Status: BANNED / DIBLOKIR
        </span>

        <h1 className="text-2xl font-black text-white tracking-tight">
          Akses Bermain Dibekukan
        </h1>

        <p className="text-xs text-slate-300 mt-2.5 leading-relaxed">
          Akun Anda telah dinonaktifkan oleh sistem <b>Anti-Cheat Kuis Battle</b> karena terdeteksi melakukan pelanggaran sportivitas bermain.
        </p>

        {/* Detail Box */}
        <div className="w-full bg-slate-950/80 border border-rose-900/60 rounded-2xl p-4 mt-5 text-left text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-[11px]">
            <span className="text-slate-400 font-bold">Pemain:</span>
            <span className="font-mono font-black text-white">@{profile?.username || 'Pemain'}</span>
          </div>

          <div className="py-2 border-b border-slate-800">
            <span className="text-slate-400 text-[11px] font-bold block mb-1">Alasan Pemblokiran:</span>
            <span className="text-rose-300 font-medium leading-snug block bg-rose-950/40 p-2 rounded-lg border border-rose-900/50">
              {profile?.banned_reason || 'Terdeteksi berpindah tab / layar sebanyak 3 kali saat game berlangsung.'}
            </span>
          </div>

          <div className="pt-2 text-[11px] text-slate-400">
            <span className="block font-bold text-slate-300 mb-1">Konsekuensi:</span>
            <ul className="list-disc list-inside space-y-0.5 text-slate-400">
              <li>Akses ke level TTS dan Battle dinonaktifkan.</li>
              <li>Skor dan peringkat telah dikeluarkan dari klasemen.</li>
            </ul>
          </div>
        </div>

        {/* Info Kontak Admin */}
        <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
          Jika Anda merasa pemblokiran ini adalah kekeliruan teknis, silakan hubungi <b>Administrator</b> untuk peninjauan dan pembukaan blokir akun.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5 mt-6">
          <button
            type="button"
            onClick={handleRecheck}
            className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-black text-xs transition-all border-b-2 border-slate-950 active:translate-y-0.5 flex items-center justify-center gap-2 shadow"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Cek Ulang Status Blokir</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs transition-all active:translate-y-0.5 shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{loggingOut ? 'Mengeluarkan Akun...' : 'Keluar Akun (Logout)'}</span>
          </button>
        </div>
      </div>
    </main>
  );
}

