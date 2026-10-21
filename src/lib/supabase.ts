import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type QuestionType = 'pilihan_ganda' | 'benar_salah' | 'essay';

export interface QuestionOption {
  key: string;
  text: string;
}

export interface Question {
  id: string;
  category_id: string | null;
  type: QuestionType;
  question_text: string;
  options: QuestionOption[];
  correct_answer: string;
  explanation: string | null;
  timer_duration: number;
  points: number;
  package_name?: string;
  box_number?: number | null;
  is_active_box?: boolean;
  is_opened?: boolean;
  created_at?: string;
}

export interface GameSession {
  id: string;
  room_code: string;
  title: string;
  status:
    | 'waiting'
    | 'active'
    | 'paused'
    | 'finished'
    | 'type_select'
    | 'category_select'
    | 'box_pilihan_ganda'
    | 'box_benar_salah'
    | 'box_essay'
    | string;
  active_round?: string; // Menyimpan babak aktif room ini (misal: "Babak 1", "Babak 2", "Final")
  current_question_id: string | null;
  is_answer_revealed: boolean;
  timer_remaining: number;
  is_timer_running: boolean;
  blink_box_count?: number;
  active_view?: 'welcome' | 'category_select' | 'question_active';
  created_at?: string;
  updated_at?: string;
}

// Tipe data pemetaan paket soal & slot kotak per room
export interface SessionQuestion {
  id: string;
  session_id: string;
  question_id: string;
  round_name: string;
  box_number: number | null;
  is_opened: boolean;
  created_at?: string;
  question?: Question;
}

export interface Team {
  id: string;
  session_id: string;
  name: string;
  color: string;
  score: number;
  rank: number;
  is_active: boolean;
  member_count?: number;
  members?: string;
  created_at?: string;
  updated_at?: string;
}

// Payload sinkronisasi real-time instan (Zero Delay) via Supabase Broadcast
export interface QuizStateUpdatePayload {
  sessionUpdate?: Partial<GameSession>;
  currentQuestion?: Question | null;
  remainingTime?: number;
  teams?: Team[];
  openedBoxIds?: string[];
  action?: string;
}

export function parseQuestionMeta(q: Question): Question {
  const boxMatch = q.explanation?.match(/\[BOX:(\d+)\]/);
  const pkgMatch = q.explanation?.match(/\[PAKET:([^\]]+)\]/);
  const cleanExp = q.explanation
    ? q.explanation.replace(/\[BOX:\d+\]/g, '').replace(/\[PAKET:[^\]]+\]/g, '').trim()
    : null;

  return {
    ...q,
    box_number: boxMatch ? parseInt(boxMatch[1], 10) : (q.box_number ?? null),
    package_name: pkgMatch ? pkgMatch[1] : (q.package_name || 'Umum / Bebas'),
    explanation: cleanExp,
  };
}

export function buildExplanationWithMeta(
  cleanExplanation: string | null | undefined,
  boxNumber: number | null | undefined,
  packageName?: string | null | undefined
): string | null {
  const clean = cleanExplanation
    ? cleanExplanation.replace(/\[BOX:\d+\]/g, '').replace(/\[PAKET:[^\]]+\]/g, '').trim()
    : '';
  let result = clean;
  if (boxNumber) {
    result += ` [BOX:${boxNumber}]`;
  }
  if (packageName && packageName !== 'Umum / Bebas') {
    result += ` [PAKET:${packageName}]`;
  }
  return result.trim() || null;
}

// ============================================================================
// DEFINISI TEMA PANGGUNG REAL-TIME
// ============================================================================
export type ThemeKey = 'default' | 'daylight' | 'royal-gold' | 'cyberpunk' | 'emerald';

export interface ThemeOption {
  id: ThemeKey;
  name: string;
  badge: string;
  bgHex: string;
  cardHex: string;
  accentHex: string;
  description: string;
}

export const THEME_PRESETS: ThemeOption[] = [
  {
    id: 'default',
    name: 'Midnight Slate',
    badge: 'Gelap Standar',
    bgHex: '#020617',
    cardHex: '#0f172a',
    accentHex: '#3b82f6',
    description: 'Gelap modern, aksen safir & ungu neon.',
  },
  {
    id: 'daylight',
    name: 'Auditorium Daylight',
    badge: 'Terang / Siang Hari',
    bgHex: '#f1f5f9',
    cardHex: '#ffffff',
    accentHex: '#0284c7',
    description: 'Putih bersih kontras tinggi, ideal untuk proyektor redup.',
  },
  {
    id: 'royal-gold',
    name: 'Royal Navy & Gold',
    badge: 'Grand Final & Formal',
    bgHex: '#050b1e',
    cardHex: '#0b1536',
    accentHex: '#f59e0b',
    description: 'Biru dongker pekat & aksen emas mewah.',
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Arena',
    badge: 'Gaming / E-Sports',
    bgHex: '#05050c',
    cardHex: '#0e0921',
    accentHex: '#06b6d4',
    description: 'Hitam pekat, neon cyan & magenta elektrik.',
  },
  {
    id: 'emerald',
    name: 'Emerald Zamrud',
    badge: 'Nuansa Alam / Syiar',
    bgHex: '#02170d',
    cardHex: '#062618',
    accentHex: '#10b981',
    description: 'Hijau zamrud elegan dengan aksen mint cerah.',
  },
];

export function applyThemeToDom(theme: string | null | undefined) {
  if (typeof document === 'undefined') return;
  const validTheme = (theme && THEME_PRESETS.some((t) => t.id === theme)) ? theme : 'default';
  document.documentElement.setAttribute('data-theme', validTheme);
  try {
    localStorage.setItem('app_theme', validTheme);
  } catch {}
}

export function parseSessionMeta(session: GameSession | null | undefined): {
  cleanTitle: string;
  boxCount: number;
  activeCategoryId: string | null;
  theme: ThemeKey;
} {
  if (!session) {
    const saved = (typeof window !== 'undefined' ? localStorage.getItem('app_theme') : null) as ThemeKey;
    return { cleanTitle: 'Kuis Battle Panggung', boxCount: 12, activeCategoryId: null, theme: saved || 'default' };
  }
  const rawTitle = session.title || 'Kuis Battle Panggung';
  const boxMatch = rawTitle.match(/\[BOXES:(\d+)\]/);
  const catMatch = rawTitle.match(/\[CAT:([^\]]+)\]/);
  const themeMatch = rawTitle.match(/\[THEME:([^\]]+)\]/);

  const cleanTitle =
    rawTitle
      .replace(/\[BOXES:\d+\]/g, '')
      .replace(/\[CAT:[^\]]+\]/g, '')
      .replace(/\[THEME:[^\]]+\]/g, '')
      .trim() || 'Kuis Battle Panggung';

  const boxCount = boxMatch ? parseInt(boxMatch[1], 10) : (session.blink_box_count || 12);
  const activeCategoryId = catMatch ? catMatch[1] : null;
  const theme = (themeMatch ? themeMatch[1] : (typeof window !== 'undefined' ? localStorage.getItem('app_theme') : null) || 'default') as ThemeKey;

  return { cleanTitle, boxCount: Math.max(1, boxCount), activeCategoryId, theme };
}

export function buildSessionTitleWithMeta(
  cleanTitle: string,
  boxCount: number,
  activeCategoryId?: string | null,
  theme?: string | null
): string {
  const clean =
    cleanTitle
      .replace(/\[BOXES:\d+\]/g, '')
      .replace(/\[CAT:[^\]]+\]/g, '')
      .replace(/\[THEME:[^\]]+\]/g, '')
      .trim() || 'Kuis Battle Panggung';
  let res = `${clean} [BOXES:${Math.max(1, boxCount)}]`;
  if (activeCategoryId && activeCategoryId !== 'all') {
    res += ` [CAT:${activeCategoryId}]`;
  }
  if (theme && theme !== 'default') {
    res += ` [THEME:${theme}]`;
  }
  return res;
}

export function buildSessionTitleWithBoxes(cleanTitle: string, boxCount: number, theme?: string | null): string {
  return buildSessionTitleWithMeta(cleanTitle, boxCount, null, theme);
}
