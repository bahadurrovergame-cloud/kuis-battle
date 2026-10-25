import { createServerClient } from '@supabase/ssr';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { hubUrl, hubAnonKey, HUB_COOKIE_NAME } from './supabase-hub';

// ============================================================================
// FACTORY FUNCTIONS: KLIEN SERVER SUPABASE HUB (SERVER ACTIONS & API ROUTES)
// ============================================================================

/**
 * 1. Client Server (Server Components, Server Actions, Route Handlers):
 * Menangani parsing dan penulisan cookie auth server-side Next.js App Router secara async.
 */
export async function createHubServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient(hubUrl, hubAnonKey, {
    cookieOptions: {
      name: HUB_COOKIE_NAME,
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Abaikan error jika dipanggil dari Server Component murni
          // di mana modifikasi response cookies tidak diizinkan.
        }
      },
    },
  });
}

/**
 * Helper untuk memvalidasi apakah kunci Service Role asli (bukan placeholder atau anon key).
 */
export function isRealServiceRoleKey(key?: string): boolean {
  if (!key || typeof key !== 'string') return false;
  if (key.includes('isi_dengan') || key.includes('placeholder')) return false;
  if (key === hubAnonKey) return false;

  // Mendukung format token baru Supabase (sb_secret_...)
  if (key.startsWith('sb_secret_')) {
    return true;
  }

  // Mendukung format JWT legacy Supabase (ey...)
  if (key.startsWith('ey')) {
    try {
      const parts = key.split('.');
      if (parts.length === 3) {
        const payloadStr = Buffer.from(parts[1], 'base64').toString('utf-8');
        const payload = JSON.parse(payloadStr);
        if (payload.role !== 'service_role') {
          return false;
        }
        const hubRef = hubUrl.replace('https://', '').split('.')[0];
        if (payload.ref && hubRef && payload.ref !== hubRef) {
          return false;
        }
      }
    } catch {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * 2. Client Admin Service Role (Backend Khusus / Server Actions Eksekusi Tinggi):
 * Digunakan KHUSUS untuk eksekusi server-side sensitif seperti:
 * - Trio Anti-Cheat (Penghapusan akun seketika via supabaseAdmin.auth.admin.deleteUser)
 * - Reset Season Mingguan & Hall of Fame archiving
 * JANGAN PERNAH diekspos ke browser / client component!
 */
export function createHubAdminClient(): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_HUB_SERVICE_ROLE_KEY;

  if (!isRealServiceRoleKey(serviceRoleKey)) {
    // Jangan pernah kirim string placeholder ke Supabase karena akan memicu "Invalid API key"
    return createClient(hubUrl, hubAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return createClient(hubUrl, serviceRoleKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

