import React, { useState, useEffect } from 'react';
import { useAuth } from '../../AuthContext';
import EmergencyModal from './EmergencyModal';
import VoiceInput from './VoiceInput';
import PhotoUploader from './PhotoUploader';
import PreviewScreen from './PreviewScreen';
import { Save, Send, LogOut, AlertTriangle, Bot, Loader } from 'lucide-react';
import './ReporterDashboard.css';

const GENRES = [
  { id: 'cleaning', label: '清掃', template: '【清掃場所】\n【清掃内容】\n【特記事項】' },
  { id: 'inspection', label: '点検', template: '【点検項目】\n【異常の有無】無・有\n【所見】' },
  { id: 'repair', label: '修理', template: '【対象箇所】\n【症状】\n【対応内容】' }
];

const ReporterDashboard = () => {
  const { logout, user } = useAuth();
  const [showEmergency, setShowEmergency] = useState(false); // 一時的にオフ
  const [showPreview, setShowPreview] = useState(false);
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [photos, setPhotos] = useState([]);

  // Form State
  const [formData, setFormData] = useState({
    genre: 'cleaning',
    content: GENRES[0].template,
    department: '',
    hasIssue: 'no',
    issueDetail: '',
    hasDelay: 'no',
    date: new Date().toISOString().split('T')[0],
  });

  const [validationError, setValidationError] = useState('');
  const [useAI, setUseAI] = useState(false);
  const [aiFeedback, setAiFeedback] = useState('');
  const [aiFeedbackLoading, setAiFeedbackLoading] = useState(false);

  // AI赤ペン先生：トグル操作（Gemini REST API を fetch で直接呼び出し）
  // React 19 の async onChange 問題を避けるため .then()/.catch() 形式で記述
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
    const prompt = `あなたは現場報告書の添削AIです。以下の報告書の内容を読み、不明確な点・不足している情報・改善すべき表現について日本語で具体的にアドバイスしてください。箇条書きで簡潔に3点以内でまとめてください。問題がなければ「特に指摘はありません」と答えてください。

【ジャンル】${genre}
【部署】${formData.department || '未入力'}
【問題の有無】${formData.hasIssue === 'yes' ? '有り' : '無し'}
${formData.issueDetail ? `【問題の詳細】${formData.issueDetail}` : ''}
【報告内容】
${formData.content}`;

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
  // const [toastMessage, setToastMessage] = useState(''); // 通知を一時的にオフ

  useEffect(() => {
    // Check local storage for saved data
    const saved = localStorage.getItem('re_report_autosave');
    if (saved) {
      setShowRecoveryDialog(true);
    }
  }, []);

  useEffect(() => {
    // Auto-save logic (debounced)
    const handler = setTimeout(() => {
      if (formData.content || formData.department) {
        localStorage.setItem('re_report_autosave', JSON.stringify({ ...formData, timestamp: Date.now() }));
        // setToastMessage('下書きを自動保存しました');
        // setTimeout(() => setToastMessage(''), 3000);
      }
    }, 2000);

    return () => clearTimeout(handler);
  }, [formData]);

  const recoverData = (accept) => {
    if (accept) {
      try {
        const saved = JSON.parse(localStorage.getItem('re_report_autosave'));
        setFormData((prev) => ({ ...prev, ...saved }));
      } catch (e) {
        console.error('Failed to parse autosave data', e);
      }
    } else {
      localStorage.removeItem('re_report_autosave');
    }
    setShowRecoveryDialog(false);
  };

  const handleGenreChange = (genreId) => {
    const genre = GENRES.find(g => g.id === genreId);
    // 清掃に切り替えたときは進捗の遅れをリセット
    setFormData(prev => ({
      ...prev,
      genre: genreId,
      content: genre.template,
      hasDelay: genreId === 'cleaning' ? 'no' : prev.hasDelay,
    }));
  };

  const handleDateExtracted = (extractedDate) => {
    const formatted = extractedDate.toISOString().split('T')[0];
    setFormData(prev => ({ ...prev, date: formatted }));
    alert(`写真から撮影日（${formatted}）を取得しました`);
  };

  const handleVoiceInput = (text) => {
    setFormData(prev => ({ ...prev, content: prev.content + '\n' + text }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.department || !formData.content.trim()) {
      setValidationError('部署名と報告内容は必須です。');
      return;
    }
    setValidationError('');
    setShowPreview(true);
  };

  if (showPreview) {
    return (
      <PreviewScreen 
        data={{ ...formData, photos }} 
        onBack={() => setShowPreview(false)} 
        onConfirm={() => {
          alert('送信完了しました！');
          localStorage.removeItem('re_report_autosave');
          window.location.reload();
        }}
      />
    );
  }

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

      {/* 通知を一時的にオフ
      {toastMessage && (
        <div className="toast-notification">
          <CheckCircle2 size={16} /> {toastMessage}
        </div>
      )}
      */}

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
        
        {/* Genre Tabs */}
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

        {/* Metadata */}
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
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-section flex-1">
            <label>問題の有無</label>
            <div className="radio-group">
              <label><input type="radio" value="no" checked={formData.hasIssue === 'no'} onChange={e => setFormData(prev => ({ ...prev, hasIssue: e.target.value, issueDetail: '' }))} /> 無し</label>
              <label><input type="radio" value="yes" checked={formData.hasIssue === 'yes'} onChange={e => setFormData(prev => ({ ...prev, hasIssue: e.target.value }))} /> 有り</label>
            </div>
          </div>
          {/* 清掃タブでは進捗の遅れを非表示 */}
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

        {/* 問題あり時の詳細入力欄 */}
        <div style={{ display: formData.hasIssue === 'yes' ? 'block' : 'none' }}>
          <div className="form-section">
            <label>問題の詳細</label>
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

        <div className="form-section">
          <PhotoUploader 
            photos={photos} 
            setPhotos={setPhotos} 
            onDateExtracted={handleDateExtracted} 
          />
        </div>

        {/* Content & Voice Input */}
        <div className="form-section">
          <div className="label-with-action">
            <label>報告内容</label>
            <VoiceInput onSelectText={handleVoiceInput} />
          </div>
          <textarea
            className="input-field content-area"
            value={formData.content}
            onChange={e => setFormData(prev => ({ ...prev, content: e.target.value }))}
            placeholder="詳細を入力してください..."
            rows={8}
            data-gramm="false"
            data-gramm_editor="false"
            data-enable-grammarly="false"
            autoComplete="off"
            data-1p-ignore="true"
            spellCheck={false}
          ></textarea>
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
