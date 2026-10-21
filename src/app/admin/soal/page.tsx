'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  supabase,
  GameSession,
  Question,
  QuestionType,
  Team,
  SessionQuestion,
  parseQuestionMeta,
  parseSessionMeta,
  buildSessionTitleWithBoxes,
  buildExplanationWithMeta,
  applyThemeToDom
} from '@/lib/supabase';
import ThemeSelector from '@/components/ThemeSelector';
import {
  BookOpen,
  Plus,
  Trash2,
  Edit,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  Tv,
  MonitorPlay,
  LogOut,
  Save,
  X,
  Users,
  UserPlus,
  ShieldCheck,
  Shuffle,
  Copy,
  Search,
  LayoutGrid,
  Tag,
  RotateCcw,
  Layers,
  Sparkles,
  CheckSquare,
  Loader2
} from 'lucide-react';
import { GeneratedQuestion } from '@/lib/gemini';

interface Category {
  id: string;
  name: string;
  description?: string | null;
  created_at?: string;
}

export default function AdminDashboardPage() {
  const router = useRouter();

  // Active Tab: 'babak' | 'soal' | 'kategori' | 'regu'
  const [activeTab, setActiveTab] = useState<'babak' | 'soal' | 'kategori' | 'regu'>('babak');

  // Shared session & Multi-room
  const [session, setSession] = useState<GameSession | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentRoomCode, setCurrentRoomCode] = useState<string>('KUIS88');
  const [availableRooms, setAvailableRooms] = useState<{ id: string; room_code: string; title: string }[]>([]);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [openedBoxIds, setOpenedBoxIds] = useState<string[]>([]);

  // Ref penanda inisialisasi babak
  const isInitialLoadedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Event Settings State (Judul Acara)
  const [eventTitle, setEventTitle] = useState('Kuis Battle Panggung');
  const [savingSettings, setSavingSettings] = useState(false);

  // Babak / Round Management States (Dukungan Custom Babak)
  const [activeRound, setActiveRound] = useState<string>('Babak 1');
  const activeRoundRef = useRef<string>(activeRound);

  useEffect(() => {
    activeRoundRef.current = activeRound;
  }, [activeRound]);

  const [customRounds, setCustomRounds] = useState<string[]>(['Babak 1', 'Babak 2', 'Final']);
  const [isNewRoundModalOpen, setIsNewRoundModalOpen] = useState(false);
  const [newRoundInput, setNewRoundInput] = useState('');
  const [roundBoxCount, setRoundBoxCount] = useState<number>(12);
  const [roundQuestions, setRoundQuestions] = useState<SessionQuestion[]>([]);
  const [isPickerModalOpen, setIsPickerModalOpen] = useState(false);
  const [pickerSelectedIds, setPickerSelectedIds] = useState<string[]>([]);
  const [pickerCategoryFilter, setPickerCategoryFilter] = useState<string>('all');
  const [pickerTypeFilter, setPickerTypeFilter] = useState<string>('all');
  const [pickerSearch, setPickerSearch] = useState<string>('');

  // Master Soal States
  const [categories, setCategories] = useState<Category[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [totalQuestionsCount, setTotalQuestionsCount] = useState<number>(0);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTypeTab, setSelectedTypeTab] = useState<'all' | 'pilihan_ganda' | 'benar_salah' | 'essay'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [packageFilter, setPackageFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize] = useState<number>(10);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Seleksi Massal (Ceklis Hapus & Ubah Kategori Sekaligus)
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [bulkCategory, setBulkCategory] = useState<string>('');
  const [bulkPackage, setBulkPackage] = useState<string>('');

  useEffect(() => {
    queueMicrotask(() => {
      setCurrentPage(1);
      setSelectedQuestionIds([]);
    });
  }, [selectedCategory, selectedTypeTab, searchQuery, packageFilter, pageSize]);

  // Category Management States
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catFormName, setCatFormName] = useState('');
  const [catFormDesc, setCatFormDesc] = useState('');
  const [savingCat, setSavingCat] = useState(false);

  // AI Question Generator States
  const [isAiGenModalOpen, setIsAiGenModalOpen] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiDifficulty, setAiDifficulty] = useState<'mudah' | 'sedang' | 'sulit' | 'campuran'>('sedang');
  const [aiQuestionType, setAiQuestionType] = useState<'pilihan_ganda' | 'benar_salah' | 'essay' | 'campuran'>('pilihan_ganda');
  const [aiAvoidDuplicates, setAiAvoidDuplicates] = useState<boolean>(true);
  const [aiCount, setAiCount] = useState<number>(3);
  const [aiCategory, setAiCategory] = useState<string>('');
  const [aiPackage, setAiPackage] = useState<string>('Paket AI Gemini');
  const [aiPoints, setAiPoints] = useState<number>(100);
  const [aiTimer, setAiTimer] = useState<number>(30);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [isAiSaving, setIsAiSaving] = useState(false);
  const [aiGeneratedQuestions, setAiGeneratedQuestions] = useState<GeneratedQuestion[]>([]);
  const [aiGenError, setAiGenError] = useState<string>('');

  // Modal Soal State (Dukungan Custom Package)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    category_id: string;
    type: QuestionType;
    question_text: string;
    options: { key: string; text: string }[];
    correct_answer: string;
    explanation: string;
    timer_duration: number;
    points: number;
    package_name: string;
  }>({
    category_id: '',
    type: 'pilihan_ganda',
    question_text: '',
    options: [
      { key: 'A', text: '' },
      { key: 'B', text: '' },
      { key: 'C', text: '' },
      { key: 'D', text: '' },
    ],
    correct_answer: 'A',
    explanation: '',
    timer_duration: 30,
    points: 100,
    package_name: 'Umum / Bebas',
  });

  // Regu / Peserta States
  const [teams, setTeams] = useState<Team[]>([]);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [teamFormName, setTeamFormName] = useState('');
  const [teamFormColor, setTeamFormColor] = useState('#3b82f6');
  const [teamFormScore, setTeamFormScore] = useState<number>(0);
  const [teamFormMemberCount, setTeamFormMemberCount] = useState<number>(3);
  const [teamFormMembers, setTeamFormMembers] = useState('');

  // KEAMANAN KETAT: Hanya peran 'admin' yang diizinkan mengakses
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);

  useEffect(() => {
    const role = sessionStorage.getItem('auth_role');
    if (role !== 'admin') {
      router.push('/login');
    } else {
      queueMicrotask(() => {
        setIsAuthorized(true);
      });
    }
  }, [router]);

  // Muat soal babak yang dipilih
  const loadRoundQuestions = useCallback(async (targetRoundName: string, targetSessionId: string) => {
    try {
      const { data: sqData } = await supabase
        .from('session_questions')
        .select('*, question:questions(*)')
        .eq('session_id', targetSessionId)
        .eq('round_name', targetRoundName)
        .order('box_number', { ascending: true, nullsFirst: false });

      if (sqData) {
        setRoundQuestions(sqData);
        const openedFromDb = sqData.filter((s) => s.is_opened).map((s) => s.question_id);
        setOpenedBoxIds((prev) => Array.from(new Set([...prev, ...openedFromDb])));
      }
    } catch {
      // Quiet fail
    }
  }, []);

  // Load Session, Categories, Master Questions
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
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

      let sQuery = supabase.from('game_sessions').select('*');
      if (targetRoom) {
        sQuery = sQuery.eq('room_code', targetRoom);
      } else {
        sQuery = sQuery.order('created_at', { ascending: true }).limit(1);
      }

      let { data: sData } = await sQuery.single();

      if (!sData && targetRoom) {
        const { data: fallbackData } = await supabase
          .from('game_sessions')
          .select('*')
          .order('created_at', { ascending: true })
          .limit(1)
          .single();
        sData = fallbackData;
      }

      if (sData) {
        setSession(sData);
        setSessionId(sData.id);
        setCurrentRoomCode(sData.room_code);
        setActiveQuestionId(sData.current_question_id || null);

        const { cleanTitle, boxCount, theme } = parseSessionMeta(sData);
        applyThemeToDom(theme);

        if (!isInitialLoadedRef.current) {
          if (sData.active_round) {
            setActiveRound(sData.active_round);
          }
          isInitialLoadedRef.current = true;
        }

        if (typeof window !== 'undefined') {
          localStorage.setItem('active_room_code', sData.room_code);
          try {
            const savedOpened = localStorage.getItem(`opened_boxes_${sData.id}`);
            if (savedOpened) setOpenedBoxIds(JSON.parse(savedOpened));
          } catch {}
        }

        setEventTitle(cleanTitle);
        setRoundBoxCount(boxCount || 12);

        // Ambil daftar babak yang ada pada room ini
        const { data: existingRoundsData } = await supabase
          .from('session_questions')
          .select('round_name')
          .eq('session_id', sData.id);

        const existingRoundNames = existingRoundsData ? existingRoundsData.map((r: { round_name: string }) => r.round_name) : [];
        setCustomRounds((prev) => {
          const merged = Array.from(new Set([...prev, ...existingRoundNames, sData.active_round || 'Babak 1'].filter(Boolean)));
          return merged;
        });

        const currentActive = isInitialLoadedRef.current ? activeRoundRef.current : (sData.active_round || 'Babak 1');
        loadRoundQuestions(currentActive, sData.id);
      }

      // 1. Ambil kategori & regu secara paralel & langsung pasang ke state tanpa saling menunggu
      const catsPromise = supabase
        .from('categories')
        .select('*')
        .order('name')
        .then(({ data, error }) => {
          if (!error && data) setCategories(data);
        });

      const teamsPromise = sData
        ? supabase
            .from('teams')
            .select('*')
            .eq('session_id', sData.id)
            .order('score', { ascending: false })
            .then(({ data, error }) => {
              if (!error && data) setTeams(data);
            })
        : Promise.resolve();

      // 2. Hitung jumlah total seluruh soal secara instan (~200ms)
      const countPromise = supabase
        .from('questions')
        .select('*', { count: 'exact', head: true })
        .then(({ count }) => {
          if (typeof count === 'number') setTotalQuestionsCount(count);
        });

      // 3. Muat batch 300 soal pertama secara cepat (~1-2 detik) alih-alih mengunduh ribuan sekaligus
      const qsPromise = supabase
        .from('questions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300)
        .then(({ data, error }) => {
          if (error) {
            console.error('Gagal fetch questions:', error);
            setStatusMsg({ text: `Gagal memuat bank soal: ${error.message}`, type: 'error' });
          } else if (data) {
            setQuestions(data.map(parseQuestionMeta));

            // Jika total soal lebih dari 300, unduh sisanya di latar belakang (background) tanpa mengunci layar
            supabase
              .from('questions')
              .select('*', { count: 'exact', head: true })
              .then(({ count }) => {
                if (count && count > 300) {
                  supabase
                    .from('questions')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .range(300, Math.min(count, 3000))
                    .then(({ data: restData }) => {
                      if (restData && restData.length > 0) {
                        setQuestions((prev) => {
                          const existingIds = new Set(prev.map((q) => q.id));
                          const newItems = restData.filter((q) => !existingIds.has(q.id)).map(parseQuestionMeta);
                          return [...prev, ...newItems];
                        });
                      }
                    });
                }
              });
          }
        });

      await Promise.all([catsPromise, teamsPromise, countPromise, qsPromise]);
    } catch {
      setStatusMsg({ text: 'Gagal memuat data', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [loadRoundQuestions]);

  useEffect(() => {
    let ignore = false;
    const run = async () => {
      if (!ignore) {
        await loadData();
      }
    };
    run();
    return () => {
      ignore = true;
    };
  }, [loadData]);

  const handleSelectRoundTab = (targetRoundName: string) => {
    setActiveRound(targetRoundName);
    if (sessionId) {
      loadRoundQuestions(targetRoundName, sessionId);
    }
  };

  // Tambah babak kustom baru
  const handleAddCustomRound = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newRoundInput.trim();
    if (!trimmed) return;
    if (!customRounds.includes(trimmed)) {
      setCustomRounds((prev) => [...prev, trimmed]);
    }
    setActiveRound(trimmed);
    if (sessionId) {
      loadRoundQuestions(trimmed, sessionId);
    }
    setNewRoundInput('');
    setIsNewRoundModalOpen(false);
    setStatusMsg({ text: `Babak "${trimmed}" berhasil dibuat! Silakan tambahkan soal.`, type: 'success' });
  };

  // Hapus babak kustom
  const handleDeleteCustomRound = (rName: string) => {
    if (!window.confirm(`Hapus babak "${rName}" dari daftar pilihan?`)) return;
    setCustomRounds((prev) => prev.filter((r) => r !== rName));
    if (activeRound === rName) {
      setActiveRound('Babak 1');
      if (sessionId) loadRoundQuestions('Babak 1', sessionId);
    }
  };

  // Realtime subscription
  useEffect(() => {
    if (!sessionId) return;
    const channelName = `room_sync_${sessionId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_sessions', filter: `id=eq.${sessionId}` },
        (payload: { new: { current_question_id?: string | null } }) => {
          if (payload.new) {
            setActiveQuestionId(payload.new.current_question_id || null);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'session_questions', filter: `session_id=eq.${sessionId}` },
        () => {
          if (sessionId) {
            loadRoundQuestions(activeRound, sessionId);
          }
        }
      )
      .on('broadcast', { event: 'reset_boxes' }, () => {
        setOpenedBoxIds([]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, activeRound, loadRoundQuestions]);

  // Simpan & Sinkronkan Babak & Jumlah Kotak ke Panggung
  const handleSyncRoundToStage = async () => {
    if (!sessionId) return;
    setSavingSettings(true);
    try {
      const titlePayload = buildSessionTitleWithBoxes(eventTitle, roundBoxCount);

      const { error } = await supabase
        .from('game_sessions')
        .update({
          title: titlePayload,
          active_round: activeRound,
        })
        .eq('id', sessionId);

      if (error) throw error;

      supabase.channel(`room_sync_${sessionId}`).send({
        type: 'broadcast',
        event: 'box_count_sync',
        payload: { boxCount: roundBoxCount, activeRound },
      });

      setStatusMsg({
        text: `Sukses! ${activeRound} (${roundBoxCount} Kotak) berhasil disinkronkan ke layar panggung!`,
        type: 'success',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setStatusMsg({ text: `Gagal sinkronisasi babak: ${msg}`, type: 'error' });
    } finally {
      setSavingSettings(false);
    }
  };

  // Reset status kotak panggung
  const handleResetStageStatus = async () => {
    if (!sessionId) return;
    if (!window.confirm(`Reset status kotak untuk ${activeRound}? Semua kotak akan kembali berstatus "Tersedia".`)) return;

    setOpenedBoxIds([]);
    try {
      localStorage.removeItem(`opened_boxes_${sessionId}`);
    } catch {}

    await supabase
      .from('session_questions')
      .update({ is_opened: false })
      .eq('session_id', sessionId)
      .eq('round_name', activeRound);

    await supabase.channel(`room_sync_${sessionId}`).send({
      type: 'broadcast',
      event: 'reset_boxes',
      payload: {},
    });

    if (sessionId) {
      loadRoundQuestions(activeRound, sessionId);
    }

    setStatusMsg({ text: `Status seluruh kotak ${activeRound} berhasil direset!`, type: 'success' });
  };

  // Ubah nomor slot kotak di babak
  const handleUpdateRoundBoxNumber = async (sqId: string, newBoxNum: number | null) => {
    try {
      const { error } = await supabase
        .from('session_questions')
        .update({ box_number: newBoxNum })
        .eq('id', sqId);

      if (error) throw error;

      setRoundQuestions((prev) =>
        prev.map((item) => (item.id === sqId ? { ...item, box_number: newBoxNum } : item))
      );
      setStatusMsg({ text: newBoxNum ? `Slot dipindah ke Kotak #${newBoxNum}` : 'Slot diatur otomatis', type: 'success' });
    } catch {
      setStatusMsg({ text: 'Gagal mengubah slot kotak', type: 'error' });
    }
  };

  // Keluarkan soal dari babak ini
  const handleRemoveFromRound = async (sqId: string) => {
    try {
      const { error } = await supabase.from('session_questions').delete().eq('id', sqId);
      if (error) throw error;

      setRoundQuestions((prev) => prev.filter((item) => item.id !== sqId));
      setStatusMsg({ text: 'Soal berhasil dikeluarkan dari babak.', type: 'success' });
    } catch {
      setStatusMsg({ text: 'Gagal mengeluarkan soal.', type: 'error' });
    }
  };

  // Tambah soal terpilih dari Bank Soal ke Babak Aktif
  const handleConfirmPickQuestions = async () => {
    if (!sessionId || pickerSelectedIds.length === 0) return;
    setLoading(true);

    try {
      const existingQIds = roundQuestions.map((sq) => sq.question_id);
      let nextSlot = 1;
      const usedSlots = roundQuestions.map((sq) => sq.box_number).filter((n): n is number => n !== null);

      const payloads = [];
      for (const qId of pickerSelectedIds) {
        if (existingQIds.includes(qId)) continue;
        while (usedSlots.includes(nextSlot)) {
          nextSlot++;
        }
        payloads.push({
          session_id: sessionId,
          question_id: qId,
          round_name: activeRound,
          box_number: nextSlot <= roundBoxCount ? nextSlot : null,
        });
        usedSlots.push(nextSlot);
        nextSlot++;
      }

      if (payloads.length > 0) {
        const { error } = await supabase.from('session_questions').insert(payloads);
        if (error) throw error;
      }

      setStatusMsg({ text: `Berhasil menambahkan ${payloads.length} soal ke ${activeRound}!`, type: 'success' });
      setIsPickerModalOpen(false);
      setPickerSelectedIds([]);
      loadRoundQuestions(activeRound, sessionId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setStatusMsg({ text: `Gagal menambahkan soal: ${msg}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // CHECKLIST MASSAL / BULK ACTIONS
  const handleToggleSelectAll = () => {
    if (paginatedQuestions.length > 0 && paginatedQuestions.every((q) => selectedQuestionIds.includes(q.id))) {
      setSelectedQuestionIds([]);
    } else {
      setSelectedQuestionIds(paginatedQuestions.map((q) => q.id));
    }
  };

  const handleToggleSelectQuestion = (id: string) => {
    setSelectedQuestionIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Hapus Massal Soal Terpilih
  const handleBulkDelete = async () => {
    if (selectedQuestionIds.length === 0) return;
    if (!window.confirm(`Hapus ${selectedQuestionIds.length} soal terpilih dari database master?`)) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('questions')
        .delete()
        .in('id', selectedQuestionIds);

      if (error) throw error;

      setStatusMsg({ text: `Berhasil menghapus ${selectedQuestionIds.length} soal terpilih!`, type: 'success' });
      setSelectedQuestionIds([]);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMsg({ text: `Gagal menghapus soal terpilih: ${msg}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Ubah Kategori Massal Soal Terpilih
  const handleBulkChangeCategory = async () => {
    if (selectedQuestionIds.length === 0) return;
    if (!bulkCategory) {
      setStatusMsg({ text: 'Pilih kategori tujuan terlebih dahulu', type: 'error' });
      return;
    }

    setLoading(true);
    try {
      const catId = bulkCategory === 'none' ? null : bulkCategory;
      const { error } = await supabase
        .from('questions')
        .update({ category_id: catId })
        .in('id', selectedQuestionIds);

      if (error) throw error;

      const catName = categories.find((c) => c.id === catId)?.name || 'Tanpa Kategori';
      setStatusMsg({
        text: `Berhasil mengubah kategori ${selectedQuestionIds.length} soal menjadi "${catName}"!`,
        type: 'success',
      });
      setSelectedQuestionIds([]);
      setBulkCategory('');
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMsg({ text: `Gagal mengubah kategori: ${msg}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Ubah Paket Massal Soal Terpilih
  const handleBulkChangePackage = async () => {
    if (selectedQuestionIds.length === 0) return;
    if (!bulkPackage.trim()) {
      setStatusMsg({ text: 'Tentukan paket tujuan terlebih dahulu', type: 'error' });
      return;
    }

    setLoading(true);
    try {
      const targetPkg = bulkPackage.trim();
      const questionsToUpdate = questions.filter((q) => selectedQuestionIds.includes(q.id));
      for (const q of questionsToUpdate) {
        const explanationWithMeta = buildExplanationWithMeta(q.explanation, q.box_number, targetPkg);
        await supabase
          .from('questions')
          .update({ explanation: explanationWithMeta })
          .eq('id', q.id);
      }

      setStatusMsg({
        text: `Berhasil mengubah paket ${selectedQuestionIds.length} soal menjadi "${targetPkg}"!`,
        type: 'success',
      });
      setSelectedQuestionIds([]);
      setBulkPackage('');
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMsg({ text: `Gagal mengubah paket: ${msg}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // EXPORT JSON SOAL MASTER
  const handleExportJSON = () => {
    try {
      const dataToExport = filteredQuestions.map((q) => ({
        type: q.type,
        question_text: q.question_text,
        options: q.options || [],
        correct_answer: q.correct_answer,
        explanation: q.explanation || '',
        package_name: q.package_name || 'Umum / Bebas',
        timer_duration: q.timer_duration || 30,
        points: q.points || 100,
        category_id: q.category_id || null,
        category_name: categories.find((c) => c.id === q.category_id)?.name || null,
      }));

      const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bank-soal-kuis-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatusMsg({ text: `Berhasil mengekspor ${dataToExport.length} soal ke format JSON!`, type: 'success' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMsg({ text: `Gagal mengekspor JSON: ${msg}`, type: 'error' });
    }
  };

  // IMPORT JSON SOAL MASTER
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        if (!Array.isArray(parsed)) {
          throw new Error('Format JSON harus berupa Array / daftar soal ([{...}])');
        }

        if (parsed.length === 0) {
          throw new Error('File JSON tidak berisi data soal.');
        }

        const validQuestions = [];
        for (const item of parsed) {
          if (!item.question_text || item.correct_answer === undefined || item.correct_answer === null) {
            continue;
          }

          let catId = item.category_id || null;
          if (!catId && item.category_name) {
            const matchCat = categories.find(
              (c) => c.name.toLowerCase() === String(item.category_name).toLowerCase()
            );
            if (matchCat) catId = matchCat.id;
          }

          const validTypes: QuestionType[] = ['pilihan_ganda', 'benar_salah', 'essay'];
          const qType: QuestionType = validTypes.includes(item.type) ? item.type : 'pilihan_ganda';

          const expWithMeta = buildExplanationWithMeta(
            item.explanation ? String(item.explanation).trim() : null,
            null,
            item.package_name ? String(item.package_name).trim() : 'Umum / Bebas'
          );

          validQuestions.push({
            category_id: catId,
            type: qType,
            question_text: String(item.question_text).trim(),
            options: Array.isArray(item.options) ? item.options : [],
            correct_answer: String(item.correct_answer).trim(),
            explanation: expWithMeta,
            timer_duration: Number(item.timer_duration) || 30,
            points: Number(item.points) || 100,
          });
        }

        if (validQuestions.length === 0) {
          throw new Error('Tidak ada data soal yang valid dalam file JSON.');
        }

        setLoading(true);
        const { error } = await supabase.from('questions').insert(validQuestions);
        if (error) throw error;

        setStatusMsg({
          text: `Berhasil mengimpor ${validQuestions.length} soal baru ke Bank Soal Master!`,
          type: 'success',
        });
        loadData();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatusMsg({ text: `Gagal mengimpor file JSON: ${msg}`, type: 'error' });
      } finally {
        setLoading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };

    reader.readAsText(file);
  };

  // Master Bank Soal Handlers
  const handleShuffleQuestion = async (q: Question) => {
    if (q.type !== 'pilihan_ganda' || !q.options || q.options.length < 2) {
      setStatusMsg({ text: 'Hanya soal Pilihan Ganda dengan opsi yang bisa diacak', type: 'error' });
      return;
    }

    const correctText = q.options.find((opt) => opt.key === q.correct_answer)?.text || '';
    const shuffledOptions = [...q.options].sort(() => Math.random() - 0.5);
    const keys = ['A', 'B', 'C', 'D'];
    const newOptions = shuffledOptions.map((opt, idx) => ({
      key: keys[idx] || opt.key,
      text: opt.text,
    }));
    const newCorrect = newOptions.find((opt) => opt.text === correctText)?.key || 'A';

    try {
      const { error } = await supabase
        .from('questions')
        .update({ options: newOptions, correct_answer: newCorrect })
        .eq('id', q.id);
      if (error) throw error;

      setQuestions((prev) =>
        prev.map((item) => (item.id === q.id ? { ...item, options: newOptions, correct_answer: newCorrect } : item))
      );
      setStatusMsg({ text: `Kunci soal berhasil diacak: Opsi baru [${newCorrect}]`, type: 'success' });
    } catch {
      setStatusMsg({ text: 'Gagal mengacak opsi soal', type: 'error' });
    }
  };

  const handleDuplicateQuestion = async (q: Question) => {
    try {
      const explanationWithMeta = buildExplanationWithMeta(q.explanation, null, q.package_name);
      const payload = {
        category_id: q.category_id || null,
        type: q.type,
        question_text: `${q.question_text} (Salinan)`,
        options: q.options || [],
        correct_answer: q.correct_answer,
        explanation: explanationWithMeta,
        timer_duration: q.timer_duration || 30,
        points: q.points || 100,
      };
      const { error } = await supabase.from('questions').insert(payload);
      if (error) throw error;
      setStatusMsg({ text: 'Soal berhasil diduplikat!', type: 'success' });
      loadData();
    } catch {
      setStatusMsg({ text: 'Gagal menduplikat soal', type: 'error' });
    }
  };

  const handleGenerateAiQuestions = async () => {
    if (!aiTopic.trim()) {
      setAiGenError('Topik soal wajib diisi!');
      return;
    }
    setAiGenError('');
    setIsAiGenerating(true);
    try {
      const res = await fetch('/api/ai/generate-soal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: aiTopic.trim(),
          difficulty: aiDifficulty,
          count: aiCount,
          categoryId: aiCategory || null,
          packageName: aiPackage.trim() || 'Umum / Bebas',
          points: aiPoints,
          timerDuration: aiTimer,
          questionType: aiQuestionType,
          existingQuestions: aiAvoidDuplicates
            ? questions
                .filter((q) => !aiCategory || q.category_id === aiCategory)
                .map((q) => q.question_text)
                .slice(0, 20)
            : [],
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Gagal menghasilkan soal dari AI.');
      }
      setAiGeneratedQuestions(data.questions || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAiGenError(`Gagal membuat soal: ${msg}`);
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleSaveAiQuestionsToDb = async () => {
    if (aiGeneratedQuestions.length === 0) return;
    setIsAiSaving(true);
    setAiGenError('');
    try {
      const payloads = aiGeneratedQuestions.map((q) => ({
        category_id: aiCategory || null,
        type: (q.type || aiQuestionType === 'campuran' ? q.type || 'pilihan_ganda' : aiQuestionType) as QuestionType,
        question_text: q.question_text,
        options: q.options || [],
        correct_answer: q.correct_answer,
        explanation: buildExplanationWithMeta(q.explanation, null, aiPackage || 'Umum / Bebas'),
        timer_duration: q.timer_duration || 30,
        points: q.points || 100,
      }));

      const { error } = await supabase.from('questions').insert(payloads);
      if (error) throw error;

      setStatusMsg({
        text: `Berhasil menambahkan ${payloads.length} soal AI ke Bank Soal!`,
        type: 'success',
      });
      setIsAiGenModalOpen(false);
      setAiGeneratedQuestions([]);
      setAiTopic('');
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAiGenError(`Gagal menyimpan ke database: ${msg}`);
    } finally {
      setIsAiSaving(false);
    }
  };

  const resetFormSoal = (defaultType: QuestionType = 'pilihan_ganda') => {
    setEditingId(null);
    let defaultAns = 'A';
    if (defaultType === 'benar_salah') defaultAns = 'true';
    if (defaultType === 'essay') defaultAns = '';

    setFormData({
      category_id: selectedCategory !== 'all' ? selectedCategory : categories[0]?.id || '',
      type: defaultType,
      question_text: '',
      options: [
        { key: 'A', text: '' },
        { key: 'B', text: '' },
        { key: 'C', text: '' },
        { key: 'D', text: '' },
      ],
      correct_answer: defaultAns,
      explanation: '',
      timer_duration: 30,
      points: 100,
      package_name: packageFilter !== 'all' ? packageFilter : 'Umum / Bebas',
    });
  };

  const handleOpenAddSoal = (defaultType?: QuestionType) => {
    const targetType = defaultType || (selectedTypeTab !== 'all' ? selectedTypeTab : 'pilihan_ganda');
    resetFormSoal(targetType);
    setIsModalOpen(true);
  };

  const handleOpenEditSoal = (q: Question) => {
    setEditingId(q.id);
    setFormData({
      category_id: q.category_id || '',
      type: q.type,
      question_text: q.question_text,
      options: q.options?.length
        ? q.options
        : [
            { key: 'A', text: '' },
            { key: 'B', text: '' },
            { key: 'C', text: '' },
            { key: 'D', text: '' },
          ],
      correct_answer: q.correct_answer,
      explanation: q.explanation || '',
      timer_duration: q.timer_duration || 30,
      points: q.points || 100,
      package_name: q.package_name || 'Umum / Bebas',
    });
    setIsModalOpen(true);
  };

  const handleDeleteSoal = async (id: string) => {
    if (!window.confirm('Hapus soal ini dari database master?')) return;
    try {
      await supabase.from('questions').delete().eq('id', id);
      setQuestions(questions.filter((q) => q.id !== id));
      setSelectedQuestionIds((prev) => prev.filter((item) => item !== id));
      setStatusMsg({ text: 'Soal berhasil dihapus', type: 'success' });
      loadData();
    } catch {
      setStatusMsg({ text: 'Gagal menghapus soal', type: 'error' });
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const explanationWithMeta = buildExplanationWithMeta(
        formData.explanation,
        null,
        formData.package_name
      );

      const payload = {
        category_id: formData.category_id || null,
        type: formData.type,
        question_text: formData.question_text,
        options: formData.type === 'pilihan_ganda' ? formData.options : [],
        correct_answer: formData.correct_answer,
        explanation: explanationWithMeta,
        timer_duration: Number(formData.timer_duration),
        points: Number(formData.points),
      };

      if (editingId) {
        const { error } = await supabase.from('questions').update(payload).eq('id', editingId);
        if (error) throw error;
        setStatusMsg({ text: 'Soal berhasil diperbarui', type: 'success' });
      } else {
        const { error } = await supabase.from('questions').insert(payload);
        if (error) throw error;
        setStatusMsg({ text: 'Soal baru berhasil ditambahkan', type: 'success' });
      }

      setIsModalOpen(false);
      resetFormSoal();
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setStatusMsg({ text: `Gagal menyimpan soal: ${msg}`, type: 'error' });
    }
  };

  // Kategori Handlers
  const handleOpenAddCategory = () => {
    setEditingCat(null);
    setCatFormName('');
    setCatFormDesc('');
    setIsCatModalOpen(true);
  };

  const handleOpenEditCategory = (cat: Category) => {
    setEditingCat(cat);
    setCatFormName(cat.name);
    setCatFormDesc(cat.description || '');
    setIsCatModalOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catFormName.trim()) return;
    setSavingCat(true);
    try {
      if (editingCat) {
        await supabase
          .from('categories')
          .update({ name: catFormName.trim(), description: catFormDesc.trim() || null })
          .eq('id', editingCat.id);
      } else {
        await supabase
          .from('categories')
          .insert({ name: catFormName.trim(), description: catFormDesc.trim() || null });
      }
      setIsCatModalOpen(false);
      const { data: cats } = await supabase.from('categories').select('*').order('name');
      if (cats) setCategories(cats);
      setStatusMsg({ text: 'Kategori berhasil disimpan!', type: 'success' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setStatusMsg({ text: `Gagal menyimpan kategori: ${msg}`, type: 'error' });
    } finally {
      setSavingCat(false);
    }
  };

  const handleDeleteCategory = async (cat: Category) => {
    if (!window.confirm(`Hapus kategori "${cat.name}"?`)) return;
    try {
      await supabase.from('categories').delete().eq('id', cat.id);
      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
      setStatusMsg({ text: `Kategori "${cat.name}" berhasil dihapus`, type: 'success' });
    } catch {
      setStatusMsg({ text: 'Gagal menghapus kategori', type: 'error' });
    }
  };

  // Regu Handlers
  const handleOpenAddTeam = () => {
    setEditingTeam(null);
    setTeamFormName('');
    setTeamFormColor('#3b82f6');
    setTeamFormScore(0);
    setTeamFormMemberCount(3);
    setTeamFormMembers('');
    setIsTeamModalOpen(true);
  };

  const handleOpenEditTeam = (team: Team) => {
    setEditingTeam(team);
    setTeamFormName(team.name);
    setTeamFormColor(team.color || '#3b82f6');
    setTeamFormScore(team.score);
    setTeamFormMemberCount(team.member_count || 3);
    setTeamFormMembers(team.members || '');
    setIsTeamModalOpen(true);
  };

  const handleDeleteTeam = async (teamId: string) => {
    if (!window.confirm('Hapus regu ini?')) return;
    try {
      await supabase.from('teams').delete().eq('id', teamId);
      setTeams(teams.filter((t) => t.id !== teamId));
      setStatusMsg({ text: 'Regu berhasil dihapus', type: 'success' });
    } catch {
      setStatusMsg({ text: 'Gagal menghapus regu', type: 'error' });
    }
  };

  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId || !teamFormName.trim()) return;

    try {
      if (editingTeam) {
        await supabase
          .from('teams')
          .update({
            name: teamFormName.trim(),
            color: teamFormColor,
            score: Number(teamFormScore),
            member_count: Number(teamFormMemberCount),
            members: teamFormMembers.trim(),
          })
          .eq('id', editingTeam.id);
      } else {
        await supabase.from('teams').insert({
          session_id: sessionId,
          name: teamFormName.trim(),
          color: teamFormColor,
          score: Number(teamFormScore),
          rank: teams.length + 1,
          member_count: Number(teamFormMemberCount),
          members: teamFormMembers.trim(),
        });
      }
      setIsTeamModalOpen(false);
      loadData();
      setStatusMsg({ text: 'Data regu berhasil disimpan!', type: 'success' });
    } catch {
      setStatusMsg({ text: 'Gagal menyimpan regu', type: 'error' });
    }
  };

  // Daftar Paket Unik untuk Filter & Pilihan Form
  const uniquePackages = Array.from(
    new Set([
      'Umum / Bebas',
      'Babak 1',
      'Babak 2',
      'Final',
      ...questions.map((q) => q.package_name).filter(Boolean) as string[],
    ])
  );

  // Filter Master Bank Soal
  const filteredQuestions = questions.filter((q) => {
    const matchesSearch =
      !searchQuery ||
      q.question_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.correct_answer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || q.category_id === selectedCategory;
    const matchesPackage = packageFilter === 'all' || (q.package_name || 'Umum / Bebas') === packageFilter;
    const matchesType = selectedTypeTab === 'all' || q.type === selectedTypeTab;
    return matchesSearch && matchesCategory && matchesPackage && matchesType;
  });

  const totalPages = Math.max(1, Math.ceil(filteredQuestions.length / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedQuestions = filteredQuestions.slice(startIndex, startIndex + pageSize);

  // Soal yang tersedia di picker modal
  const assignedQIds = roundQuestions.map((sq) => sq.question_id);
  const availableToPickQuestions = questions.filter((q) => {
    const notInThisRound = !assignedQIds.includes(q.id);
    const matchCat = pickerCategoryFilter === 'all' || q.category_id === pickerCategoryFilter;
    const matchType = pickerTypeFilter === 'all' || q.type === pickerTypeFilter;
    const matchSearch = !pickerSearch || q.question_text.toLowerCase().includes(pickerSearch.toLowerCase());
    return notInThisRound && matchCat && matchType && matchSearch;
  });

  if (!isAuthorized) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col p-4 sm:p-6">
      {/* Hidden input untuk upload file JSON */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".json"
        onChange={handleImportJSON}
        className="hidden"
      />

      {/* HEADER BAR */}
      <header className="flex flex-wrap items-center justify-between pb-4 border-b border-slate-800 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-purple-600/20 border border-purple-500/30 rounded-xl text-purple-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-wide text-white uppercase">
                Admin Pusat Perlombaan
              </h1>
              {availableRooms.length > 1 ? (
                <div className="flex items-center gap-1 bg-amber-400/10 border border-amber-400/30 rounded-lg px-2 py-0.5">
                  <span className="text-[10px] font-bold text-amber-300">ROOM:</span>
                  <select
                    value={currentRoomCode}
                    onChange={(e) => {
                      const newRoom = e.target.value;
                      if (newRoom && newRoom !== currentRoomCode) {
                        if (typeof window !== 'undefined') {
                          localStorage.setItem('active_room_code', newRoom);
                          router.push(`/admin/soal?room=${encodeURIComponent(newRoom)}`);
                        }
                      }
                    }}
                    className="bg-transparent font-mono font-black text-xs text-amber-400 focus:outline-none cursor-pointer"
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
                  ROOM: {currentRoomCode}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">Atur Babak Permainan, Kelola Database Soal, dan Regu Peserta</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeSelector session={session} />

          <a
            href={`/control?room=${encodeURIComponent(currentRoomCode)}`}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-700 hover:border-blue-500 text-xs font-semibold rounded-xl text-slate-300 transition-all"
          >
            <MonitorPlay className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Kontrol Operator</span>
          </a>

          <a
            href={`/operator?room=${encodeURIComponent(currentRoomCode)}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-700 hover:border-cyan-500 text-xs font-semibold rounded-xl text-slate-300 transition-all"
          >
            <Tv className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Layar Proyektor</span>
          </a>

          <button
            onClick={() => {
              sessionStorage.clear();
              router.push('/login');
            }}
            className="p-2 text-slate-400 hover:text-rose-400 rounded-xl bg-slate-900 border border-slate-800 transition-all"
            title="Keluar"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* STATUS NOTIFICATION */}
      {statusMsg && (
        <div
          className={`my-3 p-3 rounded-xl flex items-center justify-between text-xs border ${
            statusMsg.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/50 border-rose-800 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{statusMsg.text}</span>
          </div>
          <button onClick={() => setStatusMsg(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* TAB SELECTOR */}
      <div className="my-3 flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab('babak')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap ${
            activeTab === 'babak'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Layers className="w-4 h-4 text-amber-400" />
          <span>Atur Babak & Panggung</span>
        </button>

        <button
          onClick={() => setActiveTab('soal')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'soal'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>
            Bank Soal Master {loading && questions.length === 0 && !totalQuestionsCount ? '(Memuat...)' : `(${totalQuestionsCount || questions.length})`}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('kategori')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'kategori'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Tag className="w-4 h-4 text-emerald-400" />
          <span>Kelola Kategori ({categories.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('regu')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'regu'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Manajemen Regu ({teams.length})</span>
        </button>
      </div>

      {/* TAB 1: ATUR BABAK & PANGGUNG (DUKUNGAN CUSTOM BABAK) */}
      {activeTab === 'babak' && (
        <div className="space-y-4 flex-1 flex flex-col">
          {/* PANEL ATUR BABAK & JUMLAH KOTAK */}
          <div className="bg-gradient-to-r from-purple-950/60 via-slate-900 to-indigo-950/60 border border-purple-500/40 p-5 rounded-3xl shadow-xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-5 flex-1">
              {/* PILIH BABAK (DENGAN CUSTOM BABAK TAMBAH/HAPUS) */}
              <div>
                <label className="block text-[11px] font-black text-purple-300 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-purple-400" />
                  <span>Pilih Babak Permainan (Room {currentRoomCode}):</span>
                </label>
                <div className="flex items-center gap-1.5 flex-wrap bg-slate-950 border border-purple-500/40 p-1 rounded-xl">
                  {customRounds.map((rName) => (
                    <div key={rName} className="flex items-center">
                      <button
                        type="button"
                        onClick={() => handleSelectRoundTab(rName)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                          activeRound === rName
                            ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {rName}
                      </button>
                      {!['Babak 1', 'Babak 2', 'Final'].includes(rName) && (
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomRound(rName)}
                          className="p-1 text-slate-500 hover:text-rose-400 -ml-1 mr-1"
                          title={`Hapus babak ${rName}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}

                  {/* Tombol Tambah Babak Custom */}
                  <button
                    type="button"
                    onClick={() => setIsNewRoundModalOpen(true)}
                    className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-purple-500/40 text-purple-300 hover:text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                    title="Buat Babak Baru"
                  >
                    <Plus className="w-3 h-3" />
                    <span>+ Babak</span>
                  </button>
                </div>
              </div>

              {/* SET JUMLAH KOTAK */}
              <div>
                <label className="block text-[11px] font-black text-blue-300 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <LayoutGrid className="w-3.5 h-3.5 text-blue-400" />
                  <span>Set Kotak untuk {activeRound}:</span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-950 border border-blue-500/40 rounded-xl p-1">
                    {[6, 9, 12].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setRoundBoxCount(preset)}
                        className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                          roundBoxCount === preset
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {preset} Kotak
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5 bg-slate-950 border border-blue-500/40 rounded-xl px-2.5 py-1">
                    <span className="text-[10px] font-bold text-slate-400">Custom:</span>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={roundBoxCount}
                      onChange={(e) => setRoundBoxCount(Math.max(1, Number(e.target.value)))}
                      className="w-12 bg-slate-900 border border-blue-500/50 rounded-lg px-1 py-0.5 text-xs text-white font-mono font-black text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                    <span className="text-[10px] font-bold text-blue-300">Kotak</span>
                  </div>
                </div>
              </div>

              {/* INDIKATOR STATUS SLOT KOTAK */}
              <div className="bg-slate-950/80 border border-slate-800 px-4 py-2 rounded-2xl flex flex-col justify-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Kelengkapan Slot:
                </span>
                <span className="text-sm font-black font-mono">
                  <span className={roundQuestions.length >= roundBoxCount ? 'text-emerald-400' : 'text-amber-400'}>
                    {roundQuestions.length}
                  </span>{' '}
                  <span className="text-slate-500 font-normal">/ {roundBoxCount} Kotak Terisi</span>
                </span>
              </div>
            </div>

            {/* ACTION SYNC & RESET */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetStageStatus}
                className="px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                title="Kembalikan semua kotak ke status Tersedia"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>Reset Status</span>
              </button>

              <button
                type="button"
                onClick={handleSyncRoundToStage}
                disabled={savingSettings}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-black transition-all shadow-lg shadow-purple-600/30 flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>{savingSettings ? 'Menyinkronkan...' : 'Sinkronkan ke Layar Panggung'}</span>
              </button>
            </div>
          </div>

          {/* TOOLBAR DAFTAR SOAL BABAK */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 p-3 rounded-2xl">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-white">
                Daftar Soal {activeRound} untuk Room {currentRoomCode} ({roundQuestions.length} Soal)
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setPickerSelectedIds([]);
                setIsPickerModalOpen(true);
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-emerald-600/30 flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>+ Ambil Soal dari Bank Soal Master</span>
            </button>
          </div>

          {/* TABEL SOAL BABAK AKTIF */}
          <div className="flex-1 bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-3 text-center">Slot Kotak</th>
                    <th className="py-3 px-3">Status Panggung</th>
                    <th className="py-3 px-3">Tipe</th>
                    <th className="py-3 px-3">Kategori</th>
                    <th className="py-3 px-4">Pertanyaan</th>
                    <th className="py-3 px-4">Kunci Jawaban</th>
                    <th className="py-3 px-3 text-center">Poin</th>
                    <th className="py-3 px-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {roundQuestions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-slate-500">
                        Belum ada soal di {activeRound} untuk ruangan ini.<br />
                        <button
                          type="button"
                          onClick={() => setIsPickerModalOpen(true)}
                          className="mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs"
                        >
                          + Ambil Soal dari Bank Soal Master
                        </button>
                      </td>
                    </tr>
                  ) : (
                    roundQuestions.map((sq) => {
                      const q = sq.question;
                      if (!q) return null;
                      const isNowPlaying = activeQuestionId === q.id;
                      const isFinished = openedBoxIds.includes(q.id) || sq.is_opened;
                      const catName = categories.find((c) => c.id === q.category_id)?.name;

                      return (
                        <tr
                          key={sq.id}
                          className={`transition-colors ${
                            isNowPlaying
                              ? 'bg-blue-950/40 border-l-4 border-blue-500'
                              : isFinished
                              ? 'bg-slate-950/40 opacity-70 hover:opacity-100'
                              : 'hover:bg-slate-800/30'
                          }`}
                        >
                          <td className="py-3 px-3 text-center">
                            <select
                              value={sq.box_number ?? ''}
                              onChange={(e) =>
                                handleUpdateRoundBoxNumber(sq.id, e.target.value ? Number(e.target.value) : null)
                              }
                              className="bg-blue-950 border border-blue-500/50 text-blue-300 font-mono font-black text-xs rounded-lg px-2 py-1 focus:outline-none"
                            >
                              <option value="">Otomatis</option>
                              {Array.from({ length: roundBoxCount }).map((_, idx) => (
                                <option key={idx + 1} value={idx + 1}>
                                  Kotak #{idx + 1}
                                </option>
                              ))}
                            </select>
                          </td>

                          <td className="py-3 px-3">
                            {isNowPlaying ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-blue-500/20 text-blue-400 border border-blue-500/40 animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
                                ⏱ Sedang Tayang
                              </span>
                            ) : isFinished ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-slate-800 text-slate-400 border border-slate-700">
                                ✓ Sudah Selesai
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                                ● Tersedia
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-slate-800 text-slate-300 border border-slate-700">
                              {q.type.replace('_', ' ')}
                            </span>
                          </td>

                          <td className="py-3 px-3">
                            <span className="text-[11px] font-bold text-pink-300 flex items-center gap-1 truncate max-w-[120px]">
                              🏷️ {catName || 'Umum'}
                            </span>
                          </td>

                          <td className="py-3 px-4 font-semibold text-white max-w-xs truncate">
                            {q.question_text}
                          </td>

                          <td className="py-3 px-4 font-mono text-emerald-400 font-bold max-w-[150px] truncate">
                            {q.correct_answer}
                          </td>

                          <td className="py-3 px-3 text-center font-mono font-bold text-amber-400">
                            +{q.points}
                          </td>

                          <td className="py-3 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveFromRound(sq.id)}
                              className="px-2 py-1 bg-rose-950/70 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded-lg text-[10px] font-bold transition-all"
                              title="Keluarkan dari babak ini"
                            >
                              Keluarkan
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: BANK SOAL MASTER (DENGAN CEKLIS MASSAL, CUSTOM PAKET, IMPORT & EXPORT JSON) */}
      {activeTab === 'soal' && (
        <div className="space-y-4 flex-1 flex flex-col">
          {/* JUDUL ACARA BAR */}
          <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3">
            <div className="flex-1 min-w-[240px]">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Judul Acara Utama Panggung
              </label>
              <input
                type="text"
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                placeholder="Contoh: Kuis Battle Panggung 2026"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-400 font-semibold"
              />
            </div>
            <button
              onClick={handleSyncRoundToStage}
              disabled={savingSettings}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-purple-600/30 flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Simpan Judul Acara</span>
            </button>
          </div>

          {/* SUB-TABS TIPE SOAL & ACTION BUTTONS */}
          <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <button
                type="button"
                onClick={() => setSelectedTypeTab('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  selectedTypeTab === 'all' ? 'bg-purple-600 text-white' : 'bg-slate-950 text-slate-400 border border-slate-800'
                }`}
              >
                <span>Semua ({questions.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedTypeTab('pilihan_ganda')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  selectedTypeTab === 'pilihan_ganda' ? 'bg-blue-600 text-white' : 'bg-slate-950 text-blue-400 border border-slate-800'
                }`}
              >
                <span>Pilihan Ganda ({questions.filter((q) => q.type === 'pilihan_ganda').length})</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedTypeTab('benar_salah')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  selectedTypeTab === 'benar_salah' ? 'bg-emerald-600 text-white' : 'bg-slate-950 text-emerald-400 border border-slate-800'
                }`}
              >
                <span>Benar / Salah ({questions.filter((q) => q.type === 'benar_salah').length})</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedTypeTab('essay')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  selectedTypeTab === 'essay' ? 'bg-amber-600 text-white' : 'bg-slate-950 text-amber-400 border border-slate-800'
                }`}
              >
                <span>Rebutan ({questions.filter((q) => q.type === 'essay').length})</span>
              </button>
            </div>

            {/* ACTION BUTTONS: IMPORT, EXPORT, BUAT SOAL */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all shadow-sm"
                title="Impor soal secara massal dari file JSON"
              >
                <Upload className="w-3.5 h-3.5 text-emerald-400" />
                <span>Import JSON</span>
              </button>

              <button
                type="button"
                onClick={handleExportJSON}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all shadow-sm"
                title="Ekspor seluruh atau filter soal ke file JSON"
              >
                <Download className="w-3.5 h-3.5 text-blue-400" />
                <span>Export JSON</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAiGenError('');
                  setIsAiGenModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-xl text-xs font-black transition-all shadow-lg shadow-indigo-600/30"
                title="Buat soal otomatis dengan AI Google Gemini"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                <span>Auto-Generate Soal AI</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenAddSoal()}
                className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-purple-600/30"
              >
                <Plus className="w-4 h-4" />
                <span>+ Buat Soal Master Baru</span>
              </button>
            </div>
          </div>

          {/* FILTER BANK SOAL (LENGKAP: SEARCH, JENIS SOAL, KATEGORI, DAN CUSTOM PAKET) */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 p-3 rounded-2xl">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative min-w-[200px] flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari pertanyaan / kunci..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none"
                />
              </div>

              {/* FILTER JENIS SOAL (PILIHAN GANDA, BENAR/SALAH, ESSAY) */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-700/80">
                <button
                  type="button"
                  onClick={() => setSelectedTypeTab('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    selectedTypeTab === 'all'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Semua Jenis
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTypeTab('pilihan_ganda')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    selectedTypeTab === 'pilihan_ganda'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Pilihan Ganda
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTypeTab('benar_salah')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    selectedTypeTab === 'benar_salah'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Benar / Salah
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTypeTab('essay')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    selectedTypeTab === 'essay'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Essay / Rebutan
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Kategori:</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                >
                  <option value="all">Semua Kategori</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* FILTER PAKET / CUSTOM PACKAGE */}
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Paket:</label>
                <select
                  value={packageFilter}
                  onChange={(e) => setPackageFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                >
                  <option value="all">Semua Paket</option>
                  {uniquePackages.map((pkg) => (
                    <option key={pkg} value={pkg}>{pkg}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* BAR AKSI MASSAL (MUNCUL OTOMATIS SAAT ADA SOAL YANG DICEKLIS) */}
          {selectedQuestionIds.length > 0 && (
            <div className="bg-gradient-to-r from-purple-950/90 via-slate-900 to-indigo-950/90 border border-purple-500/50 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xl animate-in fade-in">
              <div className="flex items-center gap-3">
                <span className="text-xs font-black text-purple-300 bg-purple-500/20 px-3 py-1 rounded-xl border border-purple-500/30 flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5 text-purple-400" />
                  <span>{selectedQuestionIds.length} Soal Terpilih</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedQuestionIds([])}
                  className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                >
                  Batalkan Pilihan
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Ubah Kategori Sekaligus */}
                <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2 py-1">
                  <Tag className="w-3.5 h-3.5 text-pink-400" />
                  <select
                    value={bulkCategory}
                    onChange={(e) => setBulkCategory(e.target.value)}
                    className="bg-transparent text-xs text-white focus:outline-none"
                  >
                    <option value="" className="bg-slate-900">Pilih Kategori Baru...</option>
                    <option value="none" className="bg-slate-900">(Tanpa Kategori)</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id} className="bg-slate-900">{c.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleBulkChangeCategory}
                    disabled={!bulkCategory}
                    className="px-2.5 py-1 bg-pink-600 hover:bg-pink-500 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                  >
                    Ubah Kategori
                  </button>
                </div>

                {/* Ubah Paket Sekaligus */}
                <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2 py-1">
                  <Layers className="w-3.5 h-3.5 text-blue-400" />
                  <input
                    type="text"
                    placeholder="Nama Paket Baru..."
                    value={bulkPackage}
                    onChange={(e) => setBulkPackage(e.target.value)}
                    className="bg-transparent text-xs text-white placeholder-slate-500 w-32 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleBulkChangePackage}
                    disabled={!bulkPackage.trim()}
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                  >
                    Set Paket
                  </button>
                </div>

                {/* Hapus Massal */}
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 rounded-xl text-xs font-bold transition-all shadow-sm"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Terpilih ({selectedQuestionIds.length})</span>
                </button>
              </div>
            </div>
          )}

          {/* TABEL BANK SOAL MASTER */}
          <div className="flex-1 bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                  <tr>
                    {/* Header Checkbox Select All */}
                    <th className="py-3 px-3 w-8 text-center">
                      <input
                        type="checkbox"
                        checked={
                          paginatedQuestions.length > 0 &&
                          paginatedQuestions.every((q) => selectedQuestionIds.includes(q.id))
                        }
                        onChange={handleToggleSelectAll}
                        className="w-4 h-4 rounded text-purple-600 accent-purple-600 cursor-pointer"
                        title="Pilih Semua di Halaman Ini"
                      />
                    </th>
                    <th className="py-3 px-2 w-8 text-center">#</th>
                    <th className="py-3 px-4">Kategori</th>
                    <th className="py-3 px-4">Paket / Babak</th>
                    <th className="py-3 px-4">Tipe</th>
                    <th className="py-3 px-4">Pertanyaan</th>
                    <th className="py-3 px-4">Kunci Jawaban</th>
                    <th className="py-3 px-4 text-center">Poin</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="text-center py-10 text-slate-500">Memuat data...</td>
                    </tr>
                  ) : filteredQuestions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-10 text-slate-500">Tidak ada soal di master bank soal.</td>
                    </tr>
                  ) : (
                    paginatedQuestions.map((q, idx) => {
                      const rowNum = startIndex + idx + 1;
                      const catName = categories.find((c) => c.id === q.category_id)?.name;
                      const isChecked = selectedQuestionIds.includes(q.id);
                      return (
                        <tr
                          key={q.id}
                          className={`transition-colors ${
                            isChecked ? 'bg-purple-950/30' : 'hover:bg-slate-800/40'
                          }`}
                        >
                          {/* Checkbox per Soal */}
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleSelectQuestion(q.id)}
                              className="w-4 h-4 rounded text-purple-600 accent-purple-600 cursor-pointer"
                            />
                          </td>
                          <td className="py-3 px-2 text-center font-mono text-slate-500">{rowNum}</td>
                          <td className="py-3 px-4 font-bold text-pink-300">{catName || '(Umum)'}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold text-[10px]">
                              {q.package_name || 'Umum / Bebas'}
                            </span>
                          </td>
                          <td className="py-3 px-4 uppercase text-[10px] font-bold text-slate-400">
                            {q.type.replace('_', ' ')}
                          </td>
                          <td className="py-3 px-4 font-semibold text-white max-w-xs truncate">
                            {q.question_text}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-emerald-400 max-w-[150px] truncate">
                            {q.correct_answer}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-amber-400">
                            +{q.points}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {q.type === 'pilihan_ganda' && (
                                <button
                                  type="button"
                                  onClick={() => handleShuffleQuestion(q)}
                                  className="p-1.5 rounded-lg bg-indigo-950 text-indigo-300 hover:bg-indigo-900"
                                  title="Acak Opsi PG"
                                >
                                  <Shuffle className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDuplicateQuestion(q)}
                                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                                title="Duplikat Soal"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEditSoal(q)}
                                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                                title="Edit Soal"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSoal(q.id)}
                                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-rose-950 hover:text-rose-400"
                                title="Hapus Soal"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* PAGINATION */}
            {filteredQuestions.length > 0 && (
              <div className="bg-slate-950 border-t border-slate-800 px-4 py-3 flex items-center justify-between text-xs text-slate-400">
                <span>Total {filteredQuestions.length} Soal Master</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="px-2 py-1 rounded bg-slate-900 border border-slate-800 disabled:opacity-40"
                  >
                    ‹
                  </button>
                  <span className="font-mono px-2">{safePage} / {totalPages}</span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="px-2 py-1 rounded bg-slate-900 border border-slate-800 disabled:opacity-40"
                  >
                    ›
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: KELOLA KATEGORI */}
      {activeTab === 'kategori' && (
        <div className="space-y-4 flex-1 flex flex-col">
          <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Tag className="w-4 h-4 text-emerald-400" />
                <span>Daftar Kategori Soal ({categories.length})</span>
              </h3>
            </div>
            <button
              onClick={handleOpenAddCategory}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/30"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Kategori Baru</span>
            </button>
          </div>

          <div className="flex-1 bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">Nama Kategori</th>
                  <th className="py-3 px-4">Deskripsi</th>
                  <th className="py-3 px-4 text-center">Jumlah Soal</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {categories.map((cat, idx) => {
                  const count = questions.filter((q) => q.category_id === cat.id).length;
                  return (
                    <tr key={cat.id} className="hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-mono text-slate-500">{idx + 1}</td>
                      <td className="py-3 px-4 font-bold text-white">{cat.name}</td>
                      <td className="py-3 px-4 text-slate-400">{cat.description || '-'}</td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-emerald-400">{count}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEditCategory(cat)}
                            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteCategory(cat)}
                            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-rose-950 hover:text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: REGU */}
      {activeTab === 'regu' && (
        <div className="space-y-4 flex-1 flex flex-col">
          <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
            <div>
              <h3 className="text-sm font-bold text-white">Daftar Regu ({teams.length})</h3>
            </div>
            <button
              onClick={handleOpenAddTeam}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-600/30"
            >
              <UserPlus className="w-4 h-4" />
              <span>Tambah Regu Baru</span>
            </button>
          </div>

          <div className="flex-1 bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">Regu</th>
                  <th className="py-3 px-4">Warna</th>
                  <th className="py-3 px-4">Anggota</th>
                  <th className="py-3 px-4 text-center">Skor</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {teams.map((t, idx) => (
                  <tr key={t.id} className="hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono text-slate-500">{idx + 1}</td>
                    <td className="py-3 px-4 font-bold text-white">{t.name}</td>
                    <td className="py-3 px-4">
                      <span className="w-3.5 h-3.5 rounded-full inline-block shadow mr-2" style={{ backgroundColor: t.color }} />
                      <span className="font-mono text-slate-400 text-[10px]">{t.color}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-300">{t.members || '-'}</td>
                    <td className="py-3 px-4 text-center font-mono font-black text-emerald-400">{t.score} PTS</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenEditTeam(t)}
                          className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteTeam(t.id)}
                          className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-rose-950 hover:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL TAMBAH BABAK BARU (CUSTOM ROUND) */}
      {isNewRoundModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl relative">
            <h3 className="text-base font-black text-white uppercase mb-2">Buat Babak / Paket Baru</h3>
            <p className="text-xs text-slate-400 mb-4">Contoh: Semifinal, Babak 3, Grand Final, atau Penyisihan Grup A</p>
            <form onSubmit={handleAddCustomRound} className="space-y-4">
              <div>
                <input
                  type="text"
                  required
                  placeholder="Nama babak..."
                  value={newRoundInput}
                  onChange={(e) => setNewRoundInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewRoundModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold"
                >
                  Buat Babak
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PICKER: AMBIL SOAL DARI BANK SOAL MASTER KE BABAK */}
      {isPickerModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-black text-white uppercase flex items-center gap-2">
                  <Plus className="w-4 h-4 text-emerald-400" />
                  <span>Ambil Soal untuk {activeRound}</span>
                </h3>
                <p className="text-xs text-slate-400">Pilih soal dari Bank Soal Master untuk dimasukkan ke babak ini</p>
              </div>
              <button onClick={() => setIsPickerModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* FILTER PICKER */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-3">
              <input
                type="text"
                placeholder="Cari pertanyaan..."
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
              />
              <select
                value={pickerCategoryFilter}
                onChange={(e) => setPickerCategoryFilter(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
              >
                <option value="all">Semua Kategori</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select
                value={pickerTypeFilter}
                onChange={(e) => setPickerTypeFilter(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
              >
                <option value="all">Semua Jenis Soal</option>
                <option value="pilihan_ganda">Pilihan Ganda</option>
                <option value="benar_salah">Benar / Salah</option>
                <option value="essay">Rebutan / Essay</option>
              </select>
            </div>

            {/* LIST SOAL PICKER */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 border border-slate-800 rounded-2xl p-2 bg-slate-950/60">
              {availableToPickQuestions.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs">
                  Semua soal master sudah masuk ke babak ini atau tidak ditemukan.
                </div>
              ) : (
                availableToPickQuestions.map((q) => {
                  const isChecked = pickerSelectedIds.includes(q.id);
                  const cat = categories.find((c) => c.id === q.category_id);
                  return (
                    <label
                      key={q.id}
                      className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-purple-950/40 border-purple-500 text-white'
                          : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 truncate pr-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setPickerSelectedIds((prev) =>
                              prev.includes(q.id) ? prev.filter((id) => id !== q.id) : [...prev, q.id]
                            );
                          }}
                          className="w-4 h-4 rounded text-purple-600 accent-purple-600"
                        />
                        <div className="truncate">
                          <span className="font-semibold text-xs block truncate">{q.question_text}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            Kunci: {q.correct_answer}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {cat && (
                          <span className="text-[9px] font-bold text-pink-300 bg-pink-500/10 px-1.5 py-0.5 rounded border border-pink-500/20">
                            {cat.name}
                          </span>
                        )}
                        <span className="text-[9px] uppercase font-bold text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                          {q.type.replace('_', ' ')}
                        </span>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            {/* FOOTER PICKER */}
            <div className="pt-3 mt-3 border-t border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-purple-400">
                {pickerSelectedIds.length} Soal Dipilih
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPickerModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPickQuestions}
                  disabled={pickerSelectedIds.length === 0}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black disabled:opacity-50 shadow-md shadow-emerald-600/30"
                >
                  Tambahkan ke {activeRound}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL TAMBAH / EDIT SOAL MASTER (DENGAN INPUT PAKET/BABAK SOAL) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
              <h3 className="text-lg font-black text-white uppercase">
                {editingId ? 'Edit Soal Master' : 'Tambah Soal Master Baru'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuestion} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Kategori Soal
                  </label>
                  <select
                    value={formData.category_id}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="">(Tanpa Kategori)</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Tipe Soal
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as QuestionType })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="pilihan_ganda">Pilihan Ganda</option>
                    <option value="benar_salah">Benar / Salah</option>
                    <option value="essay">Rebutan / Essay</option>
                  </select>
                </div>
              </div>

              {/* INPUT PAKET / BABAK SOAL */}
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Paket / Babak Soal
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.package_name}
                    onChange={(e) => setFormData({ ...formData, package_name: e.target.value })}
                    placeholder="Contoh: Umum / Bebas, Babak 1, Babak 2, Final..."
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) setFormData({ ...formData, package_name: e.target.value });
                    }}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-2 text-xs text-slate-300"
                  >
                    <option value="">Pilih Preset...</option>
                    {uniquePackages.map((pkg) => (
                      <option key={pkg} value={pkg}>{pkg}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Teks Pertanyaan
                </label>
                <textarea
                  rows={3}
                  required
                  value={formData.question_text}
                  onChange={(e) => setFormData({ ...formData, question_text: e.target.value })}
                  placeholder="Ketik teks pertanyaan..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white"
                />
              </div>

              {formData.type === 'pilihan_ganda' && (
                <div className="space-y-2 p-3 bg-slate-950/70 border border-slate-800 rounded-2xl">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Opsi Jawaban & Pilih Kunci yang Benar
                  </label>
                  {formData.options.map((opt, idx) => (
                    <div key={opt.key} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="correct_pg"
                        checked={formData.correct_answer === opt.key}
                        onChange={() => setFormData({ ...formData, correct_answer: opt.key })}
                        className="w-4 h-4 text-purple-600 accent-purple-600"
                      />
                      <span className="w-5 font-bold text-slate-400 text-xs">{opt.key}</span>
                      <input
                        type="text"
                        required
                        value={opt.text}
                        onChange={(e) => {
                          const updated = [...formData.options];
                          updated[idx].text = e.target.value;
                          setFormData({ ...formData, options: updated });
                        }}
                        placeholder={`Teks opsi ${opt.key}`}
                        className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      />
                    </div>
                  ))}
                </div>
              )}

              {formData.type === 'benar_salah' && (
                <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Kunci Jawaban yang Benar
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                      <input
                        type="radio"
                        name="bs_correct"
                        value="true"
                        checked={formData.correct_answer === 'true'}
                        onChange={(e) => setFormData({ ...formData, correct_answer: e.target.value })}
                        className="w-4 h-4 text-purple-600"
                      />
                      BENAR
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                      <input
                        type="radio"
                        name="bs_correct"
                        value="false"
                        checked={formData.correct_answer === 'false'}
                        onChange={(e) => setFormData({ ...formData, correct_answer: e.target.value })}
                        className="w-4 h-4 text-purple-600"
                      />
                      SALAH
                    </label>
                  </div>
                </div>
              )}

              {formData.type === 'essay' && (
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Kunci Jawaban Rujukan Juri
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={formData.correct_answer}
                    onChange={(e) => setFormData({ ...formData, correct_answer: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white font-mono"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Durasi Timer (Detik)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={180}
                    value={formData.timer_duration}
                    onChange={(e) => setFormData({ ...formData, timer_duration: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Poin Nilai
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={1000}
                    step={10}
                    value={formData.points}
                    onChange={(e) => setFormData({ ...formData, points: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md shadow-purple-600/30"
                >
                  Simpan Soal Master
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL KATEGORI */}
      {isCatModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl relative">
            <h3 className="text-base font-black text-white uppercase mb-3">
              {editingCat ? 'Edit Kategori' : 'Tambah Kategori'}
            </h3>
            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-400 block mb-1">Nama Kategori</label>
                <input
                  type="text"
                  required
                  value={catFormName}
                  onChange={(e) => setCatFormName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 block mb-1">Deskripsi</label>
                <textarea
                  rows={2}
                  value={catFormDesc}
                  onChange={(e) => setCatFormDesc(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCatModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingCat}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL REGU */}
      {isTeamModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl relative">
            <h3 className="text-base font-black text-white uppercase mb-3">
              {editingTeam ? 'Edit Regu' : 'Tambah Regu'}
            </h3>
            <form onSubmit={handleSaveTeam} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-400 block mb-1">Nama Regu</label>
                <input
                  type="text"
                  required
                  value={teamFormName}
                  onChange={(e) => setTeamFormName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 block mb-1">Warna Meja</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={teamFormColor}
                    onChange={(e) => setTeamFormColor(e.target.value)}
                    className="w-10 h-8 bg-transparent rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={teamFormColor}
                    onChange={(e) => setTeamFormColor(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-400 block mb-1">Jumlah Anggota</label>
                  <input
                    type="number"
                    value={teamFormMemberCount}
                    onChange={(e) => setTeamFormMemberCount(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 block mb-1">Skor Awal</label>
                  <input
                    type="number"
                    value={teamFormScore}
                    onChange={(e) => setTeamFormScore(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 block mb-1">Daftar Anggota</label>
                <textarea
                  rows={2}
                  value={teamFormMembers}
                  onChange={(e) => setTeamFormMembers(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTeamModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL AUTO-GENERATE SOAL AI (GOOGLE GEMINI SDK) */}
      {isAiGenModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <button
              type="button"
              onClick={() => setIsAiGenModalOpen(false)}
              className="absolute top-6 right-6 text-slate-400 hover:text-white p-1 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-purple-600/30">
                <Sparkles className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                  <span>Auto-Generate Soal AI</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-mono">
                    Gemini SDK
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Generator soal pilihan ganda, benar/salah, atau essay otomatis dengan pembahasan.
                </p>
              </div>
            </div>

            {/* Form Input Generator */}
            <div className="space-y-4 bg-slate-950/60 border border-slate-800 p-5 rounded-2xl">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Topik atau Materi Soal <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  placeholder="Contoh: Sejarah Awal Islam, Tata Surya, Kemerdekaan RI, dsb."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
                />
              </div>

              {/* BARIS JENIS SOAL & FILTER DUPLIKASI */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Jenis Soal
                  </label>
                  <select
                    value={aiQuestionType}
                    onChange={(e) =>
                      setAiQuestionType(
                        e.target.value as 'pilihan_ganda' | 'benar_salah' | 'essay' | 'campuran'
                      )
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500 font-medium"
                  >
                    <option value="pilihan_ganda">Pilihan Ganda (4 Opsi: A, B, C, D)</option>
                    <option value="benar_salah">Benar / Salah (2 Opsi)</option>
                    <option value="essay">Essay / Rebutan / Lisan</option>
                    <option value="campuran">Campuran (Kombinasi Variatif)</option>
                  </select>
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2.5 p-2 bg-slate-900 border border-slate-700/80 rounded-xl cursor-pointer hover:bg-slate-800/60 transition-all">
                    <input
                      type="checkbox"
                      checked={aiAvoidDuplicates}
                      onChange={(e) => setAiAvoidDuplicates(e.target.checked)}
                      className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 accent-purple-600"
                    />
                    <div className="text-[11px] text-slate-300">
                      <span className="font-bold text-white block">Cegah Duplikasi</span>
                      <span className="text-slate-400">Filter agar tidak menduplikasi soal yang sudah ada</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Tingkat Kesulitan
                  </label>
                  <select
                    value={aiDifficulty}
                    onChange={(e) =>
                      setAiDifficulty(e.target.value as 'mudah' | 'sedang' | 'sulit' | 'campuran')
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                  >
                    <option value="mudah">Mudah (Tingkat Pemula / Dasar)</option>
                    <option value="sedang">Sedang (Standar Cerdas Cermat)</option>
                    <option value="sulit">Sulit (Menantang / Analitis)</option>
                    <option value="campuran">Campuran (Variasi Tingkat)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Jumlah Soal: <span className="text-purple-400 font-mono font-bold">{aiCount}</span> butir
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={aiCount}
                    onChange={(e) => setAiCount(Number(e.target.value))}
                    className="w-full accent-purple-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                    <span>1</span>
                    <span>3</span>
                    <span>5</span>
                    <span>10</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Target Kategori
                  </label>
                  <select
                    value={aiCategory}
                    onChange={(e) => setAiCategory(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                  >
                    <option value="">-- Tanpa Kategori / Umum --</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Label Paket Soal
                  </label>
                  <input
                    type="text"
                    value={aiPackage}
                    onChange={(e) => setAiPackage(e.target.value)}
                    placeholder="Contoh: Paket AI Gemini"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Nilai Poin
                  </label>
                  <input
                    type="number"
                    value={aiPoints}
                    onChange={(e) => setAiPoints(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Durasi Timer (Detik)
                  </label>
                  <input
                    type="number"
                    value={aiTimer}
                    onChange={(e) => setAiTimer(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              {aiGenError && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{aiGenError}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleGenerateAiQuestions}
                disabled={isAiGenerating || !aiTopic.trim()}
                className="w-full py-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2"
              >
                {isAiGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Gemini AI Sedang Merumuskan Soal...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Generate {aiCount} Soal dengan AI Gemini</span>
                  </>
                )}
              </button>
            </div>

            {/* PREVIEW HASIL SOAL AI */}
            {aiGeneratedQuestions.length > 0 && (
              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Hasil Review Soal ({aiGeneratedQuestions.length} Butir):</span>
                  </h4>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Format JSON Valid
                  </span>
                </div>

                <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                  {aiGeneratedQuestions.map((q, qIdx) => (
                    <div
                      key={qIdx}
                      className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-2.5 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-black text-[10px]">
                            Soal #{qIdx + 1}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              q.type === 'benar_salah'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : q.type === 'essay'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            }`}
                          >
                            {q.type === 'benar_salah'
                              ? 'Benar / Salah'
                              : q.type === 'essay'
                              ? 'Essay / Rebutan'
                              : 'Pilihan Ganda'}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400">
                          +{q.points} Poin &bull; {q.timer_duration}s
                        </span>
                      </div>

                      <p className="font-bold text-white text-sm leading-snug">
                        {q.question_text}
                      </p>

                      {q.type === 'essay' || !q.options || q.options.length === 0 ? (
                        <div className="p-2.5 rounded-xl border bg-amber-950/30 border-amber-500/30 text-amber-200 text-xs">
                          <span className="font-bold text-amber-400 block mb-0.5">Kunci Jawaban Rujukan Juri:</span>
                          <span>{q.correct_answer}</span>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          {q.options.map((opt) => {
                            const isCorrect =
                              q.type === 'benar_salah'
                                ? String(opt.key).toLowerCase() === String(q.correct_answer).toLowerCase()
                                : opt.key === q.correct_answer;
                            return (
                              <div
                                key={opt.key}
                                className={`p-2 rounded-xl border flex items-center gap-2 text-xs ${
                                  isCorrect
                                    ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-200 font-bold'
                                    : 'bg-slate-900 border-slate-800 text-slate-300'
                                }`}
                              >
                                <span
                                  className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 ${
                                    isCorrect ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                                  }`}
                                >
                                  {q.type === 'benar_salah' ? (opt.key === 'true' ? '✓' : '✗') : opt.key}
                                </span>
                                <span className="truncate">{opt.text}</span>
                                {isCorrect && (
                                  <span className="ml-auto text-[9px] uppercase px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-300">
                                    Kunci
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {q.explanation && (
                        <div className="p-2.5 bg-blue-950/30 border border-blue-500/20 rounded-xl text-[11px] text-blue-200 italic">
                          <span className="font-bold not-italic text-blue-400">Pembahasan: </span>
                          {q.explanation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Tombol Simpan ke Supabase */}
                <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      const jsonBlob = new Blob([JSON.stringify(aiGeneratedQuestions, null, 2)], {
                        type: 'application/json',
                      });
                      const url = URL.createObjectURL(jsonBlob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `soal-ai-${aiTopic.toLowerCase().replace(/\s+/g, '-')}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download JSON</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveAiQuestionsToDb}
                    disabled={isAiSaving}
                    className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-emerald-600/30 flex items-center gap-2"
                  >
                    {isAiSaving ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Menyimpan ke Supabase...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>Simpan {aiGeneratedQuestions.length} Soal ke Bank Soal</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
