import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { hubUrl, hubAnonKey, HUB_COOKIE_NAME } from '@/lib/supabase-hub';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. ISOLASI TOTAL KUIS BATTLE: Biarkan jalur ini lewat 100% tanpa ditanya auth email
  if (
    pathname.startsWith('/battle') ||
    pathname.startsWith('/operator') ||
    pathname.startsWith('/control') ||
    pathname.startsWith('/peserta') ||
    pathname.startsWith('/admin/soal') ||
    pathname.startsWith('/bank-soal') || // <-- DITAMBAHKAN: Bebaskan Bank Soal
    pathname.startsWith('/login-kuis') || // <-- DITAMBAHKAN: Bebaskan Pintu Login PIN
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // 2. Perbarui sesi cookie Supabase Hub (sb-hub-auth-token) secara aman
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(hubUrl, hubAnonKey, {
    cookieOptions: {
      name: HUB_COOKIE_NAME,
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 3. Proteksi Halaman Khusus Game Hub & TTS (Satu Halaman Login Terpadu: /login)
  const isProtectedPath =
    pathname.startsWith('/path') ||
    pathname.startsWith('/tts') ||
    pathname.startsWith('/account') ||
    pathname.startsWith('/admin-hub');

  if (isProtectedPath && !user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 4. Proteksi Pemain Terkena Banned Anti-Cheat: Arahkan ke /banned
  if (user && (pathname.startsWith('/path') || pathname.startsWith('/tts'))) {
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('is_banned, role')
        .eq('id', user.id)
        .maybeSingle();

      if (prof?.is_banned && prof?.role !== 'admin') {
        return NextResponse.redirect(new URL('/banned', request.url));
      }
    } catch {
      // Abaikan jika terjadi kegagalan query sementara di edge runtime
    }
  }

  // Jika akun tidak dibanned mencoba membuka halaman /banned, arahkan ke /path
  if (pathname === '/banned' && user) {
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('is_banned')
        .eq('id', user.id)
        .maybeSingle();

      if (prof && !prof.is_banned) {
        return NextResponse.redirect(new URL('/path', request.url));
      }
    } catch {
      // Abaikan
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Jalankan middleware pada seluruh path kecuali file statis Next.js & media
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3|wav)$).*)',
  ],
};
