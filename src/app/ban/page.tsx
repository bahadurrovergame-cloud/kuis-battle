'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createHubBrowserClient, Profile } from '@/lib/supabase-hub';
import { ShieldAlert, LogOut, RefreshCw } from 'lucide-react';

export default function BanPage() {
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
        }
      } catch (err) {
        console.error('Error fetching ban details:', err);
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

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 relative select-none">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-rose-950/40 via-slate-950 to-slate-950 pointer-events-none" />

      <div className="w-full max-w-md bg-[#0f1422] border-2 border-rose-600/90 rounded-3xl p-6 shadow-2xl relative z-10 text-center animate-in zoom-in-95">
        {/* Pulsing Warning Icon */}
        <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-rose-950/90 border-2 border-rose-500 flex items-center justify-center text-rose-400 shadow-xl shadow-rose-950/80 animate-pulse">
          <ShieldAlert className="w-10 h-10" />
        </div>

        {/* Status Badge */}
        <span className="inline-block px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/50 text-[10px] font-mono font-black uppercase tracking-wider text-rose-400 mb-2">
          STATUS: BANNED / DIBEKUKAN PERMANEN
        </span>

        <h1 className="text-2xl font-black text-white tracking-tight">
          Akses Akun Dibekukan
        </h1>

        <p className="text-xs text-slate-300 mt-2.5 leading-relaxed">
          Akun Anda telah dinonaktifkan secara permanen oleh sistem <b>Anti-Cheat Kuis Battle</b> karena terdeteksi melakukan pelanggaran integritas bermain.
        </p>

        {/* Detail Pelanggaran */}
        <div className="w-full bg-slate-950/90 border border-rose-900/70 rounded-2xl p-4 mt-5 text-left text-xs space-y-2.5">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-[11px]">
            <span className="text-slate-400 font-bold">Pemain:</span>
            <span className="font-mono font-black text-white">@{profile?.username || 'Pemain'}</span>
          </div>

          <div className="pb-2 border-b border-slate-800 text-[11px]">
            <span className="text-slate-400 font-bold block mb-1">Alasan Pemblokiran:</span>
            <span className="text-rose-300 font-medium leading-snug block bg-rose-950/50 p-2 rounded-lg border border-rose-900/60 font-mono text-[11px]">
              {profile?.banned_reason || 'Terdeteksi berpindah tab / layar sebanyak 3 kali saat game berlangsung.'}
            </span>
          </div>

          <div className="text-[11px] text-slate-400">
            <span className="block font-bold text-slate-300 mb-1">Sanksi yang Diterapkan:</span>
            <ul className="list-disc list-inside space-y-0.5 text-slate-400">
              <li>Akses ke The Path, Level TTS, dan Battle ditutup total.</li>
              <li>Poin telah di-reset menjadi 0 dan dikeluarkan dari klasemen.</li>
              <li>Riwayat pelanggaran telah dicatat secara permanen di database.</li>
            </ul>
          </div>
        </div>

        {/* Catatan Admin */}
        <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
          Jika Anda merasa pemblokiran ini merupakan kesalahan teknis sistem, silakan hubungi <b>Administrator</b> untuk peninjauan lebih lanjut.
        </p>

        {/* Action Button: Hanya Logout */}
        <div className="mt-6">
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs transition-all active:translate-y-0.5 shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <LogOut className="w-4 h-4" />
            <span>{loggingOut ? 'Mengeluarkan Akun...' : 'Keluar Akun (Logout)'}</span>
          </button>
        </div>
      </div>
    </main>
  );
}

