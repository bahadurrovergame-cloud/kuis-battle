import { NextResponse } from 'next/server';
import { createHubServerClient } from '@/lib/supabase-hub-server';
import { EmailOtpType } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/reset-password';

  const supabase = await createHubServerClient();

  // 1. Verifikasi menggunakan Token Hash (Solusi Permanen yang aman diklik langsung)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type,
    });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error('[Auth Callback] verifyOtp error:', error.message);
  }

  // 2. Fallback jika masih mendeteksi PKCE code
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error('[Auth Callback] exchangeCodeForSession error:', error.message);
  }

  // Jika gagal total, arahkan kembali ke login dengan pesan error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
