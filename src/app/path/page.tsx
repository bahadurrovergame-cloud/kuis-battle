'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  createHubBrowserClient,
  Profile,
  TTSUnit,
  TTSLevel,
  TTSUserProgress,
  GameSettings,
  TTSLeaderboardEntry,
} from '@/lib/supabase-hub';
import { refillLivesAction, syncLifeRegenAction } from '@/app/tts/actions';
import { getPathDataAction } from './actions';
import {
  getPathCache,
  setPathCache,
  getOptimisticCompletions,
  clearOptimisticCompletion,
} from '@/lib/path-store';
import { prefetchTTSGame } from '@/lib/tts-cache';
import {
  Heart,
  Coins,
  Trophy,
  Flame,
  Lock,
  Play,
  ArrowLeft,
  AlertTriangle,
  RotateCcw,
  Zap,
  Star,
  Skull,
  Calendar,
  X,
  Compass,
  Crown,
  Clock,
  Sparkles,
  History,
  ShieldAlert,
} from 'lucide-react';
import { PointHistoryModal } from '@/components/PointHistoryModal';

const DEFAULT_UNITS: TTSUnit[] = [
  {
    id: 'unit-1-umum',
    unit_number: 1,
    title: 'Wawasan Nusantara',
    description: 'Pemanasan teka-teki silang seputar geografi, budaya, dan pengetahuan umum.',
    theme_color: '#10b981',
    is_active: true,
    is_special_event: false,
    event_start_at: null,
    event_end_at: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'unit-2-kuliner',
    unit_number: 2,
    title: 'Kuliner & Rempah',
    description: 'Uji wawasan rasa, bahan, dan hidangan legendaris nusantara.',
    theme_color: '#f59e0b',
    is_active: true,
    is_special_event: false,
    event_start_at: null,
    event_end_at: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'unit-3-hard-tech',
    unit_number: 3,
    title: 'Zona Siber & Teknologi',
    description: 'Tantangan ekstrem pembusukan skor 2x lipat dengan istilah logika teknologi!',
    theme_color: '#8b5cf6',
    is_active: true,
    is_special_event: false,
    event_start_at: null,
    event_end_at: null,
    created_at: new Date().toISOString(),
  },
];

const DEFAULT_LEVELS: TTSLevel[] = [
  {
    id: 'lvl-1-1',
    unit_id: 'unit-1-umum',
    level_number: 1,
    title: 'Langkah Pertama',
    grid_rows: 8,
    grid_cols: 8,
    is_hard_zone: false,
    hard_timer_override: null,
    decay_rate_override: null,
    branch_direction: 'main',
    status: 'published',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'lvl-1-2',
    unit_id: 'unit-1-umum',
    level_number: 2,
    title: 'Ibukota & Samudera',
    grid_rows: 9,
    grid_cols: 9,
    is_hard_zone: false,
    hard_timer_override: null,
    decay_rate_override: null,
    branch_direction: 'right',
    status: 'published',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'lvl-1-3',
    unit_id: 'unit-1-umum',
    level_number: 3,
    title: 'Suku & Bahasa',
    grid_rows: 9,
    grid_cols: 9,
    is_hard_zone: false,
    hard_timer_override: null,
    decay_rate_override: null,
    branch_direction: 'left',
    status: 'published',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'lvl-1-4',
    unit_id: 'unit-1-umum',
    level_number: 4,
    title: 'Pusaka Rimba',
    grid_rows: 10,
    grid_cols: 10,
    is_hard_zone: false,
    hard_timer_override: null,
    decay_rate_override: null,
    branch_direction: 'main',
    status: 'published',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'lvl-1-5',
    unit_id: 'unit-1-umum',
    level_number: 5,
    title: 'Ujian Titik Temu (ZONA HARD)',
    grid_rows: 10,
    grid_cols: 10,
    is_hard_zone: true,
    hard_timer_override: 75,
    decay_rate_override: 4,
    branch_direction: 'main',
    status: 'published',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export default function ThePathPage() {
  const router = useRouter();

  // Ambil cache lokal seketika (0 ms) agar transisi peta instan tanpa blocking spinner
  const initialCache = useMemo(() => getPathCache(), []);

  // State User & Profil
  const [profile, setProfile] = useState<Profile | null>(initialCache?.profile || null);
  const [settings, setSettings] = useState<GameSettings | null>(initialCache?.settings || null);
  const [loading, setLoading] = useState(!initialCache);

  // Data Map
  const [units, setUnits] = useState<TTSUnit[]>(
    initialCache?.units && initialCache.units.length > 0 ? initialCache.units : DEFAULT_UNITS
  );
  const [levels, setLevels] = useState<TTSLevel[]>(
    initialCache?.levels && initialCache.levels.length > 0 ? initialCache.levels : DEFAULT_LEVELS
  );
  const [userProgress, setUserProgress] = useState<Record<string, TTSUserProgress>>(
    initialCache?.userProgress || {}
  );
  const [selectedTab, setSelectedTab] = useState<'main' | 'special'>('main');

  // Modals & Interactive Nodes
  const [selectedNode, setSelectedNode] = useState<{
    level: TTSLevel;
    unit: TTSUnit;
    isUnlocked: boolean;
    isCompleted: boolean;
    progress?: TTSUserProgress;
  } | null>(null);

  const [showNoLivesModal, setShowNoLivesModal] = useState(false);
  const [showCoinModal, setShowCoinModal] = useState(false);
  const [showPointHistoryModal, setShowPointHistoryModal] = useState(false);
  const [refillingLives, setRefillingLives] = useState(false);

  // Leaderboard Modal State
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);
  const [leaderboardList, setLeaderboardList] = useState<TTSLeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

  // Timer Regenerasi Nyawa
  const [timeUntilNextLife, setTimeUntilNextLife] = useState<string>('');

  // Listen ke event update optimistik & window focus agar peta selalu sinkron 0 ms
  useEffect(() => {
    const syncFromCache = () => {
      const cache = getPathCache();
      if (cache) {
        if (cache.profile) setProfile(cache.profile);
        if (cache.userProgress) setUserProgress(cache.userProgress);
      }
    };
    const timer = setTimeout(syncFromCache, 0);
    window.addEventListener('path-data-updated', syncFromCache);
    window.addEventListener('focus', syncFromCache);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('path-data-updated', syncFromCache);
      window.removeEventListener('focus', syncFromCache);
    };
  }, []);

  // 1. Fetch User Profile & Data dari Supabase Hub (Single Parallel Server Action + SWR Cache)
  const loadData = useCallback(async () => {
    try {
      const res = await getPathDataAction();
      if (!res.success) {
        if (res.isBanned) {
          router.replace('/ban');
          return;
        }
        if (res.error?.includes('Unauthorized')) {
          router.push('/login?redirect=/path');
        }
        return;
      }

      if (res.profile?.is_banned && res.profile?.role !== 'admin') {
        router.replace('/ban');
        return;
      }

      if (res.profile) setProfile(res.profile);
      if (res.settings) setSettings(res.settings);
      if (res.units && res.units.length > 0) setUnits(res.units);
      if (res.levels && res.levels.length > 0) setLevels(res.levels);

      // Gabungkan progres dari server dengan rekaman optimistik lokal
      if (res.userProgress) {
        const optimistic = getOptimisticCompletions();
        const mergedProgress = { ...res.userProgress };

        for (const [lvlId, opt] of Object.entries(optimistic)) {
          if (!mergedProgress[lvlId] || mergedProgress[lvlId].status !== 'completed') {
            mergedProgress[lvlId] = {
              id: `opt-${lvlId}`,
              user_id: res.profile?.id || '',
              level_id: lvlId,
              status: 'completed',
              score_earned: Math.max(opt.score, mergedProgress[lvlId]?.score_earned || 0),
              time_taken_seconds: 60,
              completed_words: [],
              grid_state: {},
              combo_multiplier: 1,
              completed_at: opt.completedAt,
              updated_at: opt.completedAt,
            };
          } else {
            // Database sudah mengonfirmasi tamat, bersihkan antrean optimistik
            clearOptimisticCompletion(lvlId);
          }
        }

        setUserProgress(mergedProgress);

        // Simpan ke Cache Client SWR
        setPathCache({
          profile: res.profile || null,
          settings: res.settings || null,
          units: res.units || [],
          levels: res.levels || [],
          userProgress: mergedProgress,
        });
      }
    } catch (err) {
      console.error('Error loading map data:', err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  // 2. Fetch Leaderboard Realtime (Menggabungkan tts_leaderboard dengan profil pemain)
  const fetchLeaderboard = useCallback(async () => {
    setLoadingLeaderboard(true);
    try {
      const supabase = createHubBrowserClient();
      const season = settings?.current_season || 1;

      // 1. Ambil data dari tts_leaderboard
      const { data: lbData } = await supabase
        .from('tts_leaderboard')
        .select('*, profiles(*)')
        .eq('season_number', season)
        .order('total_score', { ascending: false })
        .order('total_time_taken', { ascending: true })
        .limit(50);

      // 2. Ambil data dari profiles untuk memastikan seluruh pemain yang memiliki skor tampil
      const { data: allProfs } = await supabase
        .from('profiles')
        .select('*')
        .order('total_score', { ascending: false })
        .limit(50);

      const existingUserIds = new Set((lbData || []).map((e) => e.user_id));
      const mergedList: TTSLeaderboardEntry[] = [...((lbData as TTSLeaderboardEntry[]) || [])];

      (allProfs || []).forEach((prof) => {
        if (!existingUserIds.has(prof.id)) {
          mergedList.push({
            id: prof.id,
            user_id: prof.id,
            season_number: season,
            total_score: prof.total_score || 0,
            total_time_taken: 0,
            levels_completed: (prof.total_score || 0) > 0 ? 1 : 0,
            updated_at: prof.updated_at,
            profiles: prof as Profile,
          });
        }
      });

      // Urutkan berdasarkan total_score tertinggi
      mergedList.sort((a, b) => (b.total_score || 0) - (a.total_score || 0));

      // Filter: Hanya pemain non-admin yang masuk ke papan klasemen publik
      const nonAdminList = mergedList.filter((entry) => {
        const p = entry.profiles;
        if (!p) return true;
        if (p.role === 'admin') return false;
        if (p.username && p.username.toLowerCase().includes('admin')) return false;
        return true;
      });

      setLeaderboardList(nonAdminList);
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
    } finally {
      setLoadingLeaderboard(false);
    }
  }, [settings]);

  const userRankIndex = useMemo(() => {
    if (!profile) return -1;
    return leaderboardList.findIndex((entry) => entry.user_id === profile.id);
  }, [leaderboardList, profile]);

  // 3. Loop Timer Regenerasi Nyawa
  useEffect(() => {
    if (!profile) return;

    const interval = setInterval(() => {
      if (profile.lives >= profile.max_lives) {
        setTimeUntilNextLife('');
        return;
      }

      const regenMinutes = settings?.life_regen_minutes || 15;
      const lastRegen = new Date(profile.last_life_regen).getTime();
      const now = Date.now();
      const targetTime = lastRegen + regenMinutes * 60 * 1000;
      const diffMs = targetTime - now;

      if (diffMs <= 0) {
        setTimeUntilNextLife('Memulihkan...');
        syncLifeRegenAction().then((res) => {
          if (res.success && res.lives !== undefined) {
            setProfile((prev) =>
              prev
                ? {
                    ...prev,
                    lives: res.lives ?? prev.lives,
                    last_life_regen: res.lastLifeRegen ?? prev.last_life_regen,
                  }
                : null
            );
          }
        });
      } else {
        const mins = Math.floor(diffMs / 60000);
        const secs = Math.floor((diffMs % 60000) / 1000);
        setTimeUntilNextLife(
          `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        );
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [profile, settings]);

  // 3. Status Buka Kunci Level (Unit-Aware & Sequential Progression)
  const levelStatusMap = useMemo(() => {
    const map: Record<string, { isUnlocked: boolean; isCompleted: boolean }> = {};
    const sortedUnits = [...units].sort((a, b) => a.unit_number - b.unit_number);

    sortedUnits.forEach((unit, uIdx) => {
      const unitLevels = levels
        .filter((l) => l.unit_id === unit.id)
        .sort((a, b) => a.level_number - b.level_number);

      // Pulau pertama selalu terbuka. Pulau selanjutnya terbuka jika seluruh level di pulau sebelumnya tamat
      const prevUnit = uIdx > 0 ? sortedUnits[uIdx - 1] : null;
      const prevUnitLevels = prevUnit ? levels.filter((l) => l.unit_id === prevUnit.id) : [];
      const isPrevUnitFinished =
        uIdx === 0 ||
        (prevUnitLevels.length > 0 &&
          prevUnitLevels.every((l) => userProgress[l.id]?.status === 'completed'));

      unitLevels.forEach((lvl, idx) => {
        const prog = userProgress[lvl.id];
        const isCompleted = prog?.status === 'completed';

        let isUnlocked = false;
        if (isPrevUnitFinished) {
          if (idx === 0) {
            isUnlocked = true;
          } else {
            const prevLevel = unitLevels[idx - 1];
            isUnlocked = userProgress[prevLevel.id]?.status === 'completed';
          }
        }

        map[lvl.id] = { isUnlocked, isCompleted };
      });
    });

    return map;
  }, [units, levels, userProgress]);

  // 4. Modal Handler Saat Klik Node
  const handleNodeClick = (level: TTSLevel, unit: TTSUnit) => {
    const status = levelStatusMap[level.id] || { isUnlocked: false, isCompleted: false };

    if (!status.isUnlocked) {
      alert(`🔒 Level ${level.level_number} masih terkunci! Selesaikan level sebelumnya untuk melanjutkan.`);
      return;
    }

    if (!status.isCompleted && profile && profile.lives <= 0) {
      setShowNoLivesModal(true);
      return;
    }

    // 🚀 Zero-Delay Prefetching: Jalankan prefetch bundle route & data game TTS seketika saat modal dibuka
    router.prefetch(`/tts/${level.id}`);
    prefetchTTSGame(level.id);

    setSelectedNode({
      level,
      unit,
      isUnlocked: status.isUnlocked,
      isCompleted: status.isCompleted,
      progress: userProgress[level.id],
    });
  };

  const handleStartLevel = (levelId: string) => {
    // Pastikan data diprefetch dan tutup modal
    prefetchTTSGame(levelId);
    setSelectedNode(null);
    router.push(`/tts/${levelId}`);
  };

  // Refill Nyawa Instan
  const handleRefillLives = async () => {
    if (!profile) return;
    const price = settings?.coins_refill_lives_price || 50;

    if (profile.coins < price) {
      alert(`Koin Anda tidak cukup (${profile.coins}/${price} Koin). Selesaikan level lain untuk mengumpulkan koin!`);
      return;
    }

    setRefillingLives(true);
    try {
      const res = await refillLivesAction();
      if (!res.success) {
        alert(`Gagal mengisi nyawa: ${res.error || 'Terjadi kesalahan'}`);
      } else {
        setProfile((prev) =>
          prev
            ? {
                ...prev,
                coins: res.newCoins !== undefined ? res.newCoins : prev.coins,
                lives: res.newLives !== undefined ? res.newLives : 5,
              }
            : null
        );
        setShowNoLivesModal(false);
      }
    } catch {
      alert('Terjadi kesalahan jaringan.');
    } finally {
      setRefillingLives(false);
    }
  };

  const filteredUnits = useMemo(() => {
    return units.filter((u) => (selectedTab === 'special' ? u.is_special_event : !u.is_special_event));
  }, [units, selectedTab]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0b0f19] flex flex-col items-center justify-center text-slate-400 gap-3">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-black tracking-wider text-slate-300">MEMUAT THE PATH...</span>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col items-center select-none pb-28">
      {/* ==================================================================== */}
      {/* TACTILE GAME HUD HEADER                                              */}
      {/* ==================================================================== */}
      <header className="sticky top-0 z-40 w-full max-w-md bg-[#0f172a] border-b-2 border-slate-800 px-4 py-2.5 flex items-center justify-between shadow-md">
        {/* Nav Home */}
        <Link
          href="/"
          className="w-10 h-10 rounded-xl bg-slate-800 border-b-2 border-slate-950 hover:bg-slate-700 flex items-center justify-center text-slate-200 transition-all active:translate-y-0.5"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>

        {/* Resources HUD (Solid, high-contrast badges) */}
        <div className="flex items-center gap-2">
          {/* Nyawa */}
          <button
            onClick={() => setShowNoLivesModal(true)}
            className="flex items-center gap-1.5 bg-[#1e293b] border-b-2 border-slate-950 hover:bg-slate-800 px-3 py-1.5 rounded-xl text-xs font-black text-rose-400 active:translate-y-0.5 transition-all shadow-sm"
            title="Status Nyawa & Regenerasi"
          >
            <Heart className="w-4 h-4 fill-rose-500 text-rose-500" />
            <span>
              {profile?.lives ?? 5}/{profile?.max_lives ?? 5}
            </span>
            {timeUntilNextLife && (
              <span className="text-[10px] text-slate-400 font-bold ml-0.5">
                {timeUntilNextLife}
              </span>
            )}
          </button>

          {/* Koin */}
          <button
            type="button"
            onClick={() => setShowCoinModal(true)}
            className="flex items-center gap-1.5 bg-[#1e293b] hover:bg-slate-800 border-b-2 border-slate-950 px-3 py-1.5 rounded-xl text-xs font-black text-amber-400 active:translate-y-0.5 transition-all shadow-sm cursor-pointer group"
            title="Klik untuk info koin & cara mendapatkannya"
          >
            <Coins className="w-4 h-4 text-amber-400 fill-amber-500 group-hover:scale-110 transition-transform" />
            <span>{profile?.coins ?? 50}</span>
            <span className="text-[10px] text-amber-300/70 font-bold ml-0.5">ℹ️</span>
          </button>

          {/* Skor & Akses Papan Peringkat */}
          <button
            onClick={() => {
              setShowLeaderboardModal(true);
              fetchLeaderboard();
            }}
            className="flex items-center gap-1.5 bg-[#1e293b] border-b-2 border-slate-950 hover:bg-slate-800 px-2.5 py-1.5 rounded-xl text-xs font-black text-emerald-400 active:translate-y-0.5 transition-all shadow-sm group"
            title="Buka Papan Peringkat (Klasemen)"
          >
            <Trophy className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
            <span>{profile?.total_score ?? 0}</span>
          </button>

          {/* Riwayat Poin (Tahap 2: Transparansi Skor) */}
          <button
            type="button"
            onClick={() => setShowPointHistoryModal(true)}
            className="flex items-center gap-1 bg-[#1e293b] border-b-2 border-slate-950 hover:bg-slate-800 px-2 py-1.5 rounded-xl text-xs font-black text-emerald-400 active:translate-y-0.5 transition-all shadow-sm group"
            title="Riwayat Perolehan Poin"
          >
            <History className="w-4 h-4 text-emerald-400 group-hover:rotate-[-20deg] transition-transform" />
            <span className="text-[10px] hidden sm:inline">Riwayat</span>
          </button>
        </div>

        {/* User Avatar */}
        <Link
          href="/account"
          className="w-10 h-10 rounded-xl bg-[#1e293b] border-2 border-emerald-500 flex items-center justify-center text-lg active:translate-y-0.5 transition-all shadow"
        >
          {profile?.avatar_url || '⚡'}
        </Link>
      </header>

      {/* Quick Action Bar: Papan Peringkat Pemain, Riwayat Poin, & Mode Sultan Admin */}
      <div className="w-full max-w-md px-4 pt-3 flex items-center gap-2">
        <button
          onClick={() => {
            setShowLeaderboardModal(true);
            fetchLeaderboard();
          }}
          className="flex-1 py-2.5 px-3 bg-[#1e293b] hover:bg-slate-800 border-2 border-emerald-500/60 hover:border-emerald-400 text-emerald-300 font-black text-xs rounded-2xl active:translate-y-0.5 flex items-center justify-center gap-2 shadow-sm transition-all"
        >
          <Trophy className="w-4 h-4 text-amber-400" />
          <span>Papan Peringkat</span>
        </button>

        <button
          type="button"
          onClick={() => setShowPointHistoryModal(true)}
          className="py-2.5 px-3 bg-[#1e293b] hover:bg-slate-800 border-2 border-slate-700 hover:border-emerald-500/50 text-slate-200 font-black text-xs rounded-2xl active:translate-y-0.5 flex items-center justify-center gap-1.5 shadow-sm transition-all shrink-0"
          title="Lihat Riwayat Poin Transparan"
        >
          <History className="w-4 h-4 text-emerald-400" />
          <span>Riwayat Poin</span>
        </button>

        {profile?.role === 'admin' && (
          <Link
            href="/admin-hub"
            className="py-2.5 px-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-2xl border-b-4 border-amber-700 active:translate-y-0.5 active:border-b-0 flex items-center gap-1.5 shadow-md transition-all shrink-0"
          >
            <Crown className="w-4 h-4 fill-slate-950" />
            <span>Mode Sultan</span>
          </Link>
        )}
      </div>

      {/* Peringatan Akun Jika Pernah Terkena Sanksi Banned */}
      {(profile?.ban_count ?? 0) > 0 && (
        <div className="w-full max-w-md px-4 pt-2">
          <div className="px-3 py-1.5 bg-rose-950/40 border border-rose-800/60 rounded-xl flex items-center justify-between text-xs text-rose-300 shadow-sm">
            <span className="flex items-center gap-1.5 font-bold text-[11px]">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>Peringatan Sportivitas</span>
            </span>
            <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-mono font-black text-[10px] border border-rose-500/30">
              Jumlah Banned: {profile?.ban_count}
            </span>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TABS: THE PATH VS EVENT AKHIR PEKAN                                  */}
      {/* ==================================================================== */}
      <div className="w-full max-w-md px-4 pt-4">
        <div className="grid grid-cols-2 gap-2 p-1.5 bg-[#111827] rounded-2xl border-2 border-slate-800">
          <button
            type="button"
            onClick={() => setSelectedTab('main')}
            className={`py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
              selectedTab === 'main'
                ? 'bg-emerald-600 text-white shadow-[0_3px_0_#065f46]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>THE PATH UTAMA</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedTab('special')}
            className={`py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
              selectedTab === 'special'
                ? 'bg-purple-600 text-white shadow-[0_3px_0_#581c87]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>EVENT SPESIAL</span>
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MAP CANVAS (DUOLINGO-STYLE 3D TACTILE PATH)                          */}
      {/* ==================================================================== */}
      <div className="w-full max-w-md px-4 mt-6 flex flex-col gap-12">
        {filteredUnits.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs font-bold border-2 border-dashed border-slate-800 rounded-3xl mt-8 bg-[#111827]">
            Belum ada Event Spesial yang aktif minggu ini.
          </div>
        ) : (
          filteredUnits.map((unit) => {
            const unitLevels = levels.filter((l) => l.unit_id === unit.id);
            const completedCount = unitLevels.filter((lvl) => userProgress[lvl.id]?.status === 'completed').length;

            return (
              <section key={unit.id} className="relative flex flex-col items-center">
                {/* Unit Header Island Card (Solid, readable, game-like) */}
                <div className="w-full rounded-2xl p-5 mb-8 border-2 border-slate-800 bg-[#162032] shadow-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                      PULAU {unit.unit_number}
                    </span>
                    <span className="text-xs font-mono font-black text-slate-300">
                      {completedCount}/{unitLevels.length} SELESAI
                    </span>
                  </div>

                  <h2 className="text-lg font-black text-white">{unit.title}</h2>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    {unit.description}
                  </p>

                  {/* Progress Bar */}
                  <div className="w-full h-2.5 bg-slate-900 rounded-full mt-4 overflow-hidden border border-slate-800">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-500 rounded-full"
                      style={{
                        width: `${unitLevels.length > 0 ? (completedCount / unitLevels.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Level Nodes Vertikal Meandering Path */}
                <div className="flex flex-col items-center gap-8 w-full relative">
                  {unitLevels.map((level, idx) => {
                    const status = levelStatusMap[level.id] || {
                      isUnlocked: false,
                      isCompleted: false,
                    };
                    const isHard = level.is_hard_zone;

                    // Posisi horizontal S-Curve
                    let offsetClass = 'translate-x-0';
                    if (level.branch_direction === 'left' || idx % 4 === 1) {
                      offsetClass = '-translate-x-14';
                    } else if (level.branch_direction === 'right' || idx % 4 === 3) {
                      offsetClass = 'translate-x-14';
                    }

                    return (
                      <div
                        key={level.id}
                        className={`relative flex flex-col items-center transition-transform duration-300 ${offsetClass}`}
                      >
                        {/* Winding Trail Stepping Stones (Cobblestone path) */}
                        {idx > 0 && (
                          <div className="absolute -top-6 w-1.5 h-6 bg-slate-800 rounded-full -z-10" />
                        )}

                        {/* Floating "MULAI!" Banner untuk Level Aktif yang Terbuka */}
                        {status.isUnlocked && !status.isCompleted && (
                          <div className="absolute -top-7 z-20 animate-bounce">
                            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-400 text-slate-950 shadow-md border border-white">
                              MULAI!
                            </span>
                          </div>
                        )}

                        {/* 3D Chunky Node Button */}
                        <button
                          type="button"
                          onClick={() => handleNodeClick(level, unit)}
                          onMouseEnter={() => {
                            if (status.isUnlocked) {
                              router.prefetch(`/tts/${level.id}`);
                              prefetchTTSGame(level.id);
                            }
                          }}
                          className={`w-20 h-20 rounded-full flex flex-col items-center justify-center relative transition-all active:translate-y-1.5 ${
                            isHard
                              ? status.isUnlocked
                                ? 'bg-[#ef4444] border-2 border-[#fca5a5] shadow-[0_6px_0_#991b1b] text-white hover:brightness-110 active:shadow-none'
                                : 'bg-[#1e293b] border-2 border-[#334155] shadow-[0_6px_0_#0f172a] text-slate-600 opacity-60'
                              : status.isCompleted
                              ? 'bg-[#eab308] border-2 border-[#fef08a] shadow-[0_6px_0_#854d0e] text-slate-950 hover:brightness-110 active:shadow-none'
                              : status.isUnlocked
                              ? 'bg-[#22c55e] border-2 border-[#86efac] shadow-[0_6px_0_#15803d] text-white hover:brightness-110 active:shadow-none ring-4 ring-emerald-500/30'
                              : 'bg-[#1e293b] border-2 border-[#334155] shadow-[0_6px_0_#0f172a] text-slate-500 opacity-60 cursor-not-allowed'
                          }`}
                        >
                          {/* Inner Icon */}
                          {status.isCompleted ? (
                            <Star className="w-8 h-8 fill-slate-950 text-slate-950" />
                          ) : isHard ? (
                            <Flame className="w-9 h-9 fill-amber-300 text-amber-200" />
                          ) : status.isUnlocked ? (
                            <Play className="w-8 h-8 fill-white text-white ml-1" />
                          ) : (
                            <Lock className="w-7 h-7 text-slate-400" />
                          )}

                          {/* Level Number Pill */}
                          <div
                            className={`absolute -bottom-2.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black uppercase tracking-wider border shadow ${
                              isHard
                                ? 'bg-rose-950 border-rose-600 text-rose-300'
                                : status.isCompleted
                                ? 'bg-amber-950 border-amber-600 text-amber-300'
                                : status.isUnlocked
                                ? 'bg-[#0f172a] border-emerald-500 text-emerald-300'
                                : 'bg-[#0f172a] border-slate-800 text-slate-500'
                            }`}
                          >
                            LVL {level.level_number}
                          </div>
                        </button>

                        {/* Hard Zone Indicator Badge */}
                        {isHard && (
                          <span className="mt-3.5 text-[9px] font-black text-rose-400 uppercase tracking-widest flex items-center gap-1 bg-rose-950/90 border border-rose-800 px-2.5 py-0.5 rounded-full shadow">
                            <Skull className="w-3 h-3 text-rose-400" />
                            <span>ZONA HARD</span>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </div>

      {/* ==================================================================== */}
      {/* MODAL 1: PREVIEW / START LEVEL CONFIRMATION                          */}
      {/* ==================================================================== */}
      {selectedNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl p-6 bg-[#162032] border-2 border-slate-700 shadow-2xl relative animate-in fade-in zoom-in-95">
            <button
              onClick={() => setSelectedNode(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1.5 rounded-xl bg-slate-900 border border-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header Modal */}
            <div className="text-center mb-5">
              <div
                className={`w-16 h-16 mx-auto mb-3 rounded-2xl flex items-center justify-center text-3xl shadow-md ${
                  selectedNode.level.is_hard_zone
                    ? 'bg-rose-600 text-white shadow-rose-900/40'
                    : 'bg-emerald-600 text-white shadow-emerald-900/40'
                }`}
              >
                {selectedNode.level.is_hard_zone ? '🔥' : '🧩'}
              </div>

              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-300 inline-block mb-1">
                {selectedNode.unit.title} • Level {selectedNode.level.level_number}
              </span>
              <h3 className="text-xl font-black text-white">{selectedNode.level.title}</h3>
            </div>

            {/* Peringatan Zona Hard */}
            {selectedNode.level.is_hard_zone && (
              <div className="p-3.5 mb-4 rounded-2xl bg-rose-950/80 border border-rose-800 text-rose-200 text-xs flex items-start gap-2.5 leading-relaxed">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <b className="text-white block font-black">🔥 PERINGATAN: ZONA HARD!</b>
                  Pembusukan skor berjalan 2x lebih cepat dan batas waktu ekstra ketat. Siapkan fokus penuh!
                </div>
              </div>
            )}

            {/* Info Level */}
            <div className="grid grid-cols-2 gap-2 p-3 bg-slate-900/90 rounded-2xl border border-slate-800 text-xs text-slate-300 mb-5">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Ukuran Papan</span>
                <span className="font-mono font-bold text-white">
                  {selectedNode.level.grid_rows} x {selectedNode.level.grid_cols} Kotak
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Status</span>
                <span className="font-bold text-emerald-400">
                  {selectedNode.isCompleted ? '✓ Telah Ditaklukkan' : 'Tersedia'}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedNode(null)}
                className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleStartLevel(selectedNode.level.id)}
                className={`flex-1 py-3 rounded-xl font-black text-xs text-white transition-all shadow-[0_4px_0_rgba(0,0,0,0.4)] flex items-center justify-center gap-2 active:translate-y-1 ${
                  selectedNode.level.is_hard_zone
                    ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-900'
                    : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900'
                }`}
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{selectedNode.isCompleted ? 'Main Ulang Level' : 'Mulai Tantangan'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 2: STATUS NYAWA & REFILL DENGAN KOIN                           */}
      {/* ==================================================================== */}
      {showNoLivesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl p-6 bg-[#162032] border-2 border-rose-500/60 shadow-2xl relative text-center animate-in zoom-in-95">
            <button
              onClick={() => setShowNoLivesModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1.5 rounded-xl bg-slate-900 border border-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-rose-500/20 border-2 border-rose-500 flex items-center justify-center text-3xl shadow-lg">
              {(profile?.lives ?? 5) > 0 ? '❤️' : '💔'}
            </div>

            <h3 className="text-xl font-black text-white">
              {(profile?.lives ?? 5) <= 0
                ? 'Kehabisan Nyawa!'
                : (profile?.lives ?? 5) >= (profile?.max_lives ?? 5)
                ? 'Nyawa Penuh!'
                : 'Status Nyawa Pemain'}
            </h3>

            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              {(profile?.lives ?? 5) >= (profile?.max_lives ?? 5)
                ? 'Nyawa Anda saat ini berada dalam kondisi maksimal (5/5). Anda bebas memainkan level tanpa khawatir kehabisan nyawa!'
                : (profile?.lives ?? 5) <= 0
                ? 'Nyawa Anda habis karena waktu habis di Zona Hard. Tunggu regenerasi waktu atau isi ulang penuh menggunakan koin.'
                : `Sisa nyawa Anda saat ini ${profile?.lives}/${profile?.max_lives}. Nyawa berkurang 1 jika waktu habis di Zona Hard.`}
            </p>

            {(profile?.lives ?? 5) < (profile?.max_lives ?? 5) && timeUntilNextLife && (
              <div className="my-4 py-2 px-3 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono font-bold text-rose-400 flex items-center justify-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>+1 Nyawa berikutnya dalam: {timeUntilNextLife}</span>
              </div>
            )}

            <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl my-4 flex items-center justify-between text-xs">
              <span className="text-slate-400">Koin Anda Saat Ini:</span>
              <span className="font-mono font-black text-amber-400 flex items-center gap-1">
                <Coins className="w-3.5 h-3.5 fill-current" />
                {profile?.coins ?? 0} 🪙
              </span>
            </div>

            {(profile?.lives ?? 5) < (profile?.max_lives ?? 5) ? (
              <button
                type="button"
                onClick={handleRefillLives}
                disabled={refillingLives || (profile?.coins ?? 0) < (settings?.coins_refill_lives_price || 50)}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 flex items-center justify-center gap-2 active:translate-y-0.5 border-b-4 border-amber-700 active:border-b-0"
              >
                <Zap className="w-4 h-4 fill-current" />
                <span>
                  {refillingLives
                    ? 'Memulihkan Nyawa...'
                    : `Pulihkan 5 Nyawa Penuh (${settings?.coins_refill_lives_price || 50} Koin)`}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowNoLivesModal(false)}
                className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs"
              >
                Tutup & Lanjut Bertualang
              </button>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 3: PAPAN PERINGKAT (LEADERBOARD) PEMAIN                         */}
      {/* ==================================================================== */}
      {showLeaderboardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md h-[85vh] max-h-[640px] rounded-3xl bg-[#111827] border-2 border-emerald-500/50 shadow-2xl flex flex-col overflow-hidden relative animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-4 bg-[#0f172a] border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white flex items-center gap-1.5">
                    <span>PAPAN PERINGKAT</span>
                    <span className="text-[10px] text-emerald-400 bg-emerald-950 border border-emerald-800 px-1.5 py-0.2 rounded font-mono font-bold">
                      LIVE
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Klasemen Resmi Season {settings?.current_season || 1}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={fetchLeaderboard}
                  disabled={loadingLeaderboard}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-50"
                  title="Perbarui Klasemen"
                >
                  <RotateCcw className={`w-4 h-4 ${loadingLeaderboard ? 'animate-spin text-emerald-400' : ''}`} />
                </button>
                <button
                  onClick={() => setShowLeaderboardModal(false)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
                  title="Tutup"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingLeaderboard ? (
                <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-400">
                  <RotateCcw className="w-6 h-6 animate-spin text-emerald-400" />
                  <span className="text-xs font-bold">Memuat Klasemen Realtime...</span>
                </div>
              ) : leaderboardList.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center gap-2 text-center text-slate-400 p-6">
                  <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-2xl mb-1">
                    🏆
                  </div>
                  <h4 className="text-sm font-bold text-white">Belum Ada Skor di Season Ini</h4>
                  <p className="text-xs text-slate-400 max-w-xs">
                    Selesaikan level TTS pertama Anda untuk mengukir nama sebagai pemuncak klasemen!
                  </p>
                </div>
              ) : (
                <>
                  {/* Top 3 Podium Cards */}
                  {leaderboardList.length >= 1 && (
                    <div className="grid grid-cols-3 gap-2 pt-2 pb-1">
                      {/* Juara 2 (Perak) */}
                      {leaderboardList[1] ? (
                        <div className="p-2.5 rounded-2xl bg-slate-900/90 border-2 border-slate-400/40 text-center flex flex-col items-center justify-end relative order-1 mt-3">
                          <span className="text-xs font-black text-slate-300">🥈 #2</span>
                          <span className="text-xl my-1">{leaderboardList[1].profiles?.avatar_url || '🥈'}</span>
                          <span className="text-[11px] font-bold text-white truncate max-w-full">
                            @{leaderboardList[1].profiles?.username || 'Pemain'}
                          </span>
                          <span className="text-[10px] font-mono font-black text-amber-400 mt-1">
                            {leaderboardList[1].total_score} Pts
                          </span>
                          {(leaderboardList[1].profiles?.ban_count ?? 0) > 0 && (
                            <span className="text-[9px] font-bold text-rose-400 mt-1 bg-rose-950/80 px-1.5 py-0.5 rounded border border-rose-800 flex items-center gap-0.5">
                              ⚠️ Jumlah Banned: {leaderboardList[1].profiles?.ban_count}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="order-1" />
                      )}

                      {/* Juara 1 (Emas) */}
                      <div className="p-3 rounded-2xl bg-gradient-to-b from-amber-500/20 to-slate-900 border-2 border-amber-400 shadow-lg shadow-amber-500/10 text-center flex flex-col items-center justify-end relative order-2">
                        <span className="text-xs font-black text-amber-300">🥇 #1</span>
                        <span className="text-2xl my-1">{leaderboardList[0].profiles?.avatar_url || '👑'}</span>
                        <span className="text-xs font-black text-white truncate max-w-full">
                          @{leaderboardList[0].profiles?.username || 'Pemain'}
                        </span>
                        <span className="text-xs font-mono font-black text-amber-400 mt-1">
                          {leaderboardList[0].total_score} Pts
                        </span>
                        {(leaderboardList[0].profiles?.ban_count ?? 0) > 0 && (
                          <span className="text-[9px] font-bold text-rose-400 mt-1 bg-rose-950/80 px-1.5 py-0.5 rounded border border-rose-800 flex items-center gap-0.5">
                            ⚠️ Jumlah Banned: {leaderboardList[0].profiles?.ban_count}
                          </span>
                        )}
                      </div>

                      {/* Juara 3 (Perunggu) */}
                      {leaderboardList[2] ? (
                        <div className="p-2.5 rounded-2xl bg-slate-900/90 border-2 border-amber-700/50 text-center flex flex-col items-center justify-end relative order-3 mt-4">
                          <span className="text-xs font-black text-amber-600">🥉 #3</span>
                          <span className="text-xl my-1">{leaderboardList[2].profiles?.avatar_url || '🥉'}</span>
                          <span className="text-[11px] font-bold text-white truncate max-w-full">
                            @{leaderboardList[2].profiles?.username || 'Pemain'}
                          </span>
                          <span className="text-[10px] font-mono font-black text-amber-400 mt-1">
                            {leaderboardList[2].total_score} Pts
                          </span>
                          {(leaderboardList[2].profiles?.ban_count ?? 0) > 0 && (
                            <span className="text-[9px] font-bold text-rose-400 mt-1 bg-rose-950/80 px-1.5 py-0.5 rounded border border-rose-800 flex items-center gap-0.5">
                              ⚠️ Jumlah Banned: {leaderboardList[2].profiles?.ban_count}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="order-3" />
                      )}
                    </div>
                  )}

                  {/* List Rank 4 and below */}
                  <div className="space-y-1.5 mt-2">
                    {leaderboardList.map((entry, idx) => {
                      const isMe = entry.user_id === profile?.id;
                      return (
                        <div
                          key={entry.id || entry.user_id}
                          className={`p-2.5 rounded-2xl border flex items-center justify-between text-xs transition-all ${
                            isMe
                              ? 'bg-emerald-950/60 border-emerald-500 ring-1 ring-emerald-500/50'
                              : 'bg-slate-900/70 border-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`w-6 text-center font-mono font-black ${
                                idx === 0
                                  ? 'text-amber-400'
                                  : idx === 1
                                  ? 'text-slate-300'
                                  : idx === 2
                                  ? 'text-amber-600'
                                  : 'text-slate-500'
                              }`}
                            >
                              #{idx + 1}
                            </span>
                            <span className="text-lg">{entry.profiles?.avatar_url || '⚡'}</span>
                            <div className="min-w-0">
                              <span className="font-bold text-white block truncate">
                                @{entry.profiles?.username || 'Pemain'}
                                {isMe && (
                                  <span className="ml-1 text-[10px] text-emerald-400 bg-emerald-900/80 px-1.5 py-0.2 rounded font-black">
                                    KAMU
                                  </span>
                                )}
                              </span>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] text-slate-400">
                                  {entry.levels_completed || 0} Level Selesai
                                </span>
                                {(entry.profiles?.ban_count ?? 0) > 0 && (
                                  <span className="text-[9px] font-bold text-rose-400 bg-rose-950/80 border border-rose-800/80 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                    ⚠️ Jumlah Banned: {entry.profiles?.ban_count}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="font-mono font-black text-amber-400 block">
                              {entry.total_score.toLocaleString()}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {entry.total_time_taken}s
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Sticky Player Current Standing Footer */}
            <div className="p-3 bg-[#0a0f1d] border-t-2 border-slate-800 flex items-center justify-between text-xs shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-lg">{profile?.avatar_url || '⚡'}</span>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">
                    Peringkat Kamu
                  </span>
                  <span className="font-black text-emerald-400">
                    {profile?.role === 'admin' || profile?.username?.toLowerCase().includes('admin')
                      ? '👑 Akun Admin (Tidak Masuk Klasemen)'
                      : userRankIndex !== -1
                      ? `#${userRankIndex + 1} dari ${leaderboardList.length} Pemain`
                      : 'Belum Masuk Klasemen'}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Skor</span>
                <span className="font-mono font-black text-amber-400 text-sm">
                  {profile?.total_score ?? 0} Pts
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 4: INFO KOIN & SISTEM EKONOMI (PANDUAN PEMAIN)                */}
      {/* ==================================================================== */}
      {showCoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl p-5 bg-[#0f172a] border-2 border-amber-500/50 shadow-2xl text-slate-200 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 text-xl shadow-inner">
                  🪙
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Panduan Koin & Power-Up</h3>
                  <p className="text-[11px] text-amber-400 font-bold">
                    Koin Anda Saat Ini: <span className="font-mono">{profile?.coins ?? 0}</span> 🪙
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCoinModal(false)}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="py-3 text-xs space-y-3">
              {/* Jawaban Refill Koin */}
              <div className="bg-slate-900/90 p-3 rounded-2xl border border-slate-800">
                <div className="flex items-center gap-1.5 text-amber-300 font-black mb-1">
                  <span className="text-sm">❓</span>
                  <span>Apakah Koin Refill Otomatis?</span>
                </div>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  <b>Tidak.</b> Koin <i>tidak</i> bertambah otomatis per detik atau per menit. Koin adalah <b>mata uang hadiah prestasi</b> pemain.
                </p>
              </div>

              {/* Cara Dapatkan Koin */}
              <div className="bg-slate-900/90 p-3 rounded-2xl border border-slate-800 space-y-1.5">
                <div className="flex items-center gap-1.5 text-emerald-400 font-black">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Cara Mendapatkan Koin:</span>
                </div>
                <ul className="text-[11px] text-slate-300 space-y-1 pl-1">
                  <li className="flex items-start gap-1.5">
                    <span className="text-emerald-400 font-bold">✓</span>
                    <span>
                      <b>Menamatkan level di peta:</b> Hadiah{' '}
                      <span className="text-amber-400 font-black">+{settings?.coins_per_level || 20} Koin</span> setiap level selesai!
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-emerald-400 font-bold">✓</span>
                    <span>Menyelesaikan bab/pulau dan event spesial akhir pekan.</span>
                  </li>
                </ul>
              </div>

              {/* Kegunaan Koin */}
              <div className="bg-slate-900/90 p-3 rounded-2xl border border-slate-800 space-y-1.5">
                <div className="flex items-center gap-1.5 text-cyan-400 font-black">
                  <Zap className="w-4 h-4 text-cyan-400" />
                  <span>Kegunaan Koin:</span>
                </div>
                <ul className="text-[11px] text-slate-300 space-y-1 pl-1">
                  <li>💡 <b>Hint ({settings?.hint_price_coins || 15}🪙)</b>: Buka 1 huruf acak pada kata aktif.</li>
                  <li>❄️ <b>Freeze ({settings?.freeze_price_coins || 25}🪙)</b>: Bekukan pembusukan skor & timer ({settings?.freeze_duration_seconds || 10}s).</li>
                  <li>❤️ <b>Refill Nyawa ({settings?.coins_refill_lives_price || 50}🪙)</b>: Isi penuh 5 nyawa di peta tanpa menunggu cooldown.</li>
                </ul>
              </div>

              {/* Penjelasan Nyawa yang Otomatis Refill */}
              <div className="bg-rose-950/30 p-2.5 rounded-xl border border-rose-800/40 text-[11px] text-rose-200 flex items-start gap-2">
                <Heart className="w-4 h-4 text-rose-500 fill-rose-500 shrink-0 mt-0.5" />
                <div>
                  <b className="text-rose-400">Pemberitahuan Regenerasi Nyawa:</b>
                  <p className="mt-0.5 text-slate-300">
                    Yang terisi otomatis adalah <b>Nyawa (❤️)</b>, yaitu <b>+1 nyawa setiap {settings?.life_regen_minutes || 15} menit</b> jika berkurang atau habis.
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowCoinModal(false)}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-md transition-all active:translate-y-0.5 border-b-2 border-amber-700 active:border-b-0"
            >
              Saya Mengerti & Lanjut Bertualang
            </button>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 5: RIWAYAT PEROLEHAN POIN (TRANSPARANSI SKOR PEMAIN TAHAP 2)   */}
      {/* ==================================================================== */}
      <PointHistoryModal
        isOpen={showPointHistoryModal}
        onClose={() => setShowPointHistoryModal(false)}
        currentTotalScore={profile?.total_score}
      />
    </main>
  );
}
