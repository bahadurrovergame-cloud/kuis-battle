import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { hubUrl, hubAnonKey, HUB_COOKIE_NAME } from '@/lib/supabase-hub';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/auth/confirmed';

  // JALAN PINTAS KHUSUS RESET PASSWORD:
  // Lempar langsung ke halaman reset biar Browser (Client) yang memverifikasi kodenya!
  if (code && next.includes('/reset-password')) {
    return NextResponse.redirect(`${origin}${next}?code=${code}`);
  }

  // Kodingan di bawah ini tetap jalan untuk verifikasi Pendaftaran Akun Baru
  const cookieStore = await cookies();
  const supabase = createServerClient(hubUrl, hubAnonKey, {
    cookieOptions: { name: HUB_COOKIE_NAME },
    cookies: {
      get(name: string) { return cookieStore.get(name)?.value; },
      set(name: string, value: string, options) { cookieStore.set({ name, value, ...options }); },
      remove(name: string, options) { cookieStore.set({ name, value: '', ...options }); },
    },
  });

  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
    return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
