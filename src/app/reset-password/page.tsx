'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createHubBrowserClient } from '@/lib/supabase-hub';
import confetti from 'canvas-confetti';
import {
  Key, Lock, Eye, EyeOff, CheckCircle2,
  AlertCircle, ArrowRight, ShieldCheck, Compass,
} from 'lucide-react';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get('code');

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
    let isMounted = true;
    const supabase = createHubBrowserClient();

    const processRecovery = async () => {
      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            if (isMounted) {
              setErrorMsg(`Gagal memverifikasi link: ${error.message}`);
              setLoading(false);
            }
            return;
          }
          window.history.replaceState(null, '', '/reset-password');
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (isMounted) {
          if (session) {
            setHasSession(true);
          }
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setErrorMsg('Terjadi kesalahan sistem saat memuat halaman.');
          setLoading(false);
        }
      }
    };

    processRecovery();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        if (isMounted) {
          setHasSession(true);
          setLoading(false);
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [code]);

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
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setErrorMsg(error.message);
        setSubmitting(false);
        return;
      }

      setSuccess(true);
      try {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
      } catch {}

      // Timer otomatis DIBATALKAN agar user diam di halaman sukses
    } catch {
      setErrorMsg('Terjadi kesalahan jaringan.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="flex items-center gap-3 bg-[#111726] border-2 border-slate-800 rounded-2xl px-6 py-4 shadow-xl">
          <Key className="w-5 h-5 text-purple-500 animate-spin" />
          <span className="text-xs font-black tracking-wider text-slate-300">
            MEMVERIFIKASI TAUTAN PEMULIHAN...
          </span>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col items-center justify-center p-4 relative select-none">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-[#111726] border-2 border-slate-700 rounded-3xl p-6 sm:p-8 shadow-[0_8px_0_#070a12] relative z-10">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-3 bg-purple-500 rounded-2xl flex items-center justify-center text-slate-950 font-black border-b-4 border-purple-700 shadow-md">
            <Key className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white uppercase">Setel Kata Sandi Baru</h1>
          <p className="text-xs text-slate-400 mt-1 font-medium">Masukkan kata sandi baru untuk mengamankan akun Game Hub Anda</p>
        </div>

        {errorMsg && (
          <div className="mb-5 p-3.5 rounded-xl bg-rose-950/80 border-2 border-rose-600 text-rose-200 text-xs flex items-start gap-2.5 font-medium shadow">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {success ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-black text-white">Kata Sandi Berhasil Disimpan!</h2>
              <p className="text-xs text-slate-400">
                Akun Anda telah diamankan dengan kata sandi baru. Silakan masuk kembali ke akun Anda.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => router.push('/login')}
                className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider border-b-4 border-emerald-700 active:translate-y-1 active:border-b-0 transition-all shadow flex items-center justify-center gap-2"
              >
                <span>Kembali ke Halaman Masuk</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : !hasSession ? (
          <div className="text-center py-4 space-y-4">
            <div className="p-4 rounded-2xl bg-amber-950/40 border-2 border-amber-500/40 text-left space-y-2 text-xs text-amber-200">
              <p className="font-black text-amber-300 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" /> Tautan Tidak Valid atau Kedaluwarsa</p>
              <p className="text-slate-300 leading-relaxed">Tautan pemulihan kata sandi ini sudah tidak berlaku, telah digunakan sebelumnya, atau Anda membukanya di browser yang berbeda.</p>
            </div>
            <button type="button" onClick={() => router.push('/login')} className="w-full py-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs uppercase tracking-wider border-b-4 border-purple-800 active:translate-y-1 active:border-b-0 transition-all shadow flex items-center justify-center gap-2">
              <span>Minta Tautan Baru di Login</span><ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block text-[11px] font-black text-slate-300 uppercase tracking-wider mb-1.5">Kata Sandi Baru</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input type={showPassword ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimal 6 karakter" className="w-full bg-[#090d16] border-2 border-slate-700 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-400 font-medium transition-all" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-300 uppercase tracking-wider mb-1.5">Konfirmasi Kata Sandi Baru</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input type={showConfirmPassword ? 'text' : 'password'} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Ulangi kata sandi baru" className="w-full bg-[#090d16] border-2 border-slate-700 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-400 font-medium transition-all" />
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={submitting} className="w-full py-3.5 mt-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs uppercase tracking-wider border-b-4 border-purple-800 active:translate-y-1 active:border-b-0 transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2">
              <span>{submitting ? 'MENYIMPAN...' : 'SIMPAN KATA SANDI'}</span><ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        <div className="mt-6 pt-4 border-t-2 border-slate-800 text-center">
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-300 transition-all font-bold flex items-center justify-center gap-1">
            <Compass className="w-3.5 h-3.5" /><span>Kembali ke Lobi Game Hub</span>
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#090d16] flex items-center justify-center text-slate-400 text-xs font-black">MEMUAT PEMULIHAN KATA SANDI...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
