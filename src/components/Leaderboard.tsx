'use client';

import React from 'react';
import { Team } from '@/lib/supabase';
import { Trophy, Medal, Award } from 'lucide-react';

interface LeaderboardProps {
  teams: Team[];
}

export default function Leaderboard({ teams }: LeaderboardProps) {
  // Sort descending by score
  const sortedTeams = [...teams].sort((a, b) => b.score - a.score);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 flex flex-col h-full shadow-2xl backdrop-blur-md">
      <div className="flex items-center gap-3 pb-4 mb-4 border-b border-slate-800">
        <Trophy className="w-6 h-6 text-amber-400" />
        <h3 className="text-lg font-black text-white tracking-wide uppercase">
          Live Klasemen
        </h3>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {sortedTeams.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-6">Belum ada regu terhubung</p>
        ) : (
          sortedTeams.map((team, index) => {
            const rank = index + 1;
            const isTop1 = rank === 1;
            const isTop2 = rank === 2;
            const isTop3 = rank === 3;

            return (
              <div
                key={team.id}
                className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                  isTop1
                    ? 'bg-amber-500/10 border-amber-500/40 shadow-sm shadow-amber-500/10'
                    : isTop2
                    ? 'bg-slate-300/10 border-slate-400/30'
                    : isTop3
                    ? 'bg-amber-700/10 border-amber-700/30'
                    : 'bg-slate-950/60 border-slate-800/80'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Badge Peringkat */}
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
                      isTop1
                        ? 'bg-amber-400 text-slate-950 shadow-md'
                        : isTop2
                        ? 'bg-slate-300 text-slate-950 shadow-sm'
                        : isTop3
                        ? 'bg-amber-700 text-white shadow-sm'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {isTop1 ? (
                      <Trophy className="w-4 h-4" />
                    ) : isTop2 ? (
                      <Medal className="w-4 h-4" />
                    ) : isTop3 ? (
                      <Award className="w-4 h-4" />
                    ) : (
                      rank
                    )}
                  </div>

                  {/* Nama Regu */}
                  <div className="truncate">
                    <span className="font-extrabold text-white text-sm block truncate">
                      {team.name}
                    </span>
                    <span
                      className="inline-block w-2.5 h-1 rounded-full"
                      style={{ backgroundColor: team.color }}
                    />
                  </div>
                </div>

                {/* Angka Skor */}
                <div className="text-right shrink-0 pl-2">
                  <span className="font-mono font-black text-xl text-white">
                    {team.score}
                  </span>
                  <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold">
                    PTS
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
