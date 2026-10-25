import { NextResponse } from 'next/server';
import { createHubServerClient } from '@/lib/supabase-hub-server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/reset-password';

  if (code) {
    // Kita panggil client asli buatan lu yang settingan cookie-nya udah bener!
    const supabase = await createHubServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    
    // Kalau gagal, tampilkan pesan error dengan jelas
    return new NextResponse(`
      <div style="font-family:sans-serif; padding: 20px; color: white; background: #090d16; height: 100vh;">
        <h2 style="color: #f43f5e;">Gagal Verifikasi Kode (PKCE)</h2>
        <p style="color: #fbbf24;">"${error.message}"</p>
        <p style="margin-top: 20px;"><strong>Solusi Wajib:</strong> Pastikan lu menyalin (Copy URL) tautan dari email, lalu menempelkannya (Paste) di Google Chrome yang <strong>sama persis</strong> dengan yang lu pakai buat request Lupa Password tadi. Jangan diklik langsung dari Gmail!</p>
        <a href="/login" style="color: #34d399; font-weight: bold; text-decoration: none; margin-top: 20px; display: inline-block;">&larr; Coba Request Ulang</a>
      </div>
    `, { headers: { 'Content-Type': 'text/html' } });
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
