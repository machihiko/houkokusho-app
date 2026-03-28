import React, { useState, useEffect } from 'react';
import { useAuth } from '../../AuthContext';
import EmergencyModal from './EmergencyModal';
import PhotoUploader from './PhotoUploader';
import PreviewScreen from './PreviewScreen';
import VoiceInput from './VoiceInput';
import { Save, Send, LogOut, AlertTriangle, Bot, Loader } from 'lucide-react';
import './ReporterDashboard.css';

const GENRES = [
  { id: 'cleaning',   label: '清掃' },
  { id: 'inspection', label: '点検' },
  { id: 'repair',     label: '修理' },
];

// ジャンルごとの入力フィールド定義
const GENRE_FIELD_DEFS = {
  inspection: [
    { key: 'item',        label: '点検項目',   type: 'textarea',
      placeholder: '例：空調機フィルター、消火設備、排水ポンプ など' },
    { key: 'hasAnomaly',  label: '異常の有無',  type: 'radio',
      options: [{ value: 'no', label: '無' }, { value: 'yes', label: '有' }] },
    { key: 'findings',    label: '所見',       type: 'textarea',
      placeholder: '例：フィルターに詰まりあり。清掃・交換が必要。' },
  ],
  cleaning: [
    { key: 'place',  label: '清掃場所',  type: 'textarea',
      placeholder: '例：3階エントランス、駐車場B区画 など' },
    { key: 'work',   label: '清掃内容',  type: 'textarea',
      placeholder: '例：床面モップ掛け、ガラス清拭、ゴミ回収' },
    { key: 'notes',  label: '特記事項',  type: 'textarea',
      placeholder: '例：特になし / 落書きを発見、管理者へ報告済み' },
  ],
  repair: [
    { key: 'target',  label: '対象箇所',   type: 'textarea',
      placeholder: '例：西館2F トイレ 水栓レバー' },
    { key: 'symptom', label: '症状',       type: 'textarea',
      placeholder: '例：レバー操作時に水が止まらない' },
    { key: 'action',  label: '対応内容',   type: 'textarea',
      placeholder: '例：パッキン交換により修理完了' },
  ],
};

// ジャンル別フィールドの初期値
const INITIAL_GENRE_FIELDS = {
  inspection: { item: '', hasAnomaly: 'no', findings: '' },
  cleaning:   { place: '', work: '', notes: '' },
  repair:     { target: '', symptom: '', action: '' },
};

const ReporterDashboard = () => {
  const { logout, user } = useAuth();
  const [showEmergency, setShowEmergency] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [photos, setPhotos] = useState([]);

  // フォーム基本情報
  const [formData, setFormData] = useState({
    genre: 'cleaning',
    department: '',
    hasIssue: 'no',
    issueDetail: '',
    hasDelay: 'no',
    date: new Date().toISOString().split('T')[0],
  });

  // ジャンル別入力フィールド
  const [genreFields, setGenreFields] = useState(INITIAL_GENRE_FIELDS);

  // 備考欄
  const [showMemo, setShowMemo] = useState(false);
  const [memo, setMemo] = useState('');

  const [validationError, setValidationError] = useState('');
  const [useAI, setUseAI] = useState(false);
  const [aiFeedback, setAiFeedback] = useState('');
  const [aiFeedbackLoading, setAiFeedbackLoading] = useState(false);

  // 現在ジャンルの全入力を1つの文章に結合（PreviewScreen・AI・Excel共用）
  const buildContent = () => {
    const defs = GENRE_FIELD_DEFS[formData.genre];
    const fields = genreFields[formData.genre];
    const lines = defs.map(def => {
      if (def.type === 'radio') {
        const optLabel = def.options.find(o => o.value === fields[def.key])?.label ?? fields[def.key];
        return `【${def.label}】${optLabel}`;
      }
      return `【${def.label}】${fields[def.key]}`;
    });
    if (showMemo && memo.trim()) {
      lines.push(`【備考】${memo}`);
    }
    return lines.join('\n');
  };

  // ジャンルフィールドを1項目更新
  const updateGenreField = (key, value) => {
    setGenreFields(prev => ({
      ...prev,
      [formData.genre]: { ...prev[formData.genre], [key]: value },
    }));
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

    const genre = GENRES.find(g => g.id === formData.genre)?.label || formData.genre;
    const content = buildContent();
    const prompt = `あなたは現場報告書の添削AIです。以下の報告書の内容を読み、不明確な点・不足している情報・改善すべき表現について日本語で具体的にアドバイスしてください。箇条書きで簡潔に3点以内でまとめてください。問題がなければ「特に指摘はありません」と答えてください。

【ジャンル】${genre}
【部署】${formData.department || '未入力'}
【問題の有無】${formData.hasIssue === 'yes' ? '有り' : '無し'}
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
        const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
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
    const handler = setTimeout(() => {
      const currentFields = genreFields[formData.genre];
      const hasInput = formData.department ||
        Object.values(currentFields).some(v => typeof v === 'string' && v.trim() && v !== 'no');
      if (hasInput) {
        localStorage.setItem('re_report_autosave', JSON.stringify({
          ...formData, genreFields, showMemo, memo, timestamp: Date.now(),
        }));
      }
    }, 2000);
    return () => clearTimeout(handler);
  }, [formData, genreFields, showMemo, memo]);

  const recoverData = (accept) => {
    if (accept) {
      try {
        const saved = JSON.parse(localStorage.getItem('re_report_autosave'));
        setFormData(prev => ({
          ...prev,
          genre:       saved.genre       ?? prev.genre,
          department:  saved.department  ?? prev.department,
          hasIssue:    saved.hasIssue    ?? prev.hasIssue,
          issueDetail: saved.issueDetail ?? prev.issueDetail,
          hasDelay:    saved.hasDelay    ?? prev.hasDelay,
          date:        saved.date        ?? prev.date,
        }));
        if (saved.genreFields) setGenreFields(saved.genreFields);
        if (saved.showMemo != null) setShowMemo(saved.showMemo);
        if (saved.memo != null) setMemo(saved.memo);
      } catch (e) {
        console.error('Failed to parse autosave data', e);
      }
    } else {
      localStorage.removeItem('re_report_autosave');
    }
    setShowRecoveryDialog(false);
  };

  const handleGenreChange = (genreId) => {
    setFormData(prev => ({
      ...prev,
      genre: genreId,
      hasDelay: genreId === 'cleaning' ? 'no' : prev.hasDelay,
    }));
    setShowMemo(false);
  };

  const handleDateExtracted = (extractedDate) => {
    const formatted = extractedDate.toISOString().split('T')[0];
    setFormData(prev => ({ ...prev, date: formatted }));
    alert(`写真から撮影日（${formatted}）を取得しました`);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const defs  = GENRE_FIELD_DEFS[formData.genre];
    const fields = genreFields[formData.genre];
    const hasContent = defs.some(def => def.type !== 'radio' && fields[def.key]?.trim());
    if (!formData.department) {
      setValidationError('部署名は必須です。');
      return;
    }
    if (!hasContent) {
      setValidationError('報告内容を少なくとも1項目入力してください。');
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
        onConfirm={() => {
          alert('送信完了しました！');
          localStorage.removeItem('re_report_autosave');
          window.location.reload();
        }}
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

        {/* 問題の有無・進捗の遅れ */}
        <div className="form-row">
          <div className="form-section flex-1">
            <label>問題の有無</label>
            <div className="radio-group">
              <label><input type="radio" value="no" checked={formData.hasIssue === 'no'} onChange={e => setFormData(prev => ({ ...prev, hasIssue: e.target.value, issueDetail: '' }))} /> 無し</label>
              <label><input type="radio" value="yes" checked={formData.hasIssue === 'yes'} onChange={e => setFormData(prev => ({ ...prev, hasIssue: e.target.value }))} /> 有り</label>
            </div>
          </div>
          <div style={{ display: formData.genre !== 'cleaning' ? 'block' : 'none' }} className="flex-1">
            <div className="form-section flex-1">
              <label>進捗の遅れ</label>
              <div className="radio-group">
                <label><input type="radio" value="no" checked={formData.hasDelay === 'no'} onChange={e => setFormData(prev => ({ ...prev, hasDelay: e.target.value }))} /> 無し</label>
                <label><input type="radio" value="yes" checked={formData.hasDelay === 'yes'} onChange={e => setFormData(prev => ({ ...prev, hasDelay: e.target.value }))} /> 有り</label>
              </div>
            </div>
          </div>
        </div>

        {/* 問題詳細 */}
        <div style={{ display: formData.hasIssue === 'yes' ? 'block' : 'none' }}>
          <div className="form-section">
            <div className="label-with-action">
              <label>問題の詳細</label>
              <VoiceInput onResult={text => setFormData(prev => ({
                ...prev,
                issueDetail: prev.issueDetail ? `${prev.issueDetail}\n${text}` : text,
              }))} />
            </div>
            <textarea
              className="input-field issue-detail-area"
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
          </div>
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

          {currentDefs.map(def => (
            <div key={def.key} className="form-section">
              {def.type === 'radio' ? (
                <label>{def.label}</label>
              ) : (
                <div className="label-with-action">
                  <label>{def.label}</label>
                  <VoiceInput onResult={text => appendToGenreField(def.key, text)} />
                </div>
              )}
              {def.type === 'radio' ? (
                <div className="radio-group">
                  {def.options.map(opt => (
                    <label key={opt.value}>
                      <input
                        type="radio"
                        value={opt.value}
                        checked={currentFields[def.key] === opt.value}
                        onChange={e => updateGenreField(def.key, e.target.value)}
                      /> {opt.label}
                    </label>
                  ))}
                </div>
              ) : (
                <textarea
                  className="input-field genre-field-area"
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
            </div>
          ))}

          {/* 備考欄トグル */}
          <div className="memo-toggle">
            <label className="memo-checkbox-label">
              <input
                type="checkbox"
                checked={showMemo}
                onChange={e => setShowMemo(e.target.checked)}
              />
              備考欄を追加
            </label>
          </div>

          <div style={{ display: showMemo ? 'block' : 'none' }}>
            <div className="form-section">
              <div className="label-with-action">
                <label>備考</label>
                <VoiceInput onResult={text => setMemo(prev => prev ? `${prev}\n${text}` : text)} />
              </div>
              <textarea
                className="input-field genre-field-area"
                value={memo}
                onChange={e => setMemo(e.target.value)}
                placeholder="補足事項があれば記入してください..."
                rows={3}
                data-gramm="false"
                data-gramm_editor="false"
                data-enable-grammarly="false"
                autoComplete="off"
                data-1p-ignore="true"
                spellCheck={false}
              />
            </div>
          </div>
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

        <div style={{ display: useAI ? 'block' : 'none' }}>
          <div className="ai-feedback-box">
            <h4>
              {aiFeedbackLoading
                ? <><Loader size={16} className="spin" /> AIが添削中...</>
                : <><Bot size={16} /> AIコメント</>
              }
            </h4>
            {!aiFeedbackLoading && <p>{aiFeedback}</p>}
          </div>
        </div>

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
