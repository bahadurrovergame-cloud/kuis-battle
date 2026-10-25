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
  BannedUser,
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
  Shuffle,
  ChevronDown,
  ChevronUp,
  Check,
  Users,
  Search,
  RefreshCw,
  CheckSquare,
  Square,
  ShieldAlert,
  ShieldCheck,
  GripVertical,
} from 'lucide-react';
import {
  seedDefaultUnitsAction,
  createUnitAction,
  updateUnitAction,
  deleteUnitAction,
  deleteLevelAction,
  reorderUnitsAction,
  getBannedUsersAction,
  unbanMultipleEmailsAction,
  getPlayersListAction,
  adjustPlayerResourcesAction,
  getExistingWordsStatsAction,
  deletePlayerAction,
  syncLeaderboardAction,
} from './actions';
import { buildCrosswordLayout } from '@/lib/crossword-generator';
import { unbanEmailAction } from '@/app/tts/actions';
import NumericInput from '@/components/NumericInput';

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

  // Sub-Tab Mode di Area Kelola Soal: 'ai' | 'manual'
  const [creationMode, setCreationMode] = useState<'ai' | 'manual'>('ai');

  // AI Generator Form (Minimalis + Pengaturan Lanjutan)
  const [aiTheme, setAiTheme] = useState('Budaya & Tradisi Nusantara');
  const [aiWordCount, setAiWordCount] = useState(4);
  const [showAiAdvanced, setShowAiAdvanced] = useState(false);
  const [aiLevelNumber, setAiLevelNumber] = useState(1);
  const [aiIsHard, setAiIsHard] = useState(false);
  const [aiHardTimer, setAiHardTimer] = useState<number>(60);
  const [aiDecayRate, setAiDecayRate] = useState<number>(4);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [filterPublishedOnly, setFilterPublishedOnly] = useState(false);
  const [existingWordsStats, setExistingWordsStats] = useState<{
    totalWords: number;
    publishedWords: number;
  }>({ totalWords: 0, publishedWords: 0 });

  // Live Preview Draft AI (Sebelum disimpan ke DB)
  interface AiDraftWord {
    word_number: number;
    direction: 'across' | 'down';
    start_row: number;
    start_col: number;
    word: string;
    clue: string;
    points: number;
  }
  interface AiDraftLevel {
    title: string;
    gridRows: number;
    gridCols: number;
    isHardZone: boolean;
    levelNumber: number;
    hardTimerOverride: number | null;
    decayRateOverride: number | null;
    words: AiDraftWord[];
    candidateWords?: { word: string; clue: string }[];
  }
  const [aiPreviewLevel, setAiPreviewLevel] = useState<AiDraftLevel | null>(null);
  const [savingDraftLevel, setSavingDraftLevel] = useState(false);

  // Modal Mini CRUD Manajemen Pulau / Unit
  const [showManageUnitsModal, setShowManageUnitsModal] = useState(false);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [editUnitNumber, setEditUnitNumber] = useState(1);
  const [editUnitTitle, setEditUnitTitle] = useState('');
  const [editUnitDescription, setEditUnitDescription] = useState('');
  const [editUnitColor, setEditUnitColor] = useState('#10b981');
  const [editUnitIsSpecial, setEditUnitIsSpecial] = useState(false);
  const [savingUnitId, setSavingUnitId] = useState<string | null>(null);
  const [deletingUnitId, setDeletingUnitId] = useState<string | null>(null);
  const [deletingLevelId, setDeletingLevelId] = useState<string | null>(null);
  const [showAdminGuide, setShowAdminGuide] = useState(false);

  // Level Editor State
  const [editorTitle, setEditorTitle] = useState('');
  const [editorLevelNumber, setEditorLevelNumber] = useState(1);
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
  const [draggedUnitIndex, setDraggedUnitIndex] = useState<number | null>(null);
  const [reorderingUnits, setReorderingUnits] = useState(false);

  // Banned Users & Anti-Cheat Management
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
  const [loadingBannedUsers, setLoadingBannedUsers] = useState(false);
  const [selectedBannedEmails, setSelectedBannedEmails] = useState<string[]>([]);
  const [unbanningBulk, setUnbanningBulk] = useState(false);
  const [unbanEmailInput, setUnbanEmailInput] = useState('');
  const [unbanningEmail, setUnbanningEmail] = useState(false);

  // Player Resource Top-up & Management
  const [playersList, setPlayersList] = useState<Profile[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [playerSearch, setPlayerSearch] = useState('');
  const [selectedPlayerForEdit, setSelectedPlayerForEdit] = useState<Profile | null>(null);
  const [customCoins, setCustomCoins] = useState<number>(0);
  const [customScore, setCustomScore] = useState<number>(0);
  const [customLives, setCustomLives] = useState<number>(5);
  const [adjustingResources, setAdjustingResources] = useState(false);
  const [playerToDelete, setPlayerToDelete] = useState<Profile | null>(null);
  const [deletingPlayerId, setDeletingPlayerId] = useState<string | null>(null);
  const [syncingLeaderboard, setSyncingLeaderboard] = useState(false);

  // Load Banned Users
  const loadBannedUsers = useCallback(async () => {
    setLoadingBannedUsers(true);
    try {
      const res = await getBannedUsersAction();
      if (res.success && res.bannedUsers) {
        setBannedUsers(res.bannedUsers);
      }
    } catch (err) {
      console.error('Error fetching banned users:', err);
    } finally {
      setLoadingBannedUsers(false);
    }
  }, []);

  // Load Players List
  const loadPlayers = useCallback(async (searchQuery = '') => {
    setLoadingPlayers(true);
    try {
      const res = await getPlayersListAction(searchQuery);
      if (res.success && res.players) {
        setPlayersList(res.players);
      }
    } catch (err) {
      console.error('Error fetching players:', err);
    } finally {
      setLoadingPlayers(false);
    }
  }, []);

  // Load Existing Words Stats for Anti-Duplicate
  const loadExistingWordsStats = useCallback(async () => {
    try {
      const res = await getExistingWordsStatsAction();
      if (res.success) {
        setExistingWordsStats({
          totalWords: res.totalWords,
          publishedWords: res.publishedWords,
        });
      }
    } catch (err) {
      console.error('Error fetching word stats:', err);
    }
  }, []);

  // Unban Single User
  const handleUnbanSingle = async (email: string) => {
    if (!email) return;
    setUnbanningEmail(true);
    try {
      const res = await unbanEmailAction(email);
      if (res.success) {
        setStatusMsg({ text: res.message || `Berhasil membuka blokir ${email}`, type: 'success' });
        setSelectedBannedEmails((prev) => prev.filter((e) => e !== email));
        loadBannedUsers();
      } else {
        setStatusMsg({ text: res.error || 'Gagal unban email', type: 'error' });
      }
    } catch {
      setStatusMsg({ text: 'Terjadi kesalahan jaringan.', type: 'error' });
    } finally {
      setUnbanningEmail(false);
    }
  };

  // Unban Bulk (Terpilih dari Checkbox)
  const handleUnbanBulk = async () => {
    if (selectedBannedEmails.length === 0) return;
    if (!confirm(`Buka blokir untuk ${selectedBannedEmails.length} pemain terpilih?`)) return;

    setUnbanningBulk(true);
    try {
      const res = await unbanMultipleEmailsAction(selectedBannedEmails);
      if (res.success) {
        setStatusMsg({ text: res.message || 'Pemain terpilih berhasil dibuka blokirnya.', type: 'success' });
        setSelectedBannedEmails([]);
        loadBannedUsers();
      } else {
        setStatusMsg({ text: res.error || 'Gagal membuka blokir pemain.', type: 'error' });
      }
    } catch {
      setStatusMsg({ text: 'Terjadi kesalahan jaringan.', type: 'error' });
    } finally {
      setUnbanningBulk(false);
    }
  };

  // Toggle All Checkboxes
  const handleToggleSelectAllBanned = () => {
    if (selectedBannedEmails.length === bannedUsers.length) {
      setSelectedBannedEmails([]);
    } else {
      setSelectedBannedEmails(bannedUsers.map((u) => u.email));
    }
  };

  // Toggle Single Checkbox
  const handleToggleBannedEmail = (email: string) => {
    setSelectedBannedEmails((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  };

  // Suntik Poin / Koin Cepat
  const handleAdjustResources = async (
    targetUserId: string,
    addCoins = 0,
    addScore = 0,
    refillLives = false
  ) => {
    setAdjustingResources(true);
    try {
      const payload: {
        userId: string;
        addCoins?: number;
        addScore?: number;
        setLives?: number;
      } = {
        userId: targetUserId,
      };
      if (addCoins !== 0) payload.addCoins = addCoins;
      if (addScore !== 0) payload.addScore = addScore;
      if (refillLives) payload.setLives = 5;

      const res = await adjustPlayerResourcesAction(payload);
      if (res.success && res.profile) {
        setStatusMsg({ text: res.message || 'Berhasil memperbarui sumber daya!', type: 'success' });
        if (profile && res.profile.id === profile.id) {
          setProfile(res.profile);
        }
        setPlayersList((prev) =>
          prev.map((p) => (p.id === res.profile!.id ? res.profile! : p))
        );
        if (selectedPlayerForEdit && selectedPlayerForEdit.id === res.profile.id) {
          setSelectedPlayerForEdit(res.profile);
        }
      } else {
        setStatusMsg({ text: res.error || 'Gagal memperbarui data pemain', type: 'error' });
      }
    } catch {
      setStatusMsg({ text: 'Terjadi kesalahan jaringan.', type: 'error' });
    } finally {
      setAdjustingResources(false);
    }
  };

  // Simpan Perubahan Custom Modal Pemain
  const handleSaveCustomPlayerResources = async () => {
    if (!selectedPlayerForEdit) return;
    setAdjustingResources(true);
    try {
      const res = await adjustPlayerResourcesAction({
        userId: selectedPlayerForEdit.id,
        setCoins: Number(customCoins),
        setScore: Number(customScore),
        setLives: Number(customLives),
      });

      if (res.success && res.profile) {
        setStatusMsg({ text: res.message || 'Perubahan pemain berhasil disimpan!', type: 'success' });
        if (profile && res.profile.id === profile.id) {
          setProfile(res.profile);
        }
        setPlayersList((prev) =>
          prev.map((p) => (p.id === res.profile!.id ? res.profile! : p))
        );
        setSelectedPlayerForEdit(null);
      } else {
        setStatusMsg({ text: res.error || 'Gagal menyimpan perubahan pemain', type: 'error' });
      }
    } catch {
      setStatusMsg({ text: 'Terjadi kesalahan jaringan.', type: 'error' });
    } finally {
      setAdjustingResources(false);
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

      // Ambil Banned Users & Players List & Stats Kata Anti-Duplikat
      loadBannedUsers();
      loadPlayers();
      loadExistingWordsStats();
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

  // Otomatis sinkronkan nomor level AI berikutnya agar tidak bentrok dengan level yang sudah ada di pulau
  useEffect(() => {
    if (levels && levels.length > 0) {
      const maxNum = Math.max(0, ...levels.map((l) => l.level_number));
      setAiLevelNumber(maxNum + 1);
    } else {
      setAiLevelNumber(1);
    }
  }, [levels]);

  // 3. Select Level untuk Diedit
  const selectLevelForEdit = async (lvl: TTSLevel) => {
    setSelectedLevelId(lvl.id);
    setEditorLevelNumber(lvl.level_number);
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

  // 4c. Tambah Pulau Tematik Baru (Browser Client First + Fallback ke Server Action)
  const handleCreateUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUnitTitle.trim()) {
      alert('Masukkan nama/judul pulau.');
      return;
    }
    setCreatingUnit(true);
    try {
      const supabase = createHubBrowserClient();
      const { data: clientUnit, error: clientErr } = await supabase
        .from('tts_units')
        .insert({
          unit_number: newUnitNumber,
          title: newUnitTitle.trim(),
          description: newUnitDescription.trim(),
          theme_color: newUnitColor,
          is_active: true,
          is_special_event: newUnitIsSpecial,
        })
        .select()
        .single();

      if (!clientErr && clientUnit) {
        setUnits((prev) =>
          [...prev, clientUnit as TTSUnit].sort((a, b) => a.unit_number - b.unit_number)
        );
        setSelectedUnitId(clientUnit.id);
        setShowCreateUnitModal(false);
        setNewUnitTitle('');
        setNewUnitDescription('');
        setStatusMsg({
          text: `✓ Berhasil menambahkan Pulau Baru "${clientUnit.title}"!`,
          type: 'success',
        });
        return;
      }

      // Fallback ke Server Action jika query client ditolak
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
        alert(`Gagal membuat pulau: ${res.error || clientErr?.message || 'Terjadi kesalahan'}`);
      }
    } catch (err: any) {
      alert(`Terjadi kesalahan: ${err?.message}`);
    } finally {
      setCreatingUnit(false);
    }
  };

  // 5. Generate TTS dengan AI: Menghasilkan Live Preview Terlebih Dahulu (Anti-Direct Save)
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
          wordCount: aiWordCount,
          filterPublishedOnly,
        }),
      });

      const json = await res.json();

      if (!json.success || !json.data) {
        setStatusMsg({ text: json.error || 'Gagal generate soal via AI.', type: 'error' });
        setGeneratingAi(false);
        return;
      }

      const generated = json.data;

      // SET KE LIVE PREVIEW DRAFT: Tidak langsung disimpan ke database!
      setAiPreviewLevel({
        title: generated.title || `Level ${aiLevelNumber}: ${aiTheme}`,
        gridRows: generated.gridRows || 8,
        gridCols: generated.gridCols || 8,
        isHardZone: aiIsHard,
        levelNumber: aiLevelNumber,
        hardTimerOverride: aiIsHard ? aiHardTimer : null,
        decayRateOverride: aiIsHard ? aiDecayRate : null,
        candidateWords: generated.candidateWords || [],
        words: generated.words.map((w: any) => ({
          word_number: w.word_number,
          direction: w.direction,
          start_row: w.start_row,
          start_col: w.start_col,
          word: String(w.word).toUpperCase().replace(/[^A-Z]/g, ''),
          clue: w.clue,
          points: w.points || 100,
        })),
      });

      const metaInfo = json.meta?.excludedWordsCount
        ? ` (🛡️ ${json.meta.excludedWordsCount} kata lama berhasil disaring agar tidak kembar)`
        : '';

      setStatusMsg({
        text: `✨ Kisi-kisi TTS berhasil diracik AI!${metaInfo} Silakan tinjau Live Preview di samping, kocok ulang posisi jika perlu, lalu simpan.`,
        type: 'success',
      });
    } catch {
      setStatusMsg({ text: 'Koneksi ke endpoint AI gagal.', type: 'error' });
    } finally {
      setGeneratingAi(false);
    }
  };

  // 5b. Kocok Ulang Posisi (Alternatif Kombinasi Baru atau Rotasi Grid 90 Derajat secara Instan di Frontend)
  const handleShuffleAiPositions = () => {
    if (!aiPreviewLevel) return;

    // Jika tersedia candidate words dari AI, coba buat susunan jaring persilangan baru secara instan
    if (aiPreviewLevel.candidateWords && aiPreviewLevel.candidateWords.length >= 3) {
      const newLayout = buildCrosswordLayout(
        aiPreviewLevel.title,
        aiPreviewLevel.candidateWords,
        aiPreviewLevel.words.length
      );
      if (newLayout) {
        setAiPreviewLevel({
          ...aiPreviewLevel,
          gridRows: newLayout.gridRows,
          gridCols: newLayout.gridCols,
          words: newLayout.words.map((w) => ({
            word_number: w.word_number,
            direction: w.direction,
            start_row: w.start_row,
            start_col: w.start_col,
            word: w.word,
            clue: w.clue,
            points: w.points,
          })),
        });
        setStatusMsg({
          text: '🎲 Susunan persilangan TTS berhasil dikocok ke variasi baru!',
          type: 'success',
        });
        return;
      }
    }

    // Fallback: Rotasi Grid 90 Derajat secara matematis
    const shuffledWords = aiPreviewLevel.words.map((w) => ({
      ...w,
      direction: (w.direction === 'across' ? 'down' : 'across') as 'across' | 'down',
      start_row: w.start_col,
      start_col: w.start_row,
    }));

    setAiPreviewLevel({
      ...aiPreviewLevel,
      words: shuffledWords,
      gridRows: aiPreviewLevel.gridCols,
      gridCols: aiPreviewLevel.gridRows,
    });

    setStatusMsg({
      text: '🎲 Posisi kisi-kisi berhasil dikocok ulang!',
      type: 'success',
    });
  };

  // 5c. Simpan Rancangan Level AI ke Database Supabase
  const handleSaveAiDraftToDb = async () => {
    if (!aiPreviewLevel || !selectedUnitId) return;
    setSavingDraftLevel(true);
    setStatusMsg(null);

    try {
      const supabase = createHubBrowserClient();

      // 1. Validasi bentrok nomor level (Cegah error uq_unit_level)
      const existingNumbers = new Set(levels.map((l) => l.level_number));
      let targetLevelNum = aiPreviewLevel.levelNumber;
      if (existingNumbers.has(targetLevelNum)) {
        targetLevelNum = (Math.max(0, ...levels.map((l) => l.level_number))) + 1;
      }

      let targetTitle = aiPreviewLevel.title;
      if (targetTitle.startsWith(`Level ${aiPreviewLevel.levelNumber}:`)) {
        targetTitle = targetTitle.replace(`Level ${aiPreviewLevel.levelNumber}:`, `Level ${targetLevelNum}:`);
      }

      // Buat Level Baru dalam status DRAFT
      const { data: newLevel, error: lvlErr } = await supabase
        .from('tts_levels')
        .insert({
          unit_id: selectedUnitId,
          level_number: targetLevelNum,
          title: targetTitle,
          grid_rows: aiPreviewLevel.gridRows,
          grid_cols: aiPreviewLevel.gridCols,
          is_hard_zone: aiPreviewLevel.isHardZone,
          hard_timer_override: aiPreviewLevel.hardTimerOverride,
          decay_rate_override: aiPreviewLevel.decayRateOverride,
          branch_direction: 'main',
          status: 'draft',
        })
        .select()
        .single();

      if (lvlErr || !newLevel) {
        setStatusMsg({ text: `Gagal membuat level: ${lvlErr?.message}`, type: 'error' });
        setSavingDraftLevel(false);
        return;
      }

      // 2. Masukkan kata-kata hasil preview ke tabel tts_words
      const wordsToInsert = aiPreviewLevel.words.map((w) => ({
        level_id: newLevel.id,
        word_number: w.word_number,
        direction: w.direction,
        start_row: w.start_row,
        start_col: w.start_col,
        word: w.word,
        clue: w.clue,
        points: w.points || 100,
      }));

      const { error: wordsErr } = await supabase.from('tts_words').insert(wordsToInsert);

      if (wordsErr) {
        setStatusMsg({ text: `Gagal menyimpan kata: ${wordsErr.message}`, type: 'error' });
      } else {
        setStatusMsg({
          text: `✓ Level "${newLevel.title}" (${wordsToInsert.length} kata) berhasil disimpan ke database!`,
          type: 'success',
        });
        setAiPreviewLevel(null);
        await loadLevels(selectedUnitId);
        loadExistingWordsStats();
        selectLevelForEdit(newLevel);
        setCreationMode('manual');
      }
    } catch {
      setStatusMsg({ text: 'Terjadi kesalahan jaringan saat menyimpan level.', type: 'error' });
    } finally {
      setSavingDraftLevel(false);
    }
  };

  // 5d. CRUD Pulau Tematik: Mulai Edit Unit
  const handleStartEditUnit = (u: TTSUnit) => {
    setEditingUnitId(u.id);
    setEditUnitNumber(u.unit_number);
    setEditUnitTitle(u.title);
    setEditUnitDescription(u.description || '');
    setEditUnitColor(u.theme_color || '#10b981');
    setEditUnitIsSpecial(u.is_special_event || false);
  };

  // 5e. CRUD Pulau Tematik: Simpan Perubahan Edit
  const handleSaveEditUnit = async (unitId: string) => {
    if (!editUnitTitle.trim()) {
      alert('Judul pulau tidak boleh kosong.');
      return;
    }
    setSavingUnitId(unitId);
    try {
      const supabase = createHubBrowserClient();
      const { data: updatedUnit, error: clientErr } = await supabase
        .from('tts_units')
        .update({
          unit_number: editUnitNumber,
          title: editUnitTitle.trim(),
          description: editUnitDescription.trim(),
          theme_color: editUnitColor,
          is_special_event: editUnitIsSpecial,
        })
        .eq('id', unitId)
        .select()
        .single();

      if (!clientErr && updatedUnit) {
        setUnits((prev) =>
          prev
            .map((u) => (u.id === unitId ? (updatedUnit as TTSUnit) : u))
            .sort((a, b) => a.unit_number - b.unit_number)
        );
        setEditingUnitId(null);
        setStatusMsg({ text: `✓ Pulau "${updatedUnit.title}" berhasil diperbarui!`, type: 'success' });
        return;
      }

      const res = await updateUnitAction({
        id: unitId,
        unit_number: editUnitNumber,
        title: editUnitTitle.trim(),
        description: editUnitDescription.trim(),
        theme_color: editUnitColor,
        is_special_event: editUnitIsSpecial,
      });

      if (res.success && res.unit) {
        setUnits((prev) =>
          prev
            .map((u) => (u.id === unitId ? (res.unit as TTSUnit) : u))
            .sort((a, b) => a.unit_number - b.unit_number)
        );
        setEditingUnitId(null);
        setStatusMsg({ text: `✓ Pulau "${res.unit.title}" berhasil diperbarui!`, type: 'success' });
      } else {
        alert(`Gagal update pulau: ${res.error || clientErr?.message || 'Terjadi kesalahan'}`);
      }
    } catch {
      alert('Terjadi kesalahan jaringan.');
    } finally {
      setSavingUnitId(null);
    }
  };

  // 5f. CRUD Pulau Tematik: Hapus Unit (Otomatis Rapikan Nomor Urut yang Tersisa)
  const handleDeleteUnit = async (u: TTSUnit) => {
    if (!confirm(`Hapus Pulau "${u.title}" beserta seluruh level di dalamnya? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }
    setDeletingUnitId(u.id);
    try {
      const res = await deleteUnitAction(u.id);
      if (res.success) {
        const updated = res.units || units.filter((unit) => unit.id !== u.id);
        setUnits(updated);
        if (selectedUnitId === u.id) {
          setSelectedUnitId(updated[0]?.id || '');
        }
        setStatusMsg({ text: `✓ Pulau "${u.title}" berhasil dihapus dan urutan nomor dirapikan.`, type: 'success' });
      } else {
        alert(`Gagal menghapus pulau: ${res.error || 'Terjadi kesalahan'}`);
      }
    } catch {
      alert('Terjadi kesalahan jaringan.');
    } finally {
      setDeletingUnitId(null);
    }
  };

  // 5g. Urutkan & Rapikan Nomor Pulau (Drag & Drop / Reorder)
  const saveUnitsOrder = async (orderedUnits: TTSUnit[]) => {
    setReorderingUnits(true);
    try {
      const ids = orderedUnits.map((u) => u.id);
      const res = await reorderUnitsAction(ids);
      if (res.success && res.units) {
        setUnits(res.units);
        setStatusMsg({ text: '✓ Urutan nomor pulau berhasil disimpan ke database!', type: 'success' });
      } else {
        setStatusMsg({ text: res.error || 'Gagal menyimpan urutan pulau.', type: 'error' });
      }
    } catch {
      setStatusMsg({ text: 'Terjadi kesalahan jaringan saat menyimpan urutan pulau.', type: 'error' });
    } finally {
      setReorderingUnits(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedUnitIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedUnitIndex === null || draggedUnitIndex === targetIndex) return;

    const newUnits = [...units];
    const [draggedItem] = newUnits.splice(draggedUnitIndex, 1);
    newUnits.splice(targetIndex, 0, draggedItem);
    setDraggedUnitIndex(null);

    // Update state tampilan instan
    setUnits(newUnits);
    // Simpan ke database
    await saveUnitsOrder(newUnits);
  };

  const handleMoveUnit = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= units.length) return;

    const newUnits = [...units];
    const [item] = newUnits.splice(index, 1);
    newUnits.splice(targetIndex, 0, item);

    setUnits(newUnits);
    await saveUnitsOrder(newUnits);
  };

  const handleAutoReorderUnits = async () => {
    await saveUnitsOrder(units);
  };


  // 5f. Hapus Level Beserta Seluruh Kata Soal Terkait
  const handleDeleteLevel = async (levelId: string, levelTitle: string) => {
    if (!confirm(`Yakin ingin menghapus Level "${levelTitle}"? Seluruh kata soal di level ini akan dihapus permanen.`)) {
      return;
    }
    setDeletingLevelId(levelId);
    try {
      const supabase = createHubBrowserClient();
      await supabase.from('tts_words').delete().eq('level_id', levelId);
      const { error } = await supabase.from('tts_levels').delete().eq('id', levelId);

      if (error) {
        const res = await deleteLevelAction(levelId);
        if (!res.success) {
          alert(`Gagal menghapus level: ${res.error}`);
          return;
        }
      }

      setStatusMsg({ text: `✓ Level "${levelTitle}" berhasil dihapus.`, type: 'success' });
      if (selectedLevelId === levelId) {
        setSelectedLevelId(null);
        setWords([]);
      }
      if (selectedUnitId) {
        await loadLevels(selectedUnitId);
      }
    } catch (err: any) {
      alert(`Terjadi kesalahan: ${err?.message}`);
    } finally {
      setDeletingLevelId(null);
    }
  };

  // 5g. Buat Level Kosong Baru secara Manual
  const handleCreateBlankLevel = async () => {
    if (!selectedUnitId) return;
    const nextLvlNum = levels.length > 0 ? Math.max(...levels.map((l) => l.level_number)) + 1 : 1;
    const supabase = createHubBrowserClient();
    const { data: newLvl, error } = await supabase
      .from('tts_levels')
      .insert({
        unit_id: selectedUnitId,
        level_number: nextLvlNum,
        title: `Level ${nextLvlNum}: Level Baru`,
        grid_rows: 8,
        grid_cols: 8,
        is_hard_zone: false,
        branch_direction: 'main',
        status: 'draft',
      })
      .select()
      .single();

    if (error) {
      alert(`Gagal membuat level: ${error.message}`);
    } else if (newLvl) {
      await loadLevels(selectedUnitId);
      selectLevelForEdit(newLvl);
      setStatusMsg({ text: `✓ Level ${nextLvlNum} baru berhasil dibuat!`, type: 'success' });
    }
  };


  // 5h. Rapikan Nomor Urut Level (1, 2, 3...)
  const handleReorderLevels = async () => {
    if (!selectedUnitId || levels.length === 0) return;
    if (!confirm('Rapikan nomor urut seluruh level di pulau ini agar berurutan mulai dari 1, 2, 3...?')) return;
    try {
      const supabase = createHubBrowserClient();
      const sorted = [...levels].sort((a, b) => a.level_number - b.level_number);

      // Pass 1: Hindari bentrok uq_unit_level dengan offset sementara
      for (let i = 0; i < sorted.length; i++) {
        await supabase.from('tts_levels').update({ level_number: 10000 + i }).eq('id', sorted[i].id);
      }
      // Pass 2: Set nomor urut 1, 2, 3...
      for (let i = 0; i < sorted.length; i++) {
        await supabase.from('tts_levels').update({ level_number: i + 1 }).eq('id', sorted[i].id);
      }

      setStatusMsg({ text: '✓ Seluruh level di pulau ini berhasil diurutkan kembali (1, 2, 3...)!', type: 'success' });
      await loadLevels(selectedUnitId);
    } catch (err: any) {
      alert(`Gagal merapikan nomor: ${err?.message}`);
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
          level_number: editorLevelNumber,
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

  // Hapus Pemain Terdaftar
  const handleDeletePlayer = async (targetUserId: string, targetUsername: string) => {
    setDeletingPlayerId(targetUserId);
    try {
      const res = await deletePlayerAction(targetUserId);
      if (res.success) {
        setStatusMsg({ type: 'success', text: res.message || `✓ Berhasil menghapus pemain @${targetUsername}.` });
        setPlayerToDelete(null);
        loadPlayers(playerSearch);
        loadLeaderboard();
      } else {
        alert(res.error || 'Gagal menghapus pemain.');
      }
    } catch {
      alert('Terjadi kesalahan saat menghapus pemain.');
    } finally {
      setDeletingPlayerId(null);
    }
  };

  // Sinkronisasi Klasemen Manual
  const handleSyncLeaderboard = async () => {
    setSyncingLeaderboard(true);
    try {
      const res = await syncLeaderboardAction();
      if (res.success) {
        setStatusMsg({ type: 'success', text: `✓ Klasemen berhasil disinkronkan (${res.syncedCount || 0} pemain).` });
        loadLeaderboard();
      } else {
        alert(res.error || 'Gagal menyinkronkan klasemen.');
      }
    } catch {
      alert('Terjadi kesalahan saat menyinkronkan klasemen.');
    } finally {
      setSyncingLeaderboard(false);
    }
  };

  // 9. Fetch Live Leaderboard (Menggabungkan tts_leaderboard dengan seluruh profil pemain)
  const loadLeaderboard = useCallback(async () => {
    try {
      const supabase = createHubBrowserClient();
      const seasonNum = settings.current_season || 1;

      // 1. Ambil data dari tts_leaderboard
      const { data: lbData } = await supabase
        .from('tts_leaderboard')
        .select('*, profiles(*)')
        .eq('season_number', seasonNum)
        .order('total_score', { ascending: false })
        .order('total_time_taken', { ascending: true })
        .limit(50);

      // 2. Ambil data dari profiles untuk memastikan pemain dengan skor selalu tampil
      const { data: allProfs } = await supabase
        .from('profiles')
        .select('*')
        .order('total_score', { ascending: false })
        .limit(50);

      const existingUserIds = new Set((lbData || []).map((e) => e.user_id));
      const mergedList: TTSLeaderboardEntry[] = [...((lbData as TTSLeaderboardEntry[]) || [])];

      // Sisipkan profil pemain yang belum ada di tts_leaderboard
      (allProfs || []).forEach((prof) => {
        if (!existingUserIds.has(prof.id)) {
          mergedList.push({
            id: prof.id,
            user_id: prof.id,
            season_number: seasonNum,
            total_score: prof.total_score || 0,
            total_time_taken: 0,
            levels_completed: (prof.total_score || 0) > 0 ? 1 : 0,
            updated_at: prof.updated_at,
            profiles: prof as Profile,
          });
        }
      });

      // Urutkan kembali berdasarkan total_score tertinggi
      mergedList.sort((a, b) => (b.total_score || 0) - (a.total_score || 0));

      // Filter: Hanya pemain non-admin yang masuk ke papan klasemen kompetisi
      const nonAdminMerged = mergedList.filter((entry) => {
        const p = entry.profiles;
        if (!p) return true;
        if (p.role === 'admin') return false;
        if (p.username && p.username.toLowerCase().includes('admin')) return false;
        return true;
      });

      setLeaderboard(nonAdminMerged);
    } catch (err) {
      console.error('Error loading leaderboard:', err);
    }
  }, [settings.current_season]);

  useEffect(() => {
    if (activeTab === 'leaderboard') {
      loadLeaderboard();
    }
  }, [activeTab, loadLeaderboard]);

  // Visual Map Cells untuk Live Preview Draft AI
  const aiPreviewCellsMap = useMemo(() => {
    if (!aiPreviewLevel) return {};
    const map: Record<string, { letter: string; num?: number }> = {};
    aiPreviewLevel.words.forEach((w) => {
      for (let i = 0; i < w.word.length; i++) {
        const r = w.direction === 'across' ? w.start_row : w.start_row + i;
        const c = w.direction === 'across' ? w.start_col + i : w.start_col;
        const key = `${r},${c}`;
        const existing = map[key];
        const num = i === 0 ? w.word_number : existing?.num;
        map[key] = { letter: w.word[i], num };
      }
    });
    return map;
  }, [aiPreviewLevel]);

  // Visual Map Cells untuk Mobile Preview
  const previewCellsMap = useMemo(() => {
    const map: Record<string, { letter: string; num?: number }> = {};
    words.forEach((w) => {
      for (let i = 0; i < w.word.length; i++) {
        const r = w.direction === 'across' ? w.start_row : w.start_row + i;
        const c = w.direction === 'across' ? w.start_col + i : w.start_col;
        const key = `${r},${c}`;
        const existing = map[key];
        const num = i === 0 ? w.word_number : existing?.num;
        map[key] = { letter: w.word[i], num };
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
          <div className="space-y-6">
            <div className="mt-6 bg-[#111726] border-2 border-slate-700 rounded-3xl p-6 sm:p-8 shadow-[0_6px_0_#070a12]">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-amber-400" />
                  <span>Kontrol Parameter Game</span>
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
                <NumericInput
                  min={10}
                  fallback={100}
                  value={settings.base_points_per_word}
                  onChange={(val) => setSettings({ ...settings, base_points_per_word: val })}
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
                <NumericInput
                  min={0}
                  fallback={2}
                  value={settings.decay_rate_per_sec}
                  onChange={(val) => setSettings({ ...settings, decay_rate_per_sec: val })}
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
                <NumericInput
                  min={10}
                  max={300}
                  fallback={60}
                  value={settings.hard_timer_seconds}
                  onChange={(val) => setSettings({ ...settings, hard_timer_seconds: val })}
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
                <NumericInput
                  min={0}
                  fallback={20}
                  value={settings.coins_per_level}
                  onChange={(val) => setSettings({ ...settings, coins_per_level: val })}
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
                <NumericInput
                  min={0}
                  fallback={15}
                  value={settings.hint_price_coins}
                  onChange={(val) => setSettings({ ...settings, hint_price_coins: val })}
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
                <NumericInput
                  min={0}
                  fallback={25}
                  value={settings.freeze_price_coins}
                  onChange={(val) => setSettings({ ...settings, freeze_price_coins: val })}
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
                <NumericInput
                  min={1}
                  fallback={15}
                  value={settings.life_regen_minutes}
                  onChange={(val) => setSettings({ ...settings, life_regen_minutes: val })}
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
                <NumericInput
                  min={0}
                  fallback={50}
                  value={settings.coins_refill_lives_price}
                  onChange={(val) => setSettings({ ...settings, coins_refill_lives_price: val })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm font-mono font-bold text-yellow-400"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Koin untuk membeli 5 nyawa penuh seketika saat kehabisan.
                </span>
              </div>
            </form>
          </div>

          {/* ================================================================ */}
          {/* 👑 SUNTIK POIN & KOIN (SULTAN ADMIN & KELOLA PEMAIN)            */}
          {/* ================================================================ */}
          <div className="mt-6 bg-[#111726] border-2 border-amber-500/40 rounded-3xl p-6 sm:p-8 shadow-[0_6px_0_#070a12] space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  <Crown className="w-5 h-5 text-amber-400" />
                  <span>Suntik Koin, Skor, & Nyawa Pemain</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1 font-medium">
                  Tambahkan koin, skor, dan nyawa seketika baik untuk akun Admin Anda sendiri maupun untuk pemain lain.
                </p>
              </div>

              <button
                type="button"
                onClick={() => loadPlayers(playerSearch)}
                disabled={loadingPlayers}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border-b-2 border-slate-950 active:translate-y-0.5 transition-all flex items-center gap-1.5 shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingPlayers ? 'animate-spin' : ''}`} />
                <span>Segarkan Data</span>
              </button>
            </div>

            {/* Bagian A: Akun Admin Sendiri */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-950/30 via-slate-900 to-slate-900 border-2 border-amber-500/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border-2 border-amber-500/60 flex items-center justify-center text-2xl shadow-inner">
                    👑
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-white">Akun Admin Saya</span>
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-[10px] font-mono font-black text-amber-400 uppercase">
                        @{profile?.username}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      Gunakan untuk uji coba game, unlimited power-up, atau demonstrasi.
                    </span>
                  </div>
                </div>

                {/* Status Angka Saat Ini */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono font-black text-amber-400 flex items-center gap-1.5 shadow-sm">
                    <Coins className="w-3.5 h-3.5 fill-current" />
                    <span>{profile?.coins ?? 0}</span>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono font-black text-emerald-400 flex items-center gap-1.5 shadow-sm">
                    <Trophy className="w-3.5 h-3.5" />
                    <span>{profile?.total_score ?? 0}</span>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono font-black text-rose-400 flex items-center gap-1.5 shadow-sm">
                    <Heart className="w-3.5 h-3.5 fill-current" />
                    <span>{profile?.lives ?? 5}/{profile?.max_lives ?? 5}</span>
                  </div>
                </div>
              </div>

              {/* Tombol Suntik Cepat Admin */}
              <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-800/80">
                <span className="text-[11px] font-bold text-slate-400 mr-1">Isi Cepat:</span>
                <button
                  type="button"
                  disabled={adjustingResources || !profile}
                  onClick={() => handleAdjustResources(profile!.id, 100, 0)}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 text-xs font-mono font-bold active:translate-y-0.5 transition-all"
                >
                  +100 🪙
                </button>
                <button
                  type="button"
                  disabled={adjustingResources || !profile}
                  onClick={() => handleAdjustResources(profile!.id, 500, 0)}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 text-xs font-mono font-bold active:translate-y-0.5 transition-all"
                >
                  +500 🪙
                </button>
                <button
                  type="button"
                  disabled={adjustingResources || !profile}
                  onClick={() => handleAdjustResources(profile!.id, 0, 1000)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 text-xs font-mono font-bold active:translate-y-0.5 transition-all"
                >
                  +1.000 ⭐
                </button>
                <button
                  type="button"
                  disabled={adjustingResources || !profile}
                  onClick={() => handleAdjustResources(profile!.id, 0, 5000)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 text-xs font-mono font-bold active:translate-y-0.5 transition-all"
                >
                  +5.000 ⭐
                </button>
                <button
                  type="button"
                  disabled={adjustingResources || !profile}
                  onClick={() => handleAdjustResources(profile!.id, 0, 0, true)}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/50 text-rose-300 text-xs font-bold active:translate-y-0.5 transition-all"
                >
                  ❤️ Pulihkan 5 Nyawa
                </button>
                <button
                  type="button"
                  disabled={!profile}
                  onClick={() => {
                    setSelectedPlayerForEdit(profile);
                    setCustomCoins(profile?.coins ?? 0);
                    setCustomScore(profile?.total_score ?? 0);
                    setCustomLives(profile?.lives ?? 5);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs font-bold active:translate-y-0.5 transition-all sm:ml-auto"
                >
                  ✏️ Atur Angka Khusus...
                </button>
              </div>
            </div>

            {/* Bagian B: Daftar Pemain Lain */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-black text-slate-200 uppercase tracking-wider">
                    Daftar Pemain Terdaftar ({playersList.length})
                  </span>
                </div>

                {/* Pencarian Pemain */}
                <div className="flex items-center gap-2 max-w-xs w-full">
                  <div className="relative w-full">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Cari username..."
                      value={playerSearch}
                      onChange={(e) => {
                        setPlayerSearch(e.target.value);
                        loadPlayers(e.target.value);
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>
              </div>

              {/* Tabel Pemain */}
              <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900/90 text-slate-400 font-bold border-b border-slate-800 text-[11px] uppercase tracking-wider">
                      <th className="py-2.5 px-4">Pemain</th>
                      <th className="py-2.5 px-3">Role</th>
                      <th className="py-2.5 px-3">Koin (🪙)</th>
                      <th className="py-2.5 px-3">Total Skor (⭐)</th>
                      <th className="py-2.5 px-3">Nyawa (❤️)</th>
                      <th className="py-2.5 px-4 text-right">Aksi Suntik Sumber Daya</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {playersList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-6 text-slate-500 text-xs">
                          {loadingPlayers ? 'Memuat data pemain...' : 'Tidak ada pemain yang sesuai pencarian.'}
                        </td>
                      </tr>
                    ) : (
                      playersList.map((p) => {
                        const isMe = profile && p.id === profile.id;
                        return (
                          <tr key={p.id} className={`hover:bg-slate-900/40 transition-colors ${isMe ? 'bg-amber-500/5' : ''}`}>
                            <td className="py-2.5 px-4">
                              <div className="flex items-center gap-2">
                                <span className="text-base">{p.avatar_url || '⚡'}</span>
                                <div>
                                  <span className="font-bold text-white block">@{p.username}</span>
                                  {isMe && <span className="text-[10px] text-amber-400 font-bold">(Akun Anda)</span>}
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase ${
                                  p.role === 'admin'
                                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                                    : 'bg-slate-800 text-slate-300'
                                }`}
                              >
                                {p.role}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-amber-400">
                              {p.coins ?? 0}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-emerald-400">
                              {p.total_score ?? 0}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-rose-400">
                              {p.lives ?? 5}/{p.max_lives ?? 5}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  disabled={adjustingResources}
                                  onClick={() => handleAdjustResources(p.id, 100, 0)}
                                  className="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-mono font-bold"
                                  title="Tambah +100 Koin"
                                >
                                  +100 🪙
                                </button>
                                <button
                                  type="button"
                                  disabled={adjustingResources}
                                  onClick={() => handleAdjustResources(p.id, 0, 500)}
                                  className="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono font-bold"
                                  title="Tambah +500 Skor"
                                >
                                  +500 ⭐
                                </button>
                                <button
                                  type="button"
                                  disabled={adjustingResources}
                                  onClick={() => handleAdjustResources(p.id, 0, 0, true)}
                                  className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[10px] font-bold"
                                  title="Isi Nyawa 5/5"
                                >
                                  ❤️ 5
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedPlayerForEdit(p);
                                    setCustomCoins(p.coins ?? 0);
                                    setCustomScore(p.total_score ?? 0);
                                    setCustomLives(p.lives ?? 5);
                                  }}
                                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold border border-slate-700"
                                  title="Atur angka khusus"
                                >
                                  ✏️ Atur
                                </button>
                                {!isMe && (
                                  <button
                                    type="button"
                                    disabled={deletingPlayerId === p.id}
                                    onClick={() => setPlayerToDelete(p)}
                                    className="px-2 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-700/60 text-rose-300 hover:text-white text-[10px] font-bold transition flex items-center gap-1 shadow-sm disabled:opacity-50"
                                    title="Hapus Pemain Secara Permanen"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    <span>Hapus</span>
                                  </button>
                                )}
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

          {/* ================================================================ */}
          {/* 🚫 DAFTAR PEMAIN DIBLOKIR & BUKA BLOKIR (ANTI-CHEAT)            */}
          {/* ================================================================ */}
          <div className="mt-6 bg-[#111726] border-2 border-rose-500/40 rounded-3xl p-6 sm:p-8 shadow-[0_6px_0_#070a12] space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-rose-500" />
                  <span>Daftar Pemain yang Diblokir (Anti-Cheat)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1 font-medium">
                  Pemain yang terdeteksi berpindah tab atau curang 3x otomatis dimusnahkan dan masuk ke daftar ini.
                  Centang pemain di bawah untuk membuka blokiran (unban) massal atau klik buka blokir perorangan.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="px-3 py-1.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-xs font-mono font-black text-rose-400">
                  {bannedUsers.length} Pemain Diblokir
                </span>
                <button
                  type="button"
                  onClick={loadBannedUsers}
                  disabled={loadingBannedUsers}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border-b-2 border-slate-950 active:translate-y-0.5 transition-all flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingBannedUsers ? 'animate-spin' : ''}`} />
                  <span>Segarkan</span>
                </button>
              </div>
            </div>

            {/* Aksi Massal Checkbox */}
            {bannedUsers.length > 0 && (
              <div className="flex items-center justify-between gap-3 p-3 bg-slate-900/90 border border-slate-800 rounded-2xl flex-wrap">
                <button
                  type="button"
                  onClick={handleToggleSelectAllBanned}
                  className="flex items-center gap-2 text-xs font-bold text-slate-300 hover:text-white"
                >
                  {selectedBannedEmails.length === bannedUsers.length && bannedUsers.length > 0 ? (
                    <CheckSquare className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-500" />
                  )}
                  <span>
                    Pilih Semua ({selectedBannedEmails.length}/{bannedUsers.length})
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleUnbanBulk}
                  disabled={selectedBannedEmails.length === 0 || unbanningBulk}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs transition-all shadow-md disabled:opacity-40 flex items-center gap-1.5 active:translate-y-0.5 border-b-2 border-rose-800 active:border-b-0"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {unbanningBulk
                      ? 'Membuka Blokir...'
                      : `Buka Blokir Terpilih (${selectedBannedEmails.length})`}
                  </span>
                </button>
              </div>
            )}

            {/* Tabel Daftar Pemain Banned */}
            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900/90 text-slate-400 font-bold border-b border-slate-800 text-[11px] uppercase tracking-wider">
                    <th className="py-2.5 px-3 w-10 text-center">Pilih</th>
                    <th className="py-2.5 px-4">Email Pemain</th>
                    <th className="py-2.5 px-4">Alasan Pemblokiran</th>
                    <th className="py-2.5 px-3">Waktu Diblokir</th>
                    <th className="py-2.5 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {bannedUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-slate-400 text-xs">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <span className="text-2xl">🎉</span>
                          <span className="font-bold text-slate-300">
                            Tidak ada pemain yang diblokir saat ini.
                          </span>
                          <span className="text-[11px] text-slate-500">
                            Semua akun pemain berada dalam status bersih.
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    bannedUsers.map((b) => {
                      const isSelected = selectedBannedEmails.includes(b.email);
                      return (
                        <tr
                          key={b.id || b.email}
                          className={`hover:bg-slate-900/40 transition-colors ${
                            isSelected ? 'bg-rose-950/20' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleBannedEmail(b.email)}
                              className="w-4 h-4 accent-rose-500 rounded cursor-pointer"
                            />
                          </td>
                          <td className="py-2.5 px-4 font-mono font-bold text-rose-300">
                            {b.email}
                          </td>
                          <td className="py-2.5 px-4 text-slate-300 text-[11px]">
                            {b.reason || 'Terdeteksi manipulasi game/pindah layar 3x'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                            {b.banned_at
                              ? new Date(b.banned_at).toLocaleString('id-ID', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '-'}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleUnbanSingle(b.email)}
                              disabled={unbanningEmail}
                              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all active:translate-y-0.5 shadow disabled:opacity-50"
                            >
                              Buka Blokir (Unban)
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Input Manual Unban (Sebagai Cadangan) */}
            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl flex flex-col sm:flex-row items-center gap-3">
              <span className="text-xs text-slate-400 font-bold shrink-0">
                Unban manual via email:
              </span>
              <input
                type="email"
                placeholder="Masukkan email pemain..."
                value={unbanEmailInput}
                onChange={(e) => setUnbanEmailInput(e.target.value)}
                className="flex-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-rose-400"
              />
              <button
                type="button"
                onClick={() => handleUnbanSingle(unbanEmailInput.trim())}
                disabled={unbanningEmail || !unbanEmailInput.trim()}
                className="w-full sm:w-auto py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-all disabled:opacity-50 shrink-0 border border-slate-700"
              >
                Buka Blokir Manual
              </button>
            </div>
          </div>
        </div>
      )}

        {/* ================================================================== */}
        {/* TAB 2: MANAJEMEN LEVEL & AI GENERATOR GEMINI 2.5 FLASH             */}
        {/* ================================================================== */}
        {activeTab === 'levels' && (
          <div className="mt-6 space-y-6">
            {/* 1. UNIT / PULAU TEMATIK SELECTOR BAR */}
            <div className="bg-[#111726] border-2 border-slate-700 rounded-3xl p-5 sm:p-6 shadow-[0_6px_0_#070a12]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div>
                  <label className="text-[11px] font-black text-slate-200 uppercase tracking-wider block">
                    PILIH PULAU / UNIT TEMATIK
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium block">
                    Kelompok bab petualangan TTS (Duolingo Island System)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowManageUnitsModal(true)}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border-b-2 border-slate-900 active:translate-y-0.5 transition-all shadow flex items-center gap-1.5 shrink-0"
                  >
                    <Settings className="w-3.5 h-3.5 text-amber-400" />
                    <span>⚙️ Kelola Pulau</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setNewUnitNumber(units.length + 1);
                      setShowCreateUnitModal(true);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black border-b-2 border-emerald-700 active:translate-y-0.5 transition-all shadow flex items-center gap-1.5 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Buat Pulau</span>
                  </button>
                </div>
              </div>

              {units.length === 0 ? (
                <div className="p-4 bg-[#090d16] border-2 border-amber-500/70 rounded-2xl text-center space-y-3 mt-3">
                  <div className="text-amber-400 font-black text-xs flex items-center justify-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>Belum Ada Pulau Tematik di Database</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed max-w-sm mx-auto font-medium">
                    Setiap level TTS harus dikelompokkan ke dalam sebuah <b>Pulau Tematik</b>. Klik tombol di bawah untuk membuat 3 pulau starter otomatis:
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
                <div className="space-y-2.5">
                  <select
                    value={selectedUnitId}
                    onChange={(e) => setSelectedUnitId(e.target.value)}
                    className="w-full bg-[#090d16] border-2 border-slate-700 rounded-xl px-4 py-3 text-xs text-white font-black focus:outline-none focus:border-amber-400"
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
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 shadow"
                          style={{ backgroundColor: selectedUnit.theme_color || '#10b981' }}
                        />
                        <span className="text-[11px] text-slate-300 font-medium">
                          {selectedUnit.description || 'Tidak ada deskripsi'}
                        </span>
                      </div>
                      <span className="text-[10px] font-black uppercase text-amber-400 px-2.5 py-0.5 rounded-lg bg-amber-950/60 border border-amber-800 shrink-0">
                        {levels.length} Level
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            
            {/* PANDUAN CEPAT ADMIN ALUR SOAL & PUBLISH */}
            <div className="bg-[#111726] border border-blue-500/40 rounded-3xl p-4 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-500/50 flex items-center justify-center text-blue-400">
                    <Lightbulb className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-white uppercase tracking-wider">
                      Panduan Alur Admin: Cara Membuat & Menampilkan Soal TTS ke Pemain
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Ikuti 3 langkah mudah ini agar soal yang Anda buat langsung muncul dan bisa dimainkan pemain.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAdminGuide(!showAdminGuide)}
                  className="px-3 py-1.5 rounded-xl bg-blue-950/60 hover:bg-blue-900 border border-blue-800 text-blue-300 text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  <span>{showAdminGuide ? 'Tutup Panduan' : 'Buka Panduan Lengkap'}</span>
                  {showAdminGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              {showAdminGuide && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4 pt-3 border-t border-slate-800 text-xs">
                  <div className="p-3 bg-[#090d16] border border-slate-800 rounded-2xl space-y-1">
                    <span className="text-[10px] font-mono font-bold text-amber-400 block uppercase">
                      Langkah 1: Pilih Pulau
                    </span>
                    <p className="font-bold text-white text-[11px]">Pilih / Buat Pulau</p>
                    <p className="text-slate-400 text-[10px] leading-relaxed">
                      Pilih pulau di dropdown atas (misal Pulau 1). Anda juga bisa membuat pulau baru lewat tombol <b>+ Buat Pulau</b>.
                    </p>
                  </div>

                  <div className="p-3 bg-[#090d16] border border-slate-800 rounded-2xl space-y-1">
                    <span className="text-[10px] font-mono font-bold text-purple-400 block uppercase">
                      Langkah 2: Racik Soal
                    </span>
                    <p className="font-bold text-white text-[11px]">Generate AI / Manual</p>
                    <p className="text-slate-400 text-[10px] leading-relaxed">
                      Di tab <b>1. Generate Otomatis (AI)</b>, ketik tema & klik <i>Generate</i>. Periksa Live Preview lalu klik <b>Simpan Level</b>.
                    </p>
                  </div>

                  <div className="p-3 bg-[#090d16] border border-emerald-500/40 rounded-2xl space-y-1 bg-emerald-950/10">
                    <span className="text-[10px] font-mono font-bold text-emerald-400 block uppercase">
                      Langkah 3: Tampilkan Soal
                    </span>
                    <p className="font-bold text-white text-[11px]">Publish ke Pemain</p>
                    <p className="text-slate-400 text-[10px] leading-relaxed">
                      Level baru berstatus <b>DRAFT</b>. Buka tab <b>2. Input Manual</b>, pilih levelnya, lalu klik tombol hijau <b>Publish ke Pemain</b> agar muncul di HP pemain.
                    </p>
                  </div>

                  <div className="p-3 bg-[#090d16] border border-slate-800 rounded-2xl space-y-1">
                    <span className="text-[10px] font-mono font-bold text-cyan-400 block uppercase">
                      Langkah 4: Uji Coba
                    </span>
                    <p className="font-bold text-white text-[11px]">Test Main di Peta</p>
                    <p className="text-slate-400 text-[10px] leading-relaxed">
                      Klik tombol <b>📱 Test Main di Peta</b> di navbar atas untuk memainkan level secara nyata seperti pengguna asli.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* 2. SUB-TAB NAVIGASI: GENERATE AI VS INPUT MANUAL */}

            <div className="flex items-center gap-2 p-1.5 bg-[#090d16] rounded-2xl border-2 border-slate-800">
              <button
                type="button"
                onClick={() => setCreationMode('ai')}
                className={`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                  creationMode === 'ai'
                    ? 'bg-purple-600 text-white shadow-[0_4px_0_#3b0764] border-b-2 border-purple-400'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
                }`}
              >
                <Sparkles className="w-4 h-4 text-purple-300" />
                <span>1. Generate Otomatis (AI)</span>
              </button>
              <button
                type="button"
                onClick={() => setCreationMode('manual')}
                className={`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                  creationMode === 'manual'
                    ? 'bg-emerald-500 text-slate-950 shadow-[0_4px_0_#065f46] border-b-2 border-emerald-300'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
                }`}
              >
                <Edit3 className="w-4 h-4" />
                <span>2. Input & Editor Manual</span>
              </button>
            </div>

            {/* ============================================================== */}
            {/* SUB-TAB 1: GENERATE OTOMATIS (AI) & LIVE PREVIEW               */}
            {/* ============================================================== */}
            {creationMode === 'ai' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* SISI KIRI: FORM MINIMALIS AI */}
                <div className="bg-[#111726] border-2 border-purple-500/70 rounded-3xl p-6 shadow-[0_6px_0_#2e1065] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2.5 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-purple-500 text-slate-950 flex items-center justify-center font-black border-b-4 border-purple-700 shadow">
                        <Sparkles className="w-5 h-5 text-slate-950" />
                      </div>
                      <div>
                        <h3 className="text-base font-black text-white">AI Crossword Generator</h3>
                        <span className="text-[10px] text-purple-300 font-bold block">
                          Google Gemini 3.5 Flash (Super Cepat & Hemat Kuota)
                        </span>
                      </div>
                    </div>

                    <div className="space-y-4 text-xs">
                      {/* INPUT 1: TOPIK / TEMA UTAMA */}
                      <div>
                        <label className="text-[11px] font-black text-slate-200 uppercase block mb-1">
                          Topik / Tema Teka-Teki
                        </label>
                        <input
                          type="text"
                          value={aiTheme}
                          onChange={(e) => setAiTheme(e.target.value)}
                          placeholder="Contoh: Kuliner Tradisional Nusantara"
                          className="w-full bg-[#090d16] border-2 border-slate-700 rounded-xl px-4 py-3 text-white font-medium focus:outline-none focus:border-purple-400 text-xs shadow-inner"
                        />
                      </div>

                      {/* INPUT 2: JUMLAH KATA */}
                      <div>
                        <label className="text-[11px] font-black text-slate-200 uppercase block mb-1">
                          Jumlah Kata di Grid
                        </label>
                        <select
                          value={aiWordCount}
                          onChange={(e) => setAiWordCount(Number(e.target.value))}
                          className="w-full bg-[#090d16] border-2 border-slate-700 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-purple-400 text-xs shadow-inner"
                        >
                          <option value={3}>3 Kata (Paling Cepat & Ringkas)</option>
                          <option value={4}>4 Kata (Rekomendasi Terbaik)</option>
                          <option value={5}>5 Kata (Sedang)</option>
                          <option value={6}>6 Kata (Menantang)</option>
                        </select>
                      </div>

                      {/* DROPDOWN / ACCORDION: PENGATURAN LANJUTAN */}
                      <div className="border border-slate-800 rounded-2xl overflow-hidden bg-[#090d16]">
                        <button
                          type="button"
                          onClick={() => setShowAiAdvanced(!showAiAdvanced)}
                          className="w-full p-3.5 flex items-center justify-between text-left text-xs font-bold text-slate-300 hover:text-white transition-colors"
                        >
                          <span className="flex items-center gap-1.5 text-purple-300">
                            <Sliders className="w-3.5 h-3.5" />
                            <span>Pengaturan Lanjutan (Advanced Settings)</span>
                          </span>
                          {showAiAdvanced ? (
                            <ChevronUp className="w-4 h-4 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          )}
                        </button>

                        {showAiAdvanced && (
                          <div className="p-4 pt-0 border-t border-slate-800/80 space-y-3 text-xs">
                            <div className="grid grid-cols-2 gap-3 mt-3">
                              <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                                  Nomor Level
                                </label>
                                <NumericInput
                                  min={1}
                                  fallback={1}
                                  value={aiLevelNumber}
                                  onChange={setAiLevelNumber}
                                  className="w-full bg-[#111726] border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold"
                                />
                              </div>

                              <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                                  Durasi Timer (Detik)
                                </label>
                                <NumericInput
                                  min={10}
                                  max={300}
                                  fallback={60}
                                  value={aiHardTimer}
                                  onChange={setAiHardTimer}
                                  className="w-full bg-[#111726] border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                                  Poin Tiap Kata
                                </label>
                                <input
                                  type="text"
                                  value={settings.base_points_per_word}
                                  disabled
                                  className="w-full bg-[#111726] border border-slate-700 rounded-xl px-3 py-2 text-slate-400 font-mono"
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
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Proteksi Filter Anti-Duplikat Soal */}
                    <div className="mt-4 p-3.5 rounded-2xl bg-[#090d16] border border-emerald-500/40 text-xs shadow-inner">
                      <div className="flex items-start gap-2.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-black text-emerald-400 text-[11px] uppercase tracking-wide">
                              Filter Anti-Duplikat Soal (Aktif)
                            </span>
                            <span className="text-[10px] font-mono font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                              {filterPublishedOnly
                                ? `${existingWordsStats.publishedWords} Kata Published`
                                : `${existingWordsStats.totalWords} Total Kata di DB`}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                            Kata dan petunjuk soal yang sudah pernah ada di database otomatis dilarang bagi AI agar pemain tidak mendapatkan soal yang kembar.
                          </p>
                          <label className="flex items-center gap-2 mt-2 text-[11px] font-bold text-slate-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={filterPublishedOnly}
                              onChange={(e) => setFilterPublishedOnly(e.target.checked)}
                              className="w-3.5 h-3.5 rounded text-amber-500 focus:ring-amber-400 accent-amber-500"
                            />
                            <span>Hanya saring level yang berstatus published (abaikan draft)</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleGenerateAi}
                    disabled={generatingAi || !selectedUnitId}
                    className="w-full mt-6 py-4 rounded-xl bg-purple-500 hover:bg-purple-400 text-slate-950 font-black text-xs uppercase tracking-wider border-b-4 border-purple-700 active:translate-y-0.5 active:border-b-0 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>{generatingAi ? 'MERACIK KISI-KISI TTS DENGAN AI...' : '✨ GENERATE KISI-KISI TTS DENGAN AI'}</span>
                  </button>
                </div>

                {/* SISI KANAN: LIVE PREVIEW GRID & CONTROLS */}
                <div className="bg-[#111726] border-2 border-slate-700 rounded-3xl p-6 shadow-[0_6px_0_#070a12] flex flex-col justify-between">
                  {aiPreviewLevel ? (
                    <div className="space-y-4">
                      {/* Header Preview */}
                      <div className="flex items-center justify-between pb-3 border-b-2 border-slate-800">
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-wider text-purple-400 block">
                            LIVE PREVIEW (DRAFT BELUM DISIMPAN)
                          </span>
                          <h4 className="text-sm font-black text-white">{aiPreviewLevel.title}</h4>
                        </div>
                        <span className="text-[10px] font-black uppercase text-slate-300 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 shrink-0">
                          {aiPreviewLevel.words.length} Kata • {aiPreviewLevel.gridRows}x{aiPreviewLevel.gridCols}
                        </span>
                      </div>

                      {/* Visual Interactive Board Matrix */}
                      <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-center">
                        <div
                          className="grid gap-0.5 mx-auto p-1.5 bg-slate-900 rounded-xl border border-slate-800"
                          style={{
                            gridTemplateColumns: `repeat(${aiPreviewLevel.gridCols}, minmax(0, 1fr))`,
                            maxWidth: '280px',
                            aspectRatio: `${aiPreviewLevel.gridCols}/${aiPreviewLevel.gridRows}`,
                          }}
                        >
                          {Array.from({ length: aiPreviewLevel.gridRows }).map((_, r) =>
                            Array.from({ length: aiPreviewLevel.gridCols }).map((__, c) => {
                              const key = `${r},${c}`;
                              const cell = aiPreviewCellsMap[key];

                              if (!cell) {
                                return <div key={key} className="w-full h-full bg-slate-950 rounded" />;
                              }

                              return (
                                <div
                                  key={key}
                                  className="w-full h-full bg-purple-950/80 border border-purple-500/80 rounded flex items-center justify-center text-[10px] font-mono font-bold text-purple-200 relative shadow-sm"
                                >
                                  {cell.num && (
                                    <span className="absolute top-0 left-0.5 text-[6px] text-purple-300 font-mono font-bold">
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

                      {/* Clues Preview List */}
                      <div className="p-3 bg-[#090d16] rounded-xl border border-slate-800 max-h-40 overflow-y-auto space-y-1.5 text-[11px]">
                        <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                          Petunjuk Soal ({aiPreviewLevel.words.length} Kata):
                        </span>
                        {aiPreviewLevel.words.map((w) => (
                          <div key={`${w.word_number}-${w.direction}`} className="flex items-start gap-2 text-slate-300">
                            <span className="font-mono font-bold text-amber-400 shrink-0">
                              #{w.word_number} ({w.direction === 'across' ? 'Mendatar' : 'Menurun'}):
                            </span>
                            <span className="flex-1 font-medium text-slate-200">{w.clue}</span>
                            <span className="font-mono font-bold text-emerald-400 shrink-0">[{w.word}]</span>
                          </div>
                        ))}
                      </div>

                      {/* Action Bar: Kocok Ulang / Generate Ulang / Simpan */}
                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <button
                          type="button"
                          onClick={handleShuffleAiPositions}
                          className="py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase border-b-2 border-amber-700 active:translate-y-0.5 transition-all shadow flex items-center justify-center gap-1.5"
                        >
                          <Shuffle className="w-3.5 h-3.5" />
                          <span>Kocok Ulang Posisi</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleGenerateAi}
                          disabled={generatingAi}
                          className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs uppercase border-b-2 border-slate-900 active:translate-y-0.5 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Generate Ulang AI</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleSaveAiDraftToDb}
                          disabled={savingDraftLevel}
                          className="col-span-2 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider border-b-4 border-emerald-700 active:translate-y-1 active:border-b-0 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          <Check className="w-4 h-4" />
                          <span>{savingDraftLevel ? 'MENYIMPAN KE DATABASE...' : '✓ SIMPAN LEVEL KE DATABASE'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setAiPreviewLevel(null)}
                          className="col-span-2 text-center text-xs text-slate-500 hover:text-slate-300 py-1"
                        >
                          Batal / Hapus Rancangan
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
                      <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border-2 border-purple-500/30 flex items-center justify-center text-purple-400">
                        <Sparkles className="w-8 h-8" />
                      </div>
                      <h4 className="text-sm font-black text-white uppercase tracking-wider">
                        Papan Live Preview Siap
                      </h4>
                      <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                        Tentukan topik dan jumlah kata di sebelah kiri, lalu klik tombol <b>Generate Kisi-Kisi TTS</b>. Rancangan visual akan muncul di sini untuk Anda tinjau dan kocok posisinya sebelum disimpan.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* SUB-TAB 2: INPUT & EDITOR MANUAL                               */}
            {/* ============================================================== */}
            {creationMode === 'manual' && (
              <div className="flex flex-col lg:flex-row gap-6">
                {/* SISI KIRI: DAFTAR LEVEL & BUAT LEVEL KOSONG */}
                <div className="w-full lg:w-1/2 flex flex-col gap-6">
                  <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-black uppercase text-slate-300 tracking-wider">
                        Daftar Level ({levels.length})
                      </h3>

                      <div className="flex items-center gap-1.5">
                        {levels.length > 1 && (
                          <button
                            type="button"
                            onClick={handleReorderLevels}
                            title="Rapikan nomor urut level agar teratur dari 1, 2, 3..."
                            className="px-2.5 py-1.5 rounded-xl bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 text-xs font-bold border border-amber-800/80 flex items-center gap-1 transition-all"
                          >
                            <span>🔢 Rapikan (1, 2..)</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleCreateBlankLevel}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 flex items-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5 text-emerald-400" />
                          <span>+ Level Kosong</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                      {levels.length === 0 ? (
                        <p className="text-center py-8 text-xs text-slate-500">
                          Belum ada level di pulau ini. Buat level kosong baru atau gunakan generator AI.
                        </p>
                      ) : (
                        levels.map((lvl) => (
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
                              {lvl.is_hard_zone ? (
                                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-700 shadow-sm flex items-center gap-0.5">
                                  🔥 Hard
                                </span>
                              ) : (
                                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 flex items-center gap-0.5">
                                  🌿 Normal
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                                  lvl.status === 'published'
                                    ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                                    : 'bg-amber-950 text-amber-400 border-amber-800'
                                }`}
                              >
                                {lvl.status}
                              </span>
                              <button
                                type="button"
                                title="Hapus Level"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteLevel(lvl.id, lvl.title);
                                }}
                                disabled={deletingLevelId === lvl.id}
                                className="w-7 h-7 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-400 flex items-center justify-center transition-all disabled:opacity-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
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
                            type="button"
                            onClick={() => handleDeleteLevel(selectedLevelId, editorTitle)}
                            disabled={deletingLevelId === selectedLevelId}
                            className="px-3 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-400 font-bold text-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                            title="Hapus Level Ini"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{deletingLevelId === selectedLevelId ? 'Menghapus...' : 'Hapus'}</span>
                          </button>
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
                      <div className="grid grid-cols-3 gap-3 mb-5 text-xs">
                        <div>
                          <label className="text-[10px] font-bold text-amber-400 uppercase block mb-1">
                            Nomor Level
                          </label>
                          <NumericInput
                            min={1}
                            fallback={1}
                            value={editorLevelNumber}
                            onChange={setEditorLevelNumber}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono font-bold"
                          />
                        </div>

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
                            <NumericInput
                              min={4}
                              max={20}
                              fallback={8}
                              value={editorRows}
                              onChange={setEditorRows}
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                            />
                            <span>x</span>
                            <NumericInput
                              min={4}
                              max={20}
                              fallback={8}
                              value={editorCols}
                              onChange={setEditorCols}
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

                        <div className="col-span-3 grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-slate-950/60 border border-slate-800 rounded-2xl">
                          <div>
                            <label className="text-[10px] font-bold text-slate-300 uppercase block mb-1">
                              Tingkat Kesulitan Level
                            </label>
                            <select
                              value={editorIsHard ? 'hard' : 'normal'}
                              onChange={(e) => setEditorIsHard(e.target.value === 'hard')}
                              className={`w-full border rounded-xl px-3 py-2 font-bold ${
                                editorIsHard
                                  ? 'bg-rose-950/90 border-rose-600 text-rose-300'
                                  : 'bg-slate-900 border-emerald-500/60 text-emerald-300'
                              }`}
                            >
                              <option value="normal">🌿 Normal (Mudah / Santai)</option>
                              <option value="hard">🔥 Zona Hard (Sulit & Timer)</option>
                            </select>
                          </div>

                          {editorIsHard ? (
                            <>
                              <div>
                                <label className="text-[10px] font-bold text-rose-300 uppercase block mb-1">
                                  Durasi Timer (Detik)
                                </label>
                                <NumericInput
                                  min={10}
                                  max={300}
                                  fallback={60}
                                  value={editorHardTimer || 60}
                                  onChange={setEditorHardTimer}
                                  className="w-full bg-slate-900 border border-rose-800 rounded-xl px-3 py-2 text-white font-mono font-bold"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-rose-300 uppercase block mb-1">
                                  Poin Hilang / Detik (Decay)
                                </label>
                                <NumericInput
                                  min={1}
                                  max={20}
                                  fallback={4}
                                  value={editorDecayRate || 4}
                                  onChange={setEditorDecayRate}
                                  className="w-full bg-slate-900 border border-rose-800 rounded-xl px-3 py-2 text-white font-mono font-bold"
                                />
                              </div>
                            </>
                          ) : (
                            <div className="col-span-2 flex items-center text-[11px] text-slate-400 italic pt-3">
                              Level santai tanpa hitung mundur darurat. Menggunakan pengaturan standar game.
                            </div>
                          )}
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
                            <label className="text-[10px] text-slate-400 block mb-0.5">No. Petunjuk</label>
                            <NumericInput
                              min={1}
                              fallback={1}
                              value={newWordNumber}
                              onChange={setNewWordNumber}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 font-mono text-white"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-slate-400 block mb-0.5">Baris Awal (0-based)</label>
                            <NumericInput
                              min={0}
                              max={editorRows - 1}
                              fallback={0}
                              value={newWordRow}
                              onChange={setNewWordRow}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 font-mono text-white"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-slate-400 block mb-0.5">Kolom Awal (0-based)</label>
                            <NumericInput
                              min={0}
                              max={editorCols - 1}
                              fallback={0}
                              value={newWordCol}
                              onChange={setNewWordCol}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 font-mono text-white"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] text-slate-400 block mb-0.5">Teks Petunjuk (Clue)</label>
                          <textarea
                            rows={2}
                            required
                            placeholder="Tuliskan petunjuk soal teka-teki silang..."
                            value={newWordClue}
                            onChange={(e) => setNewWordClue(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white resize-none"
                          />
                        </div>

                        <button
                          type="submit"
                          className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                        >
                          + Pasang Kata ke Papan
                        </button>
                      </form>

                      {/* Daftar Kata yang Terpasang */}
                      <div className="space-y-2">
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-2">
                          Kata Terpasang ({words.length})
                        </span>

                        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                          {words.length === 0 ? (
                            <p className="text-center py-4 text-xs text-slate-600">
                              Belum ada kata terpasang di level ini.
                            </p>
                          ) : (
                            words.map((w) => (
                              <div
                                key={w.id}
                                className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs"
                              >
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-amber-400">
                                      #{w.word_number} ({w.direction})
                                    </span>
                                    <span className="font-mono font-bold text-white uppercase tracking-wider">
                                      {w.word}
                                    </span>
                                    <span className="text-[10px] text-slate-500">
                                      ({w.start_row},{w.start_col})
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-400 line-clamp-1">{w.clue}</p>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteWord(w.id)}
                                  className="w-7 h-7 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-400 flex items-center justify-center shrink-0"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-8 bg-slate-900/50 border border-slate-800 rounded-3xl space-y-2">
                      <Edit3 className="w-8 h-8 text-slate-600" />
                      <p className="text-xs text-slate-400">
                        Pilih salah satu level di sebelah kiri untuk mulai mengedit atau menambah kata.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

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

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={syncingLeaderboard}
                  onClick={handleSyncLeaderboard}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition flex items-center gap-2 border border-slate-700 disabled:opacity-50"
                  title="Sinkronkan seluruh skor profil pemain ke klasemen"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingLeaderboard ? 'animate-spin text-amber-400' : 'text-slate-400'}`} />
                  <span>{syncingLeaderboard ? 'Menyinkronkan...' : 'Sinkronkan Klasemen'}</span>
                </button>

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

      {/* MODAL MINI CRUD MANAJEMEN PULAU / UNIT TEMATIK */}
      {showManageUnitsModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#111726] border-2 border-slate-700 rounded-3xl p-6 shadow-[0_8px_0_#070a12] relative max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 font-black flex items-center justify-center">
                  <Settings className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase">MANAJEMEN PULAU / UNIT TEMATIK (CRUD)</h3>
                  <span className="text-[10px] text-slate-400">Drag kartu untuk atur urutan pulau, atau klik tombol rapikan</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {units.length > 0 && (
                  <button
                    type="button"
                    onClick={handleAutoReorderUnits}
                    disabled={reorderingUnits}
                    className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 text-xs font-bold active:translate-y-0.5 transition-all flex items-center gap-1.5"
                    title="Otomatis rapikan penomoran nomor urut pulau (1, 2, 3...)"
                  >
                    <span>{reorderingUnits ? 'Menyimpan...' : '🔢 Rapikan Urutan (1, 2..)'}</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowManageUnitsModal(false);
                    setEditingUnitId(null);
                  }}
                  className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* List / Table CRUD Pulau */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              {units.length === 0 ? (
                <div className="py-8 text-center text-slate-500">
                  Belum ada pulau tematik. Tambahkan pulau pertama di bawah.
                </div>
              ) : (
                units.map((u, idx) => {
                  const isEditingThis = editingUnitId === u.id;

                  if (isEditingThis) {
                    return (
                      <div
                        key={u.id}
                        className="p-4 bg-slate-950 border-2 border-amber-500/80 rounded-2xl space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black text-amber-400 uppercase">
                            Edit Pulau #{u.unit_number}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">{u.id.substring(0, 8)}...</span>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 block mb-1">No. Urut Pulau</label>
                            <NumericInput
                              min={1}
                              fallback={1}
                              value={editUnitNumber}
                              onChange={setEditUnitNumber}
                              className="w-full bg-[#111726] border border-slate-700 rounded-xl px-3 py-1.5 text-white font-mono"
                            />
                          </div>

                          <div className="col-span-2">
                            <label className="text-[10px] font-bold text-slate-400 block mb-1">Judul / Nama Pulau</label>
                            <input
                              type="text"
                              value={editUnitTitle}
                              onChange={(e) => setEditUnitTitle(e.target.value)}
                              className="w-full bg-[#111726] border border-slate-700 rounded-xl px-3 py-1.5 text-white font-medium"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-400 block mb-1">Deskripsi Pulau</label>
                          <textarea
                            rows={2}
                            value={editUnitDescription}
                            onChange={(e) => setEditUnitDescription(e.target.value)}
                            className="w-full bg-[#111726] border border-slate-700 rounded-xl px-3 py-1.5 text-white text-xs resize-none"
                          />
                        </div>

                        <div className="flex items-center justify-between gap-4 pt-1">
                          <div className="flex items-center gap-2">
                            <label className="text-[10px] font-bold text-slate-400">Warna Aksen:</label>
                            <input
                              type="color"
                              value={editUnitColor}
                              onChange={(e) => setEditUnitColor(e.target.value)}
                              className="w-8 h-8 rounded-lg bg-transparent cursor-pointer border border-slate-700"
                            />
                            <span className="font-mono text-slate-300">{editUnitColor}</span>
                          </div>

                          <label className="flex items-center gap-2 text-xs text-amber-300 font-bold cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editUnitIsSpecial}
                              onChange={(e) => setEditUnitIsSpecial(e.target.checked)}
                              className="w-4 h-4 rounded text-amber-500"
                            />
                            <span>Event Spesial</span>
                          </label>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                          <button
                            type="button"
                            onClick={() => setEditingUnitId(null)}
                            className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveEditUnit(u.id)}
                            disabled={savingUnitId === u.id}
                            className="py-1.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase"
                          >
                            {savingUnitId === u.id ? 'Menyimpan...' : 'Simpan Perubahan'}
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={u.id}
                      draggable={!editingUnitId && !reorderingUnits}
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, idx)}
                      className={`p-3 bg-[#090d16] border rounded-2xl flex items-center justify-between gap-3 transition-all ${
                        draggedUnitIndex === idx
                          ? 'opacity-40 border-amber-500 border-dashed bg-amber-500/10'
                          : 'border-slate-800 hover:border-slate-700 hover:bg-slate-900/40'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Drag Handle & Up/Down Arrows */}
                        <div className="flex items-center gap-1 shrink-0">
                          <div
                            className="cursor-grab active:cursor-grabbing text-slate-500 hover:text-amber-400 p-1 rounded"
                            title="Tahan dan geser (drag) ke atas/bawah untuk pindah urutan"
                          >
                            <GripVertical className="w-4 h-4" />
                          </div>

                          <div className="flex flex-col -space-y-1">
                            <button
                              type="button"
                              onClick={() => handleMoveUnit(idx, 'up')}
                              disabled={idx === 0 || reorderingUnits}
                              className="p-0.5 rounded text-slate-500 hover:text-white hover:bg-slate-800 disabled:opacity-20 transition-colors"
                              title="Pindahkan pulau ke atas"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveUnit(idx, 'down')}
                              disabled={idx === units.length - 1 || reorderingUnits}
                              className="p-0.5 rounded text-slate-500 hover:text-white hover:bg-slate-800 disabled:opacity-20 transition-colors"
                              title="Pindahkan pulau ke bawah"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Theme Dot */}
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 shadow"
                          style={{ backgroundColor: u.theme_color || '#10b981' }}
                        />

                        {/* Info Pulau */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-amber-400 text-xs shrink-0">
                              #{u.unit_number}
                            </span>
                            <span className="font-bold text-white truncate">{u.title}</span>
                            {u.is_special_event && (
                              <span className="text-[9px] font-black uppercase text-amber-300 bg-amber-950/80 border border-amber-800 px-1.5 py-0.5 rounded shrink-0">
                                ⭐ Event Spesial
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {u.description || 'Tidak ada deskripsi'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStartEditUnit(u)}
                          className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1 transition-all"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteUnit(u)}
                          disabled={deletingUnitId === u.id}
                          className="w-8 h-8 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-400 flex items-center justify-center transition-all disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-4 pt-3 border-t-2 border-slate-800 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-400">
                Total <b>{units.length}</b> pulau terdaftar di Supabase Hub.
              </span>
              <button
                type="button"
                onClick={() => {
                  setNewUnitNumber(units.length + 1);
                  setShowCreateUnitModal(true);
                }}
                className="py-2 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Pulau Baru</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
                  <NumericInput
                    min={1}
                    fallback={1}
                    value={newUnitNumber}
                    onChange={setNewUnitNumber}
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

      {/* ==================================================================== */}
      {/* MODAL 3: ATUR ANGKA KHUSUS PEMAIN (CUSTOM RESOURCES MODAL)           */}
      {/* ==================================================================== */}
      {selectedPlayerForEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl p-6 bg-[#0f172a] border-2 border-amber-500/50 shadow-2xl text-slate-200 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">{selectedPlayerForEdit.avatar_url || '⚡'}</span>
                <div>
                  <h3 className="text-sm font-black text-white">
                    Atur Sumber Daya: @{selectedPlayerForEdit.username}
                  </h3>
                  <span className="text-[10px] text-slate-400 uppercase font-mono font-bold">
                    ID: {selectedPlayerForEdit.id.slice(0, 12)}...
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlayerForEdit(null)}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="py-4 space-y-4">
              {/* Koin Input */}
              <div>
                <label className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block mb-1">
                  🪙 Total Koin Pemain
                </label>
                <NumericInput
                  min={0}
                  fallback={0}
                  value={customCoins}
                  onChange={(val) => setCustomCoins(val)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono font-bold text-amber-400"
                />
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setCustomCoins((prev) => prev + 100)}
                    className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-300 text-[10px] font-mono font-bold border border-amber-500/20 active:translate-y-0.5"
                  >
                    +100
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomCoins((prev) => prev + 500)}
                    className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-300 text-[10px] font-mono font-bold border border-amber-500/20 active:translate-y-0.5"
                  >
                    +500
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomCoins((prev) => prev + 1000)}
                    className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-300 text-[10px] font-mono font-bold border border-amber-500/20 active:translate-y-0.5"
                  >
                    +1.000
                  </button>
                </div>
              </div>

              {/* Total Skor Input */}
              <div>
                <label className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block mb-1">
                  ⭐ Total Poin Skor (Klasemen Musim)
                </label>
                <NumericInput
                  min={0}
                  fallback={0}
                  value={customScore}
                  onChange={(val) => setCustomScore(val)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono font-bold text-emerald-400"
                />
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setCustomScore((prev) => prev + 500)}
                    className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-300 text-[10px] font-mono font-bold border border-emerald-500/20 active:translate-y-0.5"
                  >
                    +500
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomScore((prev) => prev + 2000)}
                    className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-300 text-[10px] font-mono font-bold border border-emerald-500/20 active:translate-y-0.5"
                  >
                    +2.000
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomScore((prev) => prev + 10000)}
                    className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-300 text-[10px] font-mono font-bold border border-emerald-500/20 active:translate-y-0.5"
                  >
                    +10.000
                  </button>
                </div>
              </div>

              {/* Nyawa Input */}
              <div>
                <label className="text-[11px] font-bold text-rose-400 uppercase tracking-wider block mb-1">
                  ❤️ Jumlah Nyawa (0 - {selectedPlayerForEdit.max_lives || 5})
                </label>
                <NumericInput
                  min={0}
                  max={selectedPlayerForEdit.max_lives || 5}
                  fallback={5}
                  value={customLives}
                  onChange={(val) => setCustomLives(val)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono font-bold text-rose-400"
                />
                <div className="flex items-center gap-1.5 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setCustomLives(selectedPlayerForEdit.max_lives || 5)}
                    className="px-2.5 py-0.5 rounded-lg bg-rose-500/10 text-rose-300 text-[10px] font-bold border border-rose-500/20 active:translate-y-0.5"
                  >
                    Set Penuh ({selectedPlayerForEdit.max_lives || 5})
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedPlayerForEdit(null)}
                className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={adjustingResources}
                onClick={handleSaveCustomPlayerResources}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-md transition-all disabled:opacity-50 border-b-2 border-emerald-700 active:translate-y-0.5 active:border-b-0"
              >
                {adjustingResources ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus Pemain */}
      {playerToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border-2 border-rose-600/80 p-6 shadow-2xl text-center">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-rose-500/20 border-2 border-rose-500/40 flex items-center justify-center text-rose-400">
              <Trash2 className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-black text-white">Hapus Pemain @{playerToDelete.username}?</h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Tindakan ini akan <b>menghapus akun, profil, progres TTS, dan skor</b> pemain secara permanen dari database Supabase.
            </p>

            <div className="flex items-center gap-2 mt-6">
              <button
                type="button"
                onClick={() => setPlayerToDelete(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deletingPlayerId !== null}
                onClick={() => handleDeletePlayer(playerToDelete.id, playerToDelete.username)}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-lg shadow-rose-600/30 flex items-center justify-center gap-1.5"
              >
                {deletingPlayerId === playerToDelete.id ? (
                  <span>Menghapus...</span>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Permanen</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

