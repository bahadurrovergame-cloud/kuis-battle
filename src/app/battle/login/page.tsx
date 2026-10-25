'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, MonitorPlay, BookOpen, AlertCircle, ArrowRight } from 'lucide-react';

export default function BattleLoginPage() {
  const router = useRouter();
  const [operatorRole, setOperatorRole] = useState<'operator' | 'admin'>('operator');
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleOperatorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      const res = await fetch('/api/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, role: operatorRole }),
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
        setErrorMsg(data.message || 'PIN tidak valid');
      }
    } catch {
      setErrorMsg('Gagal menghubungkan ke server verifikasi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative z-10">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-3 bg-blue-600/20 border border-blue-500/30 rounded-2xl flex items-center justify-center text-blue-400 shadow-inner">
            <KeyRound className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-black tracking-tight text-white uppercase">
            Akses Operator Battle
          </h1>
          <p className="text-xs text-slate-400 mt-1">Pilih peran dan masukkan PIN akses perlombaan</p>
        </div>

        {/* Selector Role Operator / Admin */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950/80 rounded-xl mb-5 border border-slate-800">
          <button
            type="button"
            onClick={() => {
              setOperatorRole('operator');
              setErrorMsg('');
            }}
            className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
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
            }}
            className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
              operatorRole === 'admin'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Admin Soal</span>
          </button>
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
              Masukkan PIN {operatorRole === 'operator' ? 'Operator' : 'Admin'}
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
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all shadow-lg shadow-blue-600/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-98"
          >
            <span>{loading ? 'Memverifikasi...' : 'Buka Akses'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-800/80 text-center">
          <a
            href="/battle"
            className="text-xs text-slate-500 hover:text-slate-300 transition-all font-semibold"
          >
            ← Kembali ke Dashboard Battle
          </a>
        </div>
      </div>
    </main>
  );
}

