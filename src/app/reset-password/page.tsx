'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { createHubBrowserClient } from '@/lib/supabase-hub';
import confetti from 'canvas-confetti';
import {
  Key,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Compass,
} from 'lucide-react';

function ResetPasswordContent() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const supabase = createHubBrowserClient();

    // 1. Cek sesi saat komponen pertama kali mount
    const checkInitialSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          setHasSession(true);
        }
      } catch (err) {
        console.error('[Reset Password] Error checking initial session:', err);
      } finally {
        setLoading(false);
      }
    };

    checkInitialSession();

    // 2. Dengarkan event auth, khususnya PASSWORD_RECOVERY
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        setHasSession(true);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (password.length < 6) {
      setErrorMsg('Kata sandi baru minimal 6 karakter.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createHubBrowserClient();
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        setErrorMsg(error.message);
        setSubmitting(false);
        return;
      }

      setSuccess(true);

      // Rayakan dengan konfeti
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch {
        // Abaikan jika confetti gagal di beberapa environment
      }

      // Alihkan pemain ke The Path setelah 1.5 detik
      setTimeout(() => {
        router.push('/path');
        router.refresh();
      }, 1500);
    } catch {
      setErrorMsg('Terjadi kesalahan jaringan saat memperbarui kata sandi.');
      setSubmitting(false);
    }
  };

  // State Memuat Awal
  if (loading) {
    return (
      <main className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="flex items-center gap-3 bg-[#111726] border-2 border-slate-800 rounded-2xl px-6 py-4 shadow-xl">
          <Key className="w-5 h-5 text-emerald-400 animate-spin" />
          <span className="text-xs font-black tracking-wider text-slate-300">
            MEMVERIFIKASI TAUTAN PEMULIHAN...
          </span>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col items-center justify-center p-4 relative select-none">
      {/* Background Decorative Rings */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-[#111726] border-2 border-slate-700 rounded-3xl p-6 sm:p-8 shadow-[0_8px_0_#070a12] relative z-10">
        {/* Header Kartu */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-3 bg-purple-500 rounded-2xl flex items-center justify-center text-slate-950 font-black border-b-4 border-purple-700 shadow-md">
            <Key className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white uppercase">
            Setel Kata Sandi Baru
          </h1>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            Masukkan kata sandi baru untuk mengamankan akun Game Hub Anda
          </p>
        </div>

        {/* Notifikasi Error */}
        {errorMsg && (
          <div className="mb-5 p-3.5 rounded-xl bg-rose-950/80 border-2 border-rose-600 text-rose-200 text-xs flex items-start gap-2.5 font-medium shadow">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {/* State Berhasil */}
        {success ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 animate-bounce">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-black text-white">Kata Sandi Berhasil Disimpan!</h2>
              <p className="text-xs text-slate-400">
                Akun Anda telah diamankan. Mengalihkan Anda langsung ke The Path...
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => router.push('/path')}
                className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider border-b-4 border-emerald-700 active:translate-y-1 active:border-b-0 transition-all shadow flex items-center justify-center gap-2"
              >
                <span>Masuk ke Game Sekarang</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : !hasSession ? (
          /* Sesi Tidak Ditemukan / Tautan Kedaluwarsa */
          <div className="text-center py-4 space-y-4">
            <div className="p-4 rounded-2xl bg-amber-950/40 border-2 border-amber-500/40 text-left space-y-2 text-xs text-amber-200">
              <p className="font-black text-amber-300 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" /> Tautan Tidak Valid atau Kedaluwarsa
              </p>
              <p className="text-slate-300 leading-relaxed">
                Tautan pemulihan kata sandi ini sudah tidak berlaku, telah digunakan sebelumnya, atau Anda membukanya di browser yang berbeda.
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push('/login')}
              className="w-full py-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs uppercase tracking-wider border-b-4 border-purple-800 active:translate-y-1 active:border-b-0 transition-all shadow flex items-center justify-center gap-2"
            >
              <span>Minta Tautan Baru di Login</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          /* Form Ganti Kata Sandi */
          <form onSubmit={handleResetPassword} className="space-y-4">
            {/* Input Kata Sandi Baru */}
            <div>
              <label className="block text-[11px] font-black text-slate-300 uppercase tracking-wider mb-1.5">
                Kata Sandi Baru
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="w-full bg-[#090d16] border-2 border-slate-700 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-400 font-medium transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Input Konfirmasi Kata Sandi */}
            <div>
              <label className="block text-[11px] font-black text-slate-300 uppercase tracking-wider mb-1.5">
                Konfirmasi Kata Sandi Baru
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ulangi kata sandi baru"
                  className="w-full bg-[#090d16] border-2 border-slate-700 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-400 font-medium transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Checklist Validasi Singkat */}
            <div className="p-3 bg-[#090d16] border border-slate-800 rounded-xl space-y-1 text-[11px]">
              <div className="flex items-center gap-1.5 text-slate-400">
                <CheckCircle2
                  className={`w-3.5 h-3.5 ${
                    password.length >= 6 ? 'text-emerald-400' : 'text-slate-600'
                  }`}
                />
                <span className={password.length >= 6 ? 'text-emerald-300' : ''}>
                  Minimal 6 karakter
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                <CheckCircle2
                  className={`w-3.5 h-3.5 ${
                    password.length > 0 && password === confirmPassword
                      ? 'text-emerald-400'
                      : 'text-slate-600'
                  }`}
                />
                <span
                  className={
                    password.length > 0 && password === confirmPassword ? 'text-emerald-300' : ''
                  }
                >
                  Kedua kata sandi cocok
                </span>
              </div>
            </div>

            {/* Tombol Simpan */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 mt-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs uppercase tracking-wider border-b-4 border-purple-800 active:translate-y-1 active:border-b-0 transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <span>{submitting ? 'MENYIMPAN KATA SANDI...' : 'SIMPAN KATA SANDI & MULAI BERMAIN'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Kembali ke Lobi */}
        <div className="mt-6 pt-4 border-t-2 border-slate-800 text-center">
          <a
            href="/"
            className="text-xs text-slate-500 hover:text-slate-300 transition-all font-bold flex items-center justify-center gap-1"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Kembali ke Lobi Game Hub</span>
          </a>
        </div>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#090d16] flex items-center justify-center text-slate-400 text-xs font-black">
          MEMUAT PEMULIHAN KATA SANDI...
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}

