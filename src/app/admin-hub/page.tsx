'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import {
  createHubBrowserClient,
  Profile,
  GameSettings,
  TTSUnit,
  TTSLevel,
  TTSWord,
  TTSLeaderboardEntry,
} from '@/lib/supabase-hub';
import {
  Crown,
  Sparkles,
  Sliders,
  Settings,
  Plus,
  Trash2,
  Edit3,
  Eye,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  X,
  Save,
  RotateCcw,
  Zap,
  Flame,
  Snowflake,
  Lightbulb,
  Heart,
  Coins,
  Trophy,
  Smartphone,
  Send,
  ArrowRight,
  Layers,
  Lock,
  Globe2,
  Compass,
} from 'lucide-react';
import { seedDefaultUnitsAction, createUnitAction } from './actions';
import { unbanEmailAction } from '@/app/tts/actions';

export default function AdminHubPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 gap-3">
          <Crown className="w-8 h-8 text-amber-400 animate-bounce" />
          <span className="text-xs font-bold tracking-wider">Memuat Panel Sultan...</span>
        </main>
      }
    >
      <AdminHubContent />
    </Suspense>
  );
}

function AdminHubContent() {
  const router = useRouter();

  // Auth & Profile
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Tabs: 'settings' | 'levels' | 'leaderboard'
  const [activeTab, setActiveTab] = useState<'settings' | 'levels' | 'leaderboard'>('settings');

  // God Mode Parameters Form
  const [settings, setSettings] = useState<GameSettings>({
    id: 1,
    base_points_per_word: 100,
    decay_rate_per_sec: 2,
    hard_timer_seconds: 60,
    coins_per_level: 20,
    hint_price_coins: 15,
    freeze_price_coins: 25,
    freeze_duration_seconds: 10,
    life_regen_minutes: 15,
    coins_refill_lives_price: 50,
    is_hard_zone_global: false,
    current_season: 1,
    updated_at: '',
  });
  const [savingSettings, setSavingSettings] = useState(false);

  // Level Management & Units
  const [units, setUnits] = useState<TTSUnit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [levels, setLevels] = useState<TTSLevel[]>([]);
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
  const [words, setWords] = useState<TTSWord[]>([]);

  // AI Generator Form
  const [aiTheme, setAiTheme] = useState('Budaya & Tradisi Nusantara');
  const [aiLevelNumber, setAiLevelNumber] = useState(1);
  const [aiIsHard, setAiIsHard] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);

  // Level Editor State
  const [editorTitle, setEditorTitle] = useState('');
  const [editorRows, setEditorRows] = useState(8);
  const [editorCols, setEditorCols] = useState(8);
  const [editorIsHard, setEditorIsHard] = useState(false);
  const [editorHardTimer, setEditorHardTimer] = useState<number | null>(60);
  const [editorDecayRate, setEditorDecayRate] = useState<number | null>(4);
  const [editorBranch, setEditorBranch] = useState<'main' | 'left' | 'right'>('main');
  const [editorStatus, setEditorStatus] = useState<'draft' | 'published'>('draft');

  // Word Editor Modal / State
  const [newWordNumber, setNewWordNumber] = useState(1);
  const [newWordDirection, setNewWordDirection] = useState<'across' | 'down'>('across');
  const [newWordRow, setNewWordRow] = useState(0);
  const [newWordCol, setNewWordCol] = useState(0);
  const [newWordTarget, setNewWordTarget] = useState('');
  const [newWordClue, setNewWordClue] = useState('');
  const [newWordPoints, setNewWordPoints] = useState(100);

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<TTSLeaderboardEntry[]>([]);
  const [resettingSeason, setResettingSeason] = useState(false);

  // Unit Management Modal & State
  const [showCreateUnitModal, setShowCreateUnitModal] = useState(false);
  const [newUnitNumber, setNewUnitNumber] = useState(1);
  const [newUnitTitle, setNewUnitTitle] = useState('');
  const [newUnitDescription, setNewUnitDescription] = useState('');
  const [newUnitColor, setNewUnitColor] = useState('#10b981');
  const [newUnitIsSpecial, setNewUnitIsSpecial] = useState(false);
  const [seedingUnits, setSeedingUnits] = useState(false);
  const [creatingUnit, setCreatingUnit] = useState(false);

  // Unban & Reset Pemain Tool
  const [unbanEmailInput, setUnbanEmailInput] = useState('');
  const [unbanningEmail, setUnbanningEmail] = useState(false);

  const handleUnbanEmail = async () => {
    if (!unbanEmailInput.trim()) return;
    setUnbanningEmail(true);
    try {
      const res = await unbanEmailAction(unbanEmailInput.trim());
      if (res.success) {
        alert(res.message || 'Email berhasil di-unban / direset.');
        setUnbanEmailInput('');
      } else {
        alert(`Gagal: ${res.error || 'Terjadi kesalahan'}`);
      }
    } catch {
      alert('Terjadi kesalahan jaringan.');
    } finally {
      setUnbanningEmail(false);
    }
  };

  // Feedback Notif
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(
    null
  );

  // 1. Verifikasi Role Admin & Fetch Data Inisial
  const loadInitialData = useCallback(async () => {
    try {
      const supabase = createHubBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login?redirect=/admin-hub');
        return;
      }

      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (!prof || prof.role !== 'admin') {
        alert('Akses Ditolak: Halaman ini khusus untuk Administrator.');
        router.push('/path');
        return;
      }

      setProfile(prof as Profile);

      // Ambil Game Settings
      const { data: setts } = await supabase
        .from('game_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (setts) setSettings(setts as GameSettings);

      // Ambil Units
      const { data: dbUnits } = await supabase
        .from('tts_units')
        .select('*')
        .order('unit_number', { ascending: true });

      if (dbUnits && dbUnits.length > 0) {
        setUnits(dbUnits as TTSUnit[]);
        setSelectedUnitId(dbUnits[0].id);
      } else {
        // Otomatis seed starter units jika database masih kosong!
        const res = await seedDefaultUnitsAction();
        if (res.success && res.units && res.units.length > 0) {
          setUnits(res.units);
          setSelectedUnitId(res.units[0].id);
        }
      }
    } catch (err) {
      console.error('Error initializing Admin Hub:', err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // 2. Fetch Levels berdasarkan Unit yang Dipilih
  const loadLevels = useCallback(async (unitId: string) => {
    if (!unitId) return;
    try {
      const supabase = createHubBrowserClient();
      const { data: dbLevels } = await supabase
        .from('tts_levels')
        .select('*')
        .eq('unit_id', unitId)
        .order('level_number', { ascending: true });

      if (dbLevels) {
        setLevels(dbLevels as TTSLevel[]);
        if (dbLevels.length > 0) {
          selectLevelForEdit(dbLevels[0] as TTSLevel);
        } else {
          setSelectedLevelId(null);
          setWords([]);
        }
      }
    } catch (err) {
      console.error('Error fetching levels:', err);
    }
  }, []);

  useEffect(() => {
    if (selectedUnitId) {
      loadLevels(selectedUnitId);
    }
  }, [selectedUnitId, loadLevels]);

  // 3. Select Level untuk Diedit
  const selectLevelForEdit = async (lvl: TTSLevel) => {
    setSelectedLevelId(lvl.id);
    setEditorTitle(lvl.title);
    setEditorRows(lvl.grid_rows);
    setEditorCols(lvl.grid_cols);
    setEditorIsHard(lvl.is_hard_zone);
    setEditorHardTimer(lvl.hard_timer_override);
    setEditorDecayRate(lvl.decay_rate_override);
    setEditorBranch(lvl.branch_direction);
    setEditorStatus(lvl.status);

    const supabase = createHubBrowserClient();
    const { data: dbWords } = await supabase
      .from('tts_words')
      .select('*')
      .eq('level_id', lvl.id)
      .order('word_number', { ascending: true });

    if (dbWords) setWords(dbWords as TTSWord[]);
  };

  // 4. Simpan Parameter God Mode ke Supabase
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setStatusMsg(null);

    try {
      const supabase = createHubBrowserClient();
      const { error } = await supabase
        .from('game_settings')
        .upsert({ ...settings, id: 1, updated_at: new Date().toISOString() });

      if (error) {
        setStatusMsg({ text: `Gagal menyimpan parameter: ${error.message}`, type: 'error' });
      } else {
        setStatusMsg({
          text: '✓ Parameter Sultan (God Mode) berhasil diperbarui ke seluruh pemain!',
          type: 'success',
        });
      }
    } catch {
      setStatusMsg({ text: 'Terjadi kesalahan sistem saat menyimpan parameter.', type: 'error' });
    } finally {
      setSavingSettings(false);
    }
  };

  // 4b. Inisialisasi 3 Pulau Standar
  const handleSeedDefaultUnits = async () => {
    setSeedingUnits(true);
    setStatusMsg(null);
    try {
      const res = await seedDefaultUnitsAction();
      if (res.success && res.units && res.units.length > 0) {
        setUnits(res.units);
        setSelectedUnitId(res.units[0].id);
        setStatusMsg({
          text: '✓ Berhasil menginisialisasi 3 Pulau Tematik standar ke database!',
          type: 'success',
        });
      } else {
        setStatusMsg({
          text: `Gagal inisialisasi: ${res.error || 'Terjadi kesalahan'}`,
          type: 'error',
        });
      }
    } catch {
      setStatusMsg({ text: 'Gagal terhubung ke server saat inisialisasi.', type: 'error' });
    } finally {
      setSeedingUnits(false);
    }
  };

  // 4c. Tambah Pulau Tematik Baru
  const handleCreateUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUnitTitle.trim()) {
      alert('Masukkan nama/judul pulau.');
      return;
    }
    setCreatingUnit(true);
    try {
      const res = await createUnitAction({
        unit_number: newUnitNumber,
        title: newUnitTitle.trim(),
        description: newUnitDescription.trim(),
        theme_color: newUnitColor,
        is_special_event: newUnitIsSpecial,
      });

      if (res.success && res.unit) {
        setUnits((prev) =>
          [...prev, res.unit as TTSUnit].sort((a, b) => a.unit_number - b.unit_number)
        );
        setSelectedUnitId(res.unit.id);
        setShowCreateUnitModal(false);
        setNewUnitTitle('');
        setNewUnitDescription('');
        setStatusMsg({
          text: `✓ Berhasil menambahkan Pulau Baru "${res.unit.title}"!`,
          type: 'success',
        });
      } else {
        alert(`Gagal membuat pulau: ${res.error || 'Terjadi kesalahan'}`);
      }
    } catch (err: any) {
      alert(`Terjadi kesalahan: ${err?.message}`);
    } finally {
      setCreatingUnit(false);
    }
  };

  // 5. Generate TTS dengan AI (@ai-sdk/google Gemini 2.5 Flash)
  const handleGenerateAi = async () => {
    if (!selectedUnitId) {
      alert('Pilih Unit/Pulau terlebih dahulu.');
      return;
    }

    setGeneratingAi(true);
    setStatusMsg(null);

    try {
      const res = await fetch('/api/ai/generate-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: aiTheme,
          levelNumber: aiLevelNumber,
          isHardZone: aiIsHard,
        }),
      });

      const json = await res.json();

      if (!json.success || !json.data) {
        setStatusMsg({ text: json.error || 'Gagal generate soal via AI.', type: 'error' });
        setGeneratingAi(false);
        return;
      }

      const generated = json.data;
      const supabase = createHubBrowserClient();

      // 1. Buat Level Baru dalam status DRAFT
      const { data: newLevel, error: lvlErr } = await supabase
        .from('tts_levels')
        .insert({
          unit_id: selectedUnitId,
          level_number: aiLevelNumber,
          title: generated.title || `Level ${aiLevelNumber}: ${aiTheme}`,
          grid_rows: generated.gridRows || 8,
          grid_cols: generated.gridCols || 8,
          is_hard_zone: aiIsHard,
          hard_timer_override: aiIsHard ? 60 : null,
          decay_rate_override: aiIsHard ? 4 : null,
          branch_direction: 'main',
          status: 'draft', // DRAFT terlebih dahulu sesuai instruksi!
        })
        .select()
        .single();

      if (lvlErr || !newLevel) {
        setStatusMsg({ text: `Gagal membuat baris level: ${lvlErr?.message}`, type: 'error' });
        setGeneratingAi(false);
        return;
      }

      // 2. Masukkan kata-kata hasil generate AI ke tabel tts_words
      const wordsToInsert = generated.words.map((w: any) => ({
        level_id: newLevel.id,
        word_number: w.word_number,
        direction: w.direction,
        start_row: w.start_row,
        start_col: w.start_col,
        word: w.word.toUpperCase().replace(/[^A-Z]/g, ''),
        clue: w.clue,
        points: w.points || 100,
      }));

      const { error: wordsErr } = await supabase.from('tts_words').insert(wordsToInsert);

      if (wordsErr) {
        setStatusMsg({ text: `Gagal menyimpan kata: ${wordsErr.message}`, type: 'error' });
      } else {
        setStatusMsg({
          text: `✨ Berhasil mengenerate Level "${newLevel.title}" (${wordsToInsert.length} kata) dalam status DRAFT!`,
          type: 'success',
        });
        loadLevels(selectedUnitId);
      }
    } catch {
      setStatusMsg({ text: 'Koneksi ke endpoint AI gagal.', type: 'error' });
    } finally {
      setGeneratingAi(false);
    }
  };

  // 6. Simpan / Publish Level
  const handleSaveLevel = async (publish: boolean) => {
    if (!selectedLevelId) return;
    setStatusMsg(null);

    const targetStatus = publish ? 'published' : editorStatus;

    try {
      const supabase = createHubBrowserClient();
      const { error } = await supabase
        .from('tts_levels')
        .update({
          title: editorTitle,
          grid_rows: editorRows,
          grid_cols: editorCols,
          is_hard_zone: editorIsHard,
          hard_timer_override: editorIsHard ? editorHardTimer : null,
          decay_rate_override: editorIsHard ? editorDecayRate : null,
          branch_direction: editorBranch,
          status: targetStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedLevelId);

      if (error) {
        setStatusMsg({ text: `Gagal menyimpan level: ${error.message}`, type: 'error' });
      } else {
        setEditorStatus(targetStatus);
        setStatusMsg({
          text: `Level berhasil disimpan ${publish ? 'dan dipublikasikan ke pemain!' : 'sebagai DRAFT.'}`,
          type: 'success',
        });
        loadLevels(selectedUnitId);
      }
    } catch {
      setStatusMsg({ text: 'Gagal memperbarui level.', type: 'error' });
    }
  };

  // 7. Tambah Kata Manual ke Level
  const handleAddWord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLevelId) return;

    const cleanWord = newWordTarget.trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (!cleanWord) {
      alert('Masukkan kata jawaban.');
      return;
    }

    try {
      const supabase = createHubBrowserClient();
      const { data, error } = await supabase
        .from('tts_words')
        .insert({
          level_id: selectedLevelId,
          word_number: newWordNumber,
          direction: newWordDirection,
          start_row: newWordRow,
          start_col: newWordCol,
          word: cleanWord,
          clue: newWordClue.trim(),
          points: newWordPoints,
        })
        .select()
        .single();

      if (error) {
        alert(`Gagal menambah kata: ${error.message}`);
      } else if (data) {
        setWords((prev) => [...prev, data as TTSWord]);
        setNewWordTarget('');
        setNewWordClue('');
        setNewWordNumber((prev) => prev + 1);
      }
    } catch {
      alert('Terjadi kesalahan jaringan.');
    }
  };

  // 8. Hapus Kata
  const handleDeleteWord = async (wordId: string) => {
    if (!confirm('Hapus kata ini dari papan TTS?')) return;
    try {
      const supabase = createHubBrowserClient();
      await supabase.from('tts_words').delete().eq('id', wordId);
      setWords((prev) => prev.filter((w) => w.id !== wordId));
    } catch {
      alert('Gagal menghapus kata.');
    }
  };

  // 9. Fetch Live Leaderboard
  const loadLeaderboard = useCallback(async () => {
    try {
      const supabase = createHubBrowserClient();
      const { data } = await supabase
        .from('tts_leaderboard')
        .select('*, profiles(*)')
        .eq('season_number', settings.current_season)
        .order('total_score', { ascending: false })
        .order('total_time_taken', { ascending: true })
        .limit(50);

      if (data) setLeaderboard(data as TTSLeaderboardEntry[]);
    } catch (err) {
      console.error('Error loading leaderboard:', err);
    }
  }, [settings.current_season]);

  useEffect(() => {
    if (activeTab === 'leaderboard') {
      loadLeaderboard();
    }
  }, [activeTab, loadLeaderboard]);

  // Visual Map Cells untuk Mobile Preview
  const previewCellsMap = useMemo(() => {
    const map: Record<string, { letter: string; num?: number }> = {};
    words.forEach((w) => {
      for (let i = 0; i < w.word.length; i++) {
        const r = w.direction === 'across' ? w.start_row : w.start_row + i;
        const c = w.direction === 'across' ? w.start_col + i : w.start_col;
        const key = `${r},${c}`;
        map[key] = { letter: w.word[i], num: i === 0 ? w.word_number : undefined };
      }
    });
    return map;
  }, [words]);

  const selectedUnit = useMemo(
    () => units.find((u) => u.id === selectedUnitId),
    [units, selectedUnitId]
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 gap-3">
        <Crown className="w-8 h-8 text-amber-400 animate-bounce" />
        <span className="text-xs font-bold tracking-wider">Memuat Panel Sultan...</span>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col items-center pb-20 select-none">
      {/* TOP HEADER SULTAN (Tactile Game HUD) */}
      <header className="w-full bg-[#111726] border-b-2 border-slate-800 px-4 py-3 sm:px-6 sticky top-0 z-30 shadow-md">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500 text-slate-950 font-black border-b-4 border-amber-700 flex items-center justify-center shadow-md">
              <Crown className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 block -mb-0.5">
                KONTROL UTAMA SULTAN
              </span>
              <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                PANEL ADMIN GAME HUB
              </h1>
            </div>
          </div>

          {/* Quick Nav & Info */}
          <div className="flex items-center gap-2.5">
            <a
              href="/path"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black border-b-2 border-emerald-700 active:translate-y-0.5 transition-all shadow"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Test Main di Peta</span>
            </a>

            <a
              href="/"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border-b-2 border-slate-950 text-xs font-black text-slate-200 transition-all active:translate-y-0.5 shadow"
            >
              <span>Lobi Hub</span>
            </a>

            <div className="px-3 py-1.5 rounded-xl bg-[#090d16] border-2 border-amber-500/60 text-xs font-mono font-black text-amber-300">
              👑 @{profile?.username}
            </div>
          </div>
        </div>
      </header>

      {/* TABS NAVIGATION (Tactile Arcade Tabs) */}
      <div className="w-full max-w-6xl px-4 mt-6">
        <div className="flex items-center gap-2.5 border-b-2 border-slate-800 pb-3 overflow-x-auto">
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'settings'
                ? 'bg-amber-500 text-slate-950 border-b-4 border-amber-700 shadow-md'
                : 'text-slate-300 bg-[#111726] border-2 border-slate-700 hover:text-white'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>1. Atur Poin & Parameter</span>
          </button>

          <button
            onClick={() => setActiveTab('levels')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'levels'
                ? 'bg-amber-500 text-slate-950 border-b-4 border-amber-700 shadow-md'
                : 'text-slate-300 bg-[#111726] border-2 border-slate-700 hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>2. Kelola Soal & AI Generator</span>
          </button>

          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'leaderboard'
                ? 'bg-amber-500 text-slate-950 border-b-4 border-amber-700 shadow-md'
                : 'text-slate-300 bg-[#111726] border-2 border-slate-700 hover:text-white'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>3. Live Klasemen & Reset Musim</span>
          </button>
        </div>

        {/* Notifikasi Status */}
        {statusMsg && (
          <div
            className={`my-4 p-3.5 rounded-2xl border text-xs flex items-center justify-between gap-3 ${
              statusMsg.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                : 'bg-rose-950/60 border-rose-800 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMsg.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400" />
              )}
              <span>{statusMsg.text}</span>
            </div>
            <button onClick={() => setStatusMsg(null)} className="text-slate-400 hover:text-white">
              ✕
            </button>
          </div>
        )}

        {/* ================================================================== */}
        {/* TAB 1: GOD MODE PARAMETER CONTROL (ATUR TANPA CODING)              */}
        {/* ================================================================== */}
        {activeTab === 'settings' && (
          <div className="mt-6 bg-[#111726] border-2 border-slate-700 rounded-3xl p-6 sm:p-8 shadow-[0_6px_0_#070a12]">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-amber-400" />
                  <span>Kontrol Parameter Game (Tanpa Coding)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1 font-medium">
                  Seluruh perubahan di sini langsung berlaku otomatis ke seluruh pemain saat mereka bermain TTS.
                </p>
              </div>

              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider border-b-4 border-emerald-700 active:translate-y-0.5 active:border-b-0 shadow-md flex items-center gap-2 disabled:opacity-50 transition-all shrink-0"
              >
                <Save className="w-4 h-4" />
                <span>{savingSettings ? 'MENYIMPAN...' : 'SIMPAN PARAMETER'}</span>
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Poin Dasar Per Kata */}
              <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Base Point per Kata
                </label>
                <input
                  type="number"
                  value={settings.base_points_per_word}
                  onChange={(e) =>
                    setSettings({ ...settings, base_points_per_word: Number(e.target.value) })
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm font-mono font-bold text-emerald-400"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Nilai awal sebelum terkena pembusukan poin.
                </span>
              </div>

              {/* Kecepatan Scoring Decay */}
              <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Scoring Decay (Poin Hilang / Detik)
                </label>
                <input
                  type="number"
                  value={settings.decay_rate_per_sec}
                  onChange={(e) =>
                    setSettings({ ...settings, decay_rate_per_sec: Number(e.target.value) })
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm font-mono font-bold text-rose-400"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Berapa poin menyusut setiap detik (standar: 2 poin/dtk).
                </span>
              </div>

              {/* Durasi Hard Timer */}
              <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Durasi Hard Timer (Detik)
                </label>
                <input
                  type="number"
                  value={settings.hard_timer_seconds}
                  onChange={(e) =>
                    setSettings({ ...settings, hard_timer_seconds: Number(e.target.value) })
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm font-mono font-bold text-amber-400"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Batas waktu hitung mundur level Zona Hard (default: 60s).
                </span>
              </div>

              {/* Hadiah Koin Tamat Level */}
              <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Hadiah Koin per Level Selesai
                </label>
                <input
                  type="number"
                  value={settings.coins_per_level}
                  onChange={(e) =>
                    setSettings({ ...settings, coins_per_level: Number(e.target.value) })
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm font-mono font-bold text-yellow-400"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Jumlah koin yang diberikan ke profil pemain saat tamat level.
                </span>
              </div>

              {/* Harga Hint */}
              <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Harga Power-Up Hint (Koin)
                </label>
                <input
                  type="number"
                  value={settings.hint_price_coins}
                  onChange={(e) =>
                    setSettings({ ...settings, hint_price_coins: Number(e.target.value) })
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm font-mono font-bold text-amber-300"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Koin yang dipotong saat pemain membuka 1 huruf bantuan.
                </span>
              </div>

              {/* Harga Freeze */}
              <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Harga Power-Up Freeze (Koin)
                </label>
                <input
                  type="number"
                  value={settings.freeze_price_coins}
                  onChange={(e) =>
                    setSettings({ ...settings, freeze_price_coins: Number(e.target.value) })
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm font-mono font-bold text-cyan-300"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Koin yang dipotong saat membekukan waktu selama 10 detik.
                </span>
              </div>

              {/* Waktu Cooldown Nyawa */}
              <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Cooldown Regenerasi Nyawa (Menit)
                </label>
                <input
                  type="number"
                  value={settings.life_regen_minutes}
                  onChange={(e) =>
                    setSettings({ ...settings, life_regen_minutes: Number(e.target.value) })
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm font-mono font-bold text-rose-400"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Menit yang dibutuhkan untuk menambah 1 nyawa secara otomatis.
                </span>
              </div>

              {/* Biaya Refill Penuh */}
              <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Biaya Refill Nyawa Penuh (Koin)
                </label>
                <input
                  type="number"
                  value={settings.coins_refill_lives_price}
                  onChange={(e) =>
                    setSettings({ ...settings, coins_refill_lives_price: Number(e.target.value) })
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm font-mono font-bold text-yellow-400"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Koin untuk membeli 5 nyawa penuh seketika saat kehabisan.
                </span>
              </div>

              {/* Unban & Reset Pemain Tool */}
              <div className="p-4 bg-slate-950/80 border-2 border-rose-500/30 rounded-2xl md:col-span-2 mt-2">
                <label className="text-[11px] font-black text-rose-400 uppercase tracking-wider block mb-1">
                  🛠️ Alat Reset / Unban Pemain (Testing & Anti-Cheat)
                </label>
                <p className="text-[11px] text-slate-400 mb-3">
                  Gunakan form ini untuk membuka blokir email pemain yang terkena ban Anti-Cheat agar bisa mendaftar atau bermain kembali.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="email"
                    placeholder="Masukkan email pemain yang ingin di-unban / reset..."
                    value={unbanEmailInput}
                    onChange={(e) => setUnbanEmailInput(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-rose-400"
                  />
                  <button
                    type="button"
                    onClick={handleUnbanEmail}
                    disabled={unbanningEmail || !unbanEmailInput.trim()}
                    className="py-2 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0"
                  >
                    <span>{unbanningEmail ? 'Memproses...' : 'Buka Blokir (Unban)'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* ================================================================== */}
        {/* TAB 2: MANAJEMEN LEVEL & AI GENERATOR GEMINI 2.5 FLASH             */}
        {/* ================================================================== */}
        {activeTab === 'levels' && (
          <div className="mt-6 flex flex-col lg:flex-row gap-6">
            {/* SISI KIRI: UNIT, LEVEL LIST & AI GENERATOR */}
            <div className="w-full lg:w-1/2 flex flex-col gap-6">
              {/* Unit Selector & Management */}
              <div className="bg-[#111726] border-2 border-slate-700 rounded-3xl p-5 shadow-[0_6px_0_#070a12]">
                <div className="flex items-center justify-between mb-2.5">
                  <div>
                    <label className="text-[11px] font-black text-slate-200 uppercase tracking-wider block">
                      PILIH PULAU / UNIT TEMATIK
                    </label>
                    <span className="text-[10px] text-slate-400 font-medium block">
                      Kelompok bab/dunia TTS (Duolingo Island System)
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setNewUnitNumber(units.length + 1);
                      setShowCreateUnitModal(true);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black border-b-2 border-emerald-700 active:translate-y-0.5 transition-all shadow flex items-center gap-1.5 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Buat Pulau</span>
                  </button>
                </div>

                {units.length === 0 ? (
                  <div className="p-4 bg-[#090d16] border-2 border-amber-500/70 rounded-2xl text-center space-y-3 mt-3">
                    <div className="text-amber-400 font-black text-xs flex items-center justify-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <span>Belum Ada Pulau Tematik di Database</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed max-w-sm mx-auto font-medium">
                      Setiap level TTS harus dimasukkan ke dalam sebuah <b>Pulau Tematik</b>. Klik tombol di bawah untuk membuat 3 pulau starter secara otomatis di database:
                    </p>
                    <button
                      type="button"
                      onClick={handleSeedDefaultUnits}
                      disabled={seedingUnits}
                      className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider border-b-4 border-amber-700 active:translate-y-0.5 active:border-b-0 transition-all shadow flex items-center justify-center gap-2"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>{seedingUnits ? 'MENGINISIALISASI...' : '⚡ INISIALISASI 3 PULAU STANDAR'}</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 mt-2">
                    <select
                      value={selectedUnitId}
                      onChange={(e) => setSelectedUnitId(e.target.value)}
                      className="w-full bg-[#090d16] border-2 border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-black focus:outline-none focus:border-amber-400"
                    >
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          Pulau {u.unit_number}: {u.title} {u.is_special_event ? '⭐ (Event Spesial)' : ''}
                        </option>
                      ))}
                    </select>

                    {/* Preview Pulau Terpilih */}
                    {selectedUnit && (
                      <div className="p-3 rounded-xl bg-[#090d16] border border-slate-800 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3.5 h-3.5 rounded-full shrink-0"
                            style={{ backgroundColor: selectedUnit.theme_color || '#10b981' }}
                          />
                          <span className="text-[11px] text-slate-300 font-medium">
                            {selectedUnit.description || 'Tidak ada deskripsi'}
                          </span>
                        </div>
                        <span className="text-[10px] font-black uppercase text-amber-400 px-2 py-0.5 rounded-lg bg-amber-950/60 border border-amber-800 shrink-0">
                          {levels.length} Level
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* AI Auto-Generator Box (Gemini 2.5 Flash) */}
              <div className="bg-[#111726] border-2 border-purple-500/70 rounded-3xl p-6 shadow-[0_6px_0_#2e1065] relative">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-purple-500 text-slate-950 flex items-center justify-center font-black border-b-4 border-purple-700 shadow">
                    <Sparkles className="w-5 h-5 text-slate-950" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">AI Crossword Generator</h3>
                    <span className="text-[10px] text-purple-300 font-bold block">
                      Powered by Google Gemini 3.5 & 3.8 Flash (Auto-Fallback & Hemat Kuota)
                    </span>
                  </div>
                </div>

                <div className="space-y-3.5 text-xs">
                  <div>
                    <label className="text-[10px] font-black text-slate-300 uppercase block mb-1">
                      Topik / Tema Teka-Teki
                    </label>
                    <input
                      type="text"
                      value={aiTheme}
                      onChange={(e) => setAiTheme(e.target.value)}
                      placeholder="Contoh: Kuliner Tradisional Nusantara"
                      className="w-full bg-[#090d16] border-2 border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-medium focus:outline-none focus:border-purple-400"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-black text-slate-300 uppercase block mb-1">
                        Nomor Level
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={aiLevelNumber}
                        onChange={(e) => setAiLevelNumber(Number(e.target.value))}
                        className="w-full bg-[#090d16] border-2 border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono font-bold focus:outline-none focus:border-purple-400"
                      />
                    </div>

                    <div className="flex items-center pt-5">
                      <label className="flex items-center gap-2 text-xs text-rose-300 font-bold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={aiIsHard}
                          onChange={(e) => setAiIsHard(e.target.checked)}
                          className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500"
                        />
                        <span>Jadikan Zona Hard</span>
                      </label>
                    </div>
                  </div>

                  <button
                    onClick={handleGenerateAi}
                    disabled={generatingAi}
                    className="w-full mt-3 py-3.5 rounded-xl bg-purple-500 hover:bg-purple-400 text-slate-950 font-black text-xs uppercase tracking-wider border-b-4 border-purple-700 active:translate-y-0.5 active:border-b-0 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>{generatingAi ? 'MENGENERATE SOAL DENGAN AI...' : 'GENERATE SOAL AI (DRAFT)'}</span>
                  </button>
                </div>
              </div>

              {/* Daftar Level di Unit Ini */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl">
                <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-3">
                  Daftar Level ({levels.length})
                </h3>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {levels.map((lvl) => (
                    <div
                      key={lvl.id}
                      onClick={() => selectLevelForEdit(lvl)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between text-xs ${
                        selectedLevelId === lvl.id
                          ? 'bg-purple-950/60 border-purple-500 text-white shadow'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono font-bold text-amber-400">LVL {lvl.level_number}</span>
                        <span className="font-bold">{lvl.title}</span>
                        {lvl.is_hard_zone && (
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-950 text-rose-400 border border-rose-800">
                            Hard
                          </span>
                        )}
                      </div>

                      <span
                        className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                          lvl.status === 'published'
                            ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                            : 'bg-amber-950 text-amber-400 border-amber-800'
                        }`}
                      >
                        {lvl.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* SISI KANAN: LEVEL EDITOR & MOBILE VIEWPORT PREVIEW */}
            <div className="w-full lg:w-1/2 flex flex-col gap-6">
              {selectedLevelId ? (
                <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl">
                  {/* Action Bar Publish / Draft */}
                  <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-800">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                        Status Saat Ini:
                      </span>
                      <span
                        className={`font-black uppercase text-sm ${
                          editorStatus === 'published' ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        ● {editorStatus}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSaveLevel(false)}
                        className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold text-xs"
                      >
                        Simpan Draft
                      </button>
                      <button
                        onClick={() => handleSaveLevel(true)}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 flex items-center gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Publish ke Pemain</span>
                      </button>
                    </div>
                  </div>

                  {/* Form Metadata Level */}
                  <div className="grid grid-cols-2 gap-3 mb-5 text-xs">
                    <div className="col-span-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                        Judul Level
                      </label>
                      <input
                        type="text"
                        value={editorTitle}
                        onChange={(e) => setEditorTitle(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                        Ukuran Grid (Baris x Kolom)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={editorRows}
                          onChange={(e) => setEditorRows(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                        />
                        <span>x</span>
                        <input
                          type="number"
                          value={editorCols}
                          onChange={(e) => setEditorCols(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                        Arah Cabang di Peta
                      </label>
                      <select
                        value={editorBranch}
                        onChange={(e) => setEditorBranch(e.target.value as any)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                      >
                        <option value="main">Tengah (Main Path)</option>
                        <option value="left">Bercabang Kiri</option>
                        <option value="right">Bercabang Kanan</option>
                      </select>
                    </div>
                  </div>

                  {/* MOBILE VIEWPORT PREVIEW (Simulasi Tampilan HP) */}
                  <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-center mb-5">
                    <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center justify-center gap-1.5 mb-3">
                      <Smartphone className="w-3.5 h-3.5 text-purple-400" />
                      <span>Mobile Viewport Preview ({editorRows}x{editorCols})</span>
                    </span>

                    <div
                      className="grid gap-0.5 mx-auto p-1.5 bg-slate-900 rounded-xl border border-slate-800"
                      style={{
                        gridTemplateColumns: `repeat(${editorCols}, minmax(0, 1fr))`,
                        maxWidth: '260px',
                        aspectRatio: `${editorCols}/${editorRows}`,
                      }}
                    >
                      {Array.from({ length: editorRows }).map((_, r) =>
                        Array.from({ length: editorCols }).map((__, c) => {
                          const key = `${r},${c}`;
                          const cell = previewCellsMap[key];

                          if (!cell) {
                            return <div key={key} className="w-full h-full bg-slate-950 rounded" />;
                          }

                          return (
                            <div
                              key={key}
                              className="w-full h-full bg-emerald-950/80 border border-emerald-500/60 rounded flex items-center justify-center text-[10px] font-mono font-bold text-emerald-300 relative"
                            >
                              {cell.num && (
                                <span className="absolute top-0 left-0.5 text-[6px] text-slate-400">
                                  {cell.num}
                                </span>
                              )}
                              <span>{cell.letter}</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Form Tambah Kata Manual */}
                  <form onSubmit={handleAddWord} className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-3 text-xs mb-5">
                    <span className="text-[11px] font-black uppercase text-emerald-400 block">
                      + Tambah Kata Baru ke Grid
                    </span>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Kata Target</label>
                        <input
                          type="text"
                          required
                          placeholder="INDONESIA"
                          value={newWordTarget}
                          onChange={(e) => setNewWordTarget(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 font-mono uppercase text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Arah</label>
                        <select
                          value={newWordDirection}
                          onChange={(e) => setNewWordDirection(e.target.value as any)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white"
                        >
                          <option value="across">Mendatar (Across)</option>
                          <option value="down">Menurun (Down)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Nomor Soal</label>
                        <input
                          type="number"
                          value={newWordNumber}
                          onChange={(e) => setNewWordNumber(Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 font-mono text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Baris Awal (Row)</label>
                        <input
                          type="number"
                          value={newWordRow}
                          onChange={(e) => setNewWordRow(Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 font-mono text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Kolom Awal (Col)</label>
                        <input
                          type="number"
                          value={newWordCol}
                          onChange={(e) => setNewWordCol(Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 font-mono text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">Petunjuk / Soal Clue</label>
                      <input
                        type="text"
                        required
                        placeholder="Nama negara kepulauan terbesar di dunia"
                        value={newWordClue}
                        onChange={(e) => setNewWordClue(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold text-xs text-white"
                    >
                      + Tambahkan Kata ke Level Ini
                    </button>
                  </form>

                  {/* Daftar Kata yang Terdaftar */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      Daftar Kata Aktif ({words.length})
                    </span>
                    {words.map((w) => (
                      <div
                        key={w.id}
                        className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-amber-400">#{w.word_number}</span>
                            <span className="font-mono font-black text-white">{w.word}</span>
                            <span className="text-[10px] text-slate-400">
                              ({w.direction} @ {w.start_row},{w.start_col})
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{w.clue}</p>
                        </div>

                        <button
                          onClick={() => handleDeleteWord(w.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-3xl">
                  Pilih atau buat level terlebih dahulu untuk melihat editor.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* TAB 3: KLASEMEN REALTIME & KONTROL RESET MUSIM (SEASON ARCHIVE)     */}
        {/* ================================================================== */}
        {activeTab === 'leaderboard' && (
          <div className="mt-6 bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-400" />
                  <span>Papan Klasemen Realtime • Season {settings.current_season}</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Sistem tie-breaker adil: diurutkan berdasarkan Skor Tertinggi, lalu Waktu Tersingkat.
                </p>
              </div>

              <button
                onClick={async () => {
                  if (
                    !confirm(
                      `Arsipkan Season ${settings.current_season} ke Hall of Fame dan reset skor seluruh pemain ke 0 untuk Season ${
                        settings.current_season + 1
                      }?`
                    )
                  )
                    return;

                  setResettingSeason(true);
                  try {
                    const supabase = createHubBrowserClient();

                    // 1. Ambil Top 3 untuk dimasukkan ke Hall of Fame
                    const { data: top3 } = await supabase
                      .from('tts_leaderboard')
                      .select('*, profiles(*)')
                      .eq('season_number', settings.current_season)
                      .order('total_score', { ascending: false })
                      .order('total_time_taken', { ascending: true })
                      .limit(3);

                    if (top3 && top3.length > 0) {
                      const badges = ['🥇', '🥈', '🥉'];
                      const hallOfFameRows = top3.map((entry, idx) => ({
                        season_number: settings.current_season,
                        user_id: entry.user_id,
                        username: entry.profiles?.username || 'Pemain',
                        avatar_url: entry.profiles?.avatar_url || null,
                        rank: (idx + 1) as 1 | 2 | 3,
                        score: entry.total_score,
                        time_taken: entry.total_time_taken,
                        reward_badge: badges[idx],
                      }));

                      await supabase.from('hall_of_fame').insert(hallOfFameRows);

                      // Berikan badge permanen ke profil juara
                      for (let i = 0; i < top3.length; i++) {
                        const champion = top3[i];
                        const currentBadges = Array.isArray(champion.profiles?.badges)
                          ? champion.profiles.badges
                          : [];
                        currentBadges.push(`Juara ${i + 1} Season ${settings.current_season} ${badges[i]}`);
                        await supabase
                          .from('profiles')
                          .update({ badges: currentBadges })
                          .eq('id', champion.user_id);
                      }
                    }

                    // 2. Naikkan nomor season di game_settings
                    const nextSeason = settings.current_season + 1;
                    await supabase
                      .from('game_settings')
                      .update({ current_season: nextSeason, updated_at: new Date().toISOString() })
                      .eq('id', 1);

                    setSettings((prev) => ({ ...prev, current_season: nextSeason }));
                    alert(`✓ Berhasil! Juara Season ${settings.current_season} telah diarsipkan ke Hall of Fame dan Season ${nextSeason} telah dimulai.`);
                    loadLeaderboard();
                  } catch (e: any) {
                    alert(`Gagal mereset season: ${e.message}`);
                  } finally {
                    setResettingSeason(false);
                  }
                }}
                disabled={resettingSeason}
                className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-black text-xs transition-all shadow-lg shadow-amber-600/30 flex items-center gap-2 disabled:opacity-50"
              >
                <Crown className="w-4 h-4" />
                <span>{resettingSeason ? 'Mengarsipkan...' : `Nobatkan Juara & Mulai Season ${settings.current_season + 1}`}</span>
              </button>
            </div>

            {/* Tabel Leaderboard Realtime */}
            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Peringkat</th>
                    <th className="py-3 px-4">Pemain</th>
                    <th className="py-3 px-4 text-center">Level Selesai</th>
                    <th className="py-3 px-4 text-center">Waktu Tempuh</th>
                    <th className="py-3 px-4 text-right">Total Skor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {leaderboard.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        Belum ada pemain yang menyelesaikan level di Season ini.
                      </td>
                    </tr>
                  ) : (
                    leaderboard.map((row, idx) => (
                      <tr key={row.id} className="hover:bg-slate-850/50 transition-colors">
                        <td className="py-3 px-4 font-black">
                          {idx === 0 ? (
                            <span className="text-amber-400 text-base">🥇 #1</span>
                          ) : idx === 1 ? (
                            <span className="text-slate-300 text-base">🥈 #2</span>
                          ) : idx === 2 ? (
                            <span className="text-amber-600 text-base">🥉 #3</span>
                          ) : (
                            <span className="text-slate-500">#{idx + 1}</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{row.profiles?.avatar_url || '⚡'}</span>
                            <span className="font-bold text-white font-sans">
                              @{row.profiles?.username || 'Pemain'}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center text-slate-300">
                          {row.levels_completed} Level
                        </td>
                        <td className="py-3 px-4 text-center text-slate-400">
                          {row.total_time_taken}s
                        </td>
                        <td className="py-3 px-4 text-right font-black text-emerald-400 text-sm">
                          {row.total_score} PTS
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* MODAL TAMBAH PULAU / UNIT TEMATIK BARU */}
      {showCreateUnitModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#111726] border-2 border-slate-700 rounded-3xl p-6 shadow-[0_8px_0_#070a12] relative">
            <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500 text-slate-950 font-black flex items-center justify-center">
                  <Compass className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-black text-white">TAMBAH PULAU TEMATIK BARU</h3>
              </div>
              <button
                onClick={() => setShowCreateUnitModal(false)}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUnit} className="space-y-3.5">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                    No. Pulau
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={newUnitNumber}
                    onChange={(e) => setNewUnitNumber(Number(e.target.value))}
                    className="w-full bg-[#090d16] border-2 border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                    Warna Aksen Pulau
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={newUnitColor}
                      onChange={(e) => setNewUnitColor(e.target.value)}
                      className="w-10 h-9 rounded-lg bg-transparent cursor-pointer border border-slate-700"
                    />
                    <input
                      type="text"
                      value={newUnitColor}
                      onChange={(e) => setNewUnitColor(e.target.value)}
                      className="w-full bg-[#090d16] border-2 border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Nama / Judul Pulau
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Unit 4: Flora & Fauna Endemik"
                  value={newUnitTitle}
                  onChange={(e) => setNewUnitTitle(e.target.value)}
                  className="w-full bg-[#090d16] border-2 border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-medium focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Deskripsi Pulau
                </label>
                <textarea
                  rows={2}
                  placeholder="Tantangan teka-teki silang seputar satwa dan tumbuhan langka nusantara..."
                  value={newUnitDescription}
                  onChange={(e) => setNewUnitDescription(e.target.value)}
                  className="w-full bg-[#090d16] border-2 border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white font-medium focus:outline-none focus:border-emerald-400 resize-none"
                />
              </div>

              <div className="p-3 rounded-xl bg-[#090d16] border border-slate-800">
                <label className="flex items-center gap-2 text-xs text-amber-300 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newUnitIsSpecial}
                    onChange={(e) => setNewUnitIsSpecial(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400"
                  />
                  <span>Tandai sebagai Event Spesial Akhir Pekan</span>
                </label>
                <span className="text-[10px] text-slate-500 block mt-1">
                  Jika dicentang, pulau ini akan tampil di tab khusus Event Spesial di Peta pemain.
                </span>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateUnitModal(false)}
                  className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-bold border-b-2 border-slate-950 active:translate-y-0.5"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={creatingUnit}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider border-b-4 border-emerald-700 active:translate-y-0.5 active:border-b-0 shadow transition-all disabled:opacity-50"
                >
                  {creatingUnit ? 'Menyimpan...' : 'Simpan Pulau Baru'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

