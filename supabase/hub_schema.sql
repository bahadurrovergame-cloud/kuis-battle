-- ==============================================================================
-- 🎮 SUPABASE HUB SCHEMA: GAME HUB & TTS KOMPETITIF
-- Versi: 1.0.0 (Fase 1)
-- Eksekusi file ini di SQL Editor Dashboard Supabase Hub Anda.
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABEL: PROFILES
-- Terhubung langsung ke auth.users dengan ON DELETE CASCADE.
-- Begitu user dihapus dari auth (Anti-Cheat Cascade Delete), data profil langsung musnah.
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    avatar_url TEXT DEFAULT NULL,
    role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'admin')),
    total_score INTEGER NOT NULL DEFAULT 0,
    coins INTEGER NOT NULL DEFAULT 50,
    lives INTEGER NOT NULL DEFAULT 5,
    max_lives INTEGER NOT NULL DEFAULT 5,
    last_life_regen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    badges JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indeks untuk pencarian cepat & leaderboard
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_total_score ON public.profiles(total_score DESC);

-- 3. TABEL: GAME_SETTINGS (God Mode Parameters)
-- Menyimpan parameter global yang dapat diatur via Admin Hub tanpa coding.
CREATE TABLE IF NOT EXISTS public.game_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    base_points_per_word INTEGER NOT NULL DEFAULT 100,
    decay_rate_per_sec INTEGER NOT NULL DEFAULT 2,
    hard_timer_seconds INTEGER NOT NULL DEFAULT 60,
    coins_per_level INTEGER NOT NULL DEFAULT 20,
    hint_price_coins INTEGER NOT NULL DEFAULT 15,
    freeze_price_coins INTEGER NOT NULL DEFAULT 25,
    freeze_duration_seconds INTEGER NOT NULL DEFAULT 10,
    life_regen_minutes INTEGER NOT NULL DEFAULT 15,
    coins_refill_lives_price INTEGER NOT NULL DEFAULT 50,
    is_hard_zone_global BOOLEAN NOT NULL DEFAULT FALSE,
    current_season INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Masukkan default row jika belum ada
INSERT INTO public.game_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- 4. TABEL: TTS_UNITS (Pulau Tematik & Jalur Bercabang)
CREATE TABLE IF NOT EXISTS public.tts_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_number INTEGER NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    theme_color TEXT NOT NULL DEFAULT '#10b981', -- Hex warna pulau
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_special_event BOOLEAN NOT NULL DEFAULT FALSE, -- Event Akhir Pekan (Limited Time Map)
    event_start_at TIMESTAMPTZ DEFAULT NULL,
    event_end_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tts_units_unit_number ON public.tts_units(unit_number ASC);

-- 5. TABEL: TTS_LEVELS (Node / Titik Level di Peta Duolingo)
CREATE TABLE IF NOT EXISTS public.tts_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID NOT NULL REFERENCES public.tts_units(id) ON DELETE CASCADE,
    level_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    grid_rows INTEGER NOT NULL DEFAULT 10,
    grid_cols INTEGER NOT NULL DEFAULT 10,
    is_hard_zone BOOLEAN NOT NULL DEFAULT FALSE, -- Zona Hard (Merah/Ungu Neon)
    hard_timer_override INTEGER DEFAULT NULL, -- Durasi timer khusus level ini (detik)
    decay_rate_override INTEGER DEFAULT NULL, -- Laju pembusukan skor khusus level ini
    branch_direction TEXT NOT NULL DEFAULT 'main' CHECK (branch_direction IN ('main', 'left', 'right')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_unit_level UNIQUE (unit_id, level_number)
);

CREATE INDEX IF NOT EXISTS idx_tts_levels_unit_id ON public.tts_levels(unit_id);
CREATE INDEX IF NOT EXISTS idx_tts_levels_number ON public.tts_levels(level_number ASC);

-- 6. TABEL: TTS_WORDS (Kata & Posisi Kotak TTS)
CREATE TABLE IF NOT EXISTS public.tts_words (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level_id UUID NOT NULL REFERENCES public.tts_levels(id) ON DELETE CASCADE,
    word_number INTEGER NOT NULL, -- Nomor petunjuk (contoh: 1 Mendatar)
    direction TEXT NOT NULL CHECK (direction IN ('across', 'down')), -- 'across' = mendatar, 'down' = menurun
    start_row INTEGER NOT NULL, -- Baris awal (0-based)
    start_col INTEGER NOT NULL, -- Kolom awal (0-based)
    word TEXT NOT NULL, -- Kata target (uppercase tanpa spasi)
    clue TEXT NOT NULL, -- Teks soal/petunjuk
    points INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tts_words_level_id ON public.tts_words(level_id);

-- 7. TABEL: TTS_USER_PROGRESS (Progress Kotak TTS & Auto-Save Debounce)
CREATE TABLE IF NOT EXISTS public.tts_user_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    level_id UUID NOT NULL REFERENCES public.tts_levels(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'unlocked' CHECK (status IN ('locked', 'unlocked', 'in_progress', 'completed')),
    grid_state JSONB NOT NULL DEFAULT '{}'::jsonb, -- Huruf yang sudah diisi { "0,1": "A", "0,2": "B" }
    completed_words JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array id kata yang sudah benar
    score_earned INTEGER NOT NULL DEFAULT 0,
    time_taken_seconds INTEGER NOT NULL DEFAULT 0,
    combo_multiplier NUMERIC(3,1) NOT NULL DEFAULT 1.0,
    completed_at TIMESTAMPTZ DEFAULT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_level_progress UNIQUE (user_id, level_id)
);

CREATE INDEX IF NOT EXISTS idx_user_progress_user ON public.tts_user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_level ON public.tts_user_progress(level_id);

-- 8. TABEL: TTS_LEADERBOARD (Klasemen Realtime Mingguan)
CREATE TABLE IF NOT EXISTS public.tts_leaderboard (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    season_number INTEGER NOT NULL DEFAULT 1,
    total_score INTEGER NOT NULL DEFAULT 0,
    total_time_taken INTEGER NOT NULL DEFAULT 0, -- Untuk tie-breaker adil: waktu tersingkat di atas
    levels_completed INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_season UNIQUE (user_id, season_number)
);

CREATE INDEX IF NOT EXISTS idx_tts_leaderboard_rank 
ON public.tts_leaderboard(season_number, total_score DESC, total_time_taken ASC);

-- 9. TABEL: HALL_OF_FAME (Arsip Juara Season Mingguan)
CREATE TABLE IF NOT EXISTS public.hall_of_fame (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_number INTEGER NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    username TEXT NOT NULL,
    avatar_url TEXT DEFAULT NULL,
    rank INTEGER NOT NULL CHECK (rank IN (1, 2, 3)),
    score INTEGER NOT NULL,
    time_taken INTEGER NOT NULL,
    reward_badge TEXT NOT NULL, -- '🥇', '🥈', '🥉'
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_season_rank UNIQUE (season_number, rank)
);

-- ==============================================================================
-- 🔒 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tts_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tts_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tts_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tts_user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tts_leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hall_of_fame ENABLE ROW LEVEL SECURITY;

-- Helper Function: Cek apakah user saat ini adalah admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles:
CREATE POLICY "Profiles can be viewed by all authenticated users"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Game Settings:
CREATE POLICY "Game settings can be viewed by anyone"
    ON public.game_settings FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Only admins can modify game settings"
    ON public.game_settings FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Units & Levels:
CREATE POLICY "Published units and levels can be viewed by players"
    ON public.tts_units FOR SELECT
    TO authenticated
    USING (is_active = true OR public.is_admin());

CREATE POLICY "Levels can be viewed if published or admin"
    ON public.tts_levels FOR SELECT
    TO authenticated
    USING (status = 'published' OR public.is_admin());

CREATE POLICY "Admins can manage units"
    ON public.tts_units FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "Admins can manage levels"
    ON public.tts_levels FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Words:
CREATE POLICY "Words clues can be read by authenticated users"
    ON public.tts_words FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Admins can manage words"
    ON public.tts_words FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Progress:
CREATE POLICY "Users can read and update their own progress"
    ON public.tts_user_progress FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Leaderboard:
CREATE POLICY "Leaderboard can be viewed by all users"
    ON public.tts_leaderboard FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can modify their own leaderboard row"
    ON public.tts_leaderboard FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Hall of Fame:
CREATE POLICY "Hall of fame can be viewed by all"
    ON public.hall_of_fame FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Admins can manage hall of fame"
    ON public.hall_of_fame FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ==============================================================================
-- ⚡ 11. TRIGGER: OTOMATIS BUAT PROFIL SAAT USER MENDAFTAR (AUTH TRIGGER)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    clean_username TEXT;
BEGIN
    -- Ambil username dari metadata atau ambil dari bagian depan email
    clean_username := COALESCE(
        new.raw_user_meta_data->>'username',
        SPLIT_PART(new.email, '@', 1)
    );

    -- Pastikan unik dengan append angka acak jika bentrok
    IF EXISTS (SELECT 1 FROM public.profiles WHERE username = clean_username) THEN
        clean_username := clean_username || '_' || SUBSTRING(new.id::text, 1, 4);
    END IF;

    INSERT INTO public.profiles (
        id,
        username,
        avatar_url,
        role,
        total_score,
        coins,
        lives,
        max_lives,
        last_life_regen,
        badges
    ) VALUES (
        new.id,
        clean_username,
        new.raw_user_meta_data->>'avatar_url',
        COALESCE(new.raw_user_meta_data->>'role', 'player'),
        0,
        50, -- Hadiah koin selamat datang
        5,  -- 5 Nyawa awal
        5,
        NOW(),
        '[]'::jsonb
    );

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Pasang Trigger ke auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 📡 12. AKTIFKAN SUPABASE REALTIME
-- ==============================================================================
-- Pastikan leaderboard dan progres dapat didengarkan secara real-time
ALTER PUBLICATION supabase_realtime ADD TABLE public.tts_leaderboard;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- ==============================================================================
-- 🌟 13. SEED DATA AWAL: STARTER UNITS & LEVELS
-- ==============================================================================
INSERT INTO public.tts_units (id, unit_number, title, description, theme_color, is_active, is_special_event)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 1, 'Unit 1: Wawasan Nusantara', 'Pemanasan teka-teki seputar geografi, budaya, dan pengetahuan umum Indonesia.', '#10b981', true, false),
    ('22222222-2222-2222-2222-222222222222', 2, 'Unit 2: Kuliner & Rempah', 'Uji keahlian rasa dan aroma kuliner legendaris nusantara.', '#f59e0b', true, false),
    ('33333333-3333-3333-3333-333333333333', 3, 'Unit 3: Zona Siber & Teknologi', 'Zona ekstrem dengan pembusukan skor 2x lipat dan istilah teknologi masa depan!', '#8b5cf6', true, false)
ON CONFLICT (unit_number) DO NOTHING;

INSERT INTO public.tts_levels (id, unit_id, level_number, title, grid_rows, grid_cols, is_hard_zone, branch_direction, status)
VALUES
    ('aaaaaaaa-1111-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 1, 'Langkah Pertama', 8, 8, false, 'main', 'published'),
    ('aaaaaaaa-1111-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 2, 'Ibukota & Samudera', 9, 9, false, 'right', 'published'),
    ('aaaaaaaa-1111-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 3, 'Suku & Bahasa', 9, 9, false, 'left', 'published'),
    ('aaaaaaaa-1111-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 4, 'Pusaka Rimba', 10, 10, false, 'main', 'published'),
    ('aaaaaaaa-1111-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 5, 'Ujian Titik Temu (ZONA HARD)', 10, 10, true, 'main', 'published')
ON CONFLICT (unit_id, level_number) DO NOTHING;

-- ==============================================================================
-- 🚫 14. TABEL: BANNED_USERS & RPC ANTI-CHEAT EXECUTION
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.banned_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    user_id UUID,
    reason TEXT NOT NULL DEFAULT 'Terdeteksi kecurangan 3x (Anti-Cheat)',
    banned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_banned_users_email ON public.banned_users(email);
ALTER TABLE public.banned_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view banned users"
    ON public.banned_users FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Allow server and admin to manage banned users"
    ON public.banned_users FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- Fungsi Khusus Super-User untuk Eksekusi Pemusnahan Akun Seketika (Cascade Delete)
CREATE OR REPLACE FUNCTION public.execute_anti_cheat_ban(target_user_id UUID, target_email TEXT, ban_reason TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    -- 1. Catat ke tabel banned_users
    INSERT INTO public.banned_users (email, user_id, reason, banned_at)
    VALUES (LOWER(TRIM(target_email)), target_user_id, ban_reason, NOW())
    ON CONFLICT (email) DO UPDATE 
    SET reason = EXCLUDED.reason, banned_at = NOW();

    -- 2. Hapus data game pemain
    DELETE FROM public.tts_user_progress WHERE user_id = target_user_id;
    DELETE FROM public.tts_leaderboard WHERE user_id = target_user_id;
    DELETE FROM public.profiles WHERE id = target_user_id;

    -- 3. Hapus langsung dari auth.users secara tuntas (memerlukan SECURITY DEFINER)
    DELETE FROM auth.users WHERE id = target_user_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

