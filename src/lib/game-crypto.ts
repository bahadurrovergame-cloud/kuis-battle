import crypto from 'crypto';

interface GameSessionPayload {
  userId: string;
  levelId: string;
  startedAt: number; // UTC timestamp in milliseconds
  nonce: string;
}

// Secret salt untuk hashing HMAC SHA-256.
// Menggunakan environment variable atau service role key server-side.
const SECRET_KEY =
  process.env.GAME_SECURITY_SALT ||
  process.env.SUPABASE_HUB_SERVICE_ROLE_KEY ||
  'kuis-battle-sultan-anti-cheat-secret-salt-2026';

/**
 * Membuat Token Sesi Game Terenkripsi/Bertanda Tangan Digital (HMAC-SHA256).
 * Mencegah manipulasi payload, penembakan API via Postman tanpa sesi,
 * serta memvalidasi waktu pengerjaan asli dari sisi server (Speedhack Prevention).
 */
export function createGameSessionToken(
  userId: string,
  levelId: string,
  startedAtMs?: number
): string {
  const payload: GameSessionPayload = {
    userId,
    levelId,
    startedAt: typeof startedAtMs === 'number' && Number.isFinite(startedAtMs) ? startedAtMs : Date.now(),
    nonce: crypto.randomBytes(8).toString('hex'),
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(payloadBase64)
    .digest('base64url');

  return `${payloadBase64}.${signature}`;
}

/**
 * Memverifikasi integritas Token Sesi Game.
 * Menggunakan constant-time comparison (crypto.timingSafeEqual) untuk mencegah timing attack.
 */
export function verifyGameSessionToken(
  token: string,
  expectedUserId: string,
  expectedLevelId: string
): { isValid: boolean; startedAt?: number; error?: string } {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return { isValid: false, error: 'Token sesi game tidak valid atau tidak disertakan.' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { isValid: false, error: 'Format token sesi game tidak sah.' };
  }

  const [payloadBase64, providedSig] = parts;
  if (!payloadBase64 || !providedSig) {
    return { isValid: false, error: 'Struktur signature sesi game rusak.' };
  }

  const expectedSig = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(payloadBase64)
    .digest('base64url');

  // Mencegah timing attack dengan membandingkan buffer secara konstan
  const bufProvided = Buffer.from(providedSig);
  const bufExpected = Buffer.from(expectedSig);

  if (bufProvided.length !== bufExpected.length || !crypto.timingSafeEqual(bufProvided, bufExpected)) {
    return {
      isValid: false,
      error: 'Pelanggaran Integritas: Signature sesi game tidak cocok (Payload Tampering Detected).',
    };
  }

  try {
    const payloadJson = Buffer.from(payloadBase64, 'base64url').toString('utf8');
    const payload: GameSessionPayload = JSON.parse(payloadJson);

    if (payload.userId !== expectedUserId) {
      return { isValid: false, error: 'Token sesi tidak cocok dengan akun pemain aktif.' };
    }

    if (payload.levelId !== expectedLevelId) {
      return { isValid: false, error: 'Token sesi tidak cocok dengan level yang dimainkan.' };
    }

    // Maksimal batas waktu 1 sesi bermain level TTS adalah 2 jam (7200 detik)
    const sessionAgeMs = Date.now() - payload.startedAt;
    if (sessionAgeMs > 2 * 60 * 60 * 1000) {
      return { isValid: false, error: 'Sesi game telah kedaluwarsa. Silakan muat ulang level.' };
    }

    return { isValid: true, startedAt: payload.startedAt };
  } catch {
    return { isValid: false, error: 'Gagal memproses data payload sesi game.' };
  }
}

