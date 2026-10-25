import { NextResponse } from 'next/server';
import { createHubServerClient } from '@/lib/supabase-hub-server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/auth/confirmed';

  // LOGIKA BARU: JALAN PINTAS LUPA PASSWORD
  // Kita lempar kodenya ke halaman reset, biar Browser yang memproses PKCE-nya!
  if (code && next.includes('/reset-password')) {
    return NextResponse.redirect(`${origin}/reset-password?code=${code}`);
  }

  // Logika Lama: Tetap jalan untuk verifikasi Daftar Akun Baru
  if (code) {
    const supabase = await createHubServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
