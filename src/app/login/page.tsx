'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createHubBrowserClient } from '@/lib/supabase-hub';
// Biarkan import ini jika sistem ban email memang diatur secara global di database lu
import { checkBannedEmailAction } from '@/app/tts/actions';
import {
  Gamepad2,
  Mail,
  Lock,
  User,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Eye,
  EyeOff,
  Sparkles,
  MonitorPlay,
} from 'lucide-react';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const explicitRedirect = searchParams.get('redirect');
  const urlError = searchParams.get('error');

  const [tab, setTab] = useState<'login' | 'register' | 'forgot'>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [registrationSent, setRegistrationSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    if (urlError === 'auth_callback_failed') {
      setErrorMsg('Tautan verifikasi tidak valid atau telah kedaluwarsa. Silakan coba login atau kirim ulang.');
    }
  }, [urlError]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const banCheck = await checkBannedEmailAction(email.trim());
      if (banCheck.isBanned) {
        setErrorMsg(
          `⛔ AKUN DIBANNED PERMANEN: Email ini telah dibanned oleh sistem (${banCheck.reason}). Hubungi administrator jika ini kesalahan.`
        );
        setLoading(false);
        return;
      }

      const supabase = createHubBrowserClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        if (error.message.includes('Email not confirmed')) {
          setErrorMsg('Email Anda belum diverifikasi. Silakan periksa kotak masuk (inbox / spam) email Anda.');
        } else if (error.message.includes('Invalid login credentials')) {
          setErrorMsg('Email atau kata sandi tidak sesuai. Jika belum mendaftar, klik tab "Daftar Baru".');
        } else {
          setErrorMsg(error.message);
        }
        return;
      }

      if (data.user) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .maybeSingle();

        // LOGIKA REDIRECT KHUSUS KUIS BATTLE
        if (explicitRedirect) {
          router.push(explicitRedirect);
        } else if (prof?.role === 'admin') {
          router.push('/admin/soal'); // Langsung masuk ke Panel Admin Kuis Battle
        } else {
          router.push('/'); // Lobi Utama Kuis Battle
        }
        router.refresh();
      }
    } catch {
      setErrorMsg('Gagal terhubung ke server autentikasi.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (cleanUsername.length < 3) {
      setErrorMsg('Username minimal 3 karakter (hanya huruf, angka, atau underscore).');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Password minimal 6 karakter.');
      return;
    }

    setLoading(true);

    try {
      const banCheck = await checkBannedEmailAction(email.trim());
      if (banCheck.isBanned) {
        setErrorMsg(
          `⛔ PENDAFTARAN DITOLAK: Email ini telah di-BANNED secara permanen. Anda tidak diizinkan membuat akun baru dengan email ini.`
        );
        setLoading(false);
        return;
      }

      const supabase = createHubBrowserClient();

      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', cleanUsername)
        .maybeSingle();

      if (existingUser) {
        setErrorMsg(`Username "${cleanUsername}" sudah dipakai. Silakan gunakan username lain.`);
        setLoading(false);
        return;
      }

      const redirectTo = `${window.location.origin}/auth/callback?next=/auth/confirmed`;

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            username: cleanUsername,
            role: 'player', // Default ke player/operator
          },
        },
      });

      if (error) {
        if (error.message.toLowerCase().includes('rate limit')) {
          setErrorMsg(
            '⚠️ Batas pengiriman email verifikasi tercapai. Harap tunggu beberapa menit sebelum mendaftar kembali.'
          );
        } else {
          setErrorMsg(error.message);
        }
        return;
      }

      if (data.user && (!data.user.identities || data.user.identities.length === 0)) {
        setErrorMsg(
          'Email ini sudah pernah terdaftar di sistem. Silakan langsung masuk menggunakan kata sandi Anda di tab "MASUK".'
        );
        return;
      }

      if (data.user) {
        setRegistrationSent(true);
        setSuccessMsg(
          `Tautan verifikasi telah dikirim ke ${email}. Silakan buka email Anda untuk mengaktifkan akun!`
        );
      }
    } catch {
      setErrorMsg('Gagal melakukan pendaftaran. Silakan coba sesaat lagi.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();

      const banCheck = await checkBannedEmailAction(cleanEmail);
      if (banCheck.isBanned) {
        setErrorMsg(
          `⛔ AKUN DI-BANNED: Email ini telah dinonaktifkan secara permanen. Reset password tidak dapat dilakukan.`
        );
        setLoading(false);
        return;
      }

      const supabase = createHubBrowserClient();
      
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: 'https://kuis-battle.vercel.app/auth/callback?next=/reset-password',
      });

      if (error) {
        const rawMsg = error.message.toLowerCase();
        if (
          rawMsg.includes('error sending') ||
          rawMsg.includes('recovery email') ||
          (error as { status?: number }).status === 500
        ) {
          setErrorMsg(
            '⚠️ Gagal mengirim email pemulihan (Supabase Mailer 500). Hal ini umum terjadi jika kuota email habis.'
          );
        } else if (rawMsg.includes('rate limit')) {
          setErrorMsg(
            '⚠️ Batas pengiriman email tercapai (Rate Limit). Harap tunggu beberapa menit.'
          );
        } else {
          setErrorMsg(error.message);
        }
      } else {
        setResetSent(true);
      }
    } catch {
      setErrorMsg('Gagal mengirim instruksi pemulihan. Pastikan koneksi internet stabil.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col items-center justify-center p-4 relative select-none">
      <div className="w-full max-w-md bg-[#111726] border-2 border-slate-700 rounded-3xl p-6 sm:p-8 shadow-[0_8px_0_#070a12] relative z-10">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-3 bg-emerald-500 rounded-2xl flex items-center justify-center text-slate-950 font-black border-b-4 border-emerald-700 shadow-md">
            <MonitorPlay className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            MASUK KUIS BATTLE
          </h1>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            {tab === 'login' && 'Masuk untuk mengontrol jalannya kuis dan layar proyektor'}
            {tab === 'register' && 'Daftar akun untuk menjadi operator atau admin kuis'}
            {tab === 'forgot' && 'Masukkan email terdaftar untuk menyetel ulang kata sandi'}
          </p>
        </div>

        {tab !== 'forgot' && (
          <div className="grid grid-cols-2 gap-2 p-1.5 bg-[#090d16] rounded-2xl mb-5 border-2 border-slate-800">
            <button
              type="button"
              onClick={() => {
                setTab('login');
                setErrorMsg('');
                setSuccessMsg('');
              }}
              className={`py-2.5 rounded-xl text-xs font-black transition-all ${
                tab === 'login'
                  ? 'bg-emerald-500 text-slate-950 shadow-[0_3px_0_#065f46]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              MASUK
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('register');
                setErrorMsg('');
                setSuccessMsg('');
              }}
              className={`py-2.5 rounded-xl text-xs font-black transition-all ${
                tab === 'register'
                  ? 'bg-emerald-500 text-slate-950 shadow-[0_3px_0_#065f46]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              DAFTAR BARU
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="mb-4 p-3.5 rounded-xl bg-rose-950/80 border-2 border-rose-600 text-rose-200 text-xs flex items-start gap-2.5 font-medium shadow">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3.5 rounded-xl bg-emerald-950/80 border-2 border-emerald-600 text-emerald-200 text-xs flex items-start gap-2.5 font-medium shadow">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            <span className="leading-relaxed">{successMsg}</span>
          </div>
        )}

        {resetSent ? (
          <div className="text-center py-4 space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-purple-500/20 border-2 border-purple-500 flex items-center justify-center text-purple-400">
              <Mail className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white">Tautan Reset Terkirim!</h2>
              <p className="text-xs text-slate-400 mt-1">
                Kami telah mengirimkan tautan pemulihan kata sandi ke:
              </p>
              <p className="text-xs font-mono font-bold text-emerald-400 mt-0.5">{email}</p>
            </div>

            <div className="p-4 rounded-2xl bg-[#090d16] border-2 border-slate-700 text-left space-y-2 text-xs text-slate-300">
              <p className="font-black text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" /> Langkah Selanjutnya:
              </p>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-400 font-medium">
                <li>Buka aplikasi email Anda (cek folder Spam/Promosi jika belum ada).</li>
                <li>Klik tombol atau tautan reset kata sandi di email tersebut.</li>
                <li>Buat kata sandi baru Anda dan langsung mulai kelola kuis!</li>
              </ol>
            </div>

            <button
              type="button"
              onClick={() => {
                setResetSent(false);
                setTab('login');
              }}
              className="w-full py-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs uppercase tracking-wider border-b-4 border-purple-800 active:translate-y-1 active:border-b-0 transition-all shadow flex items-center justify-center gap-2"
            >
              <span>Kembali ke Form Masuk</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : registrationSent ? (
          <div className="text-center py-4 space-y-4">
            <div className="p-4 rounded-2xl bg-[#090d16] border-2 border-slate-700 text-left space-y-2 text-xs text-slate-300">
              <p className="font-black text-white">Langkah Selanjutnya:</p>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-400 font-medium">
                <li>Buka aplikasi email Anda (cek folder Spam jika belum masuk).</li>
                <li>Klik tautan verifikasi yang kami kirimkan.</li>
                <li>Kembali ke sini dan klik tombol Masuk untuk mulai mengontrol kuis!</li>
              </ol>
            </div>

            <button
              type="button"
              onClick={() => {
                setRegistrationSent(false);
                setTab('login');
              }}
              className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider border-b-4 border-emerald-700 active:translate-y-1 active:border-b-0 transition-all shadow flex items-center justify-center gap-2"
            >
              <span>Masuk Sekarang</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            {tab === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-black text-slate-300 uppercase tracking-wider mb-1.5">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nama@email.com"
                      className="w-full bg-[#090d16] border-2 border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-400 font-medium transition-all"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-black text-slate-300 uppercase tracking-wider">
                      Kata Sandi
                    </label>
                    <button
                      type="button"
                      onClick={() => setTab('forgot')}
                      className="text-[11px] text-emerald-400 hover:underline font-bold"
                    >
                      Lupa password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-[#090d16] border-2 border-slate-700 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-400 font-medium transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 mt-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider border-b-4 border-emerald-700 active:translate-y-1 active:border-b-0 transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <span>{loading ? 'MEMPROSES...' : 'MASUK KE GAME'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            {tab === 'register' && (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-black text-slate-300 uppercase tracking-wider mb-1.5">
                    Username
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="contoh: jagoan_kuis"
                      className="w-full bg-[#090d16] border-2 border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-400 font-mono transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-black text-slate-300 uppercase tracking-wider mb-1.5">
                    Email Aktif
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nama@email.com"
                      className="w-full bg-[#090d16] border-2 border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-400 font-medium transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-black text-slate-300 uppercase tracking-wider mb-1.5">
                    Kata Sandi (min. 6 karakter)
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-[#090d16] border-2 border-slate-700 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-400 font-medium transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 mt-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider border-b-4 border-emerald-700 active:translate-y-1 active:border-b-0 transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <span>{loading ? 'MENDAFTARKAN...' : 'DAFTAR & KIRIM VERIFIKASI'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            {tab === 'forgot' && (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-black text-slate-300 uppercase tracking-wider mb-1.5">
                    Email Terdaftar
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nama@email.com"
                      className="w-full bg-[#090d16] border-2 border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-400 font-medium transition-all"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setTab('login');
                      setErrorMsg('');
                      setSuccessMsg('');
                    }}
                    className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border-b-2 border-slate-900"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase border-b-4 border-emerald-700 active:translate-y-0.5 active:border-b-0 transition-all shadow disabled:opacity-50"
                  >
                    {loading ? 'Mengirim...' : 'Kirim Link Reset'}
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        <div className="mt-6 pt-4 border-t-2 border-slate-800 text-center">
          <a
            href="/"
            className="text-xs text-slate-500 hover:text-slate-300 transition-all font-bold"
          >
            ← Kembali ke Lobi Game Hub
          </a>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#090d16] flex items-center justify-center text-slate-400 text-xs font-black">
          MEMUAT AUTENTIKASI...
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
