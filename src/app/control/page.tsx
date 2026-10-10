'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  supabase,
  GameSession,
  Question,
  Team,
  parseQuestionMeta,
  parseSessionMeta,
  buildSessionTitleWithBoxes,
  buildSessionTitleWithMeta
} from '@/lib/supabase';
import {
  Play,
  Pause,
  RotateCcw,
  Eye,
  SkipForward,
  Trophy,
  Plus,
  Minus,
  Sparkles,
  Tv,
  BookOpen,
  Wifi,
  WifiOff,
  LogOut,
  AlertCircle,
  UserPlus,
  Edit2,
  Trash2,
  X,
  Check,
  LayoutGrid,
  HelpCircle,
  Layers,
  Tag
} from 'lucide-react';
import { sounds } from '@/lib/sound';

export default function OperatorControlPage() {
  const router = useRouter();

  // State utama
  const [session, setSession] = useState<GameSession | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [questionsList, setQuestionsList] = useState<Question[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [isConnected, setIsConnected] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);

  // Active game type (pilihan_ganda | benar_salah | essay)
  const [selectedGameType, setSelectedGameType] = useState<'pilihan_ganda' | 'benar_salah' | 'essay'>('pilihan_ganda');

  // Opened Box tracking
  const [openedBoxIds, setOpenedBoxIds] = useState<string[]>([]);

  // Custom score input per regu: { [teamId]: number }
  const [customScores, setCustomScores] = useState<Record<string, string>>({});
  const [appliedTeamId, setAppliedTeamId] = useState<string | null>(null);

  // Team management modal states
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [teamFormName, setTeamFormName] = useState('');
  const [teamFormColor, setTeamFormColor] = useState('#3b82f6');
  const [teamFormScore, setTeamFormScore] = useState<number>(0);
  const [availableRooms, setAvailableRooms] = useState<{ id: string; room_code: string; title: string }[]>([]);

  // Live timer countdown state
  const [remainingTime, setRemainingTime] = useState<number>(30);
  const prevRemainingRef = useRef<number>(30);

  // Auth gate check
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);

  useEffect(() => {
    const role = sessionStorage.getItem('auth_role');
    if (!role) {
      router.push('/login');
    } else {
      setIsAuthorized(true);
    }
  }, [router]);

  // Sync selectedGameType from database status
  useEffect(() => {
    if (
      session?.status === 'box_benar_salah' ||
      session?.status === 'category_benar_salah' ||
      session?.status?.includes('benar_salah')
    ) {
      setSelectedGameType('benar_salah');
    } else if (
      session?.status === 'box_essay' ||
      session?.status === 'category_essay' ||
      session?.status?.includes('essay')
    ) {
      setSelectedGameType('essay');
    } else if (
      session?.status === 'box_pilihan_ganda' ||
      session?.status === 'category_pilihan_ganda' ||
      session?.status === 'category_select' ||
      session?.status?.includes('pilihan_ganda')
    ) {
      setSelectedGameType('pilihan_ganda');
    }
  }, [session?.status]);

  // Load initial data dengan dukungan Multi-Room
  const loadData = useCallback(async () => {
    try {
      // Ambil seluruh daftar ruangan untuk switcher
      const { data: allSessions } = await supabase
        .from('game_sessions')
        .select('id, room_code, title')
        .order('created_at', { ascending: true });
      if (allSessions) setAvailableRooms(allSessions);

      const roomFromUrl =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('room')?.toUpperCase().trim() || null
          : null;
      const roomFromStorage =
        typeof window !== 'undefined' ? localStorage.getItem('active_room_code') : null;
      const targetRoom = roomFromUrl || roomFromStorage;

      let sessionQuery = supabase.from('game_sessions').select('*');
      if (targetRoom) {
        sessionQuery = sessionQuery.eq('room_code', targetRoom);
      } else {
        sessionQuery = sessionQuery.order('created_at', { ascending: true }).limit(1);
      }

      let { data: sessionData } = await sessionQuery.single();

      // Fallback jika room_code target belum ada
      if (!sessionData && targetRoom) {
        const { data: fallbackData } = await supabase
          .from('game_sessions')
          .select('*')
          .order('created_at', { ascending: true })
          .limit(1)
          .single();
        sessionData = fallbackData;
      }

      if (sessionData) {
        setSession(sessionData);

        if (typeof window !== 'undefined') {
          localStorage.setItem('active_room_code', sessionData.room_code);
        }

        const { activeCategoryId } = parseSessionMeta(sessionData);
        if (activeCategoryId) {
          setSelectedCategoryFilter(activeCategoryId);
        }

        // Load opened boxes from localStorage
        try {
          const saved = localStorage.getItem(`opened_boxes_${sessionData.id}`);
          if (saved) setOpenedBoxIds(JSON.parse(saved));
        } catch {}

        // Fetch questions
        const { data: qList } = await supabase
          .from('questions')
          .select('*')
          .order('created_at', { ascending: true });
        if (qList) {
          const parsed = qList.map(parseQuestionMeta);
          setQuestionsList(parsed);

          // Current question
          if (sessionData.current_question_id) {
            const foundQ = parsed.find((q) => q.id === sessionData.current_question_id);
            if (foundQ) setCurrentQuestion(foundQ);
          } else {
            setCurrentQuestion(null);
          }
        }

        // Teams
        const { data: teamsData } = await supabase
          .from('teams')
          .select('*')
          .eq('session_id', sessionData.id)
          .order('score', { ascending: false });
        if (teamsData) setTeams(teamsData);

        // Categories
        const { data: catData } = await supabase
          .from('categories')
          .select('*')
          .order('name', { ascending: true });
        if (catData) setCategories(catData);
      }
    } catch {
      // Quiet fail
    }
  }, []);

  useEffect(() => {
    loadData();

    // Auto-polling 2.5 detik sebagai jaring pengaman sinkronisasi
    const interval = setInterval(() => {
      loadData();
    }, 2500);

    return () => clearInterval(interval);
  }, [loadData]);

  // Realtime subscription
  useEffect(() => {
    if (!session?.id) return;

    const channelName = `room_sync_${session.id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_sessions', filter: `id=eq.${session.id}` },
        async (payload) => {
          const updated = payload.new as GameSession;
          if (updated) {
            setSession(updated);

            const { activeCategoryId } = parseSessionMeta(updated);
            if (activeCategoryId) {
              setSelectedCategoryFilter(activeCategoryId);
            }

            // Selaraskan currentQuestion di panel control dengan database
            if (updated.current_question_id) {
              const { data: qData } = await supabase
                .from('questions')
                .select('*')
                .eq('id', updated.current_question_id)
                .single();
              if (qData) setCurrentQuestion(parseQuestionMeta(qData));
            } else {
              setCurrentQuestion(null);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'teams', filter: `session_id=eq.${session.id}` },
        async () => {
          const { data: updatedTeams } = await supabase
            .from('teams')
            .select('*')
            .eq('session_id', session.id)
            .order('score', { ascending: false });
          if (updatedTeams) setTeams(updatedTeams);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'questions' },
        async () => {
          const { data: qList } = await supabase
            .from('questions')
            .select('*')
            .order('created_at', { ascending: true });
          if (qList) setQuestionsList(qList.map(parseQuestionMeta));
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categories' },
        async () => {
          const { data: catData } = await supabase
            .from('categories')
            .select('*')
            .order('name', { ascending: true });
          if (catData) setCategories(catData);
        }
      )
      .on('broadcast', { event: 'reset_boxes' }, () => {
        setOpenedBoxIds([]);
      })
      .on('broadcast', { event: 'box_count_sync' }, () => {
        loadData();
      })
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.id]);

  // SYNCHRONIZED COUNTDOWN TIMER (Presisi tinggi berbasis Server Timestamp)
  useEffect(() => {
    if (!session?.is_timer_running || !session?.updated_at) {
      if (session) {
        setRemainingTime(session.timer_remaining);
        prevRemainingRef.current = session.timer_remaining;
      }
      return;
    }

    const calcTime = () => {
      const elapsed = (Date.now() - new Date(session.updated_at!).getTime()) / 1000;
      const left = Math.max(0, Math.ceil(session.timer_remaining - elapsed));
      setRemainingTime((prev) => {
        if (left !== prev) {
          if (left <= 5 && left > 0) {
            sounds.playTick(true);
          } else if (left > 5) {
            sounds.playTick(false);
          } else if (left === 0 && prevRemainingRef.current > 0) {
            sounds.playTimeUp();
          }
          prevRemainingRef.current = left;
        }
        return left;
      });
    };

    calcTime();
    const timerInterval = setInterval(calcTime, 250);

    return () => clearInterval(timerInterval);
  }, [session?.is_timer_running, session?.updated_at, session?.timer_remaining]);

  // Handle timer toggle (Play/Pause)
  const toggleTimer = async () => {
    if (!session) return;
    const nextState = !session.is_timer_running;
    const nowIso = new Date().toISOString();

    setSession({
      ...session,
      is_timer_running: nextState,
      timer_remaining: remainingTime,
      updated_at: nowIso,
    });

    await supabase
      .from('game_sessions')
      .update({
        is_timer_running: nextState,
        timer_remaining: remainingTime,
        updated_at: nowIso,
        status: nextState ? 'active' : 'paused',
      })
      .eq('id', session.id);
  };

  // Reset timer to current question duration
  const resetTimer = async () => {
    if (!session || !currentQuestion) return;
    const dur = currentQuestion.timer_duration || 30;
    const nowIso = new Date().toISOString();

    setRemainingTime(dur);
    setSession({
      ...session,
      timer_remaining: dur,
      is_timer_running: false,
      updated_at: nowIso,
    });

    await supabase
      .from('game_sessions')
      .update({
        timer_remaining: dur,
        is_timer_running: false,
        updated_at: nowIso,
      })
      .eq('id', session.id);
  };

  // Quick preset duration: [15s], [20s], [30s], [45s], [60s]
  const handleSetDuration = async (seconds: number) => {
    if (!session) return;
    const nowIso = new Date().toISOString();

    setRemainingTime(seconds);
    setSession({
      ...session,
      timer_remaining: seconds,
      is_timer_running: false,
      updated_at: nowIso,
    });

    await supabase
      .from('game_sessions')
      .update({
        timer_remaining: seconds,
        is_timer_running: false,
        updated_at: nowIso,
      })
      .eq('id', session.id);
  };

  // Ubah Tampilan Layar Proyektor ('welcome' | 'type_select' | 'category_select' | 'box_select' | 'question_active')
  const handleSetProjectorView = async (
    view: 'welcome' | 'type_select' | 'category_select' | 'box_select' | 'question_active',
    specificType?: 'pilihan_ganda' | 'benar_salah' | 'essay',
    specificCategory?: string
  ) => {
    if (!session) return;
    const nowIso = new Date().toISOString();
    const typeToUse = specificType || selectedGameType;
    if (specificType) setSelectedGameType(specificType);

    if (view === 'welcome') {
      setCurrentQuestion(null);
      setSession({
        ...session,
        status: 'waiting',
        current_question_id: null,
        is_timer_running: false,
        is_answer_revealed: false,
        updated_at: nowIso,
      });

      await supabase
        .from('game_sessions')
        .update({
          status: 'waiting',
          current_question_id: null,
          is_timer_running: false,
          is_answer_revealed: false,
          updated_at: nowIso,
        })
        .eq('id', session.id);
    } else if (view === 'type_select') {
      setCurrentQuestion(null);
      setSession({
        ...session,
        status: 'type_select',
        current_question_id: null,
        is_timer_running: false,
        is_answer_revealed: false,
        updated_at: nowIso,
      });

      await supabase
        .from('game_sessions')
        .update({
          status: 'type_select',
          current_question_id: null,
          is_timer_running: false,
          is_answer_revealed: false,
          updated_at: nowIso,
        })
        .eq('id', session.id);
    } else if (view === 'category_select') {
      setCurrentQuestion(null);

      // 'category_pilihan_ganda' (22 char) melebihi VARCHAR(20) di DB. Gunakan 'category_select' yang aman & didukung proyektor.
      const targetStatus = typeToUse === 'pilihan_ganda' ? 'category_select' : `category_${typeToUse}`;

      setSession({
        ...session,
        status: targetStatus as any,
        current_question_id: null,
        is_timer_running: false,
        is_answer_revealed: false,
        updated_at: nowIso,
      });

      const { error } = await supabase
        .from('game_sessions')
        .update({
          status: targetStatus,
          current_question_id: null,
          is_timer_running: false,
          is_answer_revealed: false,
          updated_at: nowIso,
        })
        .eq('id', session.id);

      // Jaring pengaman: fallback ke 'category_select' jika target status kustom ditolak constraint DB
      if (error && targetStatus !== 'category_select') {
        await supabase
          .from('game_sessions')
          .update({
            status: 'category_select',
            current_question_id: null,
            is_timer_running: false,
            is_answer_revealed: false,
            updated_at: nowIso,
          })
          .eq('id', session.id);

        setSession((prev) => (prev ? { ...prev, status: 'category_select' as any } : null));
      }
    } else if (view === 'box_select') {
      setCurrentQuestion(null);
      const newStatus = `box_${typeToUse}`;
      const catToUse = specificCategory !== undefined ? specificCategory : selectedCategoryFilter;
      if (specificCategory !== undefined) setSelectedCategoryFilter(specificCategory);

      const updatedTitle = buildSessionTitleWithMeta(cleanTitle, boxCount, catToUse);

      setSession({
        ...session,
        title: updatedTitle,
        status: newStatus as any,
        current_question_id: null,
        is_timer_running: false,
        is_answer_revealed: false,
        updated_at: nowIso,
      });

      const { error } = await supabase
        .from('game_sessions')
        .update({
          title: updatedTitle,
          status: newStatus,
          current_question_id: null,
          is_timer_running: false,
          is_answer_revealed: false,
          updated_at: nowIso,
        })
        .eq('id', session.id);

      if (error) {
        await supabase
          .from('game_sessions')
          .update({
            title: updatedTitle,
            status: 'box_select',
            current_question_id: null,
            is_timer_running: false,
            is_answer_revealed: false,
            updated_at: nowIso,
          })
          .eq('id', session.id);
      }
    } else if (view === 'question_active' && currentQuestion) {
      setSession({
        ...session,
        status: 'active',
        current_question_id: currentQuestion.id,
        updated_at: nowIso,
      });

      await supabase
        .from('game_sessions')
        .update({
          status: 'active',
          current_question_id: currentQuestion.id,
          updated_at: nowIso,
        })
        .eq('id', session.id);
    }
  };

  // Toggle reveal answer
  const toggleRevealAnswer = async () => {
    if (!session) return;
    const nextState = !session.is_answer_revealed;
    setSession({ ...session, is_answer_revealed: nextState });

    await supabase
      .from('game_sessions')
      .update({ is_answer_revealed: nextState })
      .eq('id', session.id);
  };

  // Select Question & Auto-Start Timer
  const handleSelectQuestion = async (q: Question, autoStartTimer = false) => {
    if (!session) return;
    setLoadingAction(true);
    setCurrentQuestion(q);
    const dur = q.timer_duration || 30;
    const nowIso = new Date().toISOString();

    setRemainingTime(dur);
    setSession({
      ...session,
      status: 'active',
      current_question_id: q.id,
      is_answer_revealed: false,
      timer_remaining: dur,
      is_timer_running: autoStartTimer,
      updated_at: nowIso,
    });

    // Tandai kotak sebagai sudah dibuka
    setOpenedBoxIds((prev) => {
      if (prev.includes(q.id)) return prev;
      const next = [...prev, q.id];
      try {
        localStorage.setItem(`opened_boxes_${session.id}`, JSON.stringify(next));
      } catch {}
      return next;
    });

    await supabase
      .from('game_sessions')
      .update({
        status: 'active',
        current_question_id: q.id,
        is_answer_revealed: false,
        timer_remaining: dur,
        is_timer_running: autoStartTimer,
        updated_at: nowIso,
      })
      .eq('id', session.id);

    setLoadingAction(false);
  };

  // Reset status kotak yang sudah dibuka
  const handleResetBoxes = async () => {
    if (!session) return;
    const confirm = window.confirm('Buka ulang semua kotak (reset status kotak yang sudah dibuka)?');
    if (!confirm) return;

    setOpenedBoxIds([]);
    try {
      localStorage.removeItem(`opened_boxes_${session.id}`);
    } catch {}

    // Broadcast ke proyektor
    const channelName = `room_sync_${session.id}`;
    await supabase.channel(channelName).send({
      type: 'broadcast',
      event: 'reset_boxes',
      payload: {},
    });
  };

  // Hitung jumlah kotak dan judul bersih dari metadata sesi
  const { cleanTitle, boxCount } = parseSessionMeta(session);

  // Ubah jumlah kotak Blink Box (Custom) langsung dari kontrol operator
  const handleUpdateBoxCount = async (newCount: number) => {
    if (!session || newCount < 1) return;
    try {
      const updatedTitle = buildSessionTitleWithBoxes(cleanTitle, newCount);
      const { error } = await supabase
        .from('game_sessions')
        .update({ title: updatedTitle })
        .eq('id', session.id);

      if (error) throw error;

      setSession((prev) => (prev ? { ...prev, title: updatedTitle, blink_box_count: newCount } : prev));

      // Broadcast sinkronisasi ke proyektor
      supabase.channel(`room_sync_${session.id}`).send({
        type: 'broadcast',
        event: 'box_count_sync',
        payload: { boxCount: newCount },
      });
    } catch (err) {
      console.error('Update box count error:', err);
    }
  };

  // Ubah filter kategori dan sinkronkan ke metadata judul sesi proyektor
  const handleSelectCategoryFilter = async (catId: string) => {
    setSelectedCategoryFilter(catId);
    if (!session) return;
    try {
      const updatedTitle = buildSessionTitleWithMeta(cleanTitle, boxCount, catId);
      await supabase
        .from('game_sessions')
        .update({ title: updatedTitle })
        .eq('id', session.id);
      setSession((prev) => (prev ? { ...prev, title: updatedTitle } : prev));
    } catch (err) {
      console.error('Update category filter error:', err);
    }
  };

  // Filter pertanyaan sesuai jenis permainan dan kategori yang dipilih
  const filteredQuestions = questionsList.filter((q) => {
    const matchType = q.type === selectedGameType;
    const matchCat = selectedCategoryFilter === 'all' || q.category_id === selectedCategoryFilter;
    return matchType && matchCat;
  });

  const handleNextQuestion = async () => {
    if (!filteredQuestions.length || !currentQuestion) return;
    const currentIndex = filteredQuestions.findIndex((q) => q.id === currentQuestion.id);
    const nextIndex = (currentIndex + 1) % filteredQuestions.length;
    handleSelectQuestion(filteredQuestions[nextIndex], false);
  };

  // Finish Match (Trigger victory podium)
  const handleFinishMatch = async () => {
    if (!session) return;
    const confirmed = window.confirm('Apakah Anda yakin ingin menyelesaikan pertandingan & menampilkan Podium Juara di Proyektor?');
    if (!confirmed) return;

    const nowIso = new Date().toISOString();
    setSession({ ...session, status: 'finished', is_timer_running: false, updated_at: nowIso });

    await supabase
      .from('game_sessions')
      .update({ status: 'finished', is_timer_running: false, updated_at: nowIso })
      .eq('id', session.id);
  };

  // Quick Score Adjustment
  const handleAdjustScore = async (teamId: string, delta: number) => {
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;

    if (delta > 0) {
      sounds.playScoreUp();
    } else {
      sounds.playScoreDown();
    }

    const newScore = team.score + delta;
    setTeams(teams.map((t) => (t.id === teamId ? { ...t, score: newScore } : t)));

    await supabase
      .from('teams')
      .update({ score: newScore })
      .eq('id', teamId);
  };

  // Custom Score Add
  const handleCustomScore = async (teamId: string) => {
    const rawVal = customScores[teamId];
    if (!rawVal) return;

    const val = parseInt(rawVal, 10);
    if (isNaN(val) || val === 0) return;

    if (val > 0) {
      sounds.playScoreUp();
    } else {
      sounds.playScoreDown();
    }

    const team = teams.find((t) => t.id === teamId);
    if (!team) return;

    const newScore = team.score + val;
    setTeams(teams.map((t) => (t.id === teamId ? { ...t, score: newScore } : t)));

    setAppliedTeamId(teamId);
    setTimeout(() => setAppliedTeamId(null), 1200);

    setCustomScores((prev) => ({ ...prev, [teamId]: '' }));

    await supabase
      .from('teams')
      .update({ score: newScore })
      .eq('id', teamId);
  };

  // Handle Team Modals (Add / Edit / Delete)
  const handleOpenAddTeam = () => {
    setEditingTeam(null);
    setTeamFormName('');
    setTeamFormColor('#3b82f6');
    setTeamFormScore(0);
    setIsTeamModalOpen(true);
  };

  const handleOpenEditTeam = (t: Team) => {
    setEditingTeam(t);
    setTeamFormName(t.name);
    setTeamFormColor(t.color);
    setTeamFormScore(t.score);
    setIsTeamModalOpen(true);
  };

  const handleDeleteTeam = async (teamId: string) => {
    const confirmDelete = window.confirm('Hapus regu ini dari pertandingan?');
    if (!confirmDelete) return;

    setTeams(teams.filter((t) => t.id !== teamId));
    await supabase.from('teams').delete().eq('id', teamId);
  };

  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !teamFormName.trim()) return;

    if (editingTeam) {
      const { data: updated } = await supabase
        .from('teams')
        .update({
          name: teamFormName.trim(),
          color: teamFormColor,
          score: Number(teamFormScore),
        })
        .eq('id', editingTeam.id)
        .select()
        .single();

      if (updated) {
        setTeams(teams.map((t) => (t.id === editingTeam.id ? updated : t)));
      }
    } else {
      const { data: created } = await supabase
        .from('teams')
        .insert({
          session_id: session.id,
          name: teamFormName.trim(),
          color: teamFormColor,
          score: Number(teamFormScore),
          rank: teams.length + 1,
        })
        .select()
        .single();

      if (created) {
        setTeams([...teams, created]);
      }
    }
    setIsTeamModalOpen(false);
  };

  // SHORTCUT KEYBOARD: SPACEBAR untuk Pause / Resume Timer seketika
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        toggleTimer();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [session?.is_timer_running, session?.id, remainingTime]);

  const handleLogout = () => {
    sessionStorage.clear();
    router.push('/login');
  };

  if (!isAuthorized) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  // Teks label status layar proyektor
  let projectorStatusLabel = '4. Papan Kotak Blink Box';
  if (session?.status === 'waiting') {
    projectorStatusLabel = '1. Sambutan Arena (Opening)';
  } else if (session?.status === 'type_select') {
    projectorStatusLabel = '2. Format Tantangan Kuis';
  } else if (session?.status?.startsWith('category_') || session?.status === 'category_select') {
    projectorStatusLabel = '3. Pilih Kategori Soal';
  } else if (session?.current_question_id) {
    projectorStatusLabel = '5. Soal Aktif di Panggung';
  } else if (session?.status === 'box_benar_salah') {
    projectorStatusLabel = '4. Papan Kotak (Benar / Salah)';
  } else if (session?.status === 'box_essay') {
    projectorStatusLabel = '4. Papan Kotak (Rebutan / Lisan)';
  } else if (session?.status === 'box_pilihan_ganda') {
    projectorStatusLabel = '4. Papan Kotak (Pilihan Ganda)';
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col p-4 sm:p-6">
      {/* HEADER CONTROL BAR */}
      <header className="flex flex-wrap items-center justify-between pb-4 border-b border-slate-800 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-600/20 border border-blue-500/30 rounded-xl text-blue-400">
            <Tv className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-wide text-white uppercase">
              Control Panggung Operator
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              {availableRooms.length > 1 ? (
                <div className="flex items-center gap-1 bg-amber-400/10 border border-amber-400/30 rounded-lg px-2 py-0.5">
                  <span className="text-[10px] font-bold text-amber-300">ROOM:</span>
                  <select
                    value={session?.room_code || ''}
                    onChange={(e) => {
                      const newRoom = e.target.value;
                      if (newRoom && newRoom !== session?.room_code) {
                        if (typeof window !== 'undefined') {
                          localStorage.setItem('active_room_code', newRoom);
                          window.location.href = `/control?room=${encodeURIComponent(newRoom)}`;
                        }
                      }
                    }}
                    className="bg-transparent font-mono font-black text-xs text-amber-400 focus:outline-none cursor-pointer"
                    title="Ganti Ruangan Panggung yang Dikontrol"
                  >
                    {availableRooms.map((r) => (
                      <option key={r.id} value={r.room_code} className="bg-slate-900 text-white">
                        {r.room_code} - {r.title.replace(/\[BOXES:\d+\]/g, '').replace(/\[CAT:[^\]]+\]/g, '').trim()}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <span className="text-xs font-mono font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                  ROOM: {session?.room_code || '---'}
                </span>
              )}
              <span className="text-xs text-slate-400 hidden sm:inline">
                Status: {session?.status}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
              isConnected
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}
          >
            {isConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isConnected ? 'Live Sync' : 'Offline'}</span>
          </div>

          <a
            href={session?.room_code ? `/operator?room=${encodeURIComponent(session.room_code)}` : '/operator'}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-700 hover:border-blue-500 text-xs font-semibold rounded-xl text-slate-300 transition-all"
          >
            <Tv className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Buka Layar Proyektor</span>
          </a>

          <a
            href={session?.room_code ? `/admin/soal?room=${encodeURIComponent(session.room_code)}` : '/admin/soal'}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-700 hover:border-purple-500 text-xs font-semibold rounded-xl text-slate-300 transition-all"
          >
            <BookOpen className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Bank Soal</span>
          </a>

          <button
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-rose-400 rounded-xl bg-slate-900 border border-slate-800 transition-all"
            title="Keluar"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* KONTROL STATUS TAMPILAN PROYEKTOR OLEH OPERATOR */}
      <div className="my-3 bg-slate-900/90 border border-purple-500/30 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-2">
          <Tv className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            Layar Proyektor Sedang Menampilkan:
          </span>
          <span className="text-xs font-black uppercase px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
            {projectorStatusLabel}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Tombol 1: Sambutan Arena */}
          <button
            onClick={() => handleSetProjectorView('welcome')}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              session?.status === 'waiting'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 border border-purple-400'
                : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>1. Sambutan</span>
          </button>

          {/* Tombol 2: Format Tantangan */}
          <button
            onClick={() => handleSetProjectorView('type_select')}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              session?.status === 'type_select'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 border border-purple-400'
                : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>2. Jenis Soal</span>
          </button>

          {/* Tombol 3: Pilih Kategori */}
          <button
            onClick={() => handleSetProjectorView('category_select')}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              session?.status?.startsWith('category_') || session?.status === 'category_select'
                ? 'bg-pink-600 text-white shadow-md shadow-pink-600/30 border border-pink-400'
                : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>3. Kategori</span>
          </button>

          {/* Tombol 4: Papan Kotak */}
          <button
            onClick={() => handleSetProjectorView('box_select')}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              !['waiting', 'type_select'].includes(session?.status || '') &&
              !session?.status?.startsWith('category_') &&
              !session?.current_question_id
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 border border-indigo-400'
                : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>4. Papan Kotak</span>
          </button>

          {/* Tombol 5: Soal Aktif */}
          {currentQuestion && (
            <button
              onClick={() => handleSetProjectorView('question_active')}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                session?.current_question_id
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 border border-emerald-400'
                  : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              <span>5. Soal Aktif</span>
            </button>
          )}
        </div>
      </div>

      {/* SHORTCUT SPACEBAR BANNER */}
      <div className="mb-4 bg-blue-950/40 border border-blue-800/60 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-blue-300">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
          <span>
            Shortcut Cepat: Tekan tombol <strong>[SPACEBAR / SPASI]</strong> pada keyboard untuk Pause / Resume timer seketika!
          </span>
        </div>
        <span className="hidden md:inline font-mono bg-blue-900/60 px-2 py-0.5 rounded text-[11px] font-bold">
          {session?.is_timer_running ? 'TIMER BERJALAN' : 'TIMER DIJEDA'}
        </span>
      </div>

      {/* MAIN CONTROL ARENA: 2-COLUMN */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* KOLOM KIRI (7/12): SOAL AKTIF & KONTROL TIMER & NAVIGASI */}
        <section className="lg:col-span-7 space-y-6 flex flex-col justify-between">
          {/* TAMPILAN 1: JIKA PROYEKTOR SEDANG MENAMPILKAN SAMBUTAN ARENA */}
          {session?.status === 'waiting' && !session?.current_question_id && (
            <div className="bg-slate-900/90 border border-purple-500/30 rounded-2xl p-6 sm:p-8 shadow-xl backdrop-blur-md text-center flex flex-col items-center justify-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400 mb-1">
                <Sparkles className="w-7 h-7 animate-bounce" />
              </div>
              <span className="text-[11px] font-black uppercase tracking-widest text-purple-400 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20">
                Panggung Sambutan Aktif
              </span>
              <h2 className="text-lg sm:text-xl font-black text-white uppercase">
                Layar Proyektor Menampilkan Sambutan Panggung
              </h2>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Layar proyektor saat ini menyambut hadirin. Klik tombol di bawah untuk membuka pilihan Jenis Permainan atau langsung ke Papan Kotak!
              </p>
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => handleSetProjectorView('type_select')}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-purple-600/30 flex items-center gap-1.5"
                >
                  <Layers className="w-4 h-4" />
                  <span>Buka Pilihan Jenis Permainan</span>
                </button>
                <button
                  onClick={() => handleSetProjectorView('box_select')}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-indigo-600/30 flex items-center gap-1.5"
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span>Buka Papan Kotak Langsung</span>
                </button>
              </div>
            </div>
          )}

          {/* TAMPILAN 2: JIKA PROYEKTOR SEDANG MENAMPILKAN PILIHAN FORMAT / JENIS PERMAINAN */}
          {session?.status === 'type_select' && !session?.current_question_id && (
            <div className="bg-slate-900/90 border border-purple-500/30 rounded-2xl p-6 sm:p-8 shadow-xl backdrop-blur-md text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400 mx-auto">
                <Layers className="w-7 h-7" />
              </div>
              <div>
                <span className="text-[11px] font-black uppercase tracking-widest text-purple-400 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20">
                  Layar Proyektor: Tahap 1 • Pilih Jenis Permainan
                </span>
                <h2 className="text-lg sm:text-xl font-black text-white uppercase mt-2">
                  Pilih Format Tantangan untuk Panggung
                </h2>
                <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                  Proyektor saat ini menampilkan 3 format tantangan kuis. Klik salah satu jenis permainan di bawah untuk lanjut memilih kategori di proyektor!
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <button
                  onClick={() => handleSetProjectorView('category_select', 'pilihan_ganda')}
                  className="p-4 rounded-2xl bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/40 text-left transition-all group"
                >
                  <BookOpen className="w-6 h-6 text-blue-400 mb-2 group-hover:scale-110 transition-transform" />
                  <h4 className="text-sm font-black text-white uppercase">Pilihan Ganda</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">4 Opsi Jawaban (A/B/C/D)</p>
                  <span className="block mt-2 text-[10px] text-blue-300 font-bold">➔ Lanjut Pilih Kategori</span>
                </button>

                <button
                  onClick={() => handleSetProjectorView('category_select', 'benar_salah')}
                  className="p-4 rounded-2xl bg-amber-600/20 hover:bg-amber-600/40 border border-amber-500/40 text-left transition-all group"
                >
                  <HelpCircle className="w-6 h-6 text-amber-400 mb-2 group-hover:scale-110 transition-transform" />
                  <h4 className="text-sm font-black text-white uppercase">Benar / Salah</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">Ketangkasan Kilat</p>
                  <span className="block mt-2 text-[10px] text-amber-300 font-bold">➔ Lanjut Pilih Kategori</span>
                </button>

                <button
                  onClick={() => handleSetProjectorView('category_select', 'essay')}
                  className="p-4 rounded-2xl bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/40 text-left transition-all group"
                >
                  <Layers className="w-6 h-6 text-purple-400 mb-2 group-hover:scale-110 transition-transform" />
                  <h4 className="text-sm font-black text-white uppercase">Rebutan / Lisan</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">Penilaian Juri</p>
                  <span className="block mt-2 text-[10px] text-purple-300 font-bold">➔ Lanjut Pilih Kategori</span>
                </button>
              </div>
            </div>
          )}

          {/* TAMPILAN 2.5: JIKA PROYEKTOR SEDANG MENAMPILKAN PILIHAN KATEGORI */}
          {(session?.status?.startsWith('category_') || session?.status === 'category_select') && !session?.current_question_id && (
            <div className="bg-slate-900/90 border border-pink-500/30 rounded-2xl p-6 sm:p-8 shadow-xl backdrop-blur-md text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-pink-600/20 border border-pink-500/40 flex items-center justify-center text-pink-400 mx-auto">
                <Tag className="w-7 h-7" />
              </div>
              <div>
                <span className="text-[11px] font-black uppercase tracking-widest text-pink-400 bg-pink-500/10 px-3 py-1 rounded-full border border-pink-500/20">
                  Layar Proyektor: Tahap 2 • Pilih Kategori ({selectedGameType.replace('_', ' ').toUpperCase()})
                </span>
                <h2 className="text-lg sm:text-xl font-black text-white uppercase mt-2">
                  Pilih Kategori Tantangan untuk Panggung
                </h2>
                <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                  Proyektor saat ini menampilkan pilihan kategori. Klik salah satu kategori di bawah untuk langsung membuka papan kotak soal kategori tersebut di layar panggung!
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-2">
                <button
                  onClick={() => handleSetProjectorView('box_select', selectedGameType, 'all')}
                  className="p-3.5 rounded-2xl bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/40 text-left transition-all"
                >
                  <LayoutGrid className="w-5 h-5 text-indigo-400 mb-1" />
                  <h4 className="text-xs font-black text-white uppercase">Semua Kategori</h4>
                  <span className="block mt-1 text-[10px] text-indigo-300 font-mono">
                    {questionsList.filter((q) => q.type === selectedGameType).length} Soal
                  </span>
                  <span className="block mt-1 text-[9px] text-emerald-400 font-bold">➔ Buka Kotak</span>
                </button>

                {categories.map((c) => {
                  const count = questionsList.filter(
                    (q) => q.type === selectedGameType && q.category_id === c.id
                  ).length;
                  return (
                    <button
                      key={c.id}
                      onClick={() => handleSetProjectorView('box_select', selectedGameType, c.id)}
                      className="p-3.5 rounded-2xl bg-pink-600/20 hover:bg-pink-600/40 border border-pink-500/40 text-left transition-all"
                    >
                      <Tag className="w-5 h-5 text-pink-400 mb-1" />
                      <h4 className="text-xs font-black text-white uppercase truncate">{c.name}</h4>
                      <span className="block mt-1 text-[10px] text-pink-300 font-mono">{count} Soal</span>
                      <span className="block mt-1 text-[9px] text-emerald-400 font-bold">➔ Buka Kotak</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  onClick={() => handleSetProjectorView('type_select')}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1.5 border border-slate-700"
                >
                  <Layers className="w-3.5 h-3.5 text-purple-400" />
                  <span>◀ Kembali ke Pilihan Format</span>
                </button>
              </div>
            </div>
          )}

          {/* TAMPILAN 3: JIKA PROYEKTOR SEDANG MENAMPILKAN PAPAN KOTAK */}
          {!['waiting', 'type_select'].includes(session?.status || '') &&
            !session?.status?.startsWith('category_') &&
            session?.status !== 'category_select' &&
            !session?.current_question_id && (
            <div className="bg-slate-900/90 border border-indigo-500/30 rounded-2xl p-6 sm:p-8 shadow-xl backdrop-blur-md text-center flex flex-col items-center justify-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 mb-1">
                <LayoutGrid className="w-7 h-7" />
              </div>
              <span className="text-[11px] font-black uppercase tracking-widest text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
                Papan Kotak: {selectedGameType.replace('_', ' ').toUpperCase()}
              </span>
              <h2 className="text-lg sm:text-xl font-black text-white uppercase">
                Layar Proyektor Menampilkan Papan Kotak
              </h2>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Peserta di panggung sedang melihat kotak di proyektor. Klik salah satu nomor kotak di bawah untuk langsung membuka soalnya di proyektor!
              </p>
              <div className="flex items-center gap-2 flex-wrap justify-center pt-1">
                <button
                  onClick={() => handleSetProjectorView('category_select')}
                  className="px-3 py-1.5 rounded-xl bg-pink-950/70 hover:bg-pink-900/80 text-pink-300 text-xs font-bold flex items-center gap-1.5 border border-pink-700/60"
                >
                  <Tag className="w-3.5 h-3.5 text-pink-400" />
                  <span>Ganti Kategori di Proyektor</span>
                </button>
                <button
                  onClick={() => handleSetProjectorView('type_select')}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1.5 border border-slate-700"
                >
                  <Layers className="w-3.5 h-3.5 text-purple-400" />
                  <span>Ganti Jenis Permainan</span>
                </button>
              </div>
            </div>
          )}

          {/* TAMPILAN 4: KOTAK SOAL AKTIF & KUNCI CONTEKAN OPERATOR */}
          {session?.current_question_id && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-purple-500/20 text-purple-400 border border-purple-500/30">
                    {currentQuestion?.type.replace('_', ' ') || 'Belum ada soal'}
                  </span>
                  {(() => {
                    const activeCat = categories.find((c) => c.id === currentQuestion?.category_id);
                    if (!activeCat) return null;
                    return (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 bg-pink-500/20 text-pink-300 border border-pink-500/30">
                        <Tag className="w-3 h-3 text-pink-400" />
                        Kategori: {activeCat.name}
                      </span>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-semibold">
                    Bobot: +{currentQuestion?.points || 100} Poin
                  </span>
                  {/* Live Realtime Timer Badge */}
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-black font-mono tracking-wider flex items-center gap-1 border ${
                      remainingTime <= 5 && session?.is_timer_running
                        ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse'
                        : remainingTime <= 10
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                        : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                    }`}
                  >
                    ⏱ {remainingTime}s
                  </span>
                </div>
              </div>

              <h2 className="text-lg sm:text-xl font-bold text-white mb-4">
                {currentQuestion?.question_text || 'Pilih soal dari daftar di bawah'}
              </h2>

              {/* Kotak Contekan Kunci Jawaban Operator */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                    Kunci Jawaban (Contekan Operator):
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      session?.is_answer_revealed
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {session?.is_answer_revealed ? 'Terbuka di Proyektor' : 'Tertutup'}
                  </span>
                </div>
                <p className="text-base font-extrabold text-emerald-400 font-mono">
                  {currentQuestion?.correct_answer || '-'}
                </p>
                {currentQuestion?.explanation && (
                  <p className="text-xs text-slate-400 mt-1 italic">
                    Penjelasan: {currentQuestion.explanation}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* PRESET DURASI CEPAT TIMER (Hanya jika ada soal aktif) */}
          {session?.current_question_id && (
            <>
              <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 p-2.5 rounded-xl">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
                  Preset Timer:
                </span>
                <div className="flex flex-wrap gap-1.5 flex-1">
                  {[15, 20, 30, 45, 60].map((sec) => (
                    <button
                      key={sec}
                      onClick={() => handleSetDuration(sec)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                        remainingTime === sec
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>

              {/* ACTION BUTTONS: TIMER, BUKA KUNCI, KEMBALI KE KOTAK, SOAL BERIKUTNYA */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {/* Play / Pause Timer */}
                <button
                  onClick={toggleTimer}
                  className={`p-3.5 rounded-2xl font-bold flex flex-col items-center justify-center gap-1 transition-all shadow-lg ${
                    session?.is_timer_running
                      ? 'bg-amber-600 hover:bg-amber-500 text-slate-950 shadow-amber-600/20'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                  }`}
                >
                  {session?.is_timer_running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                  <span className="text-[11px] uppercase tracking-wider font-bold">
                    {session?.is_timer_running ? `Jeda (${remainingTime}s)` : `Jalankan (${remainingTime}s)`}
                  </span>
                </button>

                {/* Reset Timer */}
                <button
                  onClick={resetTimer}
                  className="p-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold flex flex-col items-center justify-center gap-1 transition-all"
                >
                  <RotateCcw className="w-5 h-5 text-slate-400" />
                  <span className="text-[11px] uppercase tracking-wider">Reset Timer</span>
                </button>

                {/* Buka / Tutup Kunci Jawaban */}
                <button
                  onClick={toggleRevealAnswer}
                  className={`p-3.5 rounded-2xl font-bold flex flex-col items-center justify-center gap-1 transition-all shadow-lg ${
                    session?.is_answer_revealed
                      ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/20'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  }`}
                >
                  <Eye className="w-5 h-5 text-amber-400" />
                  <span className="text-[11px] uppercase tracking-wider">
                    {session?.is_answer_revealed ? 'Tutup Kunci' : 'Buka Kunci'}
                  </span>
                </button>

                {/* Kembali ke Papan Kotak */}
                <button
                  onClick={() => handleSetProjectorView('box_select')}
                  className="p-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex flex-col items-center justify-center gap-1 transition-all shadow-lg shadow-indigo-600/20"
                  title="Tutup soal ini & kembali ke tampilan kotak panggung"
                >
                  <LayoutGrid className="w-5 h-5" />
                  <span className="text-[11px] uppercase tracking-wider">Papan Kotak</span>
                </button>

                {/* Soal Berikutnya */}
                <button
                  onClick={handleNextQuestion}
                  disabled={loadingAction}
                  className="p-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold flex flex-col items-center justify-center gap-1 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50"
                >
                  <SkipForward className="w-5 h-5" />
                  <span className="text-[11px] uppercase tracking-wider">Soal Lanjut</span>
                </button>
              </div>
            </>
          )}

          {/* SELEKTOR KOTAK BLINK BOX INTERAKTIF OPERATOR */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-md">
            <div className="flex flex-wrap items-center justify-between mb-3 gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-black uppercase tracking-wider text-white">
                  Pilih Kotak Blink Box ({boxCount} Kotak):
                </span>

                {/* Quick Presets & Custom Changer */}
                <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1">
                  {[6, 9, 12].map((cnt) => (
                    <button
                      key={cnt}
                      onClick={() => handleUpdateBoxCount(cnt)}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded-lg transition-all ${
                        boxCount === cnt
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {cnt}
                    </button>
                  ))}
                  <div className="flex items-center gap-1 pl-1 border-l border-slate-800">
                    <span className="text-[10px] text-slate-500 font-bold">Custom:</span>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      defaultValue={boxCount}
                      key={boxCount}
                      onBlur={(e) => {
                        const val = Number(e.target.value);
                        if (val > 0 && val !== boxCount) handleUpdateBoxCount(val);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = Number((e.target as HTMLInputElement).value);
                          if (val > 0 && val !== boxCount) handleUpdateBoxCount(val);
                        }
                      }}
                      className="w-10 bg-slate-900 border border-slate-700 rounded text-center text-[10px] font-mono font-bold text-white py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleResetBoxes}
                  className="text-[10px] text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all"
                  title="Buka ulang semua kotak"
                >
                  ↺ Reset Kotak
                </button>
                <button
                  onClick={() => handleSetProjectorView('category_select')}
                  className="text-[10px] text-pink-400 hover:text-white px-2 py-0.5 rounded bg-pink-950/60 hover:bg-pink-900/60 border border-pink-700/60 transition-all flex items-center gap-1"
                  title="Tampilkan pilihan kategori di proyektor"
                >
                  <Tag className="w-2.5 h-2.5" />
                  <span>Pilih Kategori di Proyektor</span>
                </button>
                <button
                  onClick={() => handleSetProjectorView('type_select')}
                  className="text-[10px] text-indigo-400 hover:text-white px-2 py-0.5 rounded bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-700/60 transition-all"
                  title="Tampilkan 3 jenis permainan di proyektor"
                >
                  🎮 Pilih Jenis di Proyektor
                </button>
              </div>
            </div>

            {/* TAB FILTER JENIS PERMAINAN / BABAK */}
            <div className="flex items-center gap-1.5 mb-3 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
              {[
                { type: 'pilihan_ganda', label: 'Pilihan Ganda', icon: BookOpen },
                { type: 'benar_salah', label: 'Benar / Salah', icon: HelpCircle },
                { type: 'essay', label: 'Rebutan / Lisan', icon: Layers },
              ].map((item) => {
                const Icon = item.icon;
                const isCurrent = selectedGameType === item.type;
                const count = questionsList.filter((q) => q.type === item.type).length;
                return (
                  <button
                    key={item.type}
                    onClick={() => handleSetProjectorView('box_select', item.type as any)}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      isCurrent
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                        : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                    <span className="text-[10px] opacity-70">({count})</span>
                  </button>
                );
              })}
            </div>

            {/* FILTER KATEGORI */}
            {categories.length > 0 && (
              <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1 scrollbar-thin">
                <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1 mr-1 shrink-0">
                  <Tag className="w-3 h-3 text-pink-400" />
                  Kategori:
                </span>
                <button
                  onClick={() => handleSelectCategoryFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 transition-all ${
                    selectedCategoryFilter === 'all'
                      ? 'bg-pink-600 text-white shadow-sm shadow-pink-600/30'
                      : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-900 border border-slate-800'
                  }`}
                >
                  Semua ({questionsList.filter((q) => q.type === selectedGameType).length})
                </button>
                {categories.map((cat) => {
                  const count = questionsList.filter(
                    (q) => q.type === selectedGameType && q.category_id === cat.id
                  ).length;
                  const isSel = selectedCategoryFilter === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => handleSelectCategoryFilter(cat.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 transition-all ${
                        isSel
                          ? 'bg-pink-600 text-white shadow-sm shadow-pink-600/30'
                          : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-900 border border-slate-800'
                      }`}
                    >
                      {cat.name} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            <div
              className={`grid gap-2.5 ${
                boxCount <= 4
                  ? 'grid-cols-2 sm:grid-cols-4'
                  : boxCount <= 6
                  ? 'grid-cols-3 sm:grid-cols-6'
                  : boxCount <= 9
                  ? 'grid-cols-3 sm:grid-cols-3 md:grid-cols-5'
                  : boxCount <= 12
                  ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6'
                  : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8'
              }`}
            >
              {Array.from({ length: boxCount }).map((_, idx) => {
                const boxNum = idx + 1;
                const matchedQ =
                  filteredQuestions.find((q) => q.box_number === boxNum) || filteredQuestions[idx];
                const isActive = currentQuestion?.id === matchedQ?.id && session?.current_question_id === matchedQ?.id;
                const isOpened = matchedQ && openedBoxIds.includes(matchedQ.id);
                const qCat = matchedQ ? categories.find((c) => c.id === matchedQ.category_id) : null;

                return (
                  <button
                    key={boxNum}
                    disabled={!matchedQ}
                    onClick={() => matchedQ && handleSelectQuestion(matchedQ, true)}
                    className={`p-3 rounded-xl font-bold flex flex-col items-center justify-center transition-all relative ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-400 scale-105'
                        : isOpened
                        ? 'bg-slate-950/80 border border-slate-800 text-slate-500 opacity-60 hover:opacity-100 hover:border-slate-700'
                        : matchedQ
                        ? 'bg-slate-950 border border-slate-800 hover:border-blue-500 text-slate-200 hover:text-white'
                        : 'bg-slate-950/40 border border-slate-800 text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    {isOpened && (
                      <span className="absolute top-1 right-1 text-[9px] font-bold text-emerald-400">
                        ✓
                      </span>
                    )}
                    <span className="text-base font-mono font-black">#{boxNum}</span>
                    {qCat && (
                      <span className="text-[8px] font-bold text-pink-300 bg-pink-500/20 px-1 py-0.5 rounded border border-pink-500/30 truncate max-w-[85px] leading-tight my-0.5">
                        🏷️ {qCat.name}
                      </span>
                    )}
                    <span className="text-[9px] uppercase tracking-wider truncate max-w-[80px]">
                      {matchedQ ? matchedQ.question_text.slice(0, 10) + '...' : 'Kosong'}
                    </span>
                    <span className="text-[8px] mt-0.5 text-slate-500">
                      {isOpened ? 'Sudah Dibuka' : 'Tersedia'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* LIST PEMILIHAN SOAL CEPAT */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-2">
              Daftar Bank Soal ({selectedGameType.replace('_', ' ').toUpperCase()}) - {filteredQuestions.length} Soal
            </span>
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {filteredQuestions.map((q, idx) => {
                const isActive = currentQuestion?.id === q.id && session?.current_question_id === q.id;
                const cat = categories.find((c) => c.id === q.category_id);
                return (
                  <button
                    key={q.id}
                    onClick={() => handleSelectQuestion(q, false)}
                    className={`w-full text-left p-2.5 rounded-xl text-xs font-medium flex items-center justify-between border transition-all ${
                      isActive
                        ? 'bg-blue-600/20 border-blue-500 text-white font-bold'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate pr-2 min-w-0">
                      <span className="truncate">
                        #{idx + 1}. {q.question_text}
                      </span>
                      {cat && (
                        <span className="shrink-0 text-[9px] font-semibold text-pink-300 bg-pink-500/20 px-1.5 py-0.5 rounded border border-pink-500/30">
                          {cat.name}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 uppercase text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400">
                      +{q.points || 100} pts
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* KOLOM KANAN (5/12): KONTROL SKOR CEPAT PER REGU */}
        <section className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col h-fit">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-wider">
                Panel Skor Cepat Regu
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleOpenAddTeam}
                className="flex items-center gap-1 px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-bold transition-all"
                title="Tambah Regu Baru"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>+ Regu</span>
              </button>
              <span className="text-xs text-slate-500 font-mono">
                {teams.length} Regu
              </span>
            </div>
          </div>

          {/* List Tim dengan Kontrol Skor Cepat */}
          <div className="space-y-3 overflow-y-auto max-h-[480px] pr-1">
            {teams.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-xs">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                Belum ada regu yang bergabung di room ini.
                <button
                  onClick={handleOpenAddTeam}
                  className="mt-3 block mx-auto px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold"
                >
                  + Daftarkan Regu Sekarang
                </button>
              </div>
            ) : (
              teams.map((t) => (
                <div
                  key={t.id}
                  className="p-3 sm:p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5 shadow-sm"
                >
                  {/* Header Tim & Skor Saat Ini */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full shrink-0 shadow"
                        style={{ backgroundColor: t.color }}
                      />
                      <span className="font-extrabold text-white text-xs sm:text-sm">
                        {t.name}
                      </span>
                      {/* Tombol Edit & Hapus Regu */}
                      <div className="flex items-center gap-0.5 ml-1">
                        <button
                          onClick={() => handleOpenEditTeam(t)}
                          className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                          title="Edit Nama / Warna / Skor Regu"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteTeam(t.id)}
                          className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
                          title="Hapus Regu"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <span
                      className={`font-mono font-black text-xl sm:text-2xl ${
                        t.score < 0 ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {t.score} <span className="text-[10px] text-slate-500 font-normal">PTS</span>
                    </span>
                  </div>

                  {/* Tombol Cepat: +100, +50, -50, -100 */}
                  <div className="grid grid-cols-4 gap-1 sm:gap-1.5">
                    <button
                      onClick={() => handleAdjustScore(t.id, 100)}
                      className="py-1 px-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-bold transition-all text-center"
                    >
                      +100
                    </button>
                    <button
                      onClick={() => handleAdjustScore(t.id, 50)}
                      className="py-1 px-1.5 bg-emerald-600/10 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-bold transition-all text-center"
                    >
                      +50
                    </button>
                    <button
                      onClick={() => handleAdjustScore(t.id, -50)}
                      className="py-1 px-1.5 bg-rose-600/10 hover:bg-rose-600/30 text-rose-400 border border-rose-500/20 rounded-lg text-xs font-bold transition-all text-center"
                    >
                      -50
                    </button>
                    <button
                      onClick={() => handleAdjustScore(t.id, -100)}
                      className="py-1 px-1.5 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold transition-all text-center"
                    >
                      -100
                    </button>
                  </div>

                  {/* Input Custom Nilai Tambah / Kurang Skor */}
                  <div className="flex items-center gap-1.5 pt-1 border-t border-slate-900">
                    <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider shrink-0">
                      Nilai Kustom:
                    </span>
                    <input
                      type="number"
                      placeholder="Contoh: 15 / -20"
                      value={customScores[t.id] ?? ''}
                      onChange={(e) =>
                        setCustomScores({ ...customScores, [t.id]: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleCustomScore(t.id);
                        }
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white placeholder-slate-600 font-mono focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={() => handleCustomScore(t.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1 ${
                        appliedTeamId === t.id
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/40 scale-105'
                          : 'bg-blue-600 hover:bg-blue-500 text-white'
                      }`}
                    >
                      {appliedTeamId === t.id ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Berhasil!</span>
                        </>
                      ) : (
                        <span>Terapkan</span>
                      )}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* FINISH MATCH TRIGGER PODIUM */}
          <div className="pt-4 mt-auto border-t border-slate-800">
            <button
              onClick={handleFinishMatch}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
            >
              <Trophy className="w-4 h-4 text-slate-950" />
              <span>Selesaikan Pertandingan & Buka Podium Juara</span>
            </button>
          </div>
        </section>
      </div>

      {/* MODAL TAMBAH / EDIT REGU */}
      {isTeamModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full relative shadow-2xl">
            <button
              onClick={() => setIsTeamModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-black text-white uppercase mb-1">
              {editingTeam ? 'Edit Data Regu' : 'Daftarkan Regu Baru'}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Konfigurasi nama, warna identitas, dan skor awal regu
            </p>

            <form onSubmit={handleSaveTeam} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  Nama Regu:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Regu A / Garuda"
                  value={teamFormName}
                  onChange={(e) => setTeamFormName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  Warna Identitas:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={teamFormColor}
                    onChange={(e) => setTeamFormColor(e.target.value)}
                    className="w-10 h-10 rounded-xl bg-transparent cursor-pointer border-0"
                  />
                  <span className="text-xs font-mono text-slate-400 uppercase">
                    {teamFormColor}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  Skor Awal (Poin):
                </label>
                <input
                  type="number"
                  value={teamFormScore}
                  onChange={(e) => setTeamFormScore(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTeamModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/30"
                >
                  Simpan Regu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
