import { createBrowserClient } from '@supabase/ssr';
import { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// KONFIGURASI ENVIRONMENT SUPABASE HUB (ISOLASI MURNI DARI KUIS BATTLE)
// ============================================================================
export const hubUrl = process.env.NEXT_PUBLIC_SUPABASE_HUB_URL || '';
export const hubAnonKey = process.env.NEXT_PUBLIC_SUPABASE_HUB_ANON_KEY || '';

/**
 * Cookie namespace khusus Game Hub untuk mengisolasi token sesi
 * agar tidak pernah bentrok dengan cookies Supabase Kuis Battle yang lama.
 */
export const HUB_COOKIE_NAME = 'sb-hub-auth-token';

// ============================================================================
// TIPE DATA & ENTITAS SUPABASE HUB (TYPESCRIPT KETAT)
// ============================================================================

export type UserRole = 'player' | 'admin';

export interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  role: UserRole;
  total_score: number;
  coins: number;
  lives: number;
  max_lives: number;
  last_life_regen: string;
  badges: string[];
  created_at: string;
  updated_at: string;
}

export interface GameSettings {
  id: number;
  base_points_per_word: number;
  decay_rate_per_sec: number;
  hard_timer_seconds: number;
  coins_per_level: number;
  hint_price_coins: number;
  freeze_price_coins: number;
  freeze_duration_seconds: number;
  life_regen_minutes: number;
  coins_refill_lives_price: number;
  is_hard_zone_global: boolean;
  current_season: number;
  updated_at: string;
}

export interface TTSUnit {
  id: string;
  unit_number: number;
  title: string;
  description: string;
  theme_color: string;
  is_active: boolean;
  is_special_event: boolean;
  event_start_at: string | null;
  event_end_at: string | null;
  created_at: string;
}

export type BranchDirection = 'main' | 'left' | 'right';
export type LevelStatus = 'draft' | 'published';

export interface TTSLevel {
  id: string;
  unit_id: string;
  level_number: number;
  title: string;
  grid_rows: number;
  grid_cols: number;
  is_hard_zone: boolean;
  hard_timer_override: number | null;
  decay_rate_override: number | null;
  branch_direction: BranchDirection;
  status: LevelStatus;
  created_at: string;
  updated_at: string;
}

export type WordDirection = 'across' | 'down';

export interface TTSWord {
  id: string;
  level_id: string;
  word_number: number;
  direction: WordDirection;
  start_row: number;
  start_col: number;
  word: string;
  clue: string;
  points: number;
  created_at: string;
}

export type UserProgressStatus = 'locked' | 'unlocked' | 'in_progress' | 'completed';

export interface TTSUserProgress {
  id: string;
  user_id: string;
  level_id: string;
  status: UserProgressStatus;
  grid_state: Record<string, string>;
  completed_words: string[];
  score_earned: number;
  time_taken_seconds: number;
  combo_multiplier: number;
  completed_at: string | null;
  updated_at: string;
}

export interface TTSLeaderboardEntry {
  id: string;
  user_id: string;
  season_number: number;
  total_score: number;
  total_time_taken: number;
  levels_completed: number;
  updated_at: string;
  profiles?: Profile;
}

export interface HallOfFameEntry {
  id: string;
  season_number: number;
  user_id: string | null;
  username: string;
  avatar_url: string | null;
  rank: 1 | 2 | 3;
  score: number;
  time_taken: number;
  reward_badge: string;
  archived_at: string;
}

export interface BannedUser {
  id: string;
  email: string;
  user_id: string | null;
  reason: string;
  banned_at: string;
}

// ============================================================================
// FACTORY FUNCTION: KLIEN BROWSER SUPABASE HUB (CLIENT COMPONENT SAFE)
// ============================================================================

/**
 * Client Browser (Client Components):
 * Digunakan di komponen 'use client' pada sistem Game Hub & TTS.
 * Menyimpan auth cookies di bawah namespace HUB_COOKIE_NAME.
 */
export function createHubBrowserClient(): SupabaseClient {
  return createBrowserClient(hubUrl, hubAnonKey, {
    cookieOptions: {
      name: HUB_COOKIE_NAME,
    },
  });
}
