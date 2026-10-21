'use client';

import { useEffect, useRef, useState } from 'react';
import { sounds } from '@/lib/sound';

export interface ScoreEventPayload {
  type: 'correct' | 'wrong' | 'expired';
  teamName: string | null;
  teamColor: string | null;
  points: number;
}

interface ScoreToastProps {
  event: ScoreEventPayload | null;
  /** Dipanggil setelah animasi selesai */
  onDone: () => void;
}

/**
 * ScoreToast — Overlay animasi full-screen yang muncul di proyektor
 * setiap kali operator menekan Keputusan Cepat atau mengubah skor.
 *
 * Trigger: prop `event` diisi oleh listener broadcast 'score_event'
 * di operator/page.tsx. Setelah animasi selesai, `onDone()` dipanggil
 * agar parent bisa reset event ke null.
 */
export default function ScoreToast({ event, onDone }: ScoreToastProps) {
  const [phase, setPhase] = useState<'in' | 'hold' | 'out' | 'done'>('done');
  const [particles, setParticles] = useState<{ id: number; x: number; color: string; size: number; shape: string }[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!event) return;

    // Reset & mulai animasi
    setPhase('in');

    // Bunyi sesuai tipe
    if (event.type === 'correct') {
      sounds.playScoreUp();
    } else if (event.type === 'wrong') {
      sounds.playWrong();
    }

    // Confetti hanya untuk correct
    if (event.type === 'correct') {
      const baseColor = event.teamColor || '#4ade80';
      const palette = [baseColor, '#fbbf24', '#f8fafc', '#a78bfa', '#34d399'];
      const newParticles = Array.from({ length: 30 }, (_, i) => ({
        id: i,
        x: 5 + Math.random() * 90,
        color: palette[Math.floor(Math.random() * palette.length)],
        size: 6 + Math.random() * 10,
        shape: Math.random() > 0.5 ? '50%' : '3px',
      }));
      setParticles(newParticles);
      setTimeout(() => setParticles([]), 2200);
    }

    // Timeline: in(500ms) → hold(1800ms) → out(400ms) → done
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      setPhase('hold');
      timerRef.current = setTimeout(() => {
        setPhase('out');
        timerRef.current = setTimeout(() => {
          setPhase('done');
          onDoneRef.current();
        }, 450);
      }, 1800);
    }, 500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [event]);

  if (phase === 'done' || !event) return null;

  const isCorrect = event.type === 'correct';
  const isExpired = event.type === 'expired';

  return (
    <>
      {/* Flash Overlay di seluruh layar */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: 200,
          background: isCorrect
            ? 'radial-gradient(ellipse at center, rgba(74,222,128,0.22) 0%, transparent 70%)'
            : isExpired
            ? 'radial-gradient(ellipse at center, rgba(251,191,36,0.14) 0%, transparent 70%)'
            : 'radial-gradient(ellipse at center, rgba(239,68,68,0.20) 0%, transparent 70%)',
          opacity: phase === 'out' ? 0 : 1,
          transition: 'opacity 0.4s ease',
        }}
      />

      {/* Confetti Particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="fixed pointer-events-none"
          style={{
            zIndex: 210,
            left: `${p.x}%`,
            top: '-12px',
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.shape,
            animation: `scoreConfettiFall ${1.2 + Math.random() * 0.8}s ease-in forwards`,
            animationDelay: `${Math.random() * 0.3}s`,
          }}
        />
      ))}

      {/* Toast Utama */}
      <div
        className="fixed pointer-events-none"
        style={{
          zIndex: 220,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      >
        <div
          style={{
            background: isCorrect
              ? 'linear-gradient(135deg, #14532d, #166534)'
              : isExpired
              ? 'linear-gradient(135deg, #422006, #78350f)'
              : 'linear-gradient(135deg, #450a0a, #7f1d1d)',
            border: `3px solid ${isCorrect ? '#4ade80' : isExpired ? '#fbbf24' : '#ef4444'}`,
            borderRadius: '28px',
            padding: '32px 52px',
            minWidth: 320,
            maxWidth: '90vw',
            textAlign: 'center',
            boxShadow: `
              0 0 0 6px ${isCorrect ? 'rgba(74,222,128,0.14)' : isExpired ? 'rgba(251,191,36,0.14)' : 'rgba(239,68,68,0.14)'},
              0 0 60px ${isCorrect ? 'rgba(74,222,128,0.35)' : isExpired ? 'rgba(251,191,36,0.25)' : 'rgba(239,68,68,0.35)'},
              0 30px 80px rgba(0,0,0,0.65)
            `,
            animation: phase === 'in'
              ? 'scoreToastIn 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards'
              : phase === 'out'
              ? 'scoreToastOut 0.45s ease-in forwards'
              : undefined,
            opacity: phase === 'hold' ? 1 : undefined,
          }}
        >
          {isCorrect && event.teamName && (
            <>
              <div style={{ fontSize: 18, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: event.teamColor || '#86efac', marginBottom: 6 }}>
                🏆 {event.teamName}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#bbf7d0', marginBottom: 18 }}>
                ✅ JAWABAN BENAR!
              </div>
              <div style={{ fontSize: 80, fontWeight: 900, lineHeight: 1, color: '#4ade80', textShadow: '0 0 40px rgba(74,222,128,0.8), 0 0 80px rgba(74,222,128,0.4)', letterSpacing: '-3px' }}>
                +{Math.abs(event.points)}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#86efac', marginTop: 6 }}>
                POIN
              </div>
            </>
          )}

          {event.type === 'wrong' && event.teamName && (
            <>
              <div style={{ fontSize: 18, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: event.teamColor || '#fca5a5', marginBottom: 6 }}>
                💢 {event.teamName}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fecaca', marginBottom: 14 }}>
                Jawaban tidak tepat!
              </div>
              <div
                style={{
                  fontSize: 72, fontWeight: 900, lineHeight: 1, color: '#ef4444',
                  textShadow: '0 0 40px rgba(239,68,68,0.8), 0 0 80px rgba(239,68,68,0.4)',
                  animation: 'scoreShake 0.55s ease-in-out',
                }}
              >
                ✗
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#fca5a5', marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                SALAH!
              </div>
              {Math.abs(event.points) > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'center',
                    gap: 8,
                    marginTop: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: 60,
                      fontWeight: 900,
                      lineHeight: 1,
                      color: '#f87171',
                      textShadow: '0 0 35px rgba(239,68,68,0.85), 0 0 70px rgba(239,68,68,0.45)',
                      letterSpacing: '-2px',
                    }}
                  >
                    -{Math.abs(event.points)}
                  </span>
                  <span
                    style={{
                      fontSize: 22,
                      fontWeight: 800,
                      color: '#fca5a5',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    POIN
                  </span>
                </div>
              )}
            </>
          )}

          {event.type === 'expired' && (
            <>
              <div style={{ fontSize: 18, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#fde68a', marginBottom: 6 }}>
                ⏱️ Waktu Habis!
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fef3c7', marginBottom: 18 }}>
                Soal tidak terjawab
              </div>
              <div style={{ fontSize: 80, fontWeight: 900, lineHeight: 1, color: '#fbbf24', textShadow: '0 0 40px rgba(251,191,36,0.7)' }}>
                —
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#fde68a', marginTop: 8 }}>
                Tidak Ada Poin
              </div>
            </>
          )}
        </div>
      </div>

      {/* Keyframes disuntikkan via <style> */}
      <style>{`
        @keyframes scoreToastIn {
          0%   { opacity: 0; transform: scale(0.3) rotate(-5deg); }
          40%  { opacity: 1; transform: scale(1.12) rotate(2deg); }
          60%  { transform: scale(0.97) rotate(-1deg); }
          80%  { transform: scale(1.04) rotate(0.5deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        @keyframes scoreToastOut {
          0%   { opacity: 1; transform: scale(1) translateY(0); }
          100% { opacity: 0; transform: scale(0.75) translateY(-40px); }
        }
        @keyframes scoreShake {
          0%,100% { transform: rotate(0deg) translateX(0); }
          10%  { transform: rotate(-5deg) translateX(-12px); }
          30%  { transform: rotate(5deg)  translateX(12px); }
          50%  { transform: rotate(-3deg) translateX(-7px); }
          70%  { transform: rotate(3deg)  translateX(7px); }
          90%  { transform: rotate(-1deg) translateX(-3px); }
        }
        @keyframes scoreConfettiFall {
          0%   { opacity: 1; transform: translateY(0) rotate(0deg) scale(1); }
          100% { opacity: 0; transform: translateY(120vh) rotate(720deg) scale(0.3); }
        }
      `}</style>
    </>
  );
}

