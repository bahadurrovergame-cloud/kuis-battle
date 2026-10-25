import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { hubUrl, hubAnonKey, HUB_COOKIE_NAME } from '@/lib/supabase-hub';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. ISOLASI TOTAL: Abaikan semua rute Kuis Battle lama, API lama, dan aset statis
  // Rute-rute ini tidak akan tersentuh oleh klien Supabase Hub maupun cookies Game Hub.
  if (
    pathname.startsWith('/battle') ||
    pathname.startsWith('/operator') ||
    pathname.startsWith('/control') ||
    pathname.startsWith('/peserta') ||
    pathname.startsWith('/admin/soal') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // 2. Perbarui sesi cookie Supabase Hub (sb-hub-auth-token) secara aman di Edge Middleware
  let response = NextResponse.next({
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
