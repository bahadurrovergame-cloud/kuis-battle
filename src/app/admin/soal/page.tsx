'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, Question, QuestionType, Team } from '@/lib/supabase';
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
  Edit2
} from 'lucide-react';

interface Category {
  id: string;
  name: string;
}

export default function AdminDashboardPage() {
  const router = useRouter();

  // Active Tab: 'soal' | 'regu'
  const [activeTab, setActiveTab] = useState<'soal' | 'regu'>('soal');

  // Shared session
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Soal States
  const [categories, setCategories] = useState<Category[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

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
  useEffect(() => {
    const role = sessionStorage.getItem('auth_role');
    if (!role) {
      router.push('/login');
    }
  }, [router]);

  // Load Session and Questions
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sData } = await supabase.from('game_sessions').select('*').limit(1).single();
      if (sData) setSessionId(sData.id);

      const { data: cats } = await supabase.from('categories').select('*').order('name');
      if (cats) setCategories(cats);

      let query = supabase.from('questions').select('*').order('created_at', { ascending: false });
      if (selectedCategory !== 'all') {
        query = query.eq('category_id', selectedCategory);
      }

      const { data: qs } = await query;
      if (qs) setQuestions(qs);

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

  // Reset form soal
  const resetFormSoal = () => {
    setEditingId(null);
    setFormData({
      category_id: categories[0]?.id || '',
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
  };

  const handleOpenAddSoal = () => {
    resetFormSoal();
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
    if (!window.confirm('Hapus soal ini dari database?')) return;
    try {
      await supabase.from('questions').delete().eq('id', id);
      setQuestions(questions.filter((q) => q.id !== id));
      setStatusMsg({ text: 'Soal berhasil dihapus', type: 'success' });
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
        explanation: formData.explanation,
        timer_duration: Number(formData.timer_duration),
        points: Number(formData.points),
      };

      if (editingId) {
        await supabase.from('questions').update(payload).eq('id', editingId);
        setStatusMsg({ text: 'Soal berhasil diperbarui', type: 'success' });
      } else {
        await supabase.from('questions').insert(payload);
        setStatusMsg({ text: 'Soal baru berhasil ditambahkan', type: 'success' });
      }

      setIsModalOpen(false);
      resetFormSoal();
      loadData();
    } catch {
      setStatusMsg({ text: 'Gagal menyimpan soal', type: 'error' });
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
    if (!sessionId || !teamFormName.trim()) return;

    try {
      if (editingTeam) {
        const { data: updated } = await supabase
          .from('teams')
          .update({
            name: teamFormName.trim(),
            color: teamFormColor,
            score: Number(teamFormScore),
            member_count: Number(teamFormMemberCount),
            members: teamFormMembers.trim(),
          })
          .eq('id', editingTeam.id)
          .select()
          .single();

        if (updated) {
          setTeams(teams.map((t) => (t.id === editingTeam.id ? updated : t)));
          setStatusMsg({ text: 'Data regu berhasil diperbarui', type: 'success' });
        }
      } else {
        const { data: created } = await supabase
          .from('teams')
          .insert({
            session_id: sessionId,
            name: teamFormName.trim(),
            color: teamFormColor,
            score: Number(teamFormScore),
            rank: teams.length + 1,
            member_count: Number(teamFormMemberCount),
            members: teamFormMembers.trim(),
          })
          .select()
          .single();

        if (created) {
          setTeams([...teams, created]);
          setStatusMsg({ text: 'Regu baru berhasil didaftarkan', type: 'success' });
        }
      }
      setIsTeamModalOpen(false);
    } catch {
      setStatusMsg({ text: 'Gagal menyimpan data regu', type: 'error' });
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

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col p-4 sm:p-6">
      {/* HEADER BAR */}
      <header className="flex flex-wrap items-center justify-between pb-4 border-b border-slate-800 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-purple-600/20 border border-purple-500/30 rounded-xl text-purple-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-wide text-white uppercase">
              Admin Pusat Perlombaan
            </h1>
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
            href="/control"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-700 hover:border-blue-500 text-xs font-semibold rounded-xl text-slate-300 transition-all"
          >
            <MonitorPlay className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Kontrol Operator</span>
          </a>

          <a
            href="/operator"
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

      {/* TAB SELECTOR: BANK SOAL vs MANAJEMEN REGU/PESERTA */}
      <div className="my-4 flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('soal')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'soal'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Bank Soal ({questions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('regu')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
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
          {/* TOOLBAR SOAL */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
            <div className="flex items-center gap-2">
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
            </div>

            <div className="flex items-center gap-2">
              <label className="cursor-pointer flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all">
                <Upload className="w-3.5 h-3.5 text-blue-400" />
                <span>Import JSON</span>
                <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
              </label>

              <button
                onClick={handleExportJson}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Export JSON</span>
              </button>

              <button
                onClick={handleOpenAddSoal}
                className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-purple-600/30"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Soal</span>
              </button>
            </div>
          </div>

          {/* TABEL SOAL */}
          <div className="flex-1 bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">#</th>
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
                      <td colSpan={7} className="text-center py-10 text-slate-500">
                        Memuat data...
                      </td>
                    </tr>
                  ) : questions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-slate-500">
                        Belum ada soal pada kategori ini.
                      </td>
                    </tr>
                  ) : (
                    questions.map((q, idx) => (
                      <tr key={q.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 font-mono text-slate-500">{idx + 1}</td>
                        <td className="py-3 px-4">
                          <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            {q.type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-200 max-w-xs truncate">
                          {q.question_text}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-emerald-400 max-w-[150px] truncate">
                          {q.correct_answer}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-slate-400">
                          {q.timer_duration}s
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-amber-400">
                          +{q.points}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEditSoal(q)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                              title="Edit Soal"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteSoal(q.id)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 hover:text-rose-400 text-slate-300"
                              title="Hapus Soal"
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

      {/* KONTEN TAB 2: MANAJEMEN REGU & PESERTA */}
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
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Kategori
                  </label>
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
    </main>
  );
}
