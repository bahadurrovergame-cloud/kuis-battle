'use client';

import React from 'react';

interface CircularTimerProps {
  duration: number; // total duration in seconds
  remaining: number; // remaining seconds
  isRunning: boolean;
}

export default function CircularTimer({ duration, remaining, isRunning }: CircularTimerProps) {
  const radius = 64;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius;

  // Percentage calculation
  const total = duration > 0 ? duration : 30;
  const clampedRemaining = Math.max(0, Math.min(remaining, total));
  const progress = clampedRemaining / total;
  const strokeDashoffset = circumference - progress * circumference;

  // Dynamic status color & effects
  const isUrgent = clampedRemaining <= 5 && clampedRemaining > 0;
  const isWarning = clampedRemaining <= 10 && clampedRemaining > 5;
  const isExpired = clampedRemaining === 0;

  let strokeColor = '#10b981'; // Green
  let glowColor = 'rgba(16, 185, 129, 0.4)';

  if (isUrgent) {
    strokeColor = '#ef4444'; // Red
    glowColor = 'rgba(239, 68, 68, 0.6)';
  } else if (isWarning) {
    strokeColor = '#f59e0b'; // Amber / Yellow
    glowColor = 'rgba(245, 158, 11, 0.4)';
  } else if (isExpired) {
    strokeColor = '#64748b'; // Gray
    glowColor = 'transparent';
  }

  return (
    <div className={`relative flex items-center justify-center ${isUrgent && isRunning ? 'animate-pulse' : ''}`}>
      <svg className="w-40 h-40 transform -rotate-90">
        {/* Background Track */}
        <circle
          cx="80"
          cy="80"
          r={radius}
          stroke="#1e293b"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Animated Progress Arc */}
        <circle
          cx="80"
          cy="80"
          r={radius}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
          style={{
            filter: `drop-shadow(0 0 10px ${glowColor})`,
            transition: 'stroke-dashoffset 0.8s ease, stroke 0.5s ease',
          }}
        />
      </svg>

      {/* Center Countdown Display */}
      <div className="absolute flex flex-col items-center justify-center">
        <span
          className="text-4xl font-black font-mono tracking-tight"
          style={{ color: strokeColor }}
        >
          {clampedRemaining}
        </span>
        <span className="text-[10px] tracking-widest uppercase text-slate-400 font-bold">
          DETIK
        </span>
      </div>
    </div>
  );
}
