import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { EmailOtpType } from '@supabase/supabase-js';
import { hubUrl, hubAnonKey, HUB_COOKIE_NAME } from '@/lib/supabase-hub';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/auth/confirmed';

  // PERBAIKAN: Wajib pakai await untuk versi Next.js terbaru
  const cookieStore = await cookies();

  const supabase = createServerClient(hubUrl, hubAnonKey, {
    cookieOptions: {
      name: HUB_COOKIE_NAME,
    },
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options) {
        cookieStore.set({ name, value, ...options });
      },
      remove(name: string, options) {
        cookieStore.set({ name, value: '', ...options });
      },
    },
  });

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
