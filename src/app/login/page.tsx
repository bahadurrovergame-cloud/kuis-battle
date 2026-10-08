'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, ShieldCheck, MonitorPlay, BookOpen, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState<'operator' | 'admin'>('operator');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, role }),
      });

      const data = await res.json();

      if (data.success) {
        sessionStorage.setItem('auth_role', role);
        sessionStorage.setItem('auth_token', 'authenticated');

        if (role === 'admin') {
          router.push('/admin/soal');
        } else {
          router.push('/control');
        }
      } else {
        setError(data.message || 'PIN tidak valid');
      }
    } catch {
      setError('Gagal menghubungkan ke server verifikasi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-3 bg-blue-600/20 border border-blue-500/30 rounded-2xl flex items-center justify-center text-blue-400">
            <KeyRound className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black tracking-wide text-white">GATEKEEPER ACCESS</h1>
          <p className="text-sm text-slate-400 mt-1">Pilih peran dan masukkan PIN akses</p>
        </div>

        {/* Role Selector Tabs */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950/80 rounded-xl mb-6 border border-slate-800">
          <button
            type="button"
            onClick={() => { setRole('operator'); setError(''); }}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              role === 'operator'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <MonitorPlay className="w-4 h-4" />
            Operator
          </button>
          <button
            type="button"
            onClick={() => { setRole('admin'); setError(''); }}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              role === 'admin'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Admin Soal
          </button>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
              Masukkan PIN {role === 'operator' ? 'Operator' : 'Admin'}
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

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-950/50 border border-red-800/60 rounded-xl text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !pin}
            className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 text-sm"
          >
            <ShieldCheck className="w-4 h-4" />
            {loading ? 'Memverifikasi...' : 'Masuk ke Sistem'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <a href="/peserta" className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-4">
            Masuk sebagai Peserta (Layar Meja) &rarr;
          </a>
        </div>
      </div>
    </main>
  );
}
