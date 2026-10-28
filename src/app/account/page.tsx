'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createHubBrowserClient, Profile } from '@/lib/supabase-hub';
import {
  User,
  ShieldAlert,
  Key,
  Coins,
  Heart,
  Trophy,
  LogOut,
  Save,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Crown,
} from 'lucide-react';

const AVATAR_PRESETS = [
  '⚡', '🦊', '🦁', '🐯', '🐼', '🐲', '🚀', '👑', '🧙‍♂️', '👾', '🔥', '💎',
];

function AccountContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isResetPasswordAction = searchParams.get('action') === 'reset_password';

  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState('');
  const [avatarIcon, setAvatarIcon] = useState('⚡');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(true);
  const [savingUsername, setSavingUsername] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(
    null
  );

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const supabase = createHubBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push('/login?redirect=/account');
          return;
        }

        const { data: prof, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Error fetching profile:', error);
        } else if (prof) {
          setProfile(prof as Profile);
          setUsername(prof.username || '');
          if (prof.avatar_url) {
            setAvatarIcon(prof.avatar_url);
          }
        }
      } catch (err) {
        console.error('Unexpected error loading profile:', err);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [router]);

  // Simpan perubahan username & avatar icon
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setStatusMsg(null);

    const clean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (clean.length < 3) {
      setStatusMsg({
        text: 'Username minimal 3 karakter (huruf, angka, atau underscore).',
        type: 'error',
      });
      return;
    }

    setSavingUsername(true);
    try {
      const supabase = createHubBrowserClient();

      // Cek apakah username dipakai orang lain
      if (clean !== profile.username) {
        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', clean)
          .maybeSingle();

        if (existing) {
          setStatusMsg({
            text: `Username "${clean}" sudah digunakan oleh pemain lain.`,
            type: 'error',
          });
          setSavingUsername(false);
          return;
        }
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          username: clean,
          avatar_url: avatarIcon,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);

      if (error) {
        setStatusMsg({ text: `Gagal memperbarui profil: ${error.message}`, type: 'error' });
      } else {
        setProfile((prev) => (prev ? { ...prev, username: clean, avatar_url: avatarIcon } : null));
        setStatusMsg({ text: 'Profil & Avatar berhasil diperbarui!', type: 'success' });
      }
    } catch {
      setStatusMsg({ text: 'Terjadi kesalahan jaringan saat menyimpan.', type: 'error' });
    } finally {
      setSavingUsername(false);
    }
  };

  // Simpan perubahan kata sandi
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    if (newPassword.length < 6) {
      setStatusMsg({ text: 'Kata sandi baru minimal 6 karakter.', type: 'error' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatusMsg({ text: 'Konfirmasi kata sandi tidak cocok.', type: 'error' });
      return;
    }

    setSavingPassword(true);
    try {
      const supabase = createHubBrowserClient();
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setStatusMsg({ text: `Gagal mengubah kata sandi: ${error.message}`, type: 'error' });
      } else {
        setStatusMsg({ text: 'Kata sandi berhasil diperbarui!', type: 'success' });
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch {
      setStatusMsg({ text: 'Terjadi kesalahan jaringan saat mengubah kata sandi.', type: 'error' });
    } finally {
      setSavingPassword(false);
    }
  };

  // Logout Pemain
  const handleLogout = async () => {
    try {
      const supabase = createHubBrowserClient();
      await supabase.auth.signOut();
      router.push('/login');
      router.refresh();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#090d16] flex items-center justify-center text-slate-400 text-xs font-black">
        MEMUAT PROFIL...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#090d16] text-slate-100 p-4 sm:p-8 select-none">
      <div className="max-w-2xl mx-auto">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between mb-6">
          <a
            href="/path"
            className="flex items-center gap-2 text-xs font-black text-slate-300 hover:text-white bg-[#111726] border-2 border-slate-700 px-3.5 py-2 rounded-xl transition-all active:translate-y-0.5 shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke The Path</span>
          </a>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-xs font-black text-rose-300 hover:text-white bg-rose-950/80 hover:bg-rose-900 border-2 border-rose-700 px-3.5 py-2 rounded-xl transition-all active:translate-y-0.5 shadow-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>Keluar Akun</span>
          </button>
        </div>

        {/* Profile Stats Card */}
        <div className="bg-[#111726] border-2 border-slate-700 rounded-3xl p-6 sm:p-8 shadow-[0_6px_0_#070a12] mb-6 relative">
          <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
            <div className="w-24 h-24 rounded-3xl bg-[#090d16] border-2 border-emerald-500 flex items-center justify-center text-4xl shadow-md">
              {avatarIcon}
            </div>

            <div className="flex-1">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <h1 className="text-2xl font-black text-white">@{profile?.username || 'Pemain'}</h1>
                <span className="text-[10px] font-black px-2.5 py-0.5 rounded-lg bg-emerald-500 text-slate-950 uppercase tracking-wider">
                  {profile?.role || 'PLAYER'}
                </span>
                {(profile?.ban_count ?? 0) > 0 && (
                  <span className="text-[10px] font-black px-2.5 py-0.5 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center gap-1 shadow-sm">
                    <ShieldAlert className="w-3 h-3 text-rose-400" />
                    <span>Jumlah Banned: {profile?.ban_count}</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1 font-medium">
                Akun Terverifikasi • Bergabung sejak{' '}
                {profile?.created_at
                  ? new Date(profile.created_at).toLocaleDateString('id-ID', {
                      month: 'short',
                      year: 'numeric',
                    })
                  : 'Baru saja'}
              </p>

              {/* HUD Stats */}
              <div className="grid grid-cols-3 gap-2.5 mt-4">
                <div className="bg-[#090d16] border-2 border-slate-800 rounded-2xl p-2.5 text-center">
                  <div className="flex items-center justify-center gap-1 text-amber-400 mb-0.5">
                    <Trophy className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-black uppercase">Skor</span>
                  </div>
                  <span className="font-mono font-black text-sm text-white">
                    {profile?.total_score ?? 0}
                  </span>
                </div>

                <div className="bg-[#090d16] border-2 border-slate-800 rounded-2xl p-2.5 text-center">
                  <div className="flex items-center justify-center gap-1 text-yellow-400 mb-0.5">
                    <Coins className="w-3.5 h-3.5 fill-yellow-400" />
                    <span className="text-[10px] font-black uppercase">Koin</span>
                  </div>
                  <span className="font-mono font-black text-sm text-white">
                    {profile?.coins ?? 50}
                  </span>
                </div>

                <div className="bg-[#090d16] border-2 border-slate-800 rounded-2xl p-2.5 text-center">
                  <div className="flex items-center justify-center gap-1 text-rose-400 mb-0.5">
                    <Heart className="w-3.5 h-3.5 fill-rose-500" />
                    <span className="text-[10px] font-black uppercase">Nyawa</span>
                  </div>
                  <span className="font-mono font-black text-sm text-white">
                    {profile?.lives ?? 5}/{profile?.max_lives ?? 5}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Admin Quick Action Card (Shown if profile is Admin) */}
        {profile?.role === 'admin' && (
          <div className="bg-amber-950/40 border-2 border-amber-500/80 rounded-3xl p-5 mb-6 shadow-[0_4px_0_#451a03] flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shrink-0 shadow-md">
                <Crown className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white">MODE ADMINISTRATOR SULTAN</h3>
                <p className="text-xs text-amber-300 font-medium mt-0.5">
                  Atur soal TTS, gunakan generator AI Gemini, ubah multiplier skor & reset klasemen.
                </p>
              </div>
            </div>
            <a
              href="/admin-hub"
              className="py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider border-b-4 border-amber-700 active:translate-y-0.5 active:border-b-0 transition-all shadow shrink-0"
            >
              Buka Panel Sultan →
            </a>
          </div>
        )}

        {/* Status Pesan */}
        {statusMsg && (
          <div
            className={`mb-6 p-4 rounded-2xl border-2 text-xs flex items-center gap-3 font-medium shadow ${
              statusMsg.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-600 text-emerald-200'
                : 'bg-rose-950/80 border-rose-600 text-rose-200'
            }`}
          >
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* Pengaturan Username & Avatar */}
        <div className="bg-[#111726] border-2 border-slate-700 rounded-3xl p-6 sm:p-8 shadow-[0_6px_0_#070a12] mb-6">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-black text-white">Profil & Avatar Pemain</h2>
          </div>

          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div>
              <label className="block text-[11px] font-black text-slate-300 uppercase tracking-wider mb-2">
                Pilih Ikon Avatar
              </label>
              <div className="grid grid-cols-6 sm:grid-cols-12 gap-2">
                {AVATAR_PRESETS.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => setAvatarIcon(icon)}
                    className={`h-11 rounded-xl text-xl flex items-center justify-center transition-all ${
                      avatarIcon === icon
                        ? 'bg-emerald-500 text-slate-950 border-b-4 border-emerald-700 shadow-md scale-105'
                        : 'bg-[#090d16] border-2 border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-300 uppercase tracking-wider mb-1.5">
                Ganti Username
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[#090d16] border-2 border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-400 font-medium transition-all"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Hanya huruf kecil, angka, dan underscore (_).
              </span>
            </div>

            <button
              type="submit"
              disabled={savingUsername}
              className="py-3 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider border-b-4 border-emerald-700 active:translate-y-0.5 active:border-b-0 transition-all shadow flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{savingUsername ? 'MENYIMPAN...' : 'SIMPAN PROFIL'}</span>
            </button>
          </form>
        </div>

        {/* Pengaturan Kata Sandi */}
        <div
          id="password-section"
          className={`bg-[#111726] border-2 rounded-3xl p-6 sm:p-8 shadow-[0_6px_0_#070a12] transition-all ${
            isResetPasswordAction
              ? 'border-purple-500 ring-4 ring-purple-500/20'
              : 'border-slate-700'
          }`}
        >
          {isResetPasswordAction && (
            <div className="mb-5 p-3.5 rounded-2xl bg-purple-950/80 border border-purple-500 text-purple-200 text-xs flex items-start gap-2.5 shadow">
              <Key className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-black text-white">Mode Pemulihan Kata Sandi Aktif</p>
                <p className="text-[11px] text-purple-300 mt-0.5">
                  Tautan email Anda telah diverifikasi. Masukkan kata sandi baru Anda di bawah ini dan klik &quot;Perbarui Kata Sandi&quot;.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 mb-4">
            <Key className="w-5 h-5 text-purple-400" />
            <h2 className="text-base font-black text-white">Ganti Kata Sandi</h2>
          </div>

          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-black text-slate-300 uppercase tracking-wider mb-1.5">
                  Kata Sandi Baru
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-[#090d16] border-2 border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-400 font-medium transition-all"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-300 uppercase tracking-wider mb-1.5">
                  Ulangi Kata Sandi Baru
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-[#090d16] border-2 border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-400 font-medium transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingPassword}
              className="py-3 px-5 rounded-xl bg-purple-500 hover:bg-purple-400 text-slate-950 font-black text-xs uppercase tracking-wider border-b-4 border-purple-700 active:translate-y-0.5 active:border-b-0 transition-all shadow flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{savingPassword ? 'MENGUBAH...' : 'PERBARUI KATA SANDI'}</span>
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#090d16] flex items-center justify-center text-slate-400 text-xs font-black">
          MEMUAT HALAMAN AKUN...
        </div>
      }
    >
      <AccountContent />
    </Suspense>
  );
}
