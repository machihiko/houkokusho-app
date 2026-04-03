import React, { useState, useEffect } from 'react';
import { useAuth } from '../../AuthContext';
import EmergencyModal from './EmergencyModal';
import PhotoUploader from './PhotoUploader';
import PreviewScreen from './PreviewScreen';
import VoiceInput from './VoiceInput';
import { Save, Send, LogOut, AlertTriangle, Bot, Loader } from 'lucide-react';
import './ReporterDashboard.css';
import { supabase } from '../../utils/supabaseClient';

const GENRES = [
  { id: 'cleaning',   label: '清掃' },
  { id: 'inspection', label: '点検' },
  { id: 'repair',     label: '修理' },
];

// ジャンルごとの入力フィールド定義
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
    { key: 'notes',  label: '特記事項',  type: 'textarea',
      placeholder: '例：特になし / 落書きを発見、管理者へ報告済み' },
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

// ▼▼▼ プルダウンの選択肢（ここを編集して追加・修正できます） ▼▼▼
const SELECT_OPTIONS = {
  inspection: {
    item: [
      { value: 'air_filter',   label: '空調フィルター' },
      { value: 'fire_equip',   label: '消火設備' },
      { value: 'drain_pump',   label: '排水ポンプ' },
      { value: 'electrical',   label: '電気設備' },
      { value: 'other',        label: 'その他' },
    ],
  },
  cleaning: {
    place: [
      { value: '1f_toilet',    label: '1Fトイレ' },
      { value: 'entrance',     label: 'エントランス' },
      { value: 'corridor',     label: '廊下・通路' },
      { value: 'parking',      label: '駐車場' },
      { value: 'other',        label: 'その他' },
    ],
    work: [
      { value: 'floor_mop',    label: '床面モップ掛け' },
      { value: 'glass_wipe',   label: 'ガラス清拭' },
      { value: 'trash',        label: 'ゴミ回収・分別' },
      { value: 'sink_clean',   label: '洗面台・シンク清掃' },
      { value: 'other',        label: 'その他' },
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
      { value: 'water_leak',   label: '水漏れ' },
      { value: 'broken',       label: '破損・割れ' },
      { value: 'noise',        label: '異音' },
      { value: 'not_working',  label: '動作不良' },
      { value: 'other',        label: 'その他' },
    ],
    action: [
      { value: 'replaced',     label: '部品交換により修理完了' },
      { value: 'temp_fix',     label: '応急処置済み・要経過観察' },
      { value: 'reported',     label: '業者へ連絡済み・対応待ち' },
      { value: 'other',        label: 'その他' },
    ],
  },
};
// ▲▲▲ プルダウンの選択肢ここまで ▲▲▲

// セレクトフィールドの初期選択状態
const INITIAL_SELECTED_OPTIONS = {
  inspection: { item: '' },
  cleaning:   { place: '', work: '' },
  repair:     { target: '', symptom: '', action: '' },
};

// ジャンル別フィールドの初期値
const INITIAL_GENRE_FIELDS = {
  inspection: { item: '' },
  cleaning:   { place: '', work: '', notes: '' },
  repair:     { target: '', symptom: '', action: '' },
};

// 問題の有無（全ジャンル共通・2択）
const HAS_ISSUE_OPTIONS = [
  { value: false, label: '問題無し', colorClass: 'no' },
  { value: true,  label: '問題あり', colorClass: 'yes' },
];

// 異常の有無（点検のみ・4段階）
const ANOMALY_LEVELS = [
  { value: 0, label: '異常無し',     colorClass: 'level-0' },
  { value: 1, label: '軽微な\n異変', colorClass: 'level-1' },
  { value: 2, label: '要確認',       colorClass: 'level-2' },
  { value: 3, label: '異常あり',     colorClass: 'level-3' },
];

// 進捗状態ボタンの選択肢（ジャンルごとに異なる）
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

// 選択時に備考欄が必須になる progress 値
const PROGRESS_REQUIRES_MEMO = new Set(['incomplete', 'not_started', 'delayed']);

const ReporterDashboard = () => {
  const { logout, user } = useAuth();
  const [showEmergency, setShowEmergency] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [photos, setPhotos] = useState([]);

  // フォーム基本情報
  const [formData, setFormData] = useState({
    genre:       'cleaning',
    department:  '',
    hasIssue:    false,   // 問題の有無（全ジャンル共通・boolean）
    issueDetail: '',
    date:        new Date().toISOString().split('T')[0],
  });

  // ジャンル別入力フィールド
  const [genreFields, setGenreFields] = useState(INITIAL_GENRE_FIELDS);

  // セレクトフィールドの選択状態（'other' 判定に使用）
  const [selectedOptions, setSelectedOptions] = useState(INITIAL_SELECTED_OPTIONS);

  // 異常の有無（点検のみ）
  const [anomalyLevel, setAnomalyLevel] = useState(0);
  const [anomalyDetail, setAnomalyDetail] = useState('');

  // 備考欄
  const [showMemo, setShowMemo] = useState(false);
  const [memo, setMemo] = useState('');

  // 進捗状態（Segmented Control）
  const [progress, setProgress] = useState('');

  // ── 派生フラグ ──────────────────────────────
  // hasIssue = true なら問題詳細が必須
  const issueDetailRequired = formData.hasIssue === true;
  // 点検かつ anomalyLevel > 0 なら所見が必須
  const anomalyDetailRequired = anomalyLevel > 0 && formData.genre === 'inspection';
  // progress が遅延系なら備考が必須
  const memoRequired = PROGRESS_REQUIRES_MEMO.has(progress);

  const [fieldErrors, setFieldErrors] = useState({});
  const [progressError, setProgressError] = useState('');
  const [validationError, setValidationError] = useState('');
  const [useAI, setUseAI] = useState(false);
  const [aiFeedback, setAiFeedback] = useState('');
  const [aiFeedbackLoading, setAiFeedbackLoading] = useState(false);

  // 備考必須のとき自動で備考欄を開く
  useEffect(() => {
    if (memoRequired) setShowMemo(true);
  }, [memoRequired]);

  // 現在ジャンルの全入力を1つの文章に結合（PreviewScreen・AI・Excel共用）
  const buildContent = () => {
    const defs   = GENRE_FIELD_DEFS[formData.genre];
    const fields = genreFields[formData.genre];
    const lines  = defs.map(def => `【${def.label}】${fields[def.key]}`);

    // 問題の有無（全ジャンル共通）
    lines.push(`【問題の有無】${formData.hasIssue ? '問題あり' : '問題無し'}`);
    if (formData.issueDetail.trim()) {
      lines.push(`【問題の詳細】${formData.issueDetail}`);
    }

    // 異常の有無（点検のみ）
    if (formData.genre === 'inspection') {
      const anomalyOpt = ANOMALY_LEVELS.find(l => l.value === anomalyLevel);
      if (anomalyOpt) {
        lines.push(`【異常の有無】${anomalyOpt.label.replace('\n', '')}`);
      }
      if (anomalyDetail.trim()) {
        lines.push(`【所見】${anomalyDetail}`);
      }
    }

    // 達成度・進捗状況
    if (progress) {
      const opt = PROGRESS_OPTIONS[formData.genre].find(o => o.value === progress);
      if (opt) lines.push(`【${PROGRESS_LABELS[formData.genre]}】${opt.label}`);
    }

    if ((showMemo || memoRequired) && memo.trim()) {
      lines.push(`【備考】${memo}`);
    }
    return lines.join('\n');
  };

  // セレクトフィールドの選択変更
  const updateSelectField = (key, optionValue) => {
    setSelectedOptions(prev => ({
      ...prev,
      [formData.genre]: { ...prev[formData.genre], [key]: optionValue },
    }));
    if (optionValue !== 'other') {
      // 選択肢のラベルをそのまま genreFields に保存
      const label = SELECT_OPTIONS[formData.genre][key]?.find(o => o.value === optionValue)?.label ?? '';
      setGenreFields(prev => ({
        ...prev,
        [formData.genre]: { ...prev[formData.genre], [key]: label },
      }));
    } else {
      // その他：テキスト入力に切り替えるため値をクリア
      setGenreFields(prev => ({
        ...prev,
        [formData.genre]: { ...prev[formData.genre], [key]: '' },
      }));
    }
    setFieldErrors(prev => ({ ...prev, [key]: '' }));
  };

  // ジャンルフィールドを1項目更新
  const updateGenreField = (key, value) => {
    setGenreFields(prev => ({
      ...prev,
      [formData.genre]: { ...prev[formData.genre], [key]: value },
    }));
    setFieldErrors(prev => ({ ...prev, [key]: '' }));
  };

  // 音声入力の結果をジャンルフィールドに追記
  const appendToGenreField = (key, text) => {
    setGenreFields(prev => {
      const current = prev[formData.genre][key];
      return {
        ...prev,
        [formData.genre]: {
          ...prev[formData.genre],
          [key]: current ? `${current}\n${text}` : text,
        },
      };
    });
    setFieldErrors(prev => ({ ...prev, [key]: '' }));
  };

  // AI赤ペン先生トグル
  const handleAIToggle = () => {
    if (useAI) {
      setUseAI(false);
      setAiFeedback('');
      return;
    }
    setUseAI(true);
    setAiFeedbackLoading(true);

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    console.log('[AI] VITE_GEMINI_API_KEY loaded:', apiKey ? `${apiKey.slice(0, 8)}...` : '★未設定★');

    if (!apiKey) {
      setAiFeedback('APIキーが設定されていません。.envファイルにVITE_GEMINI_API_KEYを設定し、開発サーバーを再起動してください。');
      setAiFeedbackLoading(false);
      return;
    }

    const genre   = GENRES.find(g => g.id === formData.genre)?.label || formData.genre;
    const content = buildContent();
    const prompt = `あなたは現場報告書の添削AIです。以下の報告書の内容を読み、不明確な点・不足している情報・改善すべき表現について日本語で具体的にアドバイスしてください。箇条書きで簡潔に3点以内でまとめてください。問題がなければ「特に指摘はありません」と答えてください。

【ジャンル】${genre}
【部署】${formData.department || '未入力'}
【問題の有無】${formData.hasIssue ? '問題あり' : '問題無し'}
${formData.issueDetail ? `【問題の詳細】${formData.issueDetail}` : ''}
【報告内容】
${content}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    console.log('[AI] Fetching:', url.replace(apiKey, apiKey.slice(0, 8) + '...'));

    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    )
      .then(res => {
        console.log('[AI] Response status:', res.status, res.statusText);
        if (!res.ok) {
          return res.text().then(body => {
            throw new Error(`HTTP ${res.status} ${res.statusText} - ${body}`);
          });
        }
        return res.json();
      })
      .then(data => {
        console.log('[AI] Response data:', JSON.stringify(data, null, 2));
        const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        const text = (raw != null && raw !== '') ? String(raw) : '返答を取得できませんでした。';
        setAiFeedback(text);
      })
      .catch(e => {
        console.error('[AI] Gemini API error:', e.message, e);
        setAiFeedback(`AIとの通信に失敗しました。\n詳細: ${e.message}`);
      })
      .finally(() => {
        setAiFeedbackLoading(false);
      });
  };

  useEffect(() => {
    const saved = localStorage.getItem('re_report_autosave');
    if (saved) setShowRecoveryDialog(true);
  }, []);

  // 自動保存（2秒デバウンス）
  useEffect(() => {
    const currentFields = genreFields[formData.genre];
    const hasInput = formData.department ||
      Object.values(currentFields).some(v => typeof v === 'string' && v.trim());
    const handler = setTimeout(() => {
      if (hasInput) {
        localStorage.setItem('re_report_autosave', JSON.stringify({
          ...formData, genreFields, selectedOptions, showMemo, memo, progress,
          anomalyLevel, anomalyDetail, timestamp: Date.now(),
        }));
      }
    }, 2000);
    return () => clearTimeout(handler);
  }, [formData, genreFields, showMemo, memo, progress, anomalyLevel, anomalyDetail]);

  const recoverData = (accept) => {
    if (accept) {
      try {
        const saved = JSON.parse(localStorage.getItem('re_report_autosave'));
        setFormData(prev => ({
          ...prev,
          genre:       saved.genre        ?? prev.genre,
          department:  saved.department   ?? prev.department,
          hasIssue:    saved.hasIssue     ?? prev.hasIssue,
          issueDetail: saved.issueDetail  ?? prev.issueDetail,
          date:        saved.date         ?? prev.date,
        }));
        if (saved.genreFields)          setGenreFields(saved.genreFields);
        if (saved.showMemo      != null) setShowMemo(saved.showMemo);
        if (saved.memo          != null) setMemo(saved.memo);
        if (saved.progress      != null) setProgress(saved.progress);
        if (saved.anomalyLevel    != null) setAnomalyLevel(saved.anomalyLevel);
        if (saved.anomalyDetail   != null) setAnomalyDetail(saved.anomalyDetail);
        if (saved.selectedOptions != null) setSelectedOptions(saved.selectedOptions);
      } catch (e) {
        console.error('Failed to parse autosave data', e);
      }
    } else {
      localStorage.removeItem('re_report_autosave');
    }
    setShowRecoveryDialog(false);
  };

  const handleGenreChange = (genreId) => {
    setFormData(prev => ({ ...prev, genre: genreId }));
    setProgress('');
    setProgressError('');
    setFieldErrors({});
    setShowMemo(false);
    // 点検以外に切り替えたら異常関連をリセット
    if (genreId !== 'inspection') {
      setAnomalyLevel(0);
      setAnomalyDetail('');
    }
  };

  const handleDateExtracted = (extractedDate) => {
    const formatted = extractedDate.toISOString().split('T')[0];
    setFormData(prev => ({ ...prev, date: formatted }));
    alert(`写真から撮影日（${formatted}）を取得しました`);
  };

  // 最終送信：reports insert → ジャンル別詳細 insert → 写真アップロード → photos insert
  const handleConfirm = async () => {
    const { data: reportRows, error: reportError } = await supabase
      .from('reports')
      .insert({
        genre:       formData.genre,
        department:  formData.department,
        work_date:   formData.date,
        has_problem: formData.hasIssue,
      })
      .select('id')
      .single();

    if (reportError) {
      console.error('[Supabase] 報告書の保存に失敗しました:', reportError);
      alert('送信に失敗しました。\n' + reportError.message);
      return;
    }

    const reportId     = reportRows.id;
    const fields       = genreFields[formData.genre];
    const memoValue    = (showMemo || memoRequired) && memo.trim() ? memo.trim() : null;
    // 進捗・達成度を画面表示と同じ日本語テキストに変換
    const progressLabel = PROGRESS_OPTIONS[formData.genre].find(o => o.value === progress)?.label ?? progress;

    // ── ジャンル別詳細テーブルへ insert ──────────────────
    if (formData.genre === 'cleaning') {
      const { error } = await supabase.from('cleanings').insert({
        report_id:     reportId,
        location:      fields.place,
        item:          fields.work,
        is_completed:  progressLabel,
        special_notes: fields.notes  || null,
        notes:         memoValue,
      });
      if (error) {
        console.error('[Supabase] cleanings の保存に失敗しました:', error);
        alert('清掃詳細の送信に失敗しました。\n' + error.message);
        return;
      }
    } else if (formData.genre === 'inspection') {
      const { error } = await supabase.from('inspections').insert({
        report_id:       reportId,
        inspection_item: fields.item,
        anomaly_level:   anomalyLevel,
        findings:        anomalyDetail.trim() || null,
        is_delayed:      progressLabel,
        notes:           memoValue,
      });
      if (error) {
        console.error('[Supabase] inspections の保存に失敗しました:', error);
        alert('点検詳細の送信に失敗しました。\n' + error.message);
        return;
      }
    } else if (formData.genre === 'repair') {
      const { error } = await supabase.from('repairs').insert({
        report_id:     reportId,
        repair_item:   fields.target,
        repair_detail: fields.symptom || null,
        repair_action: fields.action  || null,
        progress:      progressLabel,
        notes:         memoValue,
      });
      if (error) {
        console.error('[Supabase] repairs の保存に失敗しました:', error);
        alert('修理詳細の送信に失敗しました。\n' + error.message);
        return;
      }
    }

    if (photos.length > 0) {
      for (const photo of photos) {
        try {
          const rawExt     = photo.name.split('.').pop();
          const ext        = /^[a-zA-Z0-9]+$/.test(rawExt) ? rawExt.toLowerCase() : 'jpg';
          const rand       = Math.random().toString(36).slice(2, 10);
          const uniqueName = `${Date.now()}_${rand}.${ext}`;
          const filePath   = `${reportId}/${uniqueName}`;

          const { error: uploadError } = await supabase.storage
            .from('photos')
            .upload(filePath, photo.file, { upsert: false });

          if (uploadError) {
            console.error('[Supabase] 写真のアップロードに失敗しました:', uploadError);
            continue;
          }

          const { data: urlData } = supabase.storage.from('photos').getPublicUrl(filePath);

          const { error: photoInsertError } = await supabase
            .from('photos')
            .insert({ report_id: reportId, photo_url: urlData.publicUrl });

          if (photoInsertError) {
            console.error('[Supabase] 写真URLの保存に失敗しました:', photoInsertError);
          }
        } catch (e) {
          console.error('[Supabase] 写真処理中に予期しないエラーが発生しました:', e);
        }
      }
    }

    alert('報告書を送信しました！');
    localStorage.removeItem('re_report_autosave');
    window.location.reload();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const defs       = GENRE_FIELD_DEFS[formData.genre];
    const fields     = genreFields[formData.genre];
    const hasContent = defs.some(def => fields[def.key]?.trim());

    if (!formData.department) {
      setValidationError('部署名は必須です。');
      return;
    }
    if (!hasContent) {
      setValidationError('報告内容を少なくとも1項目入力してください。');
      return;
    }
    if (!progress) {
      setProgressError('選択してください');
      return;
    }
    setProgressError('');

    // ── 各テキストフィールドの最低文字数チェック（5文字以上） ──
    const MIN_LEN = 5;
    const minMsg  = 'もう少し具体的に入力してください（5文字以上）';
    const newFieldErrors = {};
    const curFields = genreFields[formData.genre];
    GENRE_FIELD_DEFS[formData.genre].forEach(def => {
      // select フィールドは「その他」選択時のみ長さチェック
      if (def.type === 'select' && selectedOptions[formData.genre]?.[def.key] !== 'other') return;
      const val = curFields[def.key]?.trim() ?? '';
      if (val.length > 0 && val.length < MIN_LEN) {
        newFieldErrors[def.key] = minMsg;
      }
    });
    if ((showMemo || memoRequired) && memo.trim().length > 0 && memo.trim().length < MIN_LEN) {
      newFieldErrors.memo = minMsg;
    }
    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors);
      return;
    }
    setFieldErrors({});

    if (issueDetailRequired && !formData.issueDetail.trim()) {
      setValidationError('問題の詳細を入力してください。');
      return;
    }
    if (anomalyDetailRequired && !anomalyDetail.trim()) {
      setValidationError('異常の所見を入力してください。');
      return;
    }
    if (memoRequired && !memo.trim()) {
      setValidationError('遅延や未完了の理由を備考欄に入力してください。');
      return;
    }
    setValidationError('');
    setShowPreview(true);
  };

  if (showPreview) {
    return (
      <PreviewScreen
        data={{ ...formData, content: buildContent(), photos }}
        onBack={() => setShowPreview(false)}
        onConfirm={handleConfirm}
      />
    );
  }

  const currentDefs   = GENRE_FIELD_DEFS[formData.genre];
  const currentFields = genreFields[formData.genre];

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

        {/* ジャンルタブ */}
        <div className="form-section">
          <label>報告ジャンル</label>
          <div className="genre-tabs">
            {GENRES.map(g => (
              <button
                key={g.id}
                type="button"
                className={`genre-tab ${formData.genre === g.id ? 'active' : ''}`}
                onClick={() => handleGenreChange(g.id)}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* 部署・作業日 */}
        <div className="form-row">
          <div className="form-section flex-1">
            <label>部署</label>
            <select
              className="input-field"
              value={formData.department}
              onChange={e => setFormData(prev => ({ ...prev, department: e.target.value }))}
            >
              <option value="">選択してください</option>
              <option value="cleaning_dept">清掃部</option>
              <option value="maintenance_dept">設備管理部</option>
              <option value="security_dept">警備部</option>
            </select>
          </div>
          <div className="form-section flex-1">
            <label>作業日 (写真から自動取得可)</label>
            <input
              type="date"
              className="input-field"
              value={formData.date}
              onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))}
              data-gramm="false"
              data-gramm_editor="false"
              data-enable-grammarly="false"
              autoComplete="off"
              data-1p-ignore="true"
            />
          </div>
        </div>

        {/* 問題の有無（全ジャンル共通・2択ボタン） */}
        <div className="form-section">
          <label>問題の有無</label>
          <div className="has-issue-seg">
            {HAS_ISSUE_OPTIONS.map(opt => (
              <button
                key={String(opt.value)}
                type="button"
                className={`has-issue-btn ${opt.colorClass}${formData.hasIssue === opt.value ? ' active' : ''}`}
                onClick={() => setFormData(prev => ({
                  ...prev,
                  hasIssue:    opt.value,
                  issueDetail: opt.value === false ? '' : prev.issueDetail,
                }))}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 問題詳細（問題あり の時のみ） */}
        {issueDetailRequired && (
          <div className="form-section">
            <div className="label-with-action">
              <label>問題の詳細（必須）</label>
              <VoiceInput onResult={text => setFormData(prev => ({
                ...prev,
                issueDetail: prev.issueDetail ? `${prev.issueDetail}\n${text}` : text,
              }))} />
            </div>
            <textarea
              className="input-field issue-detail-area memo-required-input"
              value={formData.issueDetail}
              onChange={e => setFormData(prev => ({ ...prev, issueDetail: e.target.value }))}
              placeholder="問題の内容を具体的に入力してください..."
              rows={3}
              data-gramm="false"
              data-gramm_editor="false"
              data-enable-grammarly="false"
              autoComplete="off"
              data-1p-ignore="true"
              spellCheck={false}
            />
            <p className="memo-required-guide">※問題の内容や状況を具体的に教えてください</p>
          </div>
        )}

        {/* 達成度 / 進捗状況 */}
        <div className="form-section">
          <label>{PROGRESS_LABELS[formData.genre]}</label>
          <div className={`progress-seg${progressError ? ' seg-error' : ''}`}>
            {PROGRESS_OPTIONS[formData.genre].map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`progress-seg-btn${progress === opt.value ? ' active' : ''}`}
                onClick={() => { setProgress(opt.value); setProgressError(''); }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {progressError && (
            <p className="field-error">{progressError}</p>
          )}
        </div>

        {/* 写真アップロード */}
        <div className="form-section">
          <PhotoUploader
            photos={photos}
            setPhotos={setPhotos}
            onDateExtracted={handleDateExtracted}
          />
        </div>

        {/* ジャンル別入力フィールド */}
        <div className="genre-fields-section">
          <div className="genre-fields-title">■ 報告内容</div>

          {currentDefs.map(def => {
            const isOther = def.type === 'select'
              && selectedOptions[formData.genre]?.[def.key] === 'other';
            return (
              <div key={def.key} className="form-section">
                <div className="label-with-action">
                  <label>{def.label}</label>
                  {/* テキスト入力時のみ音声入力を表示 */}
                  {(def.type === 'textarea' || isOther) && (
                    <VoiceInput onResult={text => appendToGenreField(def.key, text)} />
                  )}
                </div>

                {def.type === 'select' ? (
                  <>
                    <select
                      className={`input-field${fieldErrors[def.key] ? ' memo-required-input' : ''}`}
                      value={selectedOptions[formData.genre]?.[def.key] ?? ''}
                      onChange={e => updateSelectField(def.key, e.target.value)}
                    >
                      <option value="">選択してください</option>
                      {SELECT_OPTIONS[formData.genre][def.key].map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    {isOther && (
                      <textarea
                        className={`input-field genre-field-area${fieldErrors[def.key] ? ' memo-required-input' : ''}`}
                        value={currentFields[def.key]}
                        onChange={e => updateGenreField(def.key, e.target.value)}
                        placeholder={def.placeholder}
                        rows={2}
                        data-gramm="false"
                        data-gramm_editor="false"
                        data-enable-grammarly="false"
                        autoComplete="off"
                        data-1p-ignore="true"
                        spellCheck={false}
                      />
                    )}
                  </>
                ) : (
                  <textarea
                    className={`input-field genre-field-area${fieldErrors[def.key] ? ' memo-required-input' : ''}`}
                    value={currentFields[def.key]}
                    onChange={e => updateGenreField(def.key, e.target.value)}
                    placeholder={def.placeholder}
                    rows={2}
                    data-gramm="false"
                    data-gramm_editor="false"
                    data-enable-grammarly="false"
                    autoComplete="off"
                    data-1p-ignore="true"
                    spellCheck={false}
                  />
                )}

                {fieldErrors[def.key] && (
                  <p className="field-error">{fieldErrors[def.key]}</p>
                )}
              </div>
            );
          })}

          {/* 異常の有無（点検のみ・4段階ボタン） */}
          {formData.genre === 'inspection' && (
            <>
              <div className="form-section">
                <label>異常の有無</label>
                <div className="anomaly-seg">
                  {ANOMALY_LEVELS.map(lv => (
                    <button
                      key={lv.value}
                      type="button"
                      className={`anomaly-seg-btn ${lv.colorClass}${anomalyLevel === lv.value ? ' active' : ''}`}
                      onClick={() => {
                        setAnomalyLevel(lv.value);
                        if (lv.value === 0) setAnomalyDetail('');
                      }}
                    >
                      {lv.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 所見（異常レベル > 0 のときのみ） */}
              {anomalyDetailRequired && (
                <div className="form-section">
                  <div className="label-with-action">
                    <label>所見（必須）</label>
                    <VoiceInput onResult={text => setAnomalyDetail(prev => prev ? `${prev}\n${text}` : text)} />
                  </div>
                  <textarea
                    className="input-field issue-detail-area memo-required-input"
                    value={anomalyDetail}
                    onChange={e => setAnomalyDetail(e.target.value)}
                    placeholder="異常の内容を具体的に入力してください..."
                    rows={3}
                    data-gramm="false"
                    data-gramm_editor="false"
                    data-enable-grammarly="false"
                    autoComplete="off"
                    data-1p-ignore="true"
                    spellCheck={false}
                  />
                  <p className="memo-required-guide">※異常の状況や程度を詳しく教えてください</p>
                </div>
              )}
            </>
          )}

          {/* 備考欄トグル（必須時はチェックを外せない） */}
          <div className="memo-toggle">
            <label className="memo-checkbox-label">
              <input
                type="checkbox"
                checked={showMemo || memoRequired}
                disabled={memoRequired}
                onChange={e => setShowMemo(e.target.checked)}
              />
              備考欄を追加
              {memoRequired && <span className="memo-required-badge">必須</span>}
            </label>
          </div>

          {(showMemo || memoRequired) && (
            <div className="form-section">
              <div className="label-with-action">
                <label>
                  {memoRequired ? '備考（理由を記入してください）' : '備考'}
                </label>
                <VoiceInput onResult={text => setMemo(prev => prev ? `${prev}\n${text}` : text)} />
              </div>
              <textarea
                className={`input-field genre-field-area${memoRequired || fieldErrors.memo ? ' memo-required-input' : ''}`}
                value={memo}
                onChange={e => { setMemo(e.target.value); setFieldErrors(prev => ({ ...prev, memo: '' })); }}
                placeholder={memoRequired
                  ? '例：〇〇の部品が不足しているため、明日手配して再開予定です。 / 本日体調不良により欠勤のため未着手です。'
                  : '補足事項があれば記入してください...'}
                rows={3}
                data-gramm="false"
                data-gramm_editor="false"
                data-enable-grammarly="false"
                autoComplete="off"
                data-1p-ignore="true"
                spellCheck={false}
              />
              {fieldErrors.memo && (
                <p className="field-error">{fieldErrors.memo}</p>
              )}
              {memoRequired && !fieldErrors.memo && (
                <p className="memo-required-guide">
                  ※遅延や未完了の理由を詳しく教えてください
                </p>
              )}
            </div>
          )}
        </div>

        {/* AI赤ペン先生 */}
        <div className="ai-toggle-section">
          <div className="ai-info">
            <Bot size={24} color={useAI ? "var(--primary)" : "var(--text-muted)"} />
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
