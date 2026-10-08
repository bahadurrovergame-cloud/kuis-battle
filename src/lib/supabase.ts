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
  created_at?: string;
}

export interface GameSession {
  id: string;
  room_code: string;
  title: string;
  status: 'waiting' | 'active' | 'paused' | 'finished';
  current_question_id: string | null;
  is_answer_revealed: boolean;
  timer_remaining: number;
  is_timer_running: boolean;
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
  created_at?: string;
  updated_at?: string;
}
