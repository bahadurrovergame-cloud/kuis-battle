'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  supabase,
  Question,
  QuestionType,
  Team,
  SessionQuestion,
  parseQuestionMeta,
  parseSessionMeta,
  buildSessionTitleWithBoxes
} from '@/lib/supabase';
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
  Edit2,
  Shuffle,
  Copy,
  Search,
  LayoutGrid,
  Tag,
  RotateCcw,
  Layers,
  Sparkles
} from 'lucide-react';

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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentRoomCode, setCurrentRoomCode] = useState<string>('KUIS88');
  const [availableRooms, setAvailableRooms] = useState<{ id: string; room_code: string; title: string }[]>([]);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [openedBoxIds, setOpenedBoxIds] = useState<string[]>([]);

  // Event Settings State (Judul Acara)
  const [eventTitle, setEventTitle] = useState('Kuis Battle Panggung');
  const [savingSettings, setSavingSettings] = useState(false);

  // Babak / Round Management States
  const [activeRound, setActiveRound] = useState<string>('Babak 1');
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
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTypeTab, setSelectedTypeTab] = useState<'all' | 'pilihan_ganda' | 'benar_salah' | 'essay'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [packageFilter, setPackageFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, selectedTypeTab, searchQuery, packageFilter, pageSize]);

  // Category Management States
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catFormName, setCatFormName] = useState('');
  const [catFormDesc, setCatFormDesc] = useState('');
  const [savingCat, setSavingCat] = useState(false);

  // Modal Soal State
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

  // Load Session, Categories, Master Questions, and Round Questions
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
        setSessionId(sData.id);
        setCurrentRoomCode(sData.room_code);
        setActiveQuestionId(sData.current_question_id || null);
        if (sData.active_round) setActiveRound(sData.active_round);

        if (typeof window !== 'undefined') {
          localStorage.setItem('active_room_code', sData.room_code);
          try {
            const savedOpened = localStorage.getItem(`opened_boxes_${sData.id}`);
            if (savedOpened) setOpenedBoxIds(JSON.parse(savedOpened));
          } catch {}
        }

        const { cleanTitle, boxCount } = parseSessionMeta(sData);
        setEventTitle(cleanTitle);
        setRoundBoxCount(boxCount || 12);
      }

      const { data: cats } = await supabase.from('categories').select('*').order('name');
      if (cats) setCategories(cats);

      const { data: qs } = await supabase.from('questions').select('*').order('created_at', { ascending: false });
      if (qs) setQuestions(qs.map(parseQuestionMeta));

      if (sData) {
        const { data: tData } = await supabase
          .from('teams')
          .select('*')
          .eq('session_id', sData.id)
          .order('score', { ascending: false });
        if (tData) setTeams(tData);

        // Load round questions for current activeRound
        const { data: sqData } = await supabase
          .from('session_questions')
          .select('*, question:questions(*)')
          .eq('session_id', sData.id)
          .eq('round_name', activeRound)
          .order('box_number', { ascending: true, nullsFirst: false });

        if (sqData) setRoundQuestions(sqData);
      }
    } catch {
      setStatusMsg({ text: 'Gagal memuat data', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [activeRound]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime subscription
  useEffect(() => {
    if (!sessionId) return;
    const channelName = `room_sync_${sessionId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_sessions', filter: `id=eq.${sessionId}` },
        (payload: any) => {
          if (payload.new) {
            setActiveQuestionId(payload.new.current_question_id || null);
            if (payload.new.active_round) setActiveRound(payload.new.active_round);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'session_questions', filter: `session_id=eq.${sessionId}` },
        () => {
          loadData();
        }
      )
      .on('broadcast', { event: 'reset_boxes' }, () => {
        setOpenedBoxIds([]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, loadData]);

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

    await supabase.channel(`room_sync_${sessionId}`).send({
      type: 'broadcast',
      event: 'reset_boxes',
      payload: {},
    });

    setStatusMsg({ text: 'Status seluruh kotak berhasil direset menjadi Tersedia!', type: 'success' });
  };

  // Ubah nomor slot kotak di babak via tabel session_questions
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
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setStatusMsg({ text: `Gagal menambahkan soal: ${msg}`, type: 'error' });
    } finally {
      setLoading(false);
    }
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
      const payload = {
        category_id: q.category_id || null,
        type: q.type,
        question_text: `${q.question_text} (Salinan)`,
        options: q.options || [],
        correct_answer: q.correct_answer,
        explanation: q.explanation || null,
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
    });
    setIsModalOpen(true);
  };

  const handleDeleteSoal = async (id: string) => {
    if (!window.confirm('Hapus soal ini dari database master?')) return;
    try {
      await supabase.from('questions').delete().eq('id', id);
      setQuestions(questions.filter((q) => q.id !== id));
      setStatusMsg({ text: 'Soal berhasil dihapus', type: 'success' });
      loadData();
    } catch {
      setStatusMsg({ text: 'Gagal menghapus soal', type: 'error' });
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        category_id: formData.category_id || null,
        type: formData.type,
        question_text: formData.question_text,
        options: formData.type === 'pilihan_ganda' ? formData.options : [],
        correct_answer: formData.correct_answer,
        explanation: formData.explanation || null,
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
                          window.location.href = `/admin/soal?room=${encodeURIComponent(newRoom)}`;
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
          <span>Bank Soal Master ({questions.length})</span>
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

      {/* TAB 1: ATUR BABAK & PANGGUNG (PENGATURAN PAKET SOAL & SLOT KOTAK KHUSUS ROOM INI) */}
      {activeTab === 'babak' && (
        <div className="space-y-4 flex-1 flex flex-col">
          {/* PANEL ATUR BABAK & JUMLAH KOTAK */}
          <div className="bg-gradient-to-r from-purple-950/60 via-slate-900 to-indigo-950/60 border border-purple-500/40 p-5 rounded-3xl shadow-xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-5 flex-1">
              {/* PILIH BABAK */}
              <div>
                <label className="block text-[11px] font-black text-purple-300 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-purple-400" />
                  <span>Pilih Babak Permainan (Room {currentRoomCode}):</span>
                </label>
                <div className="flex items-center gap-1.5 bg-slate-950 border border-purple-500/40 p-1 rounded-xl">
                  {['Babak 1', 'Babak 2', 'Final'].map((rName) => (
                    <button
                      key={rName}
                      type="button"
                      onClick={() => setActiveRound(rName)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                        activeRound === rName
                          ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {rName}
                    </button>
                  ))}
                </div>
              </div>

              {/* SET JUMLAH KOTAK UNTUK BABAK INI */}
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
                      const isFinished = openedBoxIds.includes(q.id);
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
                          {/* SLOT KOTAK */}
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

                          {/* STATUS PANGGUNG */}
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

                          {/* TIPE */}
                          <td className="py-3 px-3">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-slate-800 text-slate-300 border border-slate-700">
                              {q.type.replace('_', ' ')}
                            </span>
                          </td>

                          {/* KATEGORI */}
                          <td className="py-3 px-3">
                            <span className="text-[11px] font-bold text-pink-300 flex items-center gap-1 truncate max-w-[120px]">
                              🏷️ {catName || 'Umum'}
                            </span>
                          </td>

                          {/* PERTANYAAN */}
                          <td className="py-3 px-4 font-semibold text-white max-w-xs truncate">
                            {q.question_text}
                          </td>

                          {/* KUNCI JAWABAN */}
                          <td className="py-3 px-4 font-mono text-emerald-400 font-bold max-w-[150px] truncate">
                            {q.correct_answer}
                          </td>

                          {/* POIN */}
                          <td className="py-3 px-3 text-center font-mono font-bold text-amber-400">
                            +{q.points}
                          </td>

                          {/* AKSI */}
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

      {/* TAB 2: BANK SOAL MASTER (MURNI GUDANG SOAL TANPA URUSAN KOTAK PANGGUNG) */}
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

          {/* SUB-TABS TIPE SOAL */}
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

            <button
              type="button"
              onClick={() => handleOpenAddSoal()}
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-purple-600/30"
            >
              <Plus className="w-4 h-4" />
              <span>+ Buat Soal Master Baru</span>
            </button>
          </div>

          {/* FILTER BANK SOAL */}
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
            </div>
          </div>

          {/* TABEL BANK SOAL MASTER */}
          <div className="flex-1 bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-3 w-10">#</th>
                    <th className="py-3 px-4">Kategori</th>
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
                      <td colSpan={7} className="text-center py-10 text-slate-500">Memuat data...</td>
                    </tr>
                  ) : filteredQuestions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-slate-500">Tidak ada soal di master bank soal.</td>
                    </tr>
                  ) : (
                    paginatedQuestions.map((q, idx) => {
                      const rowNum = startIndex + idx + 1;
                      const catName = categories.find((c) => c.id === q.category_id)?.name;
                      return (
                        <tr key={q.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-3 font-mono text-slate-500">{rowNum}</td>
                          <td className="py-3 px-4 font-bold text-pink-300">{catName || '(Umum)'}</td>
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
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEditSoal(q)}
                                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSoal(q.id)}
                                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-rose-950 hover:text-rose-400"
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
                          <Edit2 className="w-3.5 h-3.5" />
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

      {/* MODAL TAMBAH / EDIT SOAL MASTER */}
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
    </main>
  );
}
