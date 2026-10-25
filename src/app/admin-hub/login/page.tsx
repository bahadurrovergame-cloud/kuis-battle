'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminHubLoginPage() {
  const router = useRouter();

  useEffect(() => {
    // Alihkan langsung ke halaman login terpadu
    router.replace('/login?redirect=/admin-hub');
  }, [router]);

  return (
    <div className="min-h-screen bg-[#090d16] flex flex-col items-center justify-center text-slate-400 gap-3 text-xs">
      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      <span>Mengarahkan ke Halaman Login Terpadu...</span>
    </div>
  );
}
