import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { hubUrl, hubAnonKey, HUB_COOKIE_NAME } from '@/lib/supabase-hub';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const error_param = searchParams.get('error');
  const error_description = searchParams.get('error_description');
  const next = searchParams.get('next') ?? '/reset-password';

  // 1. TANGKAP ERROR DARI EMAIL/SUPABASE
  if (error_param) {
    return new NextResponse(`
      <div style="font-family:sans-serif; padding: 20px; color: white; background: #090d16; height: 100vh;">
        <h2 style="color: #f43f5e;">Error dari Supabase:</h2>
        <p><strong>Code:</strong> ${error_param}</p>
        <p><strong>Pesan:</strong> ${error_description}</p>
        <a href="/login" style="color: #34d399; text-decoration: none;">&larr; Kembali ke Login</a>
      </div>
    `, { headers: { 'Content-Type': 'text/html' } });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(hubUrl, hubAnonKey, {
    cookieOptions: { name: HUB_COOKIE_NAME },
    cookies: {
      get(name: string) { return cookieStore.get(name)?.value; },
      set(name: string, value: string, options) { cookieStore.set({ name, value, ...options }); },
      remove(name: string, options) { cookieStore.set({ name, value: '', ...options }); },
    },
  });

  // 2. PROSES KODE KEAMANAN (PKCE Flow)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    // Jika SUKSES, langsung masuk ke form ganti password
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    
    // Jika GAGAL, tampilkan error aslinya di layar!
    return new NextResponse(`
      <div style="font-family:sans-serif; padding: 20px; color: white; background: #090d16; height: 100vh;">
        <h2 style="color: #f43f5e;">Gagal Memproses Kode (PKCE Error):</h2>
        <p style="color: #fbbf24; font-size: 16px; font-weight: bold;">"${error.message}"</p>
        <div style="background: #111726; padding: 15px; border-radius: 8px; margin-top: 20px; font-size: 14px; line-height: 1.6;">
          <strong>Penyebab Paling Sering:</strong><br/>
          Lu ngeklik link ini langsung dari aplikasi Gmail, bukan di-Copy dan Paste ke Google Chrome tempat lu request lupa password tadi.<br/><br/>
          Sistem nolak karena beda browser = beda sesi keamanan.
        </div>
        <br/>
        <a href="/login" style="color: #34d399; text-decoration: none; font-weight: bold;">&larr; Coba Request Ulang</a>
      </div>
    `, { headers: { 'Content-Type': 'text/html' } });
  }

  // 3. JIKA LINK KOSONG ATAU PAKAI HASH
  return new NextResponse(`
    <html style="background: #090d16; color: white; font-family: sans-serif; text-align: center; padding: 50px;">
      <body>
        <h2>Memeriksa Sesi...</h2>
        <script>
          if (window.location.hash && window.location.hash.includes('access_token')) {
            window.location.href = '${next}' + window.location.hash;
          } else if (window.location.hash && window.location.hash.includes('error')) {
            document.body.innerHTML = '<h2 style="color: #f43f5e;">Error dari Link:</h2><p>' + window.location.hash + '</p><a href="/login" style="color: #34d399;">Kembali</a>';
          } else {
            document.body.innerHTML = '<h2 style="color: #f43f5e;">Link Tidak Valid</h2><p>Kode keamanan tidak ditemukan di link ini.</p><a href="/login" style="color: #34d399;">Kembali ke Login</a>';
          }
        </script>
      </body>
    </html>
  `, { headers: { 'Content-Type': 'text/html' } });
}
