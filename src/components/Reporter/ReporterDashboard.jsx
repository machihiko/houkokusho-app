import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import PhotoUploader from './PhotoUploader';
import PreviewScreen from './PreviewScreen';
import VoiceInput from './VoiceInput';
import { Save, Send, LogOut, Plus, X, Clock, Users } from 'lucide-react';
import './ReporterDashboard.css';
import { supabase } from '../../utils/supabaseClient';
import { GENRES } from '../../constants/genres';
import { GENRE_FORM_SCHEMA, HAS_PROBLEM_CONFIG } from '../../constants/genreFormSchema';

// ── 定数定義 ──────────────────────────────────────────

/**
 * 案件名フォールバックデータ（DB の departments テーブルが空の場合に使用）
 * area フィールドを持ち、エリア選択時に絞り込みが機能する
 * 本番運用では Supabase の departments テーブルに area 列を追加して管理する
 */
const MOCK_DEPARTMENTS = [
  { id: 'shinjuku_cleaning', name: '新宿ビル 定期清掃案件',    area: '新宿エリア' },
  { id: 'shinjuku_patrol',   name: '新宿ビル 巡回警備業務',    area: '新宿エリア' },
  { id: 'iruma_ac',          name: '入間パーク 空調保守・点検', area: '入間エリア' },
  { id: 'iruma_cleaning',    name: '入間パーク 定期清掃案件',  area: '入間エリア' },
  { id: 'tower_patrol',      name: '〇〇タワー 巡回警備業務',  area: '〇〇タワーエリア' },
  { id: 'tower_repair',      name: '〇〇タワー 設備修繕案件',  area: '〇〇タワーエリア' },
];


// ── ジャンル別定型文 ─────────────────────────────────
const TEMPLATE_TEXTS = {
  cleaning:   '問題なく全て完了しました。',
  inspection: '異常は見つかりませんでした。',
  repair:     '無事に終了しました。',
  patrol:     '異常なく巡回を完了しました。',
  emergency:  '緊急対応が完了しました。',
};

// ── タスク初期値ファクトリー ──────────────────────────
let _taskSeq = 0;
const createTask = () => ({
  _id:          `task_${Date.now()}_${++_taskSeq}`,
  genre:        'cleaning',
  genreLabel:   '清掃',  // プレビュー表示用ラベル
  // ジャンル別の動的フィールド（スキーマ駆動）
  // select: field.key+'_key' に選択値、field.key にテキスト値を格納
  // textarea/text: field.key に直接テキスト値を格納
  customFields: {},
  // 評価
  hasProblem:   false,
  // 報告内容（定型文自動挿入対象）
  findings:     '',
  // 備考
  showMemo:     false,
  memo:         '',
  // 写真
  photos:       [],
  // バリデーション
  fieldErrors:  {},
});

// ══════════════════════════════════════════════════════
//  コンポーネント
// ══════════════════════════════════════════════════════
const ReporterDashboard = () => {
  const { logout, user } = useAuth();
  // ユーザーが追加したカスタムジャンル（localStorage に永続化）
  const [customGenres, setCustomGenres] = useState(() => {
    try {
      const saved = localStorage.getItem('re_report_custom_genres');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [showPreview,        setShowPreview]        = useState(false);
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(() => {
    const raw = localStorage.getItem('re_report_autosave');
    if (!raw) return false;

    try {
      const parsed = JSON.parse(raw);
      if (parsed._version === 3) return true;
    } catch {
      // fall through to cleanup below
    }

    localStorage.removeItem('re_report_autosave');
    return false;
  });
  const [showCoWorkers,      setShowCoWorkers]      = useState(false);
  const [gpsLocation,        setGpsLocation]        = useState('');

  // ── 共通情報（reports テーブルへ）─────────────────
  const [commonData, setCommonData] = useState({
    date:           '',
    startTime:      '',
    endTime:        '',
    selectedArea:   '',
    locationId:     '',
    locationName:   '',
    departmentId:   '',
    departmentName: '',
    coWorkers:      [],   // 選択した profile.id の配列
    isOnSchedule:   true,
    // 遅延理由（全体の進捗が「遅延あり」の場合のみ使用）
    delayReason: '',
  });

  // ── タスク一覧（report_tasks テーブルへ）──────────
  const [tasks, setTasks] = useState([createTask()]);

  // ── マスタデータ ────────────────────────────────
  const [locations,   setLocations]   = useState([]);
  const [departments, setDepartments] = useState([]);
  const [profiles,    setProfiles]    = useState([]);

  // ── ログインユーザー情報 ─────────────────────────
  const [displayName, setDisplayName] = useState('');
  const [reporterId,  setReporterId]  = useState(null);

  // ── バリデーションエラー ─────────────────────────
  const [validationError, setValidationError] = useState('');

  // ── スキーマフィールドの「その他」入力履歴（セッション中に記憶）──
  // { [field.key]: ['入力済みテキスト', ...] }
  const [localFieldOptions, setLocalFieldOptions] = useState({});

  // 入力済みの「その他」テキストをローカル履歴に追加
  const rememberFieldOption = (fieldKey, text) => {
    if (!text?.trim()) return;
    setLocalFieldOptions(prev => {
      const existing = prev[fieldKey] ?? [];
      if (existing.includes(text.trim())) return prev;
      return { ...prev, [fieldKey]: [...existing.slice(-4), text.trim()] }; // 最大5件保持
    });
  };

  // ── 担当場所（現場）の新規入力履歴（セッション中に記憶・再選択可能）────
  // { id: string, name: string, area: string | null }[]
  const [localNewLocations, setLocalNewLocations] = useState([]);

  // ── セッション中に追加したエリア（DB には存在しない）──
  // { name: string }[]
  const [localNewAreas, setLocalNewAreas] = useState([]);

  // ── エリア追加 ─────────────────────────────────────
  const handleAddArea = () => {
    const name = window.prompt('新しいエリア名を入力してください');
    if (!name?.trim()) return;
    const trimmed = name.trim();
    setLocalNewAreas(prev => prev.some(a => a.name === trimmed) ? prev : [...prev, { name: trimmed }]);
    setCommonData(prev => ({
      ...prev,
      selectedArea: trimmed,
      locationId: '', locationName: '',
      departmentId: '', departmentName: '',
    }));
  };

  // ── エリア編集（セッション追加分のみ） ────────────────
  const handleEditArea = () => {
    const newName = window.prompt('エリア名を変更してください', commonData.selectedArea);
    if (!newName?.trim() || newName.trim() === commonData.selectedArea) return;
    const trimmed = newName.trim();
    setLocalNewAreas(prev => prev.map(a => a.name === commonData.selectedArea ? { name: trimmed } : a));
    setCommonData(prev => ({ ...prev, selectedArea: trimmed }));
  };

  // ── 現場追加 ──────────────────────────────────────
  const handleAddLocation = () => {
    if (!commonData.selectedArea) return;
    const name = window.prompt('新しい現場名を入力してください');
    if (!name?.trim()) return;
    const trimmed = name.trim();
    const existing = localNewLocations.find(l => l.name === trimmed && l.area === commonData.selectedArea);
    if (existing) {
      setCommonData(prev => ({ ...prev, locationId: existing.id, locationName: existing.name }));
      return;
    }
    const newId = `local_loc_${Date.now()}`;
    setLocalNewLocations(prev => [...prev, { id: newId, name: trimmed, area: commonData.selectedArea }]);
    setCommonData(prev => ({ ...prev, locationId: newId, locationName: trimmed }));
  };

  // ── 現場編集（セッション追加分のみ） ─────────────────
  const handleEditLocation = () => {
    if (!commonData.locationId?.startsWith('local_loc_')) return;
    const newName = window.prompt('現場名を変更してください', commonData.locationName);
    if (!newName?.trim() || newName.trim() === commonData.locationName) return;
    const trimmed = newName.trim();
    setLocalNewLocations(prev => prev.map(l => l.id === commonData.locationId ? { ...l, name: trimmed } : l));
    setCommonData(prev => ({ ...prev, locationName: trimmed }));
  };

  // ── 案件名追加（即時 DB INSERT）──────────────────────
  const handleAddDept = async () => {
    try {
      const name = window.prompt('新しい案件名を入力してください');
      if (!name?.trim()) return;
      const trimmed = name.trim();
      const currentArea = commonData.selectedArea || null;

      // ① ローカルキャッシュ（departments state）で重複チェック
      const existingInDB = departments.find(d =>
        d.name.trim().toLowerCase() === trimmed.toLowerCase()
        && (!currentArea || !d.area || d.area === currentArea)
      );
      if (existingInDB) {
        setCommonData(prev => ({ ...prev, departmentId: existingInDB.id, departmentName: existingInDB.name }));
        return;
      }

      // ② DB に重複チェック（unique 制約エラーを防ぐ）
      const { data: dupRows } = await supabase
        .from('departments').select('id, name').ilike('name', trimmed).limit(1);
      if (dupRows?.length > 0) {
        const dup = dupRows[0];
        setDepartments(prev =>
          prev.some(d => d.id === dup.id) ? prev : [...prev, { id: dup.id, name: dup.name, area: currentArea }]
        );
        setCommonData(prev => ({ ...prev, departmentId: dup.id, departmentName: dup.name }));
        return;
      }

      // ③ 新規 INSERT（area も保存） → departments state に追加 → departmentId をセット
      const { data: newDept, error } = await supabase
        .from('departments').insert({ name: trimmed, area: currentArea, company_id: user?.companyId ?? null }).select('id, name').single();
      if (error) { alert('案件名の追加に失敗しました: ' + error.message); return; }
      const newEntry = { id: newDept.id, name: newDept.name, area: currentArea };
      setDepartments(prev => [...prev, newEntry]);
      setCommonData(prev => ({ ...prev, departmentId: newEntry.id, departmentName: newEntry.name }));
    } catch (error) {
      console.error('[Department] 追加失敗:', error);
      alert('エラーが発生しました');
    }
  };

  // ── 案件名編集（DB UPDATE）───────────────────────────
  const handleEditDept = async () => {
    try {
      if (!commonData.departmentId || !departments.find(d => d.id === commonData.departmentId)) return;
      const newName = window.prompt('案件名を変更してください', commonData.departmentName);
      if (!newName?.trim() || newName.trim() === commonData.departmentName) return;
      const trimmed = newName.trim();
      const { error } = await supabase
        .from('departments').update({ name: trimmed }).eq('id', commonData.departmentId);
      if (error) { alert('更新に失敗しました: ' + error.message); return; }
      setDepartments(prev => prev.map(d => d.id === commonData.departmentId ? { ...d, name: trimmed } : d));
      setCommonData(prev => ({ ...prev, departmentName: trimmed }));
    } catch (error) {
      console.error('[Department] 更新失敗:', error);
      alert('エラーが発生しました');
    }
  };

  // ── 案件名削除（DB DELETE）─────────────────────────
  const handleDeleteDept = async () => {
    try {
      if (!commonData.departmentId || !departments.find(d => d.id === commonData.departmentId)) return;
      if (!window.confirm(`「${commonData.departmentName}」を削除しますか？`)) return;
      const { error } = await supabase
        .from('departments').delete().eq('id', commonData.departmentId);
      if (error) { alert('削除に失敗しました: ' + error.message); return; }
      setDepartments(prev => prev.filter(d => d.id !== commonData.departmentId));
      setCommonData(prev => ({ ...prev, departmentId: '', departmentName: '' }));
    } catch (error) {
      console.error('[Department] 削除失敗:', error);
      alert('エラーが発生しました');
    }
  };

  // ── 担当場所マスタ（target_places テーブル）────────
  // { id: string, name: string }[]
  const [targetPlaces, setTargetPlaces] = useState([]);

  // ── 担当場所を追加（DB INSERT）─────────────────────
  const handleAddTargetPlace = async (taskIdx) => {
    try {
      const name = window.prompt('新しい担当場所を入力してください');
      if (!name?.trim()) return;
      const trimmed = name.trim();
      const existing = targetPlaces.find(
        p => p.name.trim().toLowerCase() === trimmed.toLowerCase()
      );
      if (existing) {
        setTasks(prev => prev.map((t, i) => {
          if (i !== taskIdx) return t;
          return {
            ...t,
            customFields: {
              ...(t.customFields ?? {}),
              target_place_key: existing.id,
              target_place: existing.name,
            },
          };
        }));
        return;
      }
      const { data: newPlace, error } = await supabase
        .from('target_places').insert({ name: trimmed, company_id: user?.companyId ?? null }).select('id, name').single();
      if (error) { alert('追加に失敗しました: ' + error.message); return; }
      setTargetPlaces(prev => [...prev, newPlace].sort((a, b) => a.name.localeCompare(b.name, 'ja')));
      setTasks(prev => prev.map((t, i) => {
        if (i !== taskIdx) return t;
        return {
          ...t,
          customFields: {
            ...(t.customFields ?? {}),
            target_place_key: newPlace.id,
            target_place: newPlace.name,
          },
        };
      }));
    } catch (error) {
      console.error('[TargetPlace] 追加失敗:', error);
      alert('エラーが発生しました');
    }
  };

  // ── 担当場所を編集（DB UPDATE）─────────────────────
  const handleEditTargetPlace = async (placeId, currentName) => {
    try {
      const newName = window.prompt('担当場所名を変更してください', currentName);
      if (!newName?.trim() || newName.trim() === currentName) return;
      const trimmed = newName.trim();
      const { error } = await supabase
        .from('target_places').update({ name: trimmed }).eq('id', placeId);
      if (error) { alert('更新に失敗しました: ' + error.message); return; }
      setTargetPlaces(prev => prev.map(p => p.id === placeId ? { ...p, name: trimmed } : p));
      setTasks(prev => prev.map(t =>
        t.customFields?.target_place_key === placeId
          ? { ...t, customFields: { ...t.customFields, target_place: trimmed } }
          : t
      ));
    } catch (error) {
      console.error('[TargetPlace] 更新失敗:', error);
      alert('エラーが発生しました');
    }
  };

  // ── 担当場所を削除（DB DELETE）─────────────────────
  const handleDeleteTargetPlace = async (placeId, currentName) => {
    try {
      if (!window.confirm(`「${currentName}」を担当場所リストから削除しますか？`)) return;
      const { error } = await supabase.from('target_places').delete().eq('id', placeId);
      if (error) { alert('削除に失敗しました: ' + error.message); return; }
      setTargetPlaces(prev => prev.filter(p => p.id !== placeId));
      setTasks(prev => prev.map(t =>
        t.customFields?.target_place_key === placeId
          ? { ...t, customFields: { ...t.customFields, target_place_key: '', target_place: '' } }
          : t
      ));
    } catch (error) {
      console.error('[TargetPlace] 削除失敗:', error);
      alert('エラーが発生しました');
    }
  };

  // ── マスタデータ取得 ──────────────────────────────
  useEffect(() => {
    supabase.from('locations').select('id, name, area').order('area')
      .then(({ data, error }) => {
        if (error) { console.error('[Supabase] locations 取得失敗:', error.message); return; }
        setLocations(data ?? []);
      });
  }, []);

  useEffect(() => {
    supabase.from('departments').select('id, name, area').order('name')
      .then(({ data, error }) => {
        if (error) { console.error('[Supabase] departments 取得失敗:', error.message); return; }
        if (data?.length > 0) setDepartments(data);
      });
  }, []);

  useEffect(() => {
    supabase.from('target_places').select('id, name').order('name')
      .then(({ data, error }) => {
        if (error) {
          // テーブル未作成の場合は警告のみ（アプリは動作継続）
          console.warn('[Supabase] target_places 取得失敗:', error.message);
          return;
        }
        setTargetPlaces(data ?? []);
      });
  }, []);

  useEffect(() => {
    supabase.from('profiles').select('id, display_name').order('display_name')
      .then(({ data, error }) => {
        if (error) { console.error('[Supabase] profiles 取得失敗:', error.message); return; }
        if (data?.length > 0) setProfiles(data);
      });
  }, []);

  // ── ログインユーザーの profile 取得 ──────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user?.id) return;
      const uid = session.user.id;
      setReporterId(uid);
      supabase.from('profiles').select('display_name').eq('id', uid).single()
        .then(({ data }) => { if (data?.display_name) setDisplayName(data.display_name); });
    });
  }, []);

  // ── カスタムジャンルを localStorage に永続化 ─────────
  useEffect(() => {
    localStorage.setItem('re_report_custom_genres', JSON.stringify(customGenres));
  }, [customGenres]);

  // ── 自動保存（2秒デバウンス） ──────────────────────
  useEffect(() => {
    const hasInput = commonData.date
      || tasks.some(t => {
           const anyCustom = Object.values(t.customFields ?? {}).some(v => v?.trim?.());
           return anyCustom || t.findings;
         });
    const handler = setTimeout(() => {
      if (hasInput) {
        localStorage.setItem('re_report_autosave', JSON.stringify({
          _version: 3,
          commonData,
          tasks: tasks.map(t => ({ ...t, photos: [] })),
        }));
      }
    }, 2000);
    return () => clearTimeout(handler);
  }, [commonData, tasks]);

  // ── 自動保存データを復元 ──────────────────────────
  const recoverData = (accept) => {
    if (accept) {
      try {
        const saved = JSON.parse(localStorage.getItem('re_report_autosave'));
        if (saved.commonData) setCommonData(saved.commonData);
        if (saved.tasks) {
          setTasks(saved.tasks.map(t => ({
            ...createTask(), ...t, photos: [], fieldErrors: {},
          })));
        }
      } catch (e) { console.error('復元失敗:', e); }
    } else {
      localStorage.removeItem('re_report_autosave');
    }
    setShowRecoveryDialog(false);
  };

  // ── タスク更新ヘルパー ────────────────────────────
  const updateTask = (idx, partial) =>
    setTasks(prev => prev.map((t, i) => i === idx ? { ...t, ...partial } : t));

  const handleGenreChange = (idx, genreId) => {
    // GENRES + カスタムジャンルからラベルを解決
    const label = [...GENRES, ...customGenres].find(g => g.id === genreId)?.label ?? genreId;
    // 担当場所（target_place）は全ジャンル共通フィールドなので引き継ぐ
    const prevCf = tasks[idx]?.customFields ?? {};
    const preservedPlace = {};
    if (prevCf.target_place_key !== undefined) preservedPlace.target_place_key = prevCf.target_place_key;
    if (prevCf.target_place     !== undefined) preservedPlace.target_place     = prevCf.target_place;
    updateTask(idx, {
      genre:        genreId,
      genreLabel:   label,
      customFields: preservedPlace,   // 担当場所のみ引き継ぎ、それ以外はリセット
      fieldErrors:  {},
      showMemo:     false,
      // 緊急対応は常に has_problem=true として扱う
      ...(genreId === 'emergency' ? { hasProblem: true } : {}),
    });
  };

  const addTask    = () => setTasks(prev => [...prev, createTask()]);
  const removeTask = (idx) => setTasks(prev => prev.filter((_, i) => i !== idx));

  // ── 定型文適用条件チェック ─────────────────────────
  // 問題無し（または緊急対応）の場合に定型文を挿入する
  const meetsTemplateCondition = (hasProblem) => hasProblem === false;

  // ── 定型文をタスクに直接適用 ────────────────────
  const applyTemplate = (taskId, genre, currentFindings) => {
    const template = TEMPLATE_TEXTS[genre] ?? '作業が完了しました。';
    if (!currentFindings.trim()) {
      // 未入力 → 即セット
      setTasks(cur => cur.map(t =>
        t._id === taskId ? { ...t, findings: template } : t
      ));
    } else if (currentFindings.trim() !== template) {
      // 別の内容が入力済み → 末尾追記を確認
      const ok = window.confirm(
        '「問題無し・完了」が選択されました。\n定型文を報告内容の末尾に追加しますか？'
      );
      if (ok) {
        setTasks(cur => cur.map(t =>
          t._id === taskId
            ? { ...t, findings: currentFindings.trimEnd() + '\n' + template }
            : t
        ));
      }
    }
    // 既に同じ定型文が入力済みなら何もしない
  };

  // ── バリデーション（全タスク） ────────────────────
  const validateAll = () => {
    setValidationError('');
    if (!commonData.date) {
      setValidationError('作業日は必須です。');
      return false;
    }
    if (!commonData.startTime) {
      setValidationError('開始時間は必須です。');
      return false;
    }
    if (!commonData.endTime) {
      setValidationError('終了時間は必須です。');
      return false;
    }
    if (!commonData.isOnSchedule && !commonData.delayReason.trim()) {
      setValidationError('遅延がある場合は遅延の理由を入力してください。');
      return false;
    }
    for (let idx = 0; idx < tasks.length; idx++) {
      const task   = tasks[idx];
      const prefix = tasks.length > 1 ? `作業${idx + 1}：` : '';
      const schema = GENRE_FORM_SCHEMA[task.genre] ?? GENRE_FORM_SCHEMA._fallback;
      const cf     = task.customFields ?? {};

      // ① 「その他」が選択されているフィールドで自由入力が空 → エラー
      for (const field of schema) {
        if (field.type !== 'select' || !field.allowOther) continue;
        if (cf[field.key + '_key'] === 'other' && !cf[field.key]?.trim()) {
          setValidationError(
            `${prefix}「${field.label}」で「その他」が選択されています。詳細を入力してください。`
          );
          return false;
        }
      }

      // ② 必須フィールド（optional でないもの）のうち最低1つは入力必須
      const requiredFields = schema.filter(f => !f.optional);
      const anyRequiredFilled = requiredFields.some(f => cf[f.key]?.trim());

      if (task.genre === 'emergency') {
        if (!anyRequiredFilled) {
          setValidationError(`${prefix}担当場所・状況・症状・対応内容のいずれかを入力してください。`);
          return false;
        }
        if (!task.findings.trim()) {
          setValidationError(`${prefix}緊急対応の報告内容は必須です。詳細を記入してください。`);
          return false;
        }
      } else {
        if (!anyRequiredFilled) {
          setValidationError(`${prefix}担当場所または作業内容を入力してください。`);
          return false;
        }
        if (task.hasProblem && !task.findings.trim()) {
          setValidationError(`${prefix}問題がある場合は報告内容を入力してください。`);
          return false;
        }
      }
    }
    return true;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateAll()) setShowPreview(true);
  };

  // ── 送信（V2: reports → report_tasks → photos）────
  const handleConfirm = async () => {
    try {
      let finalLocationId   = commonData.locationId   || null;
      let finalDepartmentId = commonData.departmentId || null;

      const isNewLoc = commonData.locationId?.startsWith('local_loc_');
      if (isNewLoc) {
        const locName = commonData.locationName.trim();
        if (!locName) { alert('新しい現場名を入力してください。'); return; }
        const { data: newLoc, error: locErr } = await supabase
          .from('locations').insert({ name: locName, area: commonData.selectedArea || null, company_id: user?.companyId ?? null }).select('id').single();
        if (locErr) { alert('現場の追加に失敗しました: ' + locErr.message); return; }
        finalLocationId = newLoc.id;
        setLocations(prev => [...prev, { id: newLoc.id, name: locName, area: commonData.selectedArea || null }]);
        setLocalNewLocations(prev => prev.map(l => l.name === locName ? { ...l, id: newLoc.id } : l));
        setCommonData(prev => ({ ...prev, locationId: newLoc.id, locationName: locName }));
      }

      const { data: reportRow, error: reportError } = await supabase
        .from('reports')
        .insert({
          work_date: commonData.date,
          start_time: commonData.startTime || null,
          end_time: commonData.endTime || null,
          location_id: finalLocationId,
          department_id: finalDepartmentId,
          reporter_id: reporterId || null,
          co_workers: commonData.coWorkers.length > 0 ? commonData.coWorkers : null,
          is_on_schedule: commonData.isOnSchedule,
          delay_reason: commonData.isOnSchedule ? null : (commonData.delayReason.trim() || null),
          company_id: user?.companyId ?? null,
        })
        .select('id')
        .single();

      if (reportError) {
        alert('報告書の保存に失敗しました。\n' + reportError.message);
        return;
      }
      const reportId = reportRow.id;
      const photoFailures = [];

      for (let tIdx = 0; tIdx < tasks.length; tIdx++) {
        const task      = tasks[tIdx];
        const taskLabel = tasks.length > 1 ? `作業${tIdx + 1}` : '作業';
        const customData = Object.fromEntries(
          Object.entries(task.customFields ?? {})
            .filter(([k, v]) => !k.endsWith('_key') && v?.trim?.())
            .map(([k, v]) => [k, v.trim()])
        );

        const { data: taskRow, error: taskError } = await supabase
          .from('report_tasks')
          .insert({
            report_id: reportId,
            genre: task.genre,
            has_problem: task.genre === 'emergency' ? true : task.hasProblem,
            findings: task.findings.trim() || null,
            custom_data: Object.keys(customData).length > 0 ? customData : null,
          })
          .select('id')
          .single();

        if (taskError) {
          alert(`${taskLabel}の保存に失敗しました。\n${taskError.message}`);
          return;
        }
        const taskId = taskRow.id;

        for (let pIdx = 0; pIdx < task.photos.length; pIdx++) {
          const photo = task.photos[pIdx];

          if (!photo.file) {
            console.warn(`[写真] ${taskLabel}-写真${pIdx + 1}: file が存在しないためスキップ`);
            continue;
          }

          const rawExt   = (photo.name ?? '').split('.').pop();
          const ext      = /^[a-zA-Z0-9]+$/.test(rawExt) ? rawExt.toLowerCase() : 'jpg';
          const rand     = Math.random().toString(36).slice(2, 10);
          const filePath = `${reportId}/${taskId}/${Date.now()}_${rand}.${ext}`;

          const { error: uploadError } = await supabase.storage
            .from('photos')
            .upload(filePath, photo.file, { upsert: false });

          if (uploadError) {
            console.error(`[Supabase] ${taskLabel}-写真${pIdx + 1} アップロード失敗:`, uploadError.message);
            photoFailures.push(`${taskLabel}-写真${pIdx + 1}（${uploadError.message}）`);
            continue;
          }

          const { data: urlData } = supabase.storage.from('photos').getPublicUrl(filePath);
          const { error: insertError } = await supabase.from('photos').insert({
            task_id: taskId,
            photo_url: urlData.publicUrl,
          });

          if (insertError) {
            console.error(`[Supabase] ${taskLabel}-写真${pIdx + 1} DB登録失敗:`, insertError.message);
            photoFailures.push(`${taskLabel}-写真${pIdx + 1}（${insertError.message}）`);
          }
        }
      }

      if (photoFailures.length > 0) {
        alert(
          `報告書を送信しました（作業 ${tasks.length} 件）。\n\n` +
          `※以下の写真の保存に失敗しました。写真以外のデータは保存済みです。\n` +
          photoFailures.join('\n')
        );
      } else {
        alert(`報告書を送信しました！（作業 ${tasks.length} 件）`);
      }
      localStorage.removeItem('re_report_autosave');
      window.location.reload();
    } catch (error) {
      console.error('[Report] 送信失敗:', error);
      alert('エラーが発生しました');
    }
  };

  // ── プレビュー表示中 ──────────────────────────────
  if (showPreview) {
    return (
      <PreviewScreen
        tasks={tasks}
        commonData={commonData}
        profiles={profiles}
        onBack={() => setShowPreview(false)}
        onConfirm={handleConfirm}
      />
    );
  }

  // ── スキーマフィールド1件描画 ──────────────────────
  const renderSchemaField = (field, task, idx) => {
    const cf       = task.customFields ?? {};
    const keyField = field.key + '_key';   // select の選択値
    const txtField = field.key;            // 保存するテキスト値
    const keyValue = cf[keyField] ?? '';
    const isOther  = keyValue === 'other';

    const setCustom = (patch) =>
      updateTask(idx, { customFields: { ...cf, ...patch } });

    if (field.type === 'select') {
      const historyOpts  = localFieldOptions[field.key] ?? [];
      // target_place フィールドのみ DB マスタを使う
      const isTargetPlace = field.key === 'target_place';
      const isDbEntry     = isTargetPlace && targetPlaces.some(p => p.id === keyValue);

      return (
        <div key={field.key} className="form-section">
          <label>
            {field.label}
            {field.optional && <span className="optional-badge" style={{ marginLeft: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>任意</span>}
          </label>
          <div className={isTargetPlace ? 'select-with-actions' : undefined}>
            <select
              className="input-field"
              value={keyValue}
              onChange={e => {
                const val = e.target.value;
                // ローカル履歴のオプション（value = ラベル文字列）
                if (historyOpts.includes(val)) {
                  setCustom({ [keyField]: val, [txtField]: val });
                  return;
                }
                // DB マスタの担当場所
                if (isTargetPlace) {
                  const dbPlace = targetPlaces.find(p => p.id === val);
                  if (dbPlace) {
                    setCustom({ [keyField]: val, [txtField]: dbPlace.name });
                    return;
                  }
                }
                const label = val !== 'other'
                  ? (field.options.find(o => o.value === val)?.label ?? '')
                  : '';
                setCustom({ [keyField]: val, [txtField]: val !== 'other' ? label : '' });
              }}
            >
              <option value="">選択してください</option>
              {field.options.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
              {/* ── DB 登録済み担当場所 ── */}
              {isTargetPlace && targetPlaces.length > 0 && (
                <optgroup label="登録済み">
                  {targetPlaces.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </optgroup>
              )}
              {/* ── 「その他」で入力した履歴を再選択肢として表示 ── */}
              {historyOpts.length > 0 && (
                <optgroup label="最近使用">
                  {historyOpts.map(text => (
                    <option key={text} value={text}>{text}</option>
                  ))}
                </optgroup>
              )}
            </select>
            {/* target_place のみ追加・編集・削除ボタンを表示 */}
            {isTargetPlace && (
              <>
                <button type="button" className="btn-select-action" title="担当場所を追加"
                  onClick={() => handleAddTargetPlace(idx)}>＋</button>
                {user?.role !== 'user' && (<>
                  <button type="button" className="btn-select-action" title="名前を変更"
                    disabled={!isDbEntry}
                    onClick={() => handleEditTargetPlace(keyValue, cf[txtField])}>⚙</button>
                  <button type="button" className="btn-select-action btn-select-action--danger" title="削除"
                    disabled={!isDbEntry}
                    onClick={() => handleDeleteTargetPlace(keyValue, cf[txtField])}>🗑</button>
                </>)}
              </>
            )}
          </div>
          {isOther && (
            <div style={{ marginTop: '8px' }}>
              <div className="label-with-action" style={{ marginBottom: '6px' }}>
                <span className="field-other-label">{field.otherLabel ?? '詳しく入力'}</span>
                {field.allowVoice && (
                  <VoiceInput onResult={text =>
                    setCustom({ [txtField]: cf[txtField] ? `${cf[txtField]}\n${text}` : text })
                  } />
                )}
              </div>
              {(field.otherType ?? 'text') === 'textarea' ? (
                <textarea
                  className="input-field genre-field-area"
                  value={cf[txtField] ?? ''}
                  onChange={e => setCustom({ [txtField]: e.target.value })}
                  onBlur={e => rememberFieldOption(field.key, e.target.value)}
                  placeholder={field.otherPlaceholder ?? '詳しく入力してください...'}
                  rows={2}
                  data-gramm="false" autoComplete="off" data-1p-ignore="true" spellCheck={false}
                />
              ) : (
                <input
                  type="text"
                  className="input-field"
                  value={cf[txtField] ?? ''}
                  onChange={e => setCustom({ [txtField]: e.target.value })}
                  onBlur={e => rememberFieldOption(field.key, e.target.value)}
                  placeholder={field.otherPlaceholder ?? '詳しく入力してください...'}
                  data-gramm="false" autoComplete="off" data-1p-ignore="true" spellCheck={false}
                />
              )}
            </div>
          )}
        </div>
      );
    }

    // type: 'textarea' または 'text'
    return (
      <div key={field.key} className="form-section">
        <div className="label-with-action">
          <label>{field.label}</label>
          {field.allowVoice && (
            <VoiceInput onResult={text =>
              setCustom({ [txtField]: cf[txtField] ? `${cf[txtField]}\n${text}` : text })
            } />
          )}
        </div>
        {field.type === 'textarea' ? (
          <textarea
            className="input-field genre-field-area"
            value={cf[txtField] ?? ''}
            onChange={e => setCustom({ [txtField]: e.target.value })}
            placeholder={field.placeholder ?? '入力してください...'}
            rows={2}
            data-gramm="false" autoComplete="off" data-1p-ignore="true" spellCheck={false}
          />
        ) : (
          <input
            type="text"
            className="input-field"
            value={cf[txtField] ?? ''}
            onChange={e => setCustom({ [txtField]: e.target.value })}
            placeholder={field.placeholder ?? '入力してください...'}
            data-gramm="false" autoComplete="off" data-1p-ignore="true" spellCheck={false}
          />
        )}
      </div>
    );
  };

  // ── タスクブロック描画 ─────────────────────────────
  const renderTaskBlock = (task, idx) => {
    // ジャンルに対応するスキーマ（未知のカスタムジャンルは _fallback を使用）
    const schema = GENRE_FORM_SCHEMA[task.genre] ?? GENRE_FORM_SCHEMA._fallback;

    // 点検・巡回は「異常の有無」、それ以外は「問題の有無」
    const hpCfg = HAS_PROBLEM_CONFIG[task.genre] ?? HAS_PROBLEM_CONFIG._default;

    return (
      <div key={task._id} className="task-block">
        {/* タスクヘッダー */}
        <div className="task-block-header">
          <span className="task-block-label">作業 {idx + 1}</span>
          {tasks.length > 1 && (
            <button type="button" className="btn-remove-task" onClick={() => removeTask(idx)}>
              <X size={14} /> 削除
            </button>
          )}
        </div>

        {/* ジャンルタブ */}
        <div className="form-section">
          <label>報告ジャンル</label>
          <div className="genre-tabs">
            {[...GENRES, ...customGenres].map(g => (
              <button
                key={g.id}
                type="button"
                className={`genre-tab ${task.genre === g.id ? 'active' : ''}`}
                onClick={() => handleGenreChange(idx, g.id)}
              >
                {g.label}
              </button>
            ))}
            {/* ジャンル追加ボタン */}
            <button
              type="button"
              className="genre-tab genre-tab--add"
              title="ジャンルを追加"
              onClick={() => {
                const name = window.prompt('新しいジャンル名を入力してください\n（例：除草、除雪、消毒など）');
                if (!name?.trim()) return;
                const id = `custom_${Date.now()}`;
                setCustomGenres(prev => [...prev, { id, label: name.trim() }]);
              }}
            >
              ＋
            </button>
          </div>
        </div>

        {/* スキーマ定義に基づくジャンル別フィールド */}
        {schema.map(field => renderSchemaField(field, task, idx))}

        {/* 問題の有無 / 異常の有無（緊急対応は非表示・強制true） */}
        {task.genre !== 'emergency' && (
          <div className="form-section">
            <label>{hpCfg.label}</label>
            <div className="has-issue-seg">
              {[
                { value: false, label: hpCfg.noLabel,  colorClass: 'no' },
                { value: true,  label: hpCfg.yesLabel, colorClass: 'yes' },
              ].map(opt => (
                <button
                  key={String(opt.value)}
                  type="button"
                  className={`has-issue-btn ${opt.colorClass}${task.hasProblem === opt.value ? ' active' : ''}`}
                  onClick={() => {
                    updateTask(idx, { hasProblem: opt.value });
                    if (meetsTemplateCondition(opt.value)) {
                      applyTemplate(task._id, task.genre, task.findings);
                    }
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 写真アップロード */}
        <div className="form-section">
          <PhotoUploader
            photos={task.photos}
            setPhotos={photos => updateTask(idx, { photos })}
            currentDate={commonData.date}
            onDateExtracted={date => {
              const formatted = date.toISOString().split('T')[0];
              setCommonData(prev => ({ ...prev, date: formatted }));
            }}
          />
        </div>

        {/* 報告内容（findings）*/}
        <div className="form-section">
          <div className="label-with-action">
            <label>
              報告内容
              {task.genre === 'emergency' && (
                <span className="required-badge" style={{ marginLeft: '6px' }}>必須</span>
              )}
            </label>
            <VoiceInput onResult={text => updateTask(idx, {
              findings: task.findings ? `${task.findings}\n${text}` : text,
            })} />
          </div>
          <textarea
            className="input-field genre-field-area"
            value={task.findings}
            onChange={e => updateTask(idx, { findings: e.target.value })}
            placeholder={task.genre === 'emergency'
              ? '【必須】発生したトラブルの詳細、現在の状況、対応内容などを詳しく記入してください。'
              : '作業の詳細や特記事項をご記入ください。（「問題無し」「異常無し」を選択すると定型文が自動入力されます）'}
            rows={4}
            data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false"
            autoComplete="off" data-1p-ignore="true" spellCheck={false}
          />
        </div>

        {/* 備考欄トグル */}
        <div className="memo-toggle">
          <label className="memo-checkbox-label">
            <input
              type="checkbox"
              checked={task.showMemo}
              onChange={e => updateTask(idx, { showMemo: e.target.checked })}
            />
            備考欄を追加
          </label>
        </div>

        {task.showMemo && (
          <div className="form-section">
            <div className="label-with-action">
              <label>備考</label>
              <VoiceInput onResult={text => updateTask(idx, {
                memo: task.memo ? `${task.memo}\n${text}` : text,
              })} />
            </div>
            <textarea
              className="input-field genre-field-area"
              value={task.memo}
              onChange={e => updateTask(idx, { memo: e.target.value })}
              placeholder="補足事項があれば記入してください..."
              rows={3}
              data-gramm="false" autoComplete="off" data-1p-ignore="true" spellCheck={false}
            />
          </div>
        )}
      </div>
    );
  };

  // ── メインレンダー ────────────────────────────────
  return (
    <div className="reporter-container">
      {showRecoveryDialog && (
        <div className="recovery-dialog glass-panel">
          <h3><Save size={18} /> 前回の入力データがあります</h3>
          <p>続きから作成しますか？</p>
          <div className="recovery-actions">
            <button className="btn btn-outline" onClick={() => recoverData(false)}>いいえ</button>
            <button className="btn btn-primary" onClick={() => recoverData(true)}>はい（復元）</button>
          </div>
        </div>
      )}

      <header className="reporter-header glass-panel">
        <div>
          <h2>現場報告作成</h2>
          <p className="subtitle">{displayName || user?.name} 様</p>
        </div>
        <button className="btn btn-outline logout-btn fadeIn" onClick={logout}>
          <LogOut size={16} /> ログアウト
        </button>
      </header>

      <form className="report-form glass-panel" onSubmit={handleSubmit}>

        {/* ━━ 共通情報 ━━ */}
        <div className="common-section">
          <div className="common-section-title">■ 共通情報</div>

          {/* 作業日 */}
          <div className="form-section">
            <label>作業日 (写真から自動取得可)</label>
            <div className="date-input-row">
              <input
                type="date"
                className="input-field"
                value={commonData.date}
                onChange={e => setCommonData(prev => ({ ...prev, date: e.target.value }))}
                autoComplete="off" data-1p-ignore="true"
              />
              <button
                type="button"
                className="today-btn"
                onClick={() => setCommonData(prev => ({
                  ...prev,
                  date: new Date().toLocaleDateString('sv-SE'), // YYYY-MM-DD 形式
                }))}
              >
                今日
              </button>
            </div>
          </div>

          {/* 対応時間 */}
          <div className="form-row">
            <div className="form-section flex-1">
              <label><Clock size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />開始時間 <span className="required-badge">必須</span></label>
              <input
                type="time"
                className="input-field"
                value={commonData.startTime}
                onChange={e => setCommonData(prev => ({ ...prev, startTime: e.target.value }))}
              />
            </div>
            <div className="form-section flex-1">
              <label><Clock size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />終了時間 <span className="required-badge">必須</span></label>
              <div className="time-input-row">
                <input
                  type="time"
                  className="input-field"
                  value={commonData.endTime}
                  onChange={e => setCommonData(prev => ({ ...prev, endTime: e.target.value }))}
                />
                <button
                  type="button"
                  className="btn-now-time"
                  onClick={() => {
                    const now  = new Date();
                    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                    setCommonData(prev => ({ ...prev, endTime: hhmm }));
                  }}
                >現在時刻</button>
              </div>
            </div>
          </div>

          {/* エリア・現場 */}
          <div className="form-row">
            <div className="form-section flex-1">
              <label>エリア</label>
              <div className="select-with-actions">
                <select
                  className="input-field"
                  value={commonData.selectedArea}
                  onChange={e => setCommonData(prev => ({
                    ...prev,
                    selectedArea:   e.target.value,
                    locationId:     '',
                    locationName:   '',
                    departmentId:   '',
                    departmentName: '',
                  }))}
                >
                  <option value="">エリアを選択してください</option>
                  {[...new Set([
                    ...locations.map(l => l.area).filter(Boolean),
                    ...localNewAreas.map(a => a.name),
                  ])].map(area => (
                    <option key={area} value={area}>{area}</option>
                  ))}
                </select>
                <button type="button" className="btn-select-action" title="エリアを追加" onClick={handleAddArea}>＋</button>
                <button type="button" className="btn-select-action" title="エリアを編集"
                  disabled={!commonData.selectedArea || !localNewAreas.some(a => a.name === commonData.selectedArea)}
                  onClick={handleEditArea}>⚙</button>
              </div>
            </div>
            <div className="form-section flex-1">
              <label>現場</label>
              <div className="select-with-actions">
                <select
                  className="input-field"
                  value={commonData.locationId}
                  disabled={!commonData.selectedArea}
                  onChange={e => {
                    const localLoc = localNewLocations.find(l => l.id === e.target.value);
                    if (localLoc) {
                      setCommonData(prev => ({ ...prev, locationId: e.target.value, locationName: localLoc.name }));
                    } else {
                      const loc = locations.find(l => l.id === e.target.value);
                      setCommonData(prev => ({ ...prev, locationId: e.target.value, locationName: loc?.name ?? '' }));
                    }
                  }}
                >
                  <option value="">
                    {commonData.selectedArea ? '現場を選択してください' : '先にエリアを選択してください'}
                  </option>
                  {locations
                    .filter(l => l.area === commonData.selectedArea)
                    .map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  {localNewLocations.filter(l => !l.area || l.area === commonData.selectedArea).length > 0 && (
                    <optgroup label="最近追加">
                      {localNewLocations
                        .filter(l => !l.area || l.area === commonData.selectedArea)
                        .map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </optgroup>
                  )}
                </select>
                <button type="button" className="btn-select-action" title="現場を追加"
                  disabled={!commonData.selectedArea} onClick={handleAddLocation}>＋</button>
                <button type="button" className="btn-select-action" title="現場を編集"
                  disabled={!commonData.locationId?.startsWith('local_loc_')}
                  onClick={handleEditLocation}>⚙</button>
              </div>
            </div>
          </div>

          {/* GPS 現在地取得 */}
          <div className="gps-row">
            <button
              type="button"
              className="btn-gps"
              onClick={() => {
                if (!navigator.geolocation) {
                  setGpsLocation('⚠️ このブラウザは位置情報に対応していません');
                  return;
                }
                setGpsLocation('取得中...');
                navigator.geolocation.getCurrentPosition(
                  (position) => {
                    setGpsLocation(
                      '📍 取得済み (緯度: ' + position.coords.latitude.toFixed(4) +
                      ', 経度: ' + position.coords.longitude.toFixed(4) + ')'
                    );
                  },
                  () => {
                    setGpsLocation('⚠️ 位置情報が取得できませんでした');
                  }
                );
              }}
            >
              📍 現在地を取得
            </button>
            {gpsLocation && (
              <span className="gps-result">{gpsLocation}</span>
            )}
          </div>

          {/* 案件名 */}
          <div className="form-section">
            <label>案件名</label>
            <div className="select-with-actions">
              <select
                className="input-field"
                value={commonData.departmentId}
                onChange={e => {
                  const dept = departments.find(d => d.id === e.target.value)
                    ?? MOCK_DEPARTMENTS.find(d => d.id === e.target.value);
                  setCommonData(prev => ({
                    ...prev,
                    departmentId:   e.target.value,
                    departmentName: dept?.name ?? '',
                  }));
                }}
              >
                <option value="">選択してください</option>
                {(departments.length > 0 ? departments : MOCK_DEPARTMENTS)
                  .filter(d => !commonData.selectedArea || d.area === commonData.selectedArea || d.id === commonData.departmentId)
                  .map(d => <option key={d.id} value={d.id}>{d.name}</option>)
                }
              </select>
              <button type="button" className="btn-select-action" title="案件名を追加" onClick={handleAddDept}>＋</button>
              {user?.role !== 'user' && (<>
                <button type="button" className="btn-select-action" title="案件名を編集"
                  disabled={!departments.find(d => d.id === commonData.departmentId)}
                  onClick={handleEditDept}>⚙</button>
                <button type="button" className="btn-select-action btn-select-action--danger" title="案件名を削除"
                  disabled={!departments.find(d => d.id === commonData.departmentId)}
                  onClick={handleDeleteDept}>🗑</button>
              </>)}
            </div>
          </div>

          {/* 全体の進捗 */}
          <div className="form-section">
            <label>全体の進捗</label>
            <div className="has-issue-seg">
              <button
                type="button"
                className={`has-issue-btn no${commonData.isOnSchedule ? ' active' : ''}`}
                onClick={() => setCommonData(prev => ({ ...prev, isOnSchedule: true }))}
              >
                予定通り
              </button>
              <button
                type="button"
                className={`has-issue-btn yes${!commonData.isOnSchedule ? ' active' : ''}`}
                onClick={() => setCommonData(prev => ({ ...prev, isOnSchedule: false }))}
              >
                遅延あり
              </button>
            </div>
          </div>

          {/* 遅延の理由（「遅延あり」選択時のみ表示） */}
          {!commonData.isOnSchedule && (
            <div className="form-section">
              <div className="label-with-action">
                <label>遅延の理由 <span className="required-badge">必須</span></label>
                <VoiceInput onResult={text => setCommonData(prev => ({
                  ...prev,
                  delayReason: prev.delayReason ? `${prev.delayReason}\n${text}` : text,
                }))} />
              </div>
              <textarea
                className="input-field genre-field-area"
                value={commonData.delayReason}
                onChange={e => setCommonData(prev => ({ ...prev, delayReason: e.target.value }))}
                placeholder="例：資材の搬入が遅れたため、午後の作業が翌日に持ち越しとなりました。"
                rows={3}
                data-gramm="false" autoComplete="off" data-1p-ignore="true" spellCheck={false}
              />
            </div>
          )}

          {/* 同行者 */}
          <div className="form-section">
            <div className="label-with-action">
              <label>
                <Users size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                同行者（1人作業の場合は空欄）
              </label>
              <button
                type="button"
                className="btn-coworker-toggle"
                onClick={() => setShowCoWorkers(v => !v)}
              >
                {showCoWorkers
                  ? '閉じる'
                  : commonData.coWorkers.length > 0
                    ? `変更 (${commonData.coWorkers.length}名選択中)`
                    : '選択する'}
              </button>
            </div>
            {/* 選択済みの名前を表示 */}
            {commonData.coWorkers.length > 0 && !showCoWorkers && (
              <p className="co-workers-summary">
                {profiles
                  .filter(p => commonData.coWorkers.includes(p.id))
                  .map(p => p.display_name)
                  .join('、')}
              </p>
            )}
            {/* 選択パネル */}
            {showCoWorkers && (
              <div className="co-workers-panel">
                {profiles.filter(p => p.id !== reporterId).length === 0 ? (
                  <p className="co-workers-empty">他のプロフィールが見つかりませんでした。</p>
                ) : (
                  profiles
                    .filter(p => p.id !== reporterId)
                    .map(p => (
                      <label key={p.id} className="co-worker-item">
                        <input
                          type="checkbox"
                          checked={commonData.coWorkers.includes(p.id)}
                          onChange={e => {
                            const ids = e.target.checked
                              ? [...commonData.coWorkers, p.id]
                              : commonData.coWorkers.filter(id => id !== p.id);
                            setCommonData(prev => ({ ...prev, coWorkers: ids }));
                          }}
                        />
                        {p.display_name}
                      </label>
                    ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* ━━ タスクブロック（1件ずつ） ━━ */}
        {tasks.map((task, idx) => renderTaskBlock(task, idx))}

        {/* 報告追加ボタン */}
        <button type="button" className="btn-add-task" onClick={addTask}>
          <Plus size={18} /> 別の作業を追加する
        </button>

        {validationError && (
          <div className="validation-error">
            <AlertTriangle size={16} /> {validationError}
          </div>
        )}

        <div className="form-actions">
          <button type="submit" className="btn btn-primary submit-btn">
            確認画面へ進む <Send size={18} />
          </button>
        </div>
      </form>
    </div>
  );
};

export default ReporterDashboard;
