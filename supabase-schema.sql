-- ============================================================================
-- KUIS BATTLE PANGGUNG (DDL SQL SCHEMA & SEED DATA)
-- Jalankan skrip ini langsung di menu SQL Editor pada Dashboard Supabase Anda.
-- ============================================================================

-- 1. ENUM TYPE
DO $$ BEGIN
    CREATE TYPE question_type AS ENUM ('pilihan_ganda', 'benar_salah', 'essay');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. TABEL KATEGORI SOAL
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABEL SOAL (QUESTIONS)
-- options: JSONB array misal: [{"key": "A", "text": "Jawaban A"}, ...] (hanya untuk pilihan_ganda)
-- correct_answer: format teks (A/B/C/D untuk PG, "true"/"false" untuk B/S, teks rujukan untuk essay)
CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    type question_type NOT NULL DEFAULT 'pilihan_ganda',
    question_text TEXT NOT NULL,
    options JSONB DEFAULT '[]'::jsonb,
    correct_answer TEXT NOT NULL,
    explanation TEXT,
    timer_duration INT NOT NULL DEFAULT 30, -- durasi timer dalam detik
    points INT NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TABEL SESI GAME (GAME SESSIONS)
CREATE TABLE IF NOT EXISTS game_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code VARCHAR(10) NOT NULL UNIQUE,
    title VARCHAR(150) NOT NULL DEFAULT 'Kuis Battle Panggung',
    status VARCHAR(20) NOT NULL DEFAULT 'waiting', -- waiting, active, paused, finished
    current_question_id UUID REFERENCES questions(id) ON DELETE SET NULL,
    is_answer_revealed BOOLEAN NOT NULL DEFAULT false,
    timer_remaining INT NOT NULL DEFAULT 30,
    is_timer_running BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TABEL REGU / PESERTA (TEAMS)
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(20) DEFAULT '#3b82f6',
    score INT NOT NULL DEFAULT 0,
    rank INT DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_team_per_session UNIQUE(session_id, name)
);

-- 6. INDEXING UNTUK QUERY CEPAT
CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_room ON game_sessions(room_code);
CREATE INDEX IF NOT EXISTS idx_teams_session ON teams(session_id);

-- 7. SUPABASE REALTIME CONFIGURATION
-- Memastikan tabel game_sessions dan teams dapat disiarkan secara real-time via WebSocket
ALTER TABLE game_sessions REPLICA IDENTITY FULL;
ALTER TABLE teams REPLICA IDENTITY FULL;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE game_sessions, teams;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- Karena aplikasi ini menggunakan 1 operator terpusat & scoreboard pasif, aktifkan akses publik (read/write)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

-- Categories policy
CREATE POLICY "Public full access on categories" ON categories FOR ALL USING (true) WITH CHECK (true);

-- Questions policy
CREATE POLICY "Public full access on questions" ON questions FOR ALL USING (true) WITH CHECK (true);

-- Game Sessions policy
CREATE POLICY "Public full access on game_sessions" ON game_sessions FOR ALL USING (true) WITH CHECK (true);

-- Teams policy
CREATE POLICY "Public full access on teams" ON teams FOR ALL USING (true) WITH CHECK (true);


-- 9. SEED DATA AWAL
-- Kategori
INSERT INTO categories (id, name, description) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Pengetahuan Umum', 'Soal pengetahuan wawasan nusantara dan dunia'),
    ('22222222-2222-2222-2222-222222222222', 'Sains & Teknologi', 'Fisika, biologi, komputasi, dan astronomi'),
    ('33333333-3333-3333-3333-333333333333', 'Sejarah & Budaya', 'Sejarah Indonesia dan peninggalan peradaban')
ON CONFLICT (name) DO NOTHING;

-- Soal (5 Soal Contoh: 2 Pilihan Ganda, 2 Benar/Salah, 1 Essay)
INSERT INTO questions (id, category_id, type, question_text, options, correct_answer, explanation, timer_duration, points) VALUES
    (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '11111111-1111-1111-1111-111111111111',
        'pilihan_ganda',
        'Apa nama ibukota masa depan Indonesia yang terletak di Kalimantan Timur?',
        '[{"key": "A", "text": "Nusantara"}, {"key": "B", "text": "Balikpapan"}, {"key": "C", "text": "Samarinda"}, {"key": "D", "text": "Kutai"}]'::jsonb,
        'A',
        'Ibu Kota Nusantara (IKN) merupakan calon ibu kota Indonesia baru.',
        30,
        100
    ),
    (
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        '22222222-2222-2222-2222-222222222222',
        'pilihan_ganda',
        'Planet terdekat dengan Matahari dalam tata surya adalah...',
        '[{"key": "A", "text": "Venus"}, {"key": "B", "text": "Merkurius"}, {"key": "C", "text": "Mars"}, {"key": "D", "text": "Bumi"}]'::jsonb,
        'B',
        'Merkurius berada paling dekat dari pusat tata surya kita.',
        25,
        100
    ),
    (
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        '22222222-2222-2222-2222-222222222222',
        'benar_salah',
        'Kecepatan cahaya lebih cepat daripada kecepatan suara di udara.',
        '[]'::jsonb,
        'true',
        'Cahaya merambat sekitar 300.000 km/detik, sedangkan suara hanya ~343 m/detik.',
        20,
        50
    ),
    (
        'dddddddd-dddd-dddd-dddd-dddddddddddd',
        '33333333-3333-3333-3333-333333333333',
        'benar_salah',
        'Candi Borobudur dibangun pada masa kejayaan Kerajaan Majapahit.',
        '[]'::jsonb,
        'false',
        'Candi Borobudur dibangun oleh Dinasti Syailendra (Kerajaan Mataram Kuno), bukan Majapahit.',
        20,
        50
    ),
    (
        'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        '33333333-3333-3333-3333-333333333333',
        'essay',
        'Sebutkan 3 tokoh nasional yang merumuskan naskah teks Proklamasi Kemerdekaan Indonesia di rumah Laksamana Maeda!',
        '[]'::jsonb,
        'Ir. Soekarno, Drs. Mohammad Hatta, dan Mr. Achmad Soebardjo',
        'Naskah dirumuskan oleh ketiga tokoh tersebut pada dini hari 17 Agustus 1945.',
        45,
        150
    )
ON CONFLICT (id) DO NOTHING;

-- Sesi Game Awal (Room Code: KUIS88)
INSERT INTO game_sessions (id, room_code, title, status, current_question_id, is_answer_revealed, timer_remaining, is_timer_running) VALUES
    (
        '99999999-9999-9999-9999-999999999999',
        'KUIS88',
        'Grand Final Kuis Panggung',
        'waiting',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        false,
        30,
        false
    )
ON CONFLICT (room_code) DO NOTHING;

-- Regu Contoh Awal
INSERT INTO teams (session_id, name, color, score, rank) VALUES
    ('99999999-9999-9999-9999-999999999999', 'Regu Harimau', '#ef4444', 0, 1),
    ('99999999-9999-9999-9999-999999999999', 'Regu Garuda', '#3b82f6', 0, 1),
    ('99999999-9999-9999-9999-999999999999', 'Regu Rajawali', '#10b981', 0, 1)
ON CONFLICT (session_id, name) DO NOTHING;
