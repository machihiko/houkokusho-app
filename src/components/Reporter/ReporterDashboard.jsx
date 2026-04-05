import { useState, useEffect } from 'react';
import { useAuth } from '../../AuthContext';
import EmergencyModal from './EmergencyModal';
import PhotoUploader from './PhotoUploader';
import PreviewScreen from './PreviewScreen';
import VoiceInput from './VoiceInput';
import { Save, Send, LogOut, AlertTriangle, /*Bot, Loader,*/ Plus, X } from 'lucide-react';
import './ReporterDashboard.css';
import { supabase } from '../../utils/supabaseClient';

// ── 定数定義 ──────────────────────────────────────────
const GENRES = [
  { id: 'cleaning',   label: '清掃' },
  { id: 'inspection', label: '点検' },
  { id: 'repair',     label: '修理' },
];

const GENRE_FIELD_DEFS = {
  inspection: [
    { key: 'item', label: '点検項目', type: 'select',
      placeholder: 'その他の場合は具体的に入力してください...' },
  ],
  cleaning: [
    { key: 'place',  label: '清掃場所',  type: 'select',
      placeholder: 'その他の場合は具体的に入力してください...' },
    { key: 'work',   label: '清掃内容',  type: 'select',
      placeholder: 'その他の場合は具体的に入力してください...' },
    // { key: 'notes',  label: '特記事項',  type: 'textarea',
    //   placeholder: '例：特になし / 落書きを発見、管理者へ報告済み' },
  ],
  repair: [
    { key: 'target',  label: '対象箇所',  type: 'select',
      placeholder: 'その他の場合は具体的に入力してください...' },
    { key: 'symptom', label: '症状',      type: 'select',
      placeholder: 'その他の場合は具体的に入力してください...' },
    { key: 'action',  label: '対応内容',  type: 'select',
      placeholder: 'その他の場合は具体的に入力してください...' },
  ],
};

const SELECT_OPTIONS = {
  inspection: {
    item: [
      { value: 'air_filter',  label: '空調フィルター' },
      { value: 'fire_equip',  label: '消火設備' },
      { value: 'drain_pump',  label: '排水ポンプ' },
      { value: 'electrical',  label: '電気設備' },
      { value: 'other',       label: 'その他' },
    ],
  },
  cleaning: {
    place: [
      { value: '1f_toilet',  label: '1Fトイレ' },
      { value: 'entrance',   label: 'エントランス' },
      { value: 'corridor',   label: '廊下・通路' },
      { value: 'parking',    label: '駐車場' },
      { value: 'other',      label: 'その他' },
    ],
    work: [
      { value: 'floor_mop',  label: '床面モップ掛け' },
      { value: 'glass_wipe', label: 'ガラス清拭' },
      { value: 'trash',      label: 'ゴミ回収・分別' },
      { value: 'sink_clean', label: '洗面台・シンク清掃' },
      { value: 'other',      label: 'その他' },
    ],
  },
  repair: {
    target: [
      { value: 'toilet_lever', label: 'トイレ 水栓レバー' },
      { value: 'door',         label: 'ドア・扉' },
      { value: 'light',        label: '照明設備' },
      { value: 'drain',        label: '排水設備' },
      { value: 'other',        label: 'その他' },
    ],
    symptom: [
      { value: 'water_leak',  label: '水漏れ' },
      { value: 'broken',      label: '破損・割れ' },
      { value: 'noise',       label: '異音' },
      { value: 'not_working', label: '動作不良' },
      { value: 'other',       label: 'その他' },
    ],
    action: [
      { value: 'replaced',  label: '部品交換により修理完了' },
      { value: 'temp_fix',  label: '応急処置済み・要経過観察' },
      { value: 'reported',  label: '業者へ連絡済み・対応待ち' },
      { value: 'other',     label: 'その他' },
    ],
  },
};

const INITIAL_GENRE_FIELDS = {
  inspection: { item: '' },
  cleaning:   { place: '', work: '', notes: '' },
  repair:     { target: '', symptom: '', action: '' },
};

const INITIAL_SELECTED_OPTIONS = {
  inspection: { item: '' },
  cleaning:   { place: '', work: '' },
  repair:     { target: '', symptom: '', action: '' },
};

const HAS_ISSUE_OPTIONS = [
  { value: false, label: '問題無し', colorClass: 'no' },
  { value: true,  label: '問題あり', colorClass: 'yes' },
];

const ANOMALY_LEVELS = [
  { value: 0, label: '異常無し',     colorClass: 'level-0' },
  { value: 1, label: '軽微な\n異変', colorClass: 'level-1' },
  { value: 2, label: '要確認',       colorClass: 'level-2' },
  { value: 3, label: '異常あり',     colorClass: 'level-3' },
];

const PROGRESS_OPTIONS = {
  cleaning:   [
    { value: 'done',        label: '完了' },
    { value: 'incomplete',  label: '未完了' },
    { value: 'not_started', label: '未着手' },
  ],
  inspection: [
    { value: 'on_track', label: '順調' },
    { value: 'delayed',  label: '遅れあり' },
  ],
  repair: [
    { value: 'on_track', label: '順調' },
    { value: 'delayed',  label: '遅れあり' },
  ],
};

const PROGRESS_LABELS = {
  cleaning:   '達成度',
  inspection: '進捗状況',
  repair:     '進捗状況',
};

const PROGRESS_REQUIRES_MEMO = new Set(['incomplete', 'not_started', 'delayed']);

// ── タスク初期値ファクトリー ──────────────────────────
let _taskSeq = 0;
const createTask = () => ({
  _id:            `task_${Date.now()}_${++_taskSeq}`,
  genre:          'cleaning',
  department:     '',
  hasIssue:       false,
  issueDetail:    '',
  genreFields:    JSON.parse(JSON.stringify(INITIAL_GENRE_FIELDS)),
  selectedOptions: JSON.parse(JSON.stringify(INITIAL_SELECTED_OPTIONS)),
  anomalyLevel:   0,
  anomalyDetail:  '',
  progress:       '',
  showMemo:       false,
  memo:           '',
  photos:         [],
  fieldErrors:    {},
  progressError:  '',
});

// ══════════════════════════════════════════════════════
//  コンポーネント
// ══════════════════════════════════════════════════════
const ReporterDashboard = () => {
  const { logout, user } = useAuth();
  const [showEmergency,      setShowEmergency]      = useState(false);
  const [showPreview,        setShowPreview]        = useState(false);
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);

  // 共通項目（作業日は空欄スタート → EXIFで自動入力 or 手動入力）
  const [commonData, setCommonData] = useState({
    date:         '',
    selectedArea: '',
    locationId:   '',
  });

  // 現場一覧
  const [locations, setLocations] = useState([]);

  // タスク一覧（初期1件）
  const [tasks, setTasks] = useState([createTask()]);

  // グローバルエラー
  const [validationError, setValidationError] = useState('');

  // AI赤ペン先生（一時非表示のためコメントアウト）
  // const [useAI,             setUseAI]             = useState(false);
  // const [aiFeedback,        setAiFeedback]        = useState('');
  // const [aiFeedbackLoading, setAiFeedbackLoading] = useState(false);

  // ── 現場データ取得 ────────────────────────────────
  useEffect(() => {
    supabase
      .from('locations')
      .select('id, name, area')
      .order('area')
      .then(({ data, error }) => {
        if (error) { console.error('[Supabase] locations 取得失敗:', error.message); return; }
        setLocations(data ?? []);
      });
  }, []);

  // ── 自動保存ダイアログ検出 ─────────────────────────
  useEffect(() => {
    const raw = localStorage.getItem('re_report_autosave');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      // v2 フォーマットのみ復元対象とする
      if (parsed._version === 2) setShowRecoveryDialog(true);
      else localStorage.removeItem('re_report_autosave');
    } catch { localStorage.removeItem('re_report_autosave'); }
  }, []);

  // ── 自動保存（2秒デバウンス） ──────────────────────
  useEffect(() => {
    const hasInput = tasks.some(t =>
      t.department || Object.values(t.genreFields[t.genre]).some(v => typeof v === 'string' && v.trim())
    );
    const handler = setTimeout(() => {
      if (hasInput) {
        localStorage.setItem('re_report_autosave', JSON.stringify({
          _version: 2,
          commonData,
          // photos はバイナリなので保存対象外
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
            ...createTask(), ...t,
            photos: [], fieldErrors: {}, progressError: '',
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

  const updateGenreField = (idx, key, value) => {
    const t = tasks[idx];
    updateTask(idx, {
      genreFields: { ...t.genreFields, [t.genre]: { ...t.genreFields[t.genre], [key]: value } },
      fieldErrors: { ...t.fieldErrors, [key]: '' },
    });
  };

  const updateSelectField = (idx, key, optionValue) => {
    const t = tasks[idx];
    const label = optionValue !== 'other'
      ? (SELECT_OPTIONS[t.genre][key]?.find(o => o.value === optionValue)?.label ?? '')
      : '';
    updateTask(idx, {
      selectedOptions: { ...t.selectedOptions, [t.genre]: { ...t.selectedOptions[t.genre], [key]: optionValue } },
      genreFields: {
        ...t.genreFields,
        [t.genre]: { ...t.genreFields[t.genre], [key]: optionValue !== 'other' ? label : '' },
      },
      fieldErrors: { ...t.fieldErrors, [key]: '' },
    });
  };

  const appendToGenreField = (idx, key, text) => {
    const t = tasks[idx];
    const current = t.genreFields[t.genre][key];
    updateGenreField(idx, key, current ? `${current}\n${text}` : text);
  };

  const handleGenreChange = (idx, genreId) => {
    updateTask(idx, {
      genre: genreId, progress: '', progressError: '', fieldErrors: {}, showMemo: false,
      ...(genreId !== 'inspection' ? { anomalyLevel: 0, anomalyDetail: '' } : {}),
    });
  };

  const addTask    = () => setTasks(prev => [...prev, createTask()]);
  const removeTask = (idx) => setTasks(prev => prev.filter((_, i) => i !== idx));

  // ── コンテンツ組み立て（1タスク分） ────────────────
  const buildContent = (task) => {
    const { genre, hasIssue, issueDetail, anomalyLevel, anomalyDetail, progress, showMemo, memo } = task;
    const defs   = GENRE_FIELD_DEFS[genre];
    const fields = task.genreFields[genre];
    const lines  = defs.map(def => `【${def.label}】${fields[def.key]}`);
    lines.push(`【問題の有無】${hasIssue ? '問題あり' : '問題無し'}`);
    if (issueDetail.trim()) lines.push(`【問題の詳細】${issueDetail}`);
    if (genre === 'inspection') {
      const aOpt = ANOMALY_LEVELS.find(l => l.value === anomalyLevel);
      if (aOpt) lines.push(`【異常の有無】${aOpt.label.replace('\n', '')}`);
      if (anomalyDetail.trim()) lines.push(`【所見】${anomalyDetail}`);
    }
    if (progress) {
      const opt = PROGRESS_OPTIONS[genre].find(o => o.value === progress);
      if (opt) lines.push(`【${PROGRESS_LABELS[genre]}】${opt.label}`);
    }
    if ((showMemo || PROGRESS_REQUIRES_MEMO.has(progress)) && memo.trim()) {
      lines.push(`【備考】${memo}`);
    }
    return lines.join('\n');
  };

  // ── プレビューデータ構築（PreviewScreen互換） ──────
  const buildPreviewData = () => {
    const first = tasks[0];
    const combined = tasks.length === 1
      ? buildContent(first)
      : tasks
          .map((t, i) => `━━ 作業${i + 1}（${GENRES.find(g => g.id === t.genre)?.label}） ━━\n${buildContent(t)}`)
          .join('\n\n');
    return {
      genre:       first.genre,
      department:  first.department,
      date:        commonData.date,
      hasIssue:    first.hasIssue,
      issueDetail: first.issueDetail,
      hasDelay:    tasks.some(t => PROGRESS_REQUIRES_MEMO.has(t.progress)) ? 'yes' : 'no',
      content:     combined,
      photos:      tasks.flatMap(t => t.photos),
    };
  };

  // ── AI赤ペン先生（一時非表示のためコメントアウト） ──
  /* const handleAIToggle = () => {
    if (useAI) { setUseAI(false); setAiFeedback(''); return; }
    setUseAI(true);
    setAiFeedbackLoading(true);
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      setAiFeedback('APIキーが設定されていません。.envファイルにVITE_GEMINI_API_KEYを設定してください。');
      setAiFeedbackLoading(false);
      return;
    }
    const allContent = tasks
      .map((t, i) => `[作業${i + 1}: ${GENRES.find(g => g.id === t.genre)?.label}]\n${buildContent(t)}`)
      .join('\n\n');
    const prompt = `以下の業務報告書の内容を読み、不明確な点・不足している情報・改善すべき表現について日本語で具体的にアドバイスしてください。箇条書きで簡潔に3点以内でまとめてください。問題がなければ「特に指摘はありません」と答えてください。\n\n${allContent}`;

    fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    })
      .then(res => {
        if (!res.ok) return res.text().then(b => { throw new Error(`HTTP ${res.status} - ${b}`); });
        return res.json();
      })
      .then(data => {
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '返答を取得できませんでした。';
        setAiFeedback(String(text));
      })
      .catch(e => setAiFeedback(`AIとの通信に失敗しました。\n詳細: ${e.message}`))
      .finally(() => setAiFeedbackLoading(false));
  }; */

  // ── バリデーション（全タスク） ────────────────────
  const validateAll = () => {
    setValidationError('');
    if (!commonData.date) {
      setValidationError('作業日は必須です。');
      return false;
    }
    for (let idx = 0; idx < tasks.length; idx++) {
      const task  = tasks[idx];
      const prefix = tasks.length > 1 ? `作業${idx + 1}：` : '';
      const defs   = GENRE_FIELD_DEFS[task.genre];
      const fields = task.genreFields[task.genre];

      if (!task.department) {
        setValidationError(`${prefix}部署名は必須です。`);
        return false;
      }
      if (!defs.some(def => fields[def.key]?.trim())) {
        setValidationError(`${prefix}報告内容を少なくとも1項目入力してください。`);
        return false;
      }
      if (!task.progress) {
        updateTask(idx, { progressError: '選択してください' });
        setValidationError(`${prefix}${PROGRESS_LABELS[task.genre]}を選択してください。`);
        return false;
      }

      const MIN_LEN = 5;
      const minMsg  = 'もう少し具体的に入力してください（5文字以上）';
      const newFieldErrors = {};
      defs.forEach(def => {
        if (def.type === 'select' && task.selectedOptions[task.genre]?.[def.key] !== 'other') return;
        const val = fields[def.key]?.trim() ?? '';
        if (val.length > 0 && val.length < MIN_LEN) newFieldErrors[def.key] = minMsg;
      });
      const memoRequired = PROGRESS_REQUIRES_MEMO.has(task.progress);
      if ((task.showMemo || memoRequired) && task.memo.trim().length > 0 && task.memo.trim().length < MIN_LEN) {
        newFieldErrors.memo = minMsg;
      }
      if (Object.keys(newFieldErrors).length > 0) {
        updateTask(idx, { fieldErrors: newFieldErrors });
        return false;
      }

      if (task.hasIssue && !task.issueDetail.trim()) {
        setValidationError(`${prefix}問題の詳細を入力してください。`);
        return false;
      }
      if (task.anomalyLevel > 0 && task.genre === 'inspection' && !task.anomalyDetail.trim()) {
        setValidationError(`${prefix}異常の所見を入力してください。`);
        return false;
      }
      if (memoRequired && !task.memo.trim()) {
        setValidationError(`${prefix}遅延や未完了の理由を備考欄に入力してください。`);
        return false;
      }
    }
    return true;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateAll()) setShowPreview(true);
  };

  // ── 送信（全タスク分 INSERT） ────────────────────
  const handleConfirm = async () => {
    for (const task of tasks) {
      const { data: reportRows, error: reportError } = await supabase
        .from('reports')
        .insert({
          genre:       task.genre,
          department:  task.department,
          work_date:   commonData.date,
          has_problem: task.hasIssue,
          location_id: commonData.locationId || null,
        })
        .select('id')
        .single();

      if (reportError) {
        console.error('[Supabase] 報告書の保存に失敗しました:', reportError);
        alert('送信に失敗しました。\n' + reportError.message);
        return;
      }

      const reportId      = reportRows.id;
      const fields        = task.genreFields[task.genre];
      const memoRequired  = PROGRESS_REQUIRES_MEMO.has(task.progress);
      const memoValue     = (task.showMemo || memoRequired) && task.memo.trim() ? task.memo.trim() : null;
      const progressLabel = PROGRESS_OPTIONS[task.genre].find(o => o.value === task.progress)?.label ?? task.progress;

      if (task.genre === 'cleaning') {
        const { error } = await supabase.from('cleanings').insert({
          report_id:     reportId,
          location:      fields.place,
          item:          fields.work,
          is_completed:  progressLabel,
          special_notes: fields.notes || null,
          notes:         memoValue,
        });
        if (error) { alert('清掃詳細の送信に失敗しました。\n' + error.message); return; }
      } else if (task.genre === 'inspection') {
        const { error } = await supabase.from('inspections').insert({
          report_id:       reportId,
          inspection_item: fields.item,
          anomaly_level:   task.anomalyLevel,
          findings:        task.anomalyDetail.trim() || null,
          is_delayed:      progressLabel,
          notes:           memoValue,
        });
        if (error) { alert('点検詳細の送信に失敗しました。\n' + error.message); return; }
      } else if (task.genre === 'repair') {
        const { error } = await supabase.from('repairs').insert({
          report_id:     reportId,
          repair_item:   fields.target,
          repair_detail: fields.symptom || null,
          repair_action: fields.action  || null,
          progress:      progressLabel,
          notes:         memoValue,
        });
        if (error) { alert('修理詳細の送信に失敗しました。\n' + error.message); return; }
      }

      // 写真アップロード
      for (const photo of task.photos) {
        try {
          const rawExt     = photo.name.split('.').pop();
          const ext        = /^[a-zA-Z0-9]+$/.test(rawExt) ? rawExt.toLowerCase() : 'jpg';
          const rand       = Math.random().toString(36).slice(2, 10);
          const filePath   = `${reportId}/${Date.now()}_${rand}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from('photos').upload(filePath, photo.file, { upsert: false });
          if (uploadError) { console.error('[Supabase] 写真アップロード失敗:', uploadError); continue; }
          const { data: urlData } = supabase.storage.from('photos').getPublicUrl(filePath);
          await supabase.from('photos').insert({ report_id: reportId, photo_url: urlData.publicUrl });
        } catch (e) { console.error('[Supabase] 写真処理エラー:', e); }
      }
    }

    alert(`${tasks.length}件の報告書を送信しました！`);
    localStorage.removeItem('re_report_autosave');
    window.location.reload();
  };

  // ── プレビュー表示中 ──────────────────────────────
  if (showPreview) {
    return (
      <PreviewScreen
        data={buildPreviewData()}
        onBack={() => setShowPreview(false)}
        onConfirm={handleConfirm}
      />
    );
  }

  // ── タスクブロック描画 ─────────────────────────────
  const renderTaskBlock = (task, idx) => {
    const memoRequired          = PROGRESS_REQUIRES_MEMO.has(task.progress);
    const issueDetailRequired   = task.hasIssue === true;
    const anomalyDetailRequired = task.anomalyLevel > 0 && task.genre === 'inspection';
    const defs   = GENRE_FIELD_DEFS[task.genre];
    const fields = task.genreFields[task.genre];

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

        {/* 部署 */}
        <div className="form-section">
          <label>部署</label>
          <select
            className="input-field"
            value={task.department}
            onChange={e => updateTask(idx, { department: e.target.value })}
          >
            <option value="">選択してください</option>
            <option value="cleaning_dept">清掃部</option>
            <option value="maintenance_dept">設備管理部</option>
            <option value="security_dept">警備部</option>
          </select>
        </div>

        {/* 問題の有無 */}
        <div className="form-section">
          <label>問題の有無</label>
          <div className="has-issue-seg">
            {HAS_ISSUE_OPTIONS.map(opt => (
              <button
                key={String(opt.value)}
                type="button"
                className={`has-issue-btn ${opt.colorClass}${task.hasIssue === opt.value ? ' active' : ''}`}
                onClick={() => updateTask(idx, {
                  hasIssue:    opt.value,
                  issueDetail: opt.value === false ? '' : task.issueDetail,
                })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 問題詳細（問題あり時のみ） */}
        {issueDetailRequired && (
          <div className="form-section">
            <div className="label-with-action">
              <label>問題の詳細（必須）</label>
              <VoiceInput onResult={text => updateTask(idx, {
                issueDetail: task.issueDetail ? `${task.issueDetail}\n${text}` : text,
              })} />
            </div>
            <textarea
              className="input-field issue-detail-area memo-required-input"
              value={task.issueDetail}
              onChange={e => updateTask(idx, { issueDetail: e.target.value })}
              placeholder="問題の内容を具体的に入力してください..."
              rows={3}
              data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false"
              autoComplete="off" data-1p-ignore="true" spellCheck={false}
            />
            <p className="memo-required-guide">※問題の内容や状況を具体的に教えてください</p>
          </div>
        )}

        {/* 達成度 / 進捗状況 */}
        <div className="form-section">
          <label>{PROGRESS_LABELS[task.genre]}</label>
          <div className={`progress-seg${task.progressError ? ' seg-error' : ''}`}>
            {PROGRESS_OPTIONS[task.genre].map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`progress-seg-btn${task.progress === opt.value ? ' active' : ''}`}
                onClick={() => updateTask(idx, {
                  progress:     opt.value,
                  progressError: '',
                  showMemo:     PROGRESS_REQUIRES_MEMO.has(opt.value) ? true : task.showMemo,
                })}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {task.progressError && <p className="field-error">{task.progressError}</p>}
        </div>

        {/* 写真アップロード */}
        <div className="form-section">
          <PhotoUploader
            photos={task.photos}
            setPhotos={photos => updateTask(idx, { photos })}
            currentDate={commonData.date}
            onDateExtracted={date => {
              // 作業日が空欄の時のみ呼ばれる（PhotoUploader側でハンドリング済み）
              const formatted = date.toISOString().split('T')[0];
              setCommonData(prev => ({ ...prev, date: formatted }));
            }}
          />
        </div>

        {/* ジャンル別フィールド */}
        <div className="genre-fields-section">
          <div className="genre-fields-title">■ 報告内容</div>

          {defs.map(def => {
            const isOther = def.type === 'select'
              && task.selectedOptions[task.genre]?.[def.key] === 'other';
            return (
              <div key={def.key} className="form-section">
                <div className="label-with-action">
                  <label>{def.label}</label>
                  {(def.type === 'textarea' || isOther) && (
                    <VoiceInput onResult={text => appendToGenreField(idx, def.key, text)} />
                  )}
                </div>

                {def.type === 'select' ? (
                  <>
                    <select
                      className={`input-field${task.fieldErrors[def.key] ? ' memo-required-input' : ''}`}
                      value={task.selectedOptions[task.genre]?.[def.key] ?? ''}
                      onChange={e => updateSelectField(idx, def.key, e.target.value)}
                    >
                      <option value="">選択してください</option>
                      {SELECT_OPTIONS[task.genre][def.key].map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    {isOther && (
                      <textarea
                        className={`input-field genre-field-area${task.fieldErrors[def.key] ? ' memo-required-input' : ''}`}
                        value={fields[def.key]}
                        onChange={e => updateGenreField(idx, def.key, e.target.value)}
                        placeholder={def.placeholder}
                        rows={2}
                        data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false"
                        autoComplete="off" data-1p-ignore="true" spellCheck={false}
                      />
                    )}
                  </>
                ) : (
                  <textarea
                    className={`input-field genre-field-area${task.fieldErrors[def.key] ? ' memo-required-input' : ''}`}
                    value={fields[def.key]}
                    onChange={e => updateGenreField(idx, def.key, e.target.value)}
                    placeholder={def.placeholder}
                    rows={2}
                    data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false"
                    autoComplete="off" data-1p-ignore="true" spellCheck={false}
                  />
                )}
                {task.fieldErrors[def.key] && <p className="field-error">{task.fieldErrors[def.key]}</p>}
              </div>
            );
          })}

          {/* 異常の有無（点検のみ） */}
          {task.genre === 'inspection' && (
            <>
              <div className="form-section">
                <label>異常の有無</label>
                <div className="anomaly-seg">
                  {ANOMALY_LEVELS.map(lv => (
                    <button
                      key={lv.value}
                      type="button"
                      className={`anomaly-seg-btn ${lv.colorClass}${task.anomalyLevel === lv.value ? ' active' : ''}`}
                      onClick={() => updateTask(idx, {
                        anomalyLevel: lv.value,
                        ...(lv.value === 0 ? { anomalyDetail: '' } : {}),
                      })}
                    >
                      {lv.label}
                    </button>
                  ))}
                </div>
              </div>
              {anomalyDetailRequired && (
                <div className="form-section">
                  <div className="label-with-action">
                    <label>所見（必須）</label>
                    <VoiceInput onResult={text => updateTask(idx, {
                      anomalyDetail: task.anomalyDetail ? `${task.anomalyDetail}\n${text}` : text,
                    })} />
                  </div>
                  <textarea
                    className="input-field issue-detail-area memo-required-input"
                    value={task.anomalyDetail}
                    onChange={e => updateTask(idx, { anomalyDetail: e.target.value })}
                    placeholder="異常の内容を具体的に入力してください..."
                    rows={3}
                    data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false"
                    autoComplete="off" data-1p-ignore="true" spellCheck={false}
                  />
                  <p className="memo-required-guide">※異常の状況や程度を詳しく教えてください</p>
                </div>
              )}
            </>
          )}

          {/* 備考欄トグル */}
          <div className="memo-toggle">
            <label className="memo-checkbox-label">
              <input
                type="checkbox"
                checked={task.showMemo || memoRequired}
                disabled={memoRequired}
                onChange={e => updateTask(idx, { showMemo: e.target.checked })}
              />
              備考欄を追加
              {memoRequired && <span className="memo-required-badge">必須</span>}
            </label>
          </div>

          {(task.showMemo || memoRequired) && (
            <div className="form-section">
              <div className="label-with-action">
                <label>{memoRequired ? '備考（理由を記入してください）' : '備考'}</label>
                <VoiceInput onResult={text => updateTask(idx, {
                  memo: task.memo ? `${task.memo}\n${text}` : text,
                })} />
              </div>
              <textarea
                className={`input-field genre-field-area${memoRequired || task.fieldErrors.memo ? ' memo-required-input' : ''}`}
                value={task.memo}
                onChange={e => updateTask(idx, { memo: e.target.value, fieldErrors: { ...task.fieldErrors, memo: '' } })}
                placeholder={memoRequired
                  ? '例：〇〇の部品が不足しているため、明日手配して再開予定です。 / 本日体調不良により欠勤のため未着手です。'
                  : '補足事項があれば記入してください...'}
                rows={3}
                data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false"
                autoComplete="off" data-1p-ignore="true" spellCheck={false}
              />
              {task.fieldErrors.memo && <p className="field-error">{task.fieldErrors.memo}</p>}
              {memoRequired && !task.fieldErrors.memo && (
                <p className="memo-required-guide">※遅延や未完了の理由を詳しく教えてください</p>
              )}
            </div>
          )}
        </div>
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
          <p className="subtitle">{user?.name} 様</p>
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
              data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false"
              autoComplete="off" data-1p-ignore="true"
            />
          </div>

          {/* エリア・現場 */}
          <div className="form-row">
            <div className="form-section flex-1">
              <label>エリア</label>
              <select
                className="input-field"
                value={commonData.selectedArea}
                onChange={e => setCommonData(prev => ({ ...prev, selectedArea: e.target.value, locationId: '' }))}
              >
                <option value="">エリアを選択してください</option>
                {[...new Set(locations.map(l => l.area))].map(area => (
                  <option key={area} value={area}>{area}</option>
                ))}
              </select>
            </div>
            <div className="form-section flex-1">
              <label>現場</label>
              <select
                className="input-field"
                value={commonData.locationId}
                disabled={!commonData.selectedArea}
                onChange={e => setCommonData(prev => ({ ...prev, locationId: e.target.value }))}
              >
                <option value="">
                  {commonData.selectedArea ? '現場を選択してください' : '先にエリアを選択してください'}
                </option>
                {locations
                  .filter(l => l.area === commonData.selectedArea)
                  .map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* ━━ タスクブロック（1件ずつ） ━━ */}
        {tasks.map((task, idx) => renderTaskBlock(task, idx))}

        {/* 報告追加ボタン */}
        <button type="button" className="btn-add-task" onClick={addTask}>
          <Plus size={18} /> 別の報告を追加する
        </button>

        {/* AI赤ペン先生（一時非表示）
        <div className="ai-toggle-section">
          <div className="ai-info">
            <Bot size={24} color={useAI ? 'var(--primary)' : 'var(--text-muted)'} />
            <div>
              <h3>AI自動添削（赤ペン先生）</h3>
              <p>報告内容の不足や誤字脱字をAIがチェックします</p>
            </div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={useAI} onChange={handleAIToggle} />
            <span className="slider round"></span>
          </label>
        </div>

        {useAI && (
          <div className="ai-feedback-box">
            <h4>
              {aiFeedbackLoading
                ? <><Loader size={16} className="spin" /> AIが添削中...</>
                : <><Bot size={16} /> AIコメント</>
              }
            </h4>
            {!aiFeedbackLoading && <p>{aiFeedback}</p>}
          </div>
        )}
        */}

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
