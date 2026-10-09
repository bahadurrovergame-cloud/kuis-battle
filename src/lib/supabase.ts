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
  package_name?: string; // default "Umum / Bebas"
  box_number?: number | null; // 1 s/d 9
  is_active_box?: boolean;
  is_opened?: boolean;
  created_at?: string;
}

export interface GameSession {
  id: string;
  room_code: string;
  title: string;
  status: 'waiting' | 'active' | 'paused' | 'finished' | 'type_select' | 'box_pilihan_ganda' | 'box_benar_salah' | 'box_essay' | string;
  current_question_id: string | null;
  is_answer_revealed: boolean;
  timer_remaining: number;
  is_timer_running: boolean;
  blink_box_count?: number; // 6 atau 9
  active_view?: 'welcome' | 'category_select' | 'question_active';
  created_at?: string;
  updated_at?: string;
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
  members?: string; // string nama-nama peserta (contoh: "Ahmad, Budi, Siti")
  created_at?: string;
  updated_at?: string;
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

export function parseSessionMeta(session: GameSession | null | undefined): {
  cleanTitle: string;
  boxCount: number;
} {
  if (!session) return { cleanTitle: 'Kuis Battle Panggung', boxCount: 6 };
  const rawTitle = session.title || 'Kuis Battle Panggung';
  const boxMatch = rawTitle.match(/\[BOXES:(\d+)\]/);
  const cleanTitle = rawTitle.replace(/\[BOXES:\d+\]/g, '').trim() || 'Kuis Battle Panggung';
  const boxCount = boxMatch ? parseInt(boxMatch[1], 10) : (session.blink_box_count || 6);
  return { cleanTitle, boxCount: Math.max(1, boxCount) };
}

export function buildSessionTitleWithBoxes(cleanTitle: string, boxCount: number): string {
  const clean = cleanTitle.replace(/\[BOXES:\d+\]/g, '').trim() || 'Kuis Battle Panggung';
  return `${clean} [BOXES:${Math.max(1, boxCount)}]`;
}

