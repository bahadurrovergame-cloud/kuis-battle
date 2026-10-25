'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, MonitorPlay, BookOpen, AlertCircle, ArrowRight, ShieldCheck, Compass } from 'lucide-react';

export default function BattleLoginPage() {
  const router = useRouter();
  const [operatorRole, setOperatorRole] = useState<'operator' | 'admin'>('operator');
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Bersihkan sesi Kuis Battle lama saat halaman ini dibuka
  useEffect(() => {
    sessionStorage.removeItem('auth_role');
    sessionStorage.removeItem('auth_token');
  }, []);

  const handleOperatorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      const res = await fetch('/api/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin.trim(), role: operatorRole }),
      });

      const data = await res.json();

      if (data.success) {
        sessionStorage.setItem('auth_role', operatorRole);
        sessionStorage.setItem('auth_token', 'authenticated');

        if (operatorRole === 'admin') {
          router.push('/admin/soal');
        } else {
          router.push('/control');
        }
      } else {
        setErrorMsg(data.message || 'PIN tidak valid. Silakan periksa kembali PIN Anda.');
      }
    } catch {
      setErrorMsg('Gagal menghubungkan ke server verifikasi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative z-10">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-3 bg-blue-600/20 border border-blue-500/30 rounded-2xl flex items-center justify-center text-blue-400 shadow-inner">
            <KeyRound className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-black tracking-tight text-white uppercase">
            Akses Kru Kuis Battle
          </h1>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
            Khusus Operator Panggung & Admin Bank Soal (Menggunakan <b>PIN Akses</b>, tanpa perlu email / akun Supabase).
          </p>
        </div>

        {/* Selector Role Operator / Admin */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950/80 rounded-xl mb-5 border border-slate-800">
          <button
            type="button"
            onClick={() => {
              setOperatorRole('operator');
              setErrorMsg('');
              setPin('');
            }}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
              operatorRole === 'operator'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <MonitorPlay className="w-3.5 h-3.5" />
            <span>Operator</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setOperatorRole('admin');
              setErrorMsg('');
              setPin('');
            }}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
              operatorRole === 'admin'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Admin Soal</span>
          </button>
        </div>

        {/* Info Deskripsi Peran Terpilih */}
        <div className="mb-4 p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-[11px] text-slate-400 leading-relaxed">
          {operatorRole === 'operator' ? (
            <span>
              🎮 <b>Peran Operator:</b> Mengontrol timer panggung, membuka kotak nomor, dan mengelola nilai regu perlombaan di layar <code className="text-blue-400 font-mono">/control</code>.
            </span>
          ) : (
            <span>
              📚 <b>Peran Admin Soal:</b> Mengelola bank soal babak, paket pertanyaan pilihan ganda/essay, dan AI Generator di layar <code className="text-purple-400 font-mono">/admin/soal</code>.
            </span>
          )}
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleOperatorLogin} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 text-center">
              Masukkan PIN {operatorRole === 'operator' ? 'Operator' : 'Admin Soal'}
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••••"
              className="w-full text-center tracking-[0.5em] text-2xl font-bold bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:tracking-normal placeholder:text-slate-600"
              required
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={loading || pin.length < 4}
            className={`w-full py-3.5 rounded-xl text-white font-black text-xs uppercase tracking-wider transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
              operatorRole === 'operator'
                ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30'
                : 'bg-purple-600 hover:bg-purple-500 shadow-purple-600/30'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{loading ? 'Memverifikasi...' : 'Buka Akses Sistem'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-800/80 flex flex-col items-center gap-2 text-center text-xs">
          <a
            href="/battle"
            className="text-slate-400 hover:text-white transition-all font-semibold"
          >
            ← Kembali ke Ruang Battle Utama
          </a>
          <a
            href="/login"
            className="text-emerald-400/80 hover:text-emerald-300 transition-all font-semibold flex items-center gap-1"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Beralih ke Login Game Hub & TTS (Email) →</span>
          </a>
        </div>
      </div>
    </main>
  );
}
