'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function BannedRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/ban');
  }, [router]);

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-xs font-mono font-bold">
      Mengalihkan ke halaman pemblokiran akun...
    </main>
  );
}
