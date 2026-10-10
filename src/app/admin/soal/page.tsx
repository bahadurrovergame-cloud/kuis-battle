'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  supabase,
  Question,
  QuestionType,
  Team,
  parseQuestionMeta,
  buildExplanationWithMeta,
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
  FolderPlus,
  CheckSquare,
  Check,
  ListFilter
} from 'lucide-react';

interface Category {
  id: string;
  name: string;
  description?: string | null;
  created_at?: string;
}

export default function AdminDashboardPage() {
  const router = useRouter();

  // Active Tab: 'soal' | 'kategori' | 'regu'
  const [activeTab, setActiveTab] = useState<'soal' | 'kategori' | 'regu'>('soal');

  // Shared session & Multi-room
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentRoomCode, setCurrentRoomCode] = useState<string>('KUIS88');
  const [availableRooms, setAvailableRooms] = useState<{ id: string; room_code: string; title: string }[]>([]);

  // Soal States
  const [categories, setCategories] = useState<Category[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTypeTab, setSelectedTypeTab] = useState<'all' | 'pilihan_ganda' | 'benar_salah' | 'essay'>('all');
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [packageFilter, setPackageFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedQuestionIds([]);
  }, [selectedCategory, selectedTypeTab, searchQuery, packageFilter, pageSize]);

  // Category Management States
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catFormName, setCatFormName] = useState('');
  const [catFormDesc, setCatFormDesc] = useState('');
  const [savingCat, setSavingCat] = useState(false);

  // Event Settings State (Judul Acara & Jumlah Kotak)
  const [eventTitle, setEventTitle] = useState('Kuis Battle Panggung');
  const [blinkBoxCount, setBlinkBoxCount] = useState<number>(6);
  const [savingSettings, setSavingSettings] = useState(false);

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
    package_name: string;
    box_number: number | null;
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
    box_number: null,
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

  // Load Session and Questions dengan dukungan Multi-Room
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Ambil daftar seluruh ruangan untuk switcher
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
        if (typeof window !== 'undefined') {
          localStorage.setItem('active_room_code', sData.room_code);
        }
        const { cleanTitle, boxCount } = parseSessionMeta(sData);
        setEventTitle(cleanTitle);
        setBlinkBoxCount(boxCount);
      }

      const { data: cats } = await supabase.from('categories').select('*').order('name');
      if (cats) setCategories(cats);

      let query = supabase.from('questions').select('*').order('created_at', { ascending: false });
      if (selectedCategory !== 'all') {
        query = query.eq('category_id', selectedCategory);
      }

      const { data: qs } = await query;
      if (qs) setQuestions(qs.map(parseQuestionMeta));

      if (sData) {
        const { data: tData } = await supabase
          .from('teams')
          .select('*')
          .eq('session_id', sData.id)
          .order('score', { ascending: false });
        if (tData) setTeams(tData);
      }
    } catch {
      setStatusMsg({ text: 'Gagal memuat data', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Simpan Pengaturan Acara (Judul Acara & Jumlah Kotak Blink Box Custom)
  const handleSaveSettings = async () => {
    if (!sessionId) return;
    setSavingSettings(true);
    try {
      localStorage.setItem('kuis_blink_box_count', String(blinkBoxCount));

      // Simpan judul dan jumlah kotak custom ke kolom title dengan format [BOXES:X]
      const titlePayload = buildSessionTitleWithBoxes(eventTitle, blinkBoxCount);

      const { error } = await supabase
        .from('game_sessions')
        .update({ title: titlePayload })
        .eq('id', sessionId);

      if (error) throw error;

      // Broadcast sinkronisasi langsung ke proyektor dan kontrol operator
      supabase.channel(`room_sync_${sessionId}`).send({
        type: 'broadcast',
        event: 'box_count_sync',
        payload: { boxCount: blinkBoxCount },
      });

      setStatusMsg({
        text: `Pengaturan acara & ${blinkBoxCount} Kotak berhasil disimpan dan disinkronkan ke layar proyektor!`,
        type: 'success',
      });
    } catch (err: unknown) {
      console.error('Save settings error:', err);
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setStatusMsg({ text: `Gagal menyimpan pengaturan acara: ${msg}`, type: 'error' });
    } finally {
      setSavingSettings(false);
    }
  };

  // Smart Shuffle Opsi Pilihan Ganda untuk 1 Soal
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
        .update({
          options: newOptions,
          correct_answer: newCorrect,
        })
        .eq('id', q.id);
      if (error) throw error;

      setQuestions((prev) =>
        prev.map((item) => (item.id === q.id ? { ...item, options: newOptions, correct_answer: newCorrect } : item))
      );
      setStatusMsg({
        text: `Kunci soal berhasil diacak: Opsi baru [${newCorrect}] (${correctText})`,
        type: 'success',
      });
    } catch {
      setStatusMsg({ text: 'Gagal mengacak opsi soal', type: 'error' });
    }
  };

  // Acak Cepat Massal (Batch Shuffle) seluruh soal PG
  const handleBatchShuffle = async () => {
    const pgQuestions = questions.filter((q) => q.type === 'pilihan_ganda' && q.options && q.options.length >= 2);
    if (pgQuestions.length === 0) {
      setStatusMsg({ text: 'Tidak ada soal pilihan ganda untuk diacak', type: 'error' });
      return;
    }
    if (!window.confirm(`Acak kunci jawaban untuk ${pgQuestions.length} soal Pilihan Ganda sekaligus?`)) return;

    setLoading(true);
    const keys = ['A', 'B', 'C', 'D'];
    let count = 0;
    try {
      for (const q of pgQuestions) {
        const correctText = q.options.find((opt) => opt.key === q.correct_answer)?.text || '';
        const shuffled = [...q.options].sort(() => Math.random() - 0.5);
        const newOpts = shuffled.map((opt, idx) => ({
          key: keys[idx] || opt.key,
          text: opt.text,
        }));
        const newAns = newOpts.find((opt) => opt.text === correctText)?.key || 'A';

        await supabase
          .from('questions')
          .update({
            options: newOpts,
            correct_answer: newAns,
          })
          .eq('id', q.id);
        count++;
      }
      setStatusMsg({ text: `Berhasil mengacak kunci jawaban untuk ${count} soal pilihan ganda!`, type: 'success' });
      loadData();
    } catch {
      setStatusMsg({ text: 'Gagal mengacak sebagian soal', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Duplikat Soal Cepat
  const handleDuplicateQuestion = async (q: Question) => {
    try {
      const explanationWithMeta = buildExplanationWithMeta(
        q.explanation,
        null,
        q.package_name
      );
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
      setStatusMsg({ text: 'Soal berhasil diduplikat sebagai salinan!', type: 'success' });
      loadData();
    } catch {
      setStatusMsg({ text: 'Gagal menduplikat soal', type: 'error' });
    }
  };

  // Category Management Handlers
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
    if (!catFormName.trim()) {
      setStatusMsg({ text: 'Nama kategori tidak boleh kosong', type: 'error' });
      return;
    }
    setSavingCat(true);
    try {
      if (editingCat) {
        const { error } = await supabase
          .from('categories')
          .update({
            name: catFormName.trim(),
            description: catFormDesc.trim() || null,
          })
          .eq('id', editingCat.id);
        if (error) throw error;
        setStatusMsg({ text: `Kategori "${catFormName.trim()}" berhasil diperbarui!`, type: 'success' });
      } else {
        const { error } = await supabase
          .from('categories')
          .insert({
            name: catFormName.trim(),
            description: catFormDesc.trim() || null,
          });
        if (error) throw error;
        setStatusMsg({ text: `Kategori baru "${catFormName.trim()}" berhasil ditambahkan!`, type: 'success' });
      }

      setIsCatModalOpen(false);
      setEditingCat(null);
      setCatFormName('');
      setCatFormDesc('');

      const { data: cats } = await supabase.from('categories').select('*').order('name');
      if (cats) setCategories(cats);
    } catch (err: unknown) {
      console.error('Save category error:', err);
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setStatusMsg({ text: `Gagal menyimpan kategori: ${msg}`, type: 'error' });
    } finally {
      setSavingCat(false);
    }
  };

  const handleDeleteCategory = async (cat: Category) => {
    const linkedCount = questions.filter((q) => q.category_id === cat.id).length;
    const confirmText = linkedCount > 0
      ? `Hapus kategori "${cat.name}"?\nPerhatian: Ada ${linkedCount} soal terkait kategori ini. Soal tidak akan dihapus, namun status kategorinya akan menjadi kosong.`
      : `Hapus kategori "${cat.name}"?`;

    if (!window.confirm(confirmText)) return;

    try {
      const { error } = await supabase.from('categories').delete().eq('id', cat.id);
      if (error) throw error;

      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
      setQuestions((prev) =>
        prev.map((q) => (q.category_id === cat.id ? { ...q, category_id: null } : q))
      );
      if (selectedCategory === cat.id) setSelectedCategory('all');

      setStatusMsg({ text: `Kategori "${cat.name}" berhasil dihapus`, type: 'success' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setStatusMsg({ text: `Gagal menghapus kategori: ${msg}`, type: 'error' });
    }
  };

  // Quick Assign Slot Kotak (Panggung) Langsung dari Tabel
  const handleQuickAssignBox = async (q: Question, newBoxNum: number | null) => {
    try {
      const explanationWithMeta = buildExplanationWithMeta(
        q.explanation,
        newBoxNum,
        q.package_name
      );

      const { error } = await supabase
        .from('questions')
        .update({ explanation: explanationWithMeta })
        .eq('id', q.id);

      if (error) throw error;

      setQuestions((prev) =>
        prev.map((item) =>
          item.id === q.id ? { ...item, box_number: newBoxNum } : item
        )
      );

      setStatusMsg({
        text: newBoxNum
          ? `Soal disetel ke Slot Kotak #${newBoxNum} panggung!`
          : 'Slot soal dikembalikan ke urutan otomatis.',
        type: 'success',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setStatusMsg({ text: `Gagal mengubah slot kotak: ${msg}`, type: 'error' });
    }
  };

  // Quick Assign Kategori Soal Langsung dari Tabel
  const handleQuickAssignCategory = async (q: Question, newCatId: string | null) => {
    try {
      const { error } = await supabase
        .from('questions')
        .update({ category_id: newCatId || null })
        .eq('id', q.id);

      if (error) throw error;

      setQuestions((prev) =>
        prev.map((item) =>
          item.id === q.id ? { ...item, category_id: newCatId || null } : item
        )
      );

      const catName = categories.find((c) => c.id === newCatId)?.name || 'Tanpa Kategori';
      setStatusMsg({
        text: `Kategori soal berhasil diubah ke: ${catName}`,
        type: 'success',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setStatusMsg({ text: `Gagal mengubah kategori: ${msg}`, type: 'error' });
    }
  };

  // Reset form soal
  const resetFormSoal = (defaultType: QuestionType = 'pilihan_ganda') => {
    setEditingId(null);
    let defaultAns = 'A';
    if (defaultType === 'benar_salah') defaultAns = 'true';
    if (defaultType === 'essay') defaultAns = '';

    setFormData({
      category_id: selectedCategory !== 'all' ? selectedCategory : (categories[0]?.id || ''),
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
      package_name: 'Umum / Bebas',
      box_number: null,
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
      box_number: q.box_number ?? null,
    });
    setIsModalOpen(true);
  };

  const handleDeleteSoal = async (id: string) => {
    if (!window.confirm('Hapus soal ini dari database?')) return;
    try {
      await supabase.from('questions').delete().eq('id', id);
      setQuestions(questions.filter((q) => q.id !== id));
      setSelectedQuestionIds((prev) => prev.filter((item) => item !== id));
      setStatusMsg({ text: 'Soal berhasil dihapus', type: 'success' });
    } catch {
      setStatusMsg({ text: 'Gagal menghapus soal', type: 'error' });
    }
  };

  // Hapus Massal Soal Terpilih (Bulk Delete)
  const handleBatchDeleteSoal = async () => {
    if (selectedQuestionIds.length === 0) return;
    const count = selectedQuestionIds.length;
    if (
      !window.confirm(
        `PERINGATAN: Apakah Anda yakin ingin menghapus ${count} soal yang diceklis sekaligus?\n\nTindakan ini permanen dan soal tidak dapat dipulihkan!`
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('questions')
        .delete()
        .in('id', selectedQuestionIds);

      if (error) throw error;

      setQuestions((prev) => prev.filter((q) => !selectedQuestionIds.includes(q.id)));
      setSelectedQuestionIds([]);
      setStatusMsg({
        text: `Sukses! Sebanyak ${count} soal berhasil dihapus sekaligus.`,
        type: 'success',
      });
    } catch (err: unknown) {
      console.error('Batch delete error:', err);
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setStatusMsg({ text: `Gagal menghapus soal massal: ${msg}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Ubah Kategori Massal Soal Terpilih (Bulk Assign Category)
  const handleBatchMoveCategory = async (targetCatId: string) => {
    if (selectedQuestionIds.length === 0) return;
    setLoading(true);
    try {
      const newCatVal = targetCatId === 'none' ? null : targetCatId;
      const { error } = await supabase
        .from('questions')
        .update({ category_id: newCatVal })
        .in('id', selectedQuestionIds);

      if (error) throw error;

      setQuestions((prev) =>
        prev.map((q) =>
          selectedQuestionIds.includes(q.id) ? { ...q, category_id: newCatVal } : q
        )
      );

      const targetCatName =
        categories.find((c) => c.id === targetCatId)?.name || 'Tanpa Kategori';
      setStatusMsg({
        text: `Kategori untuk ${selectedQuestionIds.length} soal berhasil diubah ke "${targetCatName}"!`,
        type: 'success',
      });
      setSelectedQuestionIds([]);
    } catch (err: unknown) {
      console.error('Batch move category error:', err);
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setStatusMsg({ text: `Gagal mengubah kategori massal: ${msg}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const explanationWithMeta = buildExplanationWithMeta(
        formData.explanation,
        formData.box_number ? Number(formData.box_number) : null,
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
      console.error('Error save question:', err);
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setStatusMsg({ text: `Gagal menyimpan soal: ${msg}`, type: 'error' });
    }
  };

  // Team Handlers
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
    if (!window.confirm('Hapus regu ini dari daftar lomba?')) return;
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
    if (!sessionId || !teamFormName.trim()) {
      setStatusMsg({ text: 'Sesi belum aktif atau nama regu kosong', type: 'error' });
      return;
    }

    try {
      if (editingTeam) {
        // Try update with members columns, fallback if columns not added
        const updatePayload: Record<string, unknown> = {
          name: teamFormName.trim(),
          color: teamFormColor,
          score: Number(teamFormScore),
        };
        if (teamFormMemberCount !== undefined) updatePayload.member_count = Number(teamFormMemberCount);
        if (teamFormMembers !== undefined) updatePayload.members = teamFormMembers.trim();

        let { error: updateErr, data: updated } = await supabase
          .from('teams')
          .update(updatePayload)
          .eq('id', editingTeam.id)
          .select()
          .single();

        if (updateErr) {
          // If columns member_count/members don't exist yet in postgres, update basic columns
          const { error: fallbackErr, data: fallbackUpdated } = await supabase
            .from('teams')
            .update({
              name: teamFormName.trim(),
              color: teamFormColor,
              score: Number(teamFormScore),
            })
            .eq('id', editingTeam.id)
            .select()
            .single();

          if (fallbackErr) throw fallbackErr;
          updated = fallbackUpdated;
        }

        if (updated) {
          setTeams(teams.map((t) => (t.id === editingTeam.id ? updated : t)));
          setStatusMsg({ text: 'Data regu berhasil diperbarui!', type: 'success' });
        }
      } else {
        const insertPayload: Record<string, unknown> = {
          session_id: sessionId,
          name: teamFormName.trim(),
          color: teamFormColor,
          score: Number(teamFormScore),
          rank: teams.length + 1,
        };
        if (teamFormMemberCount !== undefined) insertPayload.member_count = Number(teamFormMemberCount);
        if (teamFormMembers !== undefined) insertPayload.members = teamFormMembers.trim();

        let { error: insertErr, data: created } = await supabase
          .from('teams')
          .insert(insertPayload)
          .select()
          .single();

        if (insertErr) {
          // Fallback insert without member columns if column doesn't exist
          const { error: fallbackErr, data: fallbackCreated } = await supabase
            .from('teams')
            .insert({
              session_id: sessionId,
              name: teamFormName.trim(),
              color: teamFormColor,
              score: Number(teamFormScore),
              rank: teams.length + 1,
            })
            .select()
            .single();

          if (fallbackErr) throw fallbackErr;
          created = fallbackCreated;
        }

        if (created) {
          setTeams([...teams, created]);
          setStatusMsg({ text: 'Regu baru berhasil didaftarkan!', type: 'success' });
        }
      }
      setIsTeamModalOpen(false);
      loadData();
    } catch (err: unknown) {
      console.error('Error save team:', err);
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setStatusMsg({ text: `Gagal menyimpan regu: ${msg}`, type: 'error' });
    }
  };

  // Quick JSON Import & Export
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (Array.isArray(json)) {
          const formatted = json.map((item) => ({
            type: item.type || 'pilihan_ganda',
            question_text: item.question_text,
            options: item.options || [],
            correct_answer: String(item.correct_answer),
            explanation: item.explanation || '',
            timer_duration: Number(item.timer_duration) || 30,
            points: Number(item.points) || 100,
          }));

          await supabase.from('questions').insert(formatted);
          setStatusMsg({ text: `Berhasil mengimpor ${formatted.length} soal!`, type: 'success' });
          loadData();
        }
      } catch {
        setStatusMsg({ text: 'Format file JSON tidak valid', type: 'error' });
      }
    };
    reader.readAsText(file);
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(questions, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `bank_soal_kuis_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Counts per question type
  const countPG = questions.filter((q) => q.type === 'pilihan_ganda').length;
  const countBS = questions.filter((q) => q.type === 'benar_salah').length;
  const countEssay = questions.filter((q) => q.type === 'essay').length;

  // Filtered questions based on search, category, package, and type tab
  const filteredQuestions = questions.filter((q) => {
    const matchesSearch =
      !searchQuery ||
      q.question_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.correct_answer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === 'all' || q.category_id === selectedCategory;
    const matchesPackage =
      packageFilter === 'all' || (q.package_name || 'Umum / Bebas') === packageFilter;
    const matchesType =
      selectedTypeTab === 'all' || q.type === selectedTypeTab;
    return matchesSearch && matchesCategory && matchesPackage && matchesType;
  });

  const totalPages = Math.max(1, Math.ceil(filteredQuestions.length / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedQuestions = filteredQuestions.slice(startIndex, startIndex + pageSize);

  const isCurrentPageAllSelected =
    paginatedQuestions.length > 0 &&
    paginatedQuestions.every((q) => selectedQuestionIds.includes(q.id));

  const isCurrentPagePartiallySelected =
    paginatedQuestions.some((q) => selectedQuestionIds.includes(q.id)) &&
    !isCurrentPageAllSelected;

  const handleToggleSelectPage = () => {
    if (isCurrentPageAllSelected) {
      const pageIdSet = new Set(paginatedQuestions.map((q) => q.id));
      setSelectedQuestionIds((prev) => prev.filter((id) => !pageIdSet.has(id)));
    } else {
      const pageIds = paginatedQuestions.map((q) => q.id);
      setSelectedQuestionIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const handleSelectAllFiltered = () => {
    setSelectedQuestionIds(filteredQuestions.map((q) => q.id));
  };

  const handleClearSelection = () => {
    setSelectedQuestionIds([]);
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedQuestionIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

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
                    title="Ganti Ruangan Panggung Aktif"
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
            <p className="text-xs text-slate-400">Kelola Bank Soal, Daftar Regu, dan Anggota Peserta</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-700 hover:border-slate-500 text-xs font-semibold rounded-xl text-slate-300 transition-all"
          >
            <span>Dashboard Hub</span>
          </a>

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
          className={`my-4 p-3 rounded-xl flex items-center justify-between text-xs border ${
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

      {/* TAB SELECTOR: BANK SOAL vs KELOLA KATEGORI vs MANAJEMEN REGU/PESERTA */}
      <div className="my-4 flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab('soal')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'soal'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Bank Soal ({questions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('kategori')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
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
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'regu'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Manajemen Regu & Peserta ({teams.length})</span>
        </button>
      </div>

      {/* KONTEN TAB 1: BANK SOAL */}
      {activeTab === 'soal' && (
        <div className="space-y-4 flex-1 flex flex-col">
          {/* PENGATURAN ACARA & BLINK BOX SYNC */}
          <div className="bg-gradient-to-r from-purple-950/40 via-slate-900/60 to-blue-950/40 border border-purple-800/40 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4 flex-1 min-w-[280px]">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-[11px] font-bold text-purple-300 uppercase tracking-wider mb-1">
                  Judul Acara (Tampil di Layar Proyektor)
                </label>
                <input
                  type="text"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  placeholder="Contoh: Kuis Battle Panggung 2026"
                  className="w-full bg-slate-950 border border-purple-500/40 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-400 font-semibold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-blue-300 uppercase tracking-wider mb-1">
                  Jumlah Kotak Blink Box (Bisa Custom)
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-950 border border-blue-500/40 rounded-xl p-1">
                    {[6, 9, 12].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setBlinkBoxCount(preset)}
                        className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                          blinkBoxCount === preset ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {preset} Kotak
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5 bg-slate-950 border border-blue-500/40 rounded-xl px-2.5 py-1">
                    <span className="text-[11px] font-bold text-slate-400">Custom:</span>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={blinkBoxCount}
                      onChange={(e) => setBlinkBoxCount(Math.max(1, Number(e.target.value)))}
                      className="w-12 bg-slate-900 border border-blue-500/50 rounded-lg px-1 py-0.5 text-xs text-white font-mono font-black text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                    <span className="text-[11px] font-bold text-blue-300">Kotak</span>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-purple-600/30 flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingSettings ? 'Menyimpan...' : 'Sinkronkan ke Layar'}</span>
            </button>
          </div>

          {/* SUB-TABS TIPE SOAL & TOMBOL CEPAT PER JENIS */}
          <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-md">
            {/* Tab pemisah tipe soal */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setSelectedTypeTab('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                  selectedTypeTab === 'all'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <span>Semua Soal</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                    selectedTypeTab === 'all'
                      ? 'bg-white/20 text-white font-black'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {questions.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedTypeTab('pilihan_ganda')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                  selectedTypeTab === 'pilihan_ganda'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'bg-slate-950 text-blue-400 hover:text-blue-300 border border-slate-800'
                }`}
              >
                <span>Pilihan Ganda</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                    selectedTypeTab === 'pilihan_ganda'
                      ? 'bg-white/20 text-white font-black'
                      : 'bg-blue-950/80 text-blue-400 border border-blue-800/40'
                  }`}
                >
                  {countPG}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedTypeTab('benar_salah')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                  selectedTypeTab === 'benar_salah'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                    : 'bg-slate-950 text-emerald-400 hover:text-emerald-300 border border-slate-800'
                }`}
              >
                <span>Benar / Salah</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                    selectedTypeTab === 'benar_salah'
                      ? 'bg-white/20 text-white font-black'
                      : 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/40'
                  }`}
                >
                  {countBS}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedTypeTab('essay')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                  selectedTypeTab === 'essay'
                    ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                    : 'bg-slate-950 text-amber-400 hover:text-amber-300 border border-slate-800'
                }`}
              >
                <span>Rebutan / Essay</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                    selectedTypeTab === 'essay'
                      ? 'bg-white/20 text-white font-black'
                      : 'bg-amber-950/80 text-amber-400 border border-amber-800/40'
                  }`}
                >
                  {countEssay}
                </span>
              </button>
            </div>

            {/* Tombol cepat tambah per jenis */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider hidden lg:inline">
                Tambah Cepat:
              </span>
              <button
                type="button"
                onClick={() => handleOpenAddSoal('pilihan_ganda')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-600/20"
                title="Tambah Soal Pilihan Ganda (Opsi A - D)"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Soal PG</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenAddSoal('benar_salah')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20"
                title="Tambah Soal Benar / Salah"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Soal Benar/Salah</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenAddSoal('essay')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-amber-600/20"
                title="Tambah Soal Rebutan / Essay (Tanya Jawab Lisan)"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Soal Rebutan</span>
              </button>
            </div>
          </div>

          {/* TOOLBAR FILTER & AKSI LAINNYA */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 p-3.5 rounded-2xl">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              {/* Search input */}
              <div className="relative min-w-[200px] flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari pertanyaan / kunci..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              {/* Kategori filter */}
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Kategori:
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="all">Semua Kategori</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleOpenAddCategory}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 rounded-xl text-xs font-bold transition-all shadow-sm"
                  title="Tambah Kategori Baru"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Kategori</span>
                </button>
              </div>

              {/* Paket Soal filter (Opsional) */}
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Paket:
                </label>
                <select
                  value={packageFilter}
                  onChange={(e) => setPackageFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="all">Semua Paket</option>
                  <option value="Umum / Bebas">Umum / Bebas</option>
                  <option value="Babak 1">Babak 1</option>
                  <option value="Babak 2">Babak 2</option>
                  <option value="Final">Final</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Batch Shuffle Button */}
              <button
                type="button"
                onClick={handleBatchShuffle}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-300 rounded-xl text-xs font-bold transition-all"
                title="Acak semua kunci jawaban Pilihan Ganda secara otomatis"
              >
                <Shuffle className="w-3.5 h-3.5 text-indigo-400" />
                <span>Acak Kunci PG</span>
              </button>

              <label className="cursor-pointer flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all">
                <Upload className="w-3.5 h-3.5 text-blue-400" />
                <span>Import JSON</span>
                <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
              </label>

              <button
                type="button"
                onClick={handleExportJson}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Export JSON</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenAddSoal()}
                className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-purple-600/30"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Soal</span>
              </button>
            </div>
          </div>

          {/* BULK ACTION BAR (MUNCUL JIKA ADA SOAL YANG DICEKLIS) */}
          {selectedQuestionIds.length > 0 && (
            <div className="bg-gradient-to-r from-purple-950/90 via-slate-900/90 to-rose-950/90 border-2 border-purple-500/70 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-2xl backdrop-blur-md animate-in fade-in">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple-600 flex items-center justify-center font-mono font-black text-xs text-white shadow-md">
                  {selectedQuestionIds.length}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-white tracking-wide uppercase">
                      {selectedQuestionIds.length} Soal Terpilih
                    </span>
                    <span className="text-[11px] text-purple-300">
                      (dari {filteredQuestions.length} soal di daftar)
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Aksi massal untuk semua soal yang sudah diceklis
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedQuestionIds.length < filteredQuestions.length && (
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    className="px-3 py-1.5 bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-700/60 rounded-xl text-xs font-bold transition-all shadow-sm"
                  >
                    Ceklis Semua ({filteredQuestions.length} Soal)
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold transition-all"
                >
                  Batalkan Ceklis
                </button>

                {/* Pindah Kategori Massal */}
                <div className="flex items-center gap-1.5 bg-slate-950 border border-purple-500/50 rounded-xl px-2.5 py-1">
                  <span className="text-[11px] font-bold text-slate-300">Pindah Kategori:</span>
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        handleBatchMoveCategory(e.target.value);
                        e.target.value = '';
                      }
                    }}
                    defaultValue=""
                    className="bg-slate-900 text-xs font-bold text-emerald-300 border border-slate-700 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="" disabled>
                      Pilih Target Kategori...
                    </option>
                    <option value="none">(Tanpa Kategori)</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* HAPUS MASSAL */}
                <button
                  type="button"
                  onClick={handleBatchDeleteSoal}
                  className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black transition-all shadow-lg shadow-rose-600/40"
                  title="Hapus semua soal yang terpilih sekaligus"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Hapus {selectedQuestionIds.length} Soal Sekaligus</span>
                </button>
              </div>
            </div>
          )}

          {/* TABEL SOAL */}
          <div className="flex-1 bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                  <tr>
                    {/* MASTER CHECKBOX */}
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isCurrentPageAllSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = isCurrentPagePartiallySelected;
                        }}
                        onChange={handleToggleSelectPage}
                        className="w-4 h-4 rounded border-slate-700 text-purple-600 focus:ring-purple-500 cursor-pointer accent-purple-600"
                        title="Pilih / Batalkan semua soal di halaman ini"
                      />
                    </th>
                    <th className="py-3 px-3 w-10">#</th>
                    <th className="py-3 px-4">Kategori</th>
                    <th className="py-3 px-4">Slot Kotak (Panggung)</th>
                    <th className="py-3 px-4">Tipe</th>
                    <th className="py-3 px-4">Pertanyaan</th>
                    <th className="py-3 px-4">Kunci Jawaban</th>
                    <th className="py-3 px-4 text-center">Timer</th>
                    <th className="py-3 px-4 text-center">Poin</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {loading ? (
                    <tr>
                      <td colSpan={10} className="text-center py-10 text-slate-500">
                        Memuat data...
                      </td>
                    </tr>
                  ) : filteredQuestions.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center py-10 text-slate-500">
                        Tidak ada soal yang sesuai pencarian atau filter kategori/tipe/paket.
                      </td>
                    </tr>
                  ) : (
                    paginatedQuestions.map((q, idx) => {
                      const rowNum = startIndex + idx + 1;
                      const catName = categories.find((c) => c.id === q.category_id)?.name;
                      const isSelected = selectedQuestionIds.includes(q.id);

                      // Temukan teks kunci jika PG
                      const pgOptText =
                        q.type === 'pilihan_ganda'
                          ? q.options?.find((opt) => opt.key === q.correct_answer)?.text
                          : null;

                      return (
                        <tr
                          key={q.id}
                          className={`transition-colors ${
                            isSelected
                              ? 'bg-purple-950/25 border-l-2 border-purple-500 hover:bg-purple-950/35'
                              : 'hover:bg-slate-800/40'
                          }`}
                        >
                          {/* CHECKBOX BARIS */}
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectOne(q.id)}
                              className="w-4 h-4 rounded border-slate-700 text-purple-600 focus:ring-purple-500 cursor-pointer accent-purple-600"
                            />
                          </td>

                          <td className="py-3 px-3 font-mono text-slate-500">{rowNum}</td>

                          <td className="py-3 px-4">
                            <div className="flex flex-col gap-1">
                              <select
                                value={q.category_id || ''}
                                onChange={(e) =>
                                  handleQuickAssignCategory(q, e.target.value || null)
                                }
                                className="bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1 text-[11px] font-semibold text-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 max-w-[130px] truncate"
                                title="Ubah kategori soal langsung"
                              >
                                <option value="">(Tanpa Kategori)</option>
                                {categories.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                              {catName && (
                                <span className="text-[9px] text-emerald-400/80 font-bold truncate max-w-[130px]">
                                  🏷️ {catName}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <select
                              value={q.box_number ?? ''}
                              onChange={(e) =>
                                handleQuickAssignBox(
                                  q,
                                  e.target.value ? Number(e.target.value) : null
                                )
                              }
                              className={`border rounded-lg px-2 py-1 text-[11px] font-mono font-bold focus:outline-none focus:ring-1 ${
                                q.box_number
                                  ? 'bg-blue-950/80 border-blue-500/50 text-blue-300 focus:ring-blue-400'
                                  : 'bg-slate-950 border-slate-700/80 text-slate-400 focus:ring-purple-500'
                              }`}
                              title="Pilih nomor kotak panggung tempat soal ini muncul"
                            >
                              <option value="">Otomatis</option>
                              {Array.from({ length: Math.max(12, blinkBoxCount) }).map((_, i) => (
                                <option key={i + 1} value={i + 1}>
                                  Kotak #{i + 1}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* TIPE SOAL BADGE */}
                          <td className="py-3 px-4">
                            {q.type === 'pilihan_ganda' && (
                              <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-700/50">
                                Pilihan Ganda
                              </span>
                            )}
                            {q.type === 'benar_salah' && (
                              <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700/50">
                                Benar / Salah
                              </span>
                            )}
                            {q.type === 'essay' && (
                              <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-700/50">
                                Rebutan / Essay
                              </span>
                            )}
                          </td>

                          {/* TEKS PERTANYAAN */}
                          <td className="py-3 px-4 font-semibold text-slate-200 max-w-xs truncate">
                            {q.question_text}
                          </td>

                          {/* KUNCI JAWABAN */}
                          <td className="py-3 px-4 max-w-[170px] truncate">
                            {q.type === 'pilihan_ganda' ? (
                              <div className="flex items-center gap-1.5 font-mono text-xs">
                                <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white font-bold text-[10px]">
                                  {q.correct_answer}
                                </span>
                                <span className="text-emerald-400 font-semibold truncate text-[11px]">
                                  {pgOptText || '(Opsi Teks)'}
                                </span>
                              </div>
                            ) : q.type === 'benar_salah' ? (
                              q.correct_answer === 'true' ? (
                                <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-700/60 text-emerald-300 font-bold text-[10px]">
                                  ✓ BENAR
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-rose-950 border border-rose-700/60 text-rose-300 font-bold text-[10px]">
                                  ✗ SALAH
                                </span>
                              )
                            ) : (
                              <span className="font-mono text-amber-300 font-semibold text-[11px] truncate block">
                                {q.correct_answer || '(Rujukan Juri)'}
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-center font-mono text-slate-400">
                            {q.timer_duration}s
                          </td>

                          <td className="py-3 px-4 text-center font-mono font-bold text-amber-400">
                            +{q.points}
                          </td>

                          {/* AKSI BARIS */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {q.type === 'pilihan_ganda' && (
                                <button
                                  type="button"
                                  onClick={() => handleShuffleQuestion(q)}
                                  className="p-1.5 rounded-lg bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-800/50"
                                  title="Smart Shuffle: Acak posisi opsi & pindahkan kunci jawaban otomatis"
                                >
                                  <Shuffle className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDuplicateQuestion(q)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                                title="Duplikat Soal"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEditSoal(q)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                                title="Edit Soal"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSoal(q.id)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 hover:text-rose-400 text-slate-300"
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

            {/* PAGINATION TOOLBAR */}
            {filteredQuestions.length > 0 && (
              <div className="bg-slate-950 border-t border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span>
                    Menampilkan <strong className="text-white font-mono">{startIndex + 1}</strong> -{' '}
                    <strong className="text-white font-mono">
                      {Math.min(startIndex + pageSize, filteredQuestions.length)}
                    </strong>{' '}
                    dari <strong className="text-white font-mono">{filteredQuestions.length}</strong>{' '}
                    soal
                  </span>
                  <span className="text-slate-600">|</span>
                  <div className="flex items-center gap-1.5">
                    <span>Per Halaman:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                      className="bg-slate-900 border border-slate-700 text-white rounded-lg px-2 py-1 text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-purple-500"
                    >
                      <option value={10}>10 Baris</option>
                      <option value={20}>20 Baris</option>
                      <option value={50}>50 Baris</option>
                      <option value={100}>100 Baris</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(1)}
                    disabled={safePage <= 1}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300"
                    title="Halaman Pertama"
                  >
                    «
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300"
                  >
                    ‹ Sebelumnya
                  </button>

                  <div className="flex items-center gap-1 px-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
                      .map((p, idx, arr) => {
                        const prev = arr[idx - 1];
                        const hasGap = prev && p - prev > 1;
                        return (
                          <span key={p} className="flex items-center gap-1">
                            {hasGap && <span className="text-slate-600 text-xs px-1">...</span>}
                            <button
                              type="button"
                              onClick={() => setCurrentPage(p)}
                              className={`min-w-[28px] h-7 px-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                                safePage === p
                                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                              }`}
                            >
                              {p}
                            </button>
                          </span>
                        );
                      })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300"
                  >
                    Selanjutnya ›
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={safePage >= totalPages}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300"
                    title="Halaman Terakhir"
                  >
                    »
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* KONTEN TAB 2: KELOLA KATEGORI SOAL */}
      {activeTab === 'kategori' && (
        <div className="space-y-4 flex-1 flex flex-col">
          {/* TOOLBAR KATEGORI */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Tag className="w-4 h-4 text-emerald-400" />
                <span>Daftar Kategori Soal ({categories.length})</span>
              </h3>
              <p className="text-xs text-slate-400">
                Kelola kategori dan topik untuk mengelompokkan soal kuis di panggung
              </p>
            </div>
            <button
              onClick={handleOpenAddCategory}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-600/30"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Kategori Baru</span>
            </button>
          </div>

          {/* TABEL KATEGORI */}
          <div className="flex-1 bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">#</th>
                    <th className="py-3 px-4">Nama Kategori</th>
                    <th className="py-3 px-4">Deskripsi</th>
                    <th className="py-3 px-4 text-center">Jumlah Soal Terkait</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {categories.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-10 text-slate-500">
                        Belum ada kategori yang dibuat. Klik &apos;Tambah Kategori Baru&apos; di atas.
                      </td>
                    </tr>
                  ) : (
                    categories.map((cat, idx) => {
                      const count = questions.filter((q) => q.category_id === cat.id).length;
                      return (
                        <tr key={cat.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-500">{idx + 1}</td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center gap-1.5 font-bold text-xs px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-700/50 text-emerald-300">
                              <Tag className="w-3.5 h-3.5 text-emerald-400" />
                              {cat.name}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-300 max-w-md truncate">
                            {cat.description || (
                              <span className="text-slate-500 italic">Tidak ada deskripsi</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-emerald-400">
                            {count} Soal
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenEditCategory(cat)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                                title="Edit Kategori"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteCategory(cat)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 hover:text-rose-400 text-slate-300"
                                title="Hapus Kategori"
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
          </div>
        </div>
      )}

      {/* KONTEN TAB 3: MANAJEMEN REGU & PESERTA */}
      {activeTab === 'regu' && (
        <div className="space-y-4 flex-1 flex flex-col">
          {/* TOOLBAR REGU */}
          <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
            <div>
              <h3 className="text-sm font-bold text-white">Daftar Regu Terdaftar</h3>
              <p className="text-xs text-slate-400">Atur nama regu, warna meja, dan susunan nama anggota tim</p>
            </div>
            <button
              onClick={handleOpenAddTeam}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-600/30"
            >
              <UserPlus className="w-4 h-4" />
              <span>Tambah Regu Baru</span>
            </button>
          </div>

          {/* TABEL REGU */}
          <div className="flex-1 bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">#</th>
                    <th className="py-3 px-4">Regu</th>
                    <th className="py-3 px-4">Warna Meja</th>
                    <th className="py-3 px-4 text-center">Jumlah Anggota</th>
                    <th className="py-3 px-4">Nama Peserta / Anggota</th>
                    <th className="py-3 px-4 text-center">Skor Saat Ini</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {teams.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-slate-500">
                        Belum ada regu yang terdaftar di panggung.
                      </td>
                    </tr>
                  ) : (
                    teams.map((t, idx) => (
                      <tr key={t.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 font-mono text-slate-500">{idx + 1}</td>
                        <td className="py-3 px-4 font-extrabold text-white text-sm">
                          {t.name}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-4 h-4 rounded-full shadow"
                              style={{ backgroundColor: t.color }}
                            />
                            <span className="font-mono text-slate-400 text-[11px] uppercase">
                              {t.color}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-slate-300">
                          {t.member_count || 3} Orang
                        </td>
                        <td className="py-3 px-4 text-slate-300 italic max-w-xs truncate">
                          {t.members || '(Nama anggota belum diinput)'}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-black text-emerald-400 text-sm">
                          {t.score} PTS
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEditTeam(t)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                              title="Edit Data Regu"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteTeam(t.id)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 hover:text-rose-400 text-slate-300"
                              title="Hapus Regu"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL TAMBAH / EDIT SOAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-800">
              <h3 className="text-lg font-black text-white uppercase">
                {editingId ? 'Edit Soal' : 'Tambah Soal Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuestion} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Kategori Soal
                    </label>
                    <button
                      type="button"
                      onClick={handleOpenAddCategory}
                      className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Kategori Baru</span>
                    </button>
                  </div>
                  <select
                    value={formData.category_id}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                  >
                    <option value="">(Tanpa Kategori)</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Tipe Soal
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) =>
                      setFormData({ ...formData, type: e.target.value as QuestionType })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                  >
                    <option value="pilihan_ganda">Pilihan Ganda</option>
                    <option value="benar_salah">Benar / Salah</option>
                    <option value="essay">Essay (Diskusi Lisan)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Teks Pertanyaan
                </label>
                <textarea
                  rows={3}
                  required
                  value={formData.question_text}
                  onChange={(e) => setFormData({ ...formData, question_text: e.target.value })}
                  placeholder="Ketik isi pertanyaan..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              {formData.type === 'pilihan_ganda' && (
                <div className="space-y-2 p-3 bg-slate-950/70 border border-slate-800 rounded-2xl">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Opsi Pilihan (A - D) & Pilih Kunci Jawaban Benar
                  </label>
                  {formData.options.map((opt, idx) => (
                    <div key={opt.key} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="correct_pg"
                        checked={formData.correct_answer === opt.key}
                        onChange={() => setFormData({ ...formData, correct_answer: opt.key })}
                        className="w-4 h-4 text-purple-600 focus:ring-purple-500"
                      />
                      <span className="w-6 font-bold text-slate-400 text-xs text-center">
                        {opt.key}
                      </span>
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
                        className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
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
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Kunci Jawaban Rujukan Juri
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={formData.correct_answer}
                    onChange={(e) => setFormData({ ...formData, correct_answer: e.target.value })}
                    placeholder="Tuliskan poin-poin jawaban yang dianggap benar..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Penjelasan Tambahan (Opsional)
                </label>
                <input
                  type="text"
                  value={formData.explanation}
                  onChange={(e) => setFormData({ ...formData, explanation: e.target.value })}
                  placeholder="Catatan tambahan untuk juri / penonton"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Durasi Timer (Detik)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={180}
                    value={formData.timer_duration}
                    onChange={(e) =>
                      setFormData({ ...formData, timer_duration: Number(e.target.value) })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Poin Nilai
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={1000}
                    step={10}
                    value={formData.points}
                    onChange={(e) =>
                      setFormData({ ...formData, points: Number(e.target.value) })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              {/* Slot Kotak & Paket Soal (Opsional) */}
              <div className="grid grid-cols-2 gap-4 p-3 bg-slate-950/70 border border-slate-800 rounded-2xl">
                <div>
                  <label className="block text-[11px] font-bold text-blue-300 uppercase tracking-wider mb-1.5">
                    Slot Kotak Blink Box (Panggung)
                  </label>
                  <select
                    value={formData.box_number ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        box_number: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  >
                    <option value="">Otomatis (Sesuai Urutan)</option>
                    {Array.from({ length: Math.max(12, blinkBoxCount) }).map((_, i) => (
                      <option key={i + 1} value={i + 1}>
                        Kotak Nomor #{i + 1}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-purple-300 uppercase tracking-wider mb-1.5">
                    Paket / Babak (Opsional)
                  </label>
                  <select
                    value={formData.package_name}
                    onChange={(e) => setFormData({ ...formData, package_name: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                  >
                    <option value="Umum / Bebas">Umum / Bebas</option>
                    <option value="Babak 1">Babak 1</option>
                    <option value="Babak 2">Babak 2</option>
                    <option value="Final">Final</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-purple-600/30"
                >
                  <Save className="w-4 h-4" />
                  <span>Simpan Soal</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL TAMBAH / EDIT REGU & PESERTA */}
      {isTeamModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
              <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-400" />
                {editingTeam ? 'Edit Data Regu & Peserta' : 'Tambah Regu Baru'}
              </h3>
              <button
                onClick={() => setIsTeamModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTeam} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Nama Regu / Group
                </label>
                <input
                  type="text"
                  required
                  value={teamFormName}
                  onChange={(e) => setTeamFormName(e.target.value)}
                  placeholder="Contoh: Regu Harimau"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Warna Identitas Meja
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={teamFormColor}
                    onChange={(e) => setTeamFormColor(e.target.value)}
                    className="w-12 h-10 bg-transparent rounded-lg cursor-pointer border border-slate-700 p-0.5"
                  />
                  <input
                    type="text"
                    value={teamFormColor}
                    onChange={(e) => setTeamFormColor(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Jumlah Anggota
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={teamFormMemberCount}
                    onChange={(e) => setTeamFormMemberCount(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Skor Saat Ini
                  </label>
                  <input
                    type="number"
                    value={teamFormScore}
                    onChange={(e) => setTeamFormScore(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Nama-Nama Anggota Peserta
                </label>
                <textarea
                  rows={2}
                  value={teamFormMembers}
                  onChange={(e) => setTeamFormMembers(e.target.value)}
                  placeholder="Contoh: Budi (Ketua), Siti, Ahmad"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsTeamModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30"
                >
                  {editingTeam ? 'Simpan Perubahan' : 'Tambahkan Regu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL TAMBAH / EDIT KATEGORI SOAL */}
      {isCatModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
              <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Tag className="w-5 h-5 text-emerald-400" />
                <span>{editingCat ? 'Edit Kategori Soal' : 'Tambah Kategori Baru'}</span>
              </h3>
              <button
                onClick={() => setIsCatModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Nama Kategori
                </label>
                <input
                  type="text"
                  required
                  value={catFormName}
                  onChange={(e) => setCatFormName(e.target.value)}
                  placeholder="Contoh: Pengetahuan Umum, Sains & Teknologi, Sejarah..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Deskripsi Kategori (Opsional)
                </label>
                <textarea
                  rows={3}
                  value={catFormDesc}
                  onChange={(e) => setCatFormDesc(e.target.value)}
                  placeholder="Keterangan singkat mengenai topik kategori ini..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCatModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingCat}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingCat ? 'Menyimpan...' : 'Simpan Kategori'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
