import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import EmergencyModal from './EmergencyModal';
import PhotoUploader from './PhotoUploader';
import PreviewScreen from './PreviewScreen';
import VoiceInput from './VoiceInput';
import { Save, Send, LogOut, AlertTriangle, Plus, X, Clock, Users } from 'lucide-react';
import './ReporterDashboard.css';
import { supabase } from '../../utils/supabaseClient';

// ── 定数定義 ──────────────────────────────────────────
const GENRES = [
  { id: 'cleaning',   label: '清掃' },
  { id: 'inspection', label: '点検' },
  { id: 'repair',     label: '修理' },
  { id: 'patrol',     label: '巡回' },
  { id: 'emergency',  label: '緊急対応' },
];

const TARGET_PLACE_OPTIONS = [
  { value: 'entrance',  label: 'エントランス' },
  { value: '1f_toilet', label: '1Fトイレ' },
  { value: '2f_toilet', label: '2Fトイレ' },
  { value: 'corridor',  label: '廊下・通路' },
  { value: 'parking',   label: '駐車場' },
  { value: 'staircase', label: '階段' },
  { value: 'roof',      label: '屋上' },
  { value: 'elec_room', label: '電気室' },
  { value: 'mech_room', label: '機械室' },
  { value: 'other',     label: 'その他' },
];

const TASK_DETAIL_OPTIONS = {
  cleaning: [
    { value: 'floor_mop',    label: '床面モップ掛け' },
    { value: 'trash',        label: 'ゴミ回収・分別' },
    { value: 'glass_wipe',   label: 'ガラス拭き' },
    { value: 'toilet_clean', label: 'トイレ清掃' },
    { value: 'supply',       label: '備品補充' },
    { value: 'other',        label: 'その他' },
  ],
  inspection: [
    { value: 'fire_equip',   label: '消防設備' },
    { value: 'air_cond',     label: '空調設備' },
    { value: 'plumbing',     label: '給排水設備' },
    { value: 'electrical',   label: '電気設備' },
    { value: 'exterior',     label: '外観・建具' },
    { value: 'other',        label: 'その他' },
  ],
  repair: [
    { value: 'toilet_tap',   label: 'トイレ水栓' },
    { value: 'door_knob',    label: 'ドアノブ' },
    { value: 'lighting',     label: '蛍光灯' },
    { value: 'wall_floor',   label: '壁紙・床材' },
    { value: 'other',        label: 'その他' },
  ],
  patrol: [
    { value: 'perimeter',    label: '建物外周' },
    { value: 'corridor',     label: '各階通路' },
    { value: 'parking',      label: '駐車場・駐輪場' },
    { value: 'other',        label: 'その他' },
  ],
  emergency: [
    { value: 'water_leak',   label: '水漏れ対応' },
    { value: 'power_out',    label: '停電対応' },
    { value: 'intrusion',    label: '不審者対応' },
    { value: 'injury',       label: '負傷者対応' },
    { value: 'other',        label: 'その他' },
  ],
};

// ジャンル別症状の選択肢（点検・修理・巡回・緊急対応で異なる）
const SYMPTOM_OPTIONS = {
  inspection: [
    { value: 'malfunction',  label: '動作不良' },
    { value: 'noise_smell',  label: '異音・異臭' },
    { value: 'lamp_out',     label: 'ランプ切れ' },
    { value: 'dirt_clog',    label: '汚れ・詰まり' },
    { value: 'other',        label: 'その他' },
  ],
  repair: [
    { value: 'water_leak',   label: '水漏れ' },
    { value: 'broken',       label: '破損・割れ' },
    { value: 'light_fail',   label: '点灯不良' },
    { value: 'peeling',      label: '剥がれ' },
    { value: 'other',        label: 'その他' },
  ],
  patrol: [
    { value: 'suspicious',   label: '不審物あり' },
    { value: 'bike',         label: '放置自転車あり' },
    { value: 'light_out',    label: '照明切れ' },
    { value: 'other',        label: 'その他' },
  ],
  emergency: [
    { value: 'water_leak',   label: '水漏れ' },
    { value: 'power_out',    label: '停電' },
    { value: 'intrusion',    label: '不審者' },
    { value: 'injury',       label: '負傷者' },
    { value: 'other',        label: 'その他' },
  ],
};

// ジャンル別対応内容の選択肢（修理・緊急対応で異なる）
const ACTION_TAKEN_OPTIONS = {
  repair: [
    { value: 'replaced',     label: '部品交換' },
    { value: 'temp_fix',     label: '応急処置済み（要経過観察）' },
    { value: 'reported',     label: '専門業者へ手配済み' },
    { value: 'other',        label: 'その他' },
  ],
  emergency: [
    { value: 'first_aid',    label: '応急処置済み' },
    { value: 'specialist',   label: '専門業者へ連絡済み' },
    { value: 'authorities',  label: '警察・消防へ通報済み' },
    { value: 'other',        label: 'その他' },
  ],
};

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
  _id:             `task_${Date.now()}_${++_taskSeq}`,
  genre:           'cleaning',
  // 担当場所
  targetPlaceKey:  '',   // selectの選択値
  targetPlace:     '',   // 確定テキスト（選択ラベル or 自由入力）
  // 作業内容
  taskDetailKey:   '',
  taskDetail:      '',
  // 症状（任意）
  symptomKey:      '',
  symptom:         '',
  // 対応内容（任意）
  actionTakenKey:  '',
  actionTaken:     '',
  // 評価
  hasProblem:      false,
  // 報告内容（定型文自動挿入対象）
  findings:        '',
  // 備考
  showMemo:        false,
  memo:            '',
  // 写真
  photos:          [],
  // バリデーション
  fieldErrors:     {},
});

// ══════════════════════════════════════════════════════
//  コンポーネント
// ══════════════════════════════════════════════════════
const ReporterDashboard = () => {
  const { logout, user } = useAuth();
  const [showEmergency,      setShowEmergency]      = useState(false);
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
    // 「その他（新規追加）」選択時の自由入力値
    newAreaName:       '',
    newLocationName:   '',
    newDepartmentName: '',
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

  // ── マスタデータ取得 ──────────────────────────────
  useEffect(() => {
    supabase.from('locations').select('id, name, area').order('area')
      .then(({ data, error }) => {
        if (error) { console.error('[Supabase] locations 取得失敗:', error.message); return; }
        setLocations(data ?? []);
      });
  }, []);

  useEffect(() => {
    supabase.from('departments').select('id, name').order('name')
      .then(({ data, error }) => {
        if (error) { console.error('[Supabase] departments 取得失敗:', error.message); return; }
        if (data?.length > 0) setDepartments(data);
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

  // ── 自動保存（2秒デバウンス） ──────────────────────
  useEffect(() => {
    const hasInput = commonData.date
      || tasks.some(t => t.targetPlace || t.taskDetail || t.findings);
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

  // セレクト型フィールド更新（ラベルをテキストとして保存）
  const updateSelectField = (idx, keyField, textField, optionsList, value) => {
    const label = value !== 'other'
      ? (optionsList.find(o => o.value === value)?.label ?? '')
      : '';
    updateTask(idx, {
      [keyField]: value,
      [textField]: value !== 'other' ? label : '',
      fieldErrors: { ...tasks[idx].fieldErrors, [textField]: '' },
    });
  };

  const handleGenreChange = (idx, genreId) => {
    updateTask(idx, {
      genre:         genreId,
      taskDetailKey: '',
      taskDetail:    '',
      fieldErrors:   {},
      showMemo:      false,
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

      if (task.genre === 'emergency') {
        // 緊急対応：担当場所・状況・症状・対応内容のいずれか1つがあればOK
        const anyFilled = task.targetPlace.trim() || task.taskDetail.trim()
                       || task.symptom.trim()     || task.actionTaken.trim();
        if (!anyFilled) {
          setValidationError(`${prefix}担当場所・状況・症状・対応内容のいずれかを入力してください。`);
          return false;
        }
        // 緊急対応は報告内容が必須
        if (!task.findings.trim()) {
          setValidationError(`${prefix}緊急対応の報告内容は必須です。詳細を記入してください。`);
          return false;
        }
      } else {
        if (!task.targetPlace.trim() && !task.taskDetail.trim()) {
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
    // ── 新規現場の登録（「その他」選択時）──────────────
    let finalLocationId   = commonData.locationId   || null;
    let finalDepartmentId = commonData.departmentId || null;

    if (commonData.locationId === 'other') {
      const locName  = commonData.newLocationName.trim();
      const areaName = commonData.selectedArea === 'other'
        ? commonData.newAreaName.trim()
        : commonData.selectedArea;
      if (!locName) { alert('新しい現場名を入力してください。'); return; }
      const { data: newLoc, error: locErr } = await supabase
        .from('locations').insert({ name: locName, area: areaName }).select('id').single();
      if (locErr) { alert('現場の追加に失敗しました: ' + locErr.message); return; }
      finalLocationId = newLoc.id;
      // ローカルリストに反映して次回から選択肢に表示
      setLocations(prev => [...prev, { id: newLoc.id, name: locName, area: areaName }]);
    }

    if (commonData.departmentId === 'other') {
      const deptName = commonData.newDepartmentName.trim();
      if (!deptName) { alert('新しい案件名を入力してください。'); return; }
      const { data: newDept, error: deptErr } = await supabase
        .from('departments').insert({ name: deptName }).select('id').single();
      if (deptErr) { alert('案件名の追加に失敗しました: ' + deptErr.message); return; }
      finalDepartmentId = newDept.id;
      setDepartments(prev => [...prev, { id: newDept.id, name: deptName }]);
    }

    // ① reports（親）を1件 INSERT
    const { data: reportRow, error: reportError } = await supabase
      .from('reports')
      .insert({
        work_date:      commonData.date,
        start_time:     commonData.startTime  || null,
        end_time:       commonData.endTime    || null,
        location_id:    finalLocationId,
        department_id:  finalDepartmentId,
        reporter_id:    reporterId || null,
        co_workers:     commonData.coWorkers.length > 0 ? commonData.coWorkers : null,
        is_on_schedule: commonData.isOnSchedule,
        delay_reason:   commonData.isOnSchedule ? null : (commonData.delayReason.trim() || null),
      })
      .select('id')
      .single();

    if (reportError) {
      alert('報告書の保存に失敗しました。\n' + reportError.message);
      return;
    }
    const reportId = reportRow.id;

    // ② report_tasks（子）を各タスクごとに INSERT → ③ photos（孫）をアップロード＆INSERT
    const photoFailures = []; // 失敗した写真のファイル名を蓄積

    for (let tIdx = 0; tIdx < tasks.length; tIdx++) {
      const task        = tasks[tIdx];
      const taskLabel   = tasks.length > 1 ? `作業${tIdx + 1}` : '作業';

      // ── ② report_tasks INSERT（V3: ジャンル固有項目はcustom_dataにまとめる）
      const customData = {};
      if (task.targetPlace.trim()) customData.target_place = task.targetPlace.trim();
      if (task.taskDetail.trim())  customData.task_detail  = task.taskDetail.trim();
      if (task.symptom.trim())     customData.symptom      = task.symptom.trim();
      if (task.actionTaken.trim()) customData.action_taken = task.actionTaken.trim();

      const { data: taskRow, error: taskError } = await supabase
        .from('report_tasks')
        .insert({
          report_id:   reportId,
          genre:       task.genre,
          has_problem: task.genre === 'emergency' ? true : task.hasProblem,
          findings:    task.findings.trim() || null,
          custom_data: Object.keys(customData).length > 0 ? customData : null,
        })
        .select('id')
        .single();

      if (taskError) {
        alert(`${taskLabel}の保存に失敗しました。\n${taskError.message}`);
        return;
      }
      const taskId = taskRow.id; // ← 写真に紐付ける task_id（UUID）

      // ── ③ 写真ごとにアップロード → photos INSERT ─────
      for (let pIdx = 0; pIdx < task.photos.length; pIdx++) {
        const photo = task.photos[pIdx];

        // file プロパティが存在しない場合はスキップ（自動保存復元時など）
        if (!photo.file) {
          console.warn(`[写真] ${taskLabel}-写真${pIdx + 1}: file が存在しないためスキップ`);
          continue;
        }

        // 拡張子を安全に取得
        const rawExt   = (photo.name ?? '').split('.').pop();
        const ext      = /^[a-zA-Z0-9]+$/.test(rawExt) ? rawExt.toLowerCase() : 'jpg';
        const rand     = Math.random().toString(36).slice(2, 10);
        const filePath = `${reportId}/${taskId}/${Date.now()}_${rand}.${ext}`;

        // Storage へアップロード
        const { error: uploadError } = await supabase.storage
          .from('photos')
          .upload(filePath, photo.file, { upsert: false });

        if (uploadError) {
          console.error(`[Supabase] ${taskLabel}-写真${pIdx + 1} アップロード失敗:`, uploadError.message);
          photoFailures.push(`${taskLabel}-写真${pIdx + 1}（${uploadError.message}）`);
          continue; // 1枚失敗しても他の写真を続行
        }

        // 公開URLを取得して photos テーブルに INSERT（task_id で紐付け）
        const { data: urlData } = supabase.storage.from('photos').getPublicUrl(filePath);
        const { error: insertError } = await supabase.from('photos').insert({
          task_id:   taskId,
          photo_url: urlData.publicUrl,
        });

        if (insertError) {
          console.error(`[Supabase] ${taskLabel}-写真${pIdx + 1} DB登録失敗:`, insertError.message);
          photoFailures.push(`${taskLabel}-写真${pIdx + 1}（${insertError.message}）`);
        }
      }
    }

    // 写真の失敗があれば報告（報告書本体は保存済み）
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

  // ── タスクブロック描画 ─────────────────────────────
  const renderTaskBlock = (task, idx) => {
    const taskDetailOpts     = TASK_DETAIL_OPTIONS[task.genre]     ?? [{ value: 'other', label: 'その他' }];
    const symptomOpts        = SYMPTOM_OPTIONS[task.genre]         ?? [{ value: 'other', label: 'その他' }];
    const actionTakenOpts    = ACTION_TAKEN_OPTIONS[task.genre]    ?? [{ value: 'other', label: 'その他' }];
    const isTargetPlaceOther = task.targetPlaceKey === 'other';
    const isTaskDetailOther  = task.taskDetailKey  === 'other';
    const isSymptomOther     = task.symptomKey     === 'other';
    const isActionTakenOther = task.actionTakenKey === 'other';

    // ジャンルごとの表示制御
    const showSymptom     = ['inspection', 'repair', 'emergency'].includes(task.genre);
    const showActionTaken = ['repair', 'emergency'].includes(task.genre);
    // 点検・巡回は「異常の有無」、それ以外は「問題の有無」
    const hasProblemLabel = ['inspection', 'patrol'].includes(task.genre) ? '異常の有無' : '問題の有無';
    const noLabel         = ['inspection', 'patrol'].includes(task.genre) ? '異常無し' : '問題無し';
    const yesLabel        = ['inspection', 'patrol'].includes(task.genre) ? '異常あり' : '問題あり';

    // ジャンルごとの作業詳細ラベル
    const taskDetailLabel = {
      cleaning:   '清掃内容',
      inspection: '点検項目',
      repair:     '対象箇所',
      patrol:     '巡回箇所',
      emergency:  '状況・対応内容',
    }[task.genre] ?? '作業内容';

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
            {GENRES.map(g => (
              <button
                key={g.id}
                type="button"
                className={`genre-tab ${task.genre === g.id ? 'active' : ''}`}
                onClick={() => handleGenreChange(idx, g.id)}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* 担当場所（全ジャンル共通） */}
        <div className="form-section">
          <label>担当場所</label>
          <select
            className="input-field"
            value={task.targetPlaceKey}
            onChange={e =>
              updateSelectField(idx, 'targetPlaceKey', 'targetPlace', TARGET_PLACE_OPTIONS, e.target.value)
            }
          >
            <option value="">選択してください</option>
            {TARGET_PLACE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {isTargetPlaceOther && (
            <div style={{ marginTop: '8px' }}>
              <div className="label-with-action" style={{ marginBottom: '6px' }}>
                <span className="field-other-label">場所を詳しく入力</span>
                <VoiceInput onResult={text => updateTask(idx, {
                  targetPlace: task.targetPlace ? `${task.targetPlace}${text}` : text,
                })} />
              </div>
              <input
                type="text"
                className="input-field"
                value={task.targetPlace}
                onChange={e => updateTask(idx, { targetPlace: e.target.value })}
                placeholder="場所を具体的に入力してください..."
                data-gramm="false" autoComplete="off" data-1p-ignore="true" spellCheck={false}
              />
            </div>
          )}
        </div>

        {/* ジャンル別：作業詳細フィールド */}
        <div className="form-section">
          <label>{taskDetailLabel}</label>
          <select
            className="input-field"
            value={task.taskDetailKey}
            onChange={e =>
              updateSelectField(idx, 'taskDetailKey', 'taskDetail', taskDetailOpts, e.target.value)
            }
          >
            <option value="">選択してください</option>
            {taskDetailOpts.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {isTaskDetailOther && (
            <div style={{ marginTop: '8px' }}>
              <div className="label-with-action" style={{ marginBottom: '6px' }}>
                <span className="field-other-label">詳しく入力</span>
                <VoiceInput onResult={text => updateTask(idx, {
                  taskDetail: task.taskDetail ? `${task.taskDetail}\n${text}` : text,
                })} />
              </div>
              <textarea
                className="input-field genre-field-area"
                value={task.taskDetail}
                onChange={e => updateTask(idx, { taskDetail: e.target.value })}
                placeholder={`${taskDetailLabel}を具体的に入力してください...`}
                rows={2}
                data-gramm="false" autoComplete="off" data-1p-ignore="true" spellCheck={false}
              />
            </div>
          )}
        </div>

        {/* 症状（点検・修理・緊急対応のみ） */}
        {showSymptom && (
          <div className="form-section">
            <label>症状</label>
            <select
              className="input-field"
              value={task.symptomKey}
              onChange={e =>
                updateSelectField(idx, 'symptomKey', 'symptom', symptomOpts, e.target.value)
              }
            >
              <option value="">選択してください</option>
              {symptomOpts.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {isSymptomOther && (
              <div style={{ marginTop: '8px' }}>
                <div className="label-with-action" style={{ marginBottom: '6px' }}>
                  <span className="field-other-label">症状を詳しく入力</span>
                  <VoiceInput onResult={text => updateTask(idx, {
                    symptom: task.symptom ? `${task.symptom}${text}` : text,
                  })} />
                </div>
                <input
                  type="text"
                  className="input-field"
                  value={task.symptom}
                  onChange={e => updateTask(idx, { symptom: e.target.value })}
                  placeholder="症状を具体的に入力してください..."
                  data-gramm="false" autoComplete="off" data-1p-ignore="true" spellCheck={false}
                />
              </div>
            )}
          </div>
        )}

        {/* 対応内容（修理・緊急対応のみ） */}
        {showActionTaken && (
          <div className="form-section">
            <label>対応内容</label>
            <select
              className="input-field"
              value={task.actionTakenKey}
              onChange={e =>
                updateSelectField(idx, 'actionTakenKey', 'actionTaken', actionTakenOpts, e.target.value)
              }
            >
              <option value="">選択してください</option>
              {actionTakenOpts.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {isActionTakenOther && (
              <div style={{ marginTop: '8px' }}>
                <div className="label-with-action" style={{ marginBottom: '6px' }}>
                  <span className="field-other-label">対応内容を詳しく入力</span>
                  <VoiceInput onResult={text => updateTask(idx, {
                    actionTaken: task.actionTaken ? `${task.actionTaken}\n${text}` : text,
                  })} />
                </div>
                <textarea
                  className="input-field genre-field-area"
                  value={task.actionTaken}
                  onChange={e => updateTask(idx, { actionTaken: e.target.value })}
                  placeholder="対応内容を具体的に入力してください..."
                  rows={2}
                  data-gramm="false" autoComplete="off" data-1p-ignore="true" spellCheck={false}
                />
              </div>
            )}
          </div>
        )}

        {/* 問題の有無 / 異常の有無（緊急対応は非表示・強制true） */}
        {task.genre !== 'emergency' && (
          <div className="form-section">
            <label>{hasProblemLabel}</label>
            <div className="has-issue-seg">
              {[
                { value: false, label: noLabel,  colorClass: 'no' },
                { value: true,  label: yesLabel, colorClass: 'yes' },
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
      {showEmergency && <EmergencyModal onClose={() => setShowEmergency(false)} />}

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
            <input
              type="date"
              className="input-field"
              value={commonData.date}
              onChange={e => setCommonData(prev => ({ ...prev, date: e.target.value }))}
              autoComplete="off" data-1p-ignore="true"
            />
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
              <select
                className="input-field"
                value={commonData.selectedArea}
                onChange={e => setCommonData(prev => ({
                  ...prev,
                  selectedArea:    e.target.value,
                  locationId:      '',
                  locationName:    '',
                  newAreaName:     '',
                  newLocationName: '',
                }))}
              >
                <option value="">エリアを選択してください</option>
                {[...new Set(locations.map(l => l.area))].map(area => (
                  <option key={area} value={area}>{area}</option>
                ))}
                <option value="other">その他（新規追加）</option>
              </select>
              {/* 新規エリア名入力 */}
              {commonData.selectedArea === 'other' && (
                <input
                  type="text"
                  className="input-field"
                  style={{ marginTop: '8px' }}
                  value={commonData.newAreaName}
                  onChange={e => setCommonData(prev => ({ ...prev, newAreaName: e.target.value }))}
                  placeholder="新しいエリア名を入力..."
                  autoComplete="off" data-1p-ignore="true"
                />
              )}
            </div>
            <div className="form-section flex-1">
              <label>現場</label>
              <select
                className="input-field"
                value={commonData.locationId}
                disabled={!commonData.selectedArea}
                onChange={e => {
                  if (e.target.value === 'other') {
                    setCommonData(prev => ({
                      ...prev, locationId: 'other', locationName: '', newLocationName: '',
                    }));
                  } else {
                    const loc = locations.find(l => l.id === e.target.value);
                    setCommonData(prev => ({
                      ...prev,
                      locationId:   e.target.value,
                      locationName: loc?.name ?? '',
                    }));
                  }
                }}
              >
                <option value="">
                  {commonData.selectedArea ? '現場を選択してください' : '先にエリアを選択してください'}
                </option>
                {locations
                  .filter(l => l.area === commonData.selectedArea)
                  .map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                {commonData.selectedArea && (
                  <option value="other">その他（新規追加）</option>
                )}
              </select>
              {/* 新規現場名入力 */}
              {commonData.locationId === 'other' && (
                <input
                  type="text"
                  className="input-field"
                  style={{ marginTop: '8px' }}
                  value={commonData.newLocationName}
                  onChange={e => setCommonData(prev => ({
                    ...prev, newLocationName: e.target.value, locationName: e.target.value,
                  }))}
                  placeholder="新しい現場名を入力..."
                  autoComplete="off" data-1p-ignore="true"
                />
              )}
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

          {/* 部署 */}
          <div className="form-section">
            <label>案件名</label>
            <select
              className="input-field"
              value={commonData.departmentId}
              onChange={e => {
                if (e.target.value === 'other') {
                  setCommonData(prev => ({
                    ...prev, departmentId: 'other', departmentName: '', newDepartmentName: '',
                  }));
                } else {
                  const dept = departments.find(d => d.id === e.target.value);
                  setCommonData(prev => ({
                    ...prev,
                    departmentId:   e.target.value,
                    departmentName: dept?.name ?? '',
                  }));
                }
              }}
            >
              <option value="">選択してください</option>
              {departments.length > 0
                ? departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))
                : (
                  <>
                    <option value="shinjuku_cleaning">新宿ビル 定期清掃案件</option>
                    <option value="iruma_ac">入間パーク 空調保守・点検</option>
                    <option value="tower_patrol">〇〇タワー 巡回警備業務</option>
                  </>
                )
              }
              <option value="other">その他（新規追加）</option>
            </select>
            {/* 新規部署名入力 */}
            {commonData.departmentId === 'other' && (
              <input
                type="text"
                className="input-field"
                style={{ marginTop: '8px' }}
                value={commonData.newDepartmentName}
                onChange={e => setCommonData(prev => ({
                  ...prev, newDepartmentName: e.target.value, departmentName: e.target.value,
                }))}
                placeholder="新しい案件名を入力..."
                autoComplete="off" data-1p-ignore="true"
              />
            )}
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
