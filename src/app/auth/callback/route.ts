import { NextResponse } from 'next/server';
import { createHubServerClient } from '@/lib/supabase-hub-server';
import { EmailOtpType } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/auth/confirmed';

  const supabase = await createHubServerClient();

  // 1. Verifikasi menggunakan Token Hash (Format link email verifikasi standar Supabase)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type,
    });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error('[Auth Callback] verifyOtp error:', error);
  }

  // 2. Verifikasi menggunakan PKCE Code
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error('[Auth Callback] exchangeCodeForSession error:', error);
  }

  // Jika user sudah memiliki sesi aktif, tetap arahkan ke halaman confirmed
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
