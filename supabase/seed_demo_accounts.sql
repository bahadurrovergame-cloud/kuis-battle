-- ==============================================================================
-- 🚀 AKTIVASI AKUN DEMO INSTAN (ADMIN & PEMAIN)
-- Jalankan skrip ini di SQL Editor Dashboard Supabase Hub Anda:
-- https://supabase.com/dashboard/project/walaesizlxguuhatsrsc/sql
-- ==============================================================================

-- 1. Konfirmasi Email untuk Akun Demo seketika (Bypass Verifikasi Email Manual)
UPDATE auth.users 
SET email_confirmed_at = NOW() 
WHERE email IN ('admin@demo.com', 'player@demo.com');

-- 2. Inisialisasi Profil & Hak Akses Role Admin Sultan
INSERT INTO public.profiles (id, username, role, total_score, coins, lives, max_lives)
SELECT id, 'admin_demo', 'admin', 0, 500, 5, 5 
FROM auth.users WHERE email = 'admin@demo.com'
ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- 3. Inisialisasi Profil Pemain Biasa
INSERT INTO public.profiles (id, username, role, total_score, coins, lives, max_lives)
SELECT id, 'pemain_demo', 'player', 0, 50, 5, 5 
FROM auth.users WHERE email = 'player@demo.com'
ON CONFLICT (id) DO NOTHING;

