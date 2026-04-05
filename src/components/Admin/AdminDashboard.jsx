import { useState, useEffect } from 'react';
import { useAuth } from '../../AuthContext';
import { LogOut, Filter, Bot, FileText, Phone, Mail, MessageCircle, AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';
import ExcelExportBtn from './ExcelExportBtn';
import './AdminDashboard.css';

// ── ジャンルキー（DB値）→ 表示名 ──────────────────────
const GENRE_MAP = { cleaning: '清掃', inspection: '点検', repair: '修理' };

// ── DB行 → ダッシュボード用オブジェクト ────────────────
const mapReport = (r) => {
  const c   = r.cleanings?.[0];
  const ins = r.inspections?.[0];
  const rep = r.repairs?.[0];

  let content  = '';
  let hasDelay = 'no';

  if (r.genre === 'cleaning' && c) {
    content  = [c.location, c.item, c.special_notes, c.notes].filter(Boolean).join('　');
    // 清掃は「完了」以外を遅延とみなす
    hasDelay = c.is_completed !== '完了' ? 'yes' : 'no';
  } else if (r.genre === 'inspection' && ins) {
    content  = [ins.inspection_item, ins.findings, ins.notes].filter(Boolean).join('　');
    hasDelay = ins.is_delayed === '遅れあり' ? 'yes' : 'no';
  } else if (r.genre === 'repair' && rep) {
    content  = [rep.repair_item, rep.repair_detail, rep.repair_action, rep.notes].filter(Boolean).join('　');
    hasDelay = rep.progress === '遅れあり' ? 'yes' : 'no';
  }

  return {
    id:         String(r.id),
    date:       r.work_date,
    genre:      GENRE_MAP[r.genre] ?? r.genre,
    submitter:  r.department,          // DB に氏名フィールドなし→部署で代替
    department: r.department,
    hasIssue:   r.has_problem ? 'yes' : 'no',
    hasDelay,
    hasPhoto:   (r.photos?.length ?? 0) > 0,
    photoUrls:  r.photos?.map(p => p.photo_url) ?? [],  // Excel 画像埋め込み用
    content:    content || '（詳細なし）',
  };
};

// ── サマリーブロックの定義 ──────────────────────────────
const SUMMARY_BLOCKS = [
  { key: 'no_issue',  label: '異常なし',       colorClass: 'no-issue',  count: (rs) => rs.filter(r => r.hasIssue === 'no').length },
  { key: 'has_issue', label: '要確認（問題あり）', colorClass: 'has-issue', count: (rs) => rs.filter(r => r.hasIssue === 'yes').length },
  { key: 'delayed',   label: '進捗遅延',        colorClass: 'delayed',   count: (rs) => rs.filter(r => r.hasDelay === 'yes').length },
];

// ── AI 要約生成（Gemini API） ──────────────────────────
const generateSummary = async (reports) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('APIキーが未設定です（VITE_GEMINI_API_KEY）');

  const reportText = reports.map(r =>
    `・[${r.date}] ${r.genre}｜${r.department}: ${r.content}（問題:${r.hasIssue === 'yes' ? 'あり' : 'なし'} / 遅延:${r.hasDelay === 'yes' ? 'あり' : 'なし'}）`
  ).join('\n');

  const prompt =
    '以下の業務報告書データを分析し、現在発生している主な問題点と、管理者が取るべき推奨アクションを200文字程度のインサイトとして要約してください。箇条書きは使わず、流れるような文章で出力してください。\n\n' +
    reportText;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message ?? `APIエラー (${res.status})`);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '要約を取得できませんでした。';
};

// ── コンポーネント ─────────────────────────────────────
const AdminDashboard = () => {
  const { logout, user } = useAuth();

  // 報告書データ
  const [reports,        setReports]        = useState([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError,   setReportsError]   = useState('');

  // フィルター
  const [activeFilter, setActiveFilter] = useState(null);
  const [filters, setFilters] = useState({
    date: '', genre: '', submitter: '', department: '',
    hasIssue: '', hasDelay: '', hasPhoto: '',
  });
  const [expandedReport, setExpandedReport] = useState(null);

  // AI 要約
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError,   setAiError]   = useState('');

  // ── Supabase fetch ───────────────────────────────────
  const fetchReports = async () => {
    setReportsLoading(true);
    setReportsError('');
    try {
      // FK制約名で一意にリレーションを指定（複数FK存在時の曖昧さ回避）
      const { data, error } = await supabase
        .from('reports')
        .select(`
          id, genre, department, work_date, has_problem,
          cleanings!cleanings_report_id_fkey     ( location, item, is_completed, special_notes, notes ),
          inspections!inspections_report_id_fkey ( inspection_item, anomaly_level, findings, is_delayed, notes ),
          repairs!repairs_report_id_fkey         ( repair_item, repair_detail, repair_action, progress, notes ),
          photos!photos_report_id_fkey           ( photo_url )
        `)
        .order('work_date', { ascending: false });

      if (error) throw error;
      setReports(data.map(mapReport));
    } catch (e) {
      console.error('[Supabase] 報告書の取得に失敗:', e);
      setReportsError(e.message);
    } finally {
      setReportsLoading(false);
    }
  };

  // ── 初回マウント：データ取得 + Realtime購読 ─────────
  useEffect(() => {
    fetchReports();

    // reports テーブルの変更をリアルタイムで検知して再取得
    const channel = supabase
      .channel('admin_reports_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, fetchReports)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 初回データ取得完了後に AI 要約を自動生成 ────────
  useEffect(() => {
    if (reports.length > 0 && !aiSummary) {
      handleGenerateSummary(reports);
    }
  }, [reports]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── AI 要約ハンドラ ──────────────────────────────────
  const handleGenerateSummary = async (targetReports) => {
    if (!targetReports?.length) return;
    setAiLoading(true);
    setAiError('');
    try {
      const summary = await generateSummary(targetReports);
      setAiSummary(summary);
    } catch (e) {
      setAiError(e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleSummaryClick = (key) => {
    setActiveFilter(prev => prev === key ? null : key);
  };

  // フィルター適用後の一覧
  const filteredReports = reports.filter(rpt => {
    if (filters.date       && rpt.date !== filters.date) return false;
    if (filters.genre      && rpt.genre !== filters.genre) return false;
    if (filters.submitter  && !rpt.submitter.includes(filters.submitter)) return false;
    if (filters.department && rpt.department !== filters.department) return false;
    if (filters.hasIssue   && rpt.hasIssue !== filters.hasIssue) return false;
    if (filters.hasDelay   && rpt.hasDelay !== filters.hasDelay) return false;
    if (filters.hasPhoto === 'yes' && !rpt.hasPhoto) return false;
    if (filters.hasPhoto === 'no'  &&  rpt.hasPhoto) return false;
    if (activeFilter === 'no_issue'  && rpt.hasIssue !== 'no')  return false;
    if (activeFilter === 'has_issue' && rpt.hasIssue !== 'yes') return false;
    if (activeFilter === 'delayed'   && rpt.hasDelay !== 'yes') return false;
    return true;
  });

  return (
    <div className="admin-container">
      <header className="admin-header glass-panel">
        <div>
          <h2>報告書管理ダッシュボード</h2>
          <p className="subtitle">{user?.name} ログイン中</p>
        </div>
        <button className="btn btn-outline logout-btn" onClick={logout}>
          <LogOut size={16} /> ログアウト
        </button>
      </header>

      {/* ── サマリーブロック ── */}
      <div className="summary-blocks">
        {SUMMARY_BLOCKS.map(block => (
          <button
            key={block.key}
            type="button"
            className={`summary-block ${block.colorClass}${activeFilter === block.key ? ' active' : ''}`}
            onClick={() => handleSummaryClick(block.key)}
            title={activeFilter === block.key ? 'クリックで絞り込みを解除' : 'クリックで絞り込む'}
          >
            <span className="summary-count">{block.count(reports)}</span>
            <span className="summary-label">{block.label}</span>
            {activeFilter === block.key && (
              <span className="summary-active-badge">絞込中</span>
            )}
          </button>
        ))}
      </div>

      <div className="admin-grid">
        {/* ① 検索・フィルターパネル */}
        <div className="filter-panel glass-panel panel-filter">
            <h3 className="section-title"><Filter size={18} /> 検索・フィルター</h3>
            <div className="filter-grid">
              <div className="filter-item">
                <label>日付</label>
                <input type="date" className="input-field-sm" value={filters.date}
                  onChange={e => handleFilterChange('date', e.target.value)}
                  data-gramm="false" data-enable-grammarly="false"
                  autoComplete="off" data-1p-ignore="true" />
              </div>
              <div className="filter-item">
                <label>ジャンル</label>
                <select className="input-field-sm" value={filters.genre}
                  onChange={e => handleFilterChange('genre', e.target.value)}>
                  <option value="">すべて</option>
                  <option value="清掃">清掃</option>
                  <option value="点検">点検</option>
                  <option value="修理">修理</option>
                </select>
              </div>
              <div className="filter-item">
                <label>提出者名</label>
                <input type="text" className="input-field-sm" placeholder="検索..."
                  value={filters.submitter}
                  onChange={e => handleFilterChange('submitter', e.target.value)}
                  data-gramm="false" data-enable-grammarly="false"
                  autoComplete="off" data-1p-ignore="true" />
              </div>
              <div className="filter-item">
                <label>部署</label>
                <select className="input-field-sm" value={filters.department}
                  onChange={e => handleFilterChange('department', e.target.value)}>
                  <option value="">すべて</option>
                  <option value="清掃部">清掃部</option>
                  <option value="設備管理部">設備管理部</option>
                  <option value="警備部">警備部</option>
                </select>
              </div>
            </div>
            <div className="filter-item-row toggle-group-sm mt-3">
              <label>問題の有無:</label>
              <select className="input-field-sm" value={filters.hasIssue}
                onChange={e => handleFilterChange('hasIssue', e.target.value)}>
                <option value="">すべて</option>
                <option value="yes">あり</option>
                <option value="no">なし</option>
              </select>
            </div>
            <div className="filter-item-row toggle-group-sm">
              <label>進捗の遅れ:</label>
              <select className="input-field-sm" value={filters.hasDelay}
                onChange={e => handleFilterChange('hasDelay', e.target.value)}>
                <option value="">すべて</option>
                <option value="yes">あり</option>
                <option value="no">なし</option>
              </select>
            </div>
            <div className="filter-item-row toggle-group-sm">
              <label>写真の有無:</label>
              <select className="input-field-sm" value={filters.hasPhoto}
                onChange={e => handleFilterChange('hasPhoto', e.target.value)}>
                <option value="">すべて</option>
                <option value="yes">あり</option>
                <option value="no">なし</option>
              </select>
            </div>
            <button
              className="btn btn-outline full-width mt-3"
              onClick={() => {
                setFilters({ date:'', genre:'', submitter:'', department:'',
                             hasIssue:'', hasDelay:'', hasPhoto:'' });
                setActiveFilter(null);
              }}
            >
              条件クリア
            </button>
        </div>

        {/* ② 届いた報告書リスト */}
        <div className="report-list-container glass-panel panel-reports">
            <div className="list-header">
              <h3 className="section-title">
                <FileText size={18} /> 届いた報告書
                <span className="list-count">{filteredReports.length}件</span>
                <span
                  className="filter-active-note"
                  style={{ visibility: activeFilter ? 'visible' : 'hidden' }}
                >
                  {activeFilter
                    ? `― ${SUMMARY_BLOCKS.find(b => b.key === activeFilter)?.label} で絞込中`
                    : '\u00a0'}
                </span>
              </h3>
              <ExcelExportBtn reports={filteredReports} aiSummary={aiSummary} />
            </div>

            <div className="report-items">
              {reportsLoading ? (
                <p className="no-data">読み込み中...</p>
              ) : reportsError ? (
                <p className="no-data" style={{ color: 'var(--danger)' }}>
                  取得エラー: {reportsError}
                  <button className="btn-text-refresh" onClick={fetchReports}>
                    <RefreshCw size={14} /> 再試行
                  </button>
                </p>
              ) : filteredReports.length === 0 ? (
                <p className="no-data">該当する報告書はありません。</p>
              ) : (
                filteredReports.map(rpt => (
                  <div
                    key={rpt.id}
                    className={`report-card${
                      rpt.hasIssue === 'yes' && rpt.hasDelay === 'yes' ? ' card-issue-delay' :
                      rpt.hasIssue === 'yes' ? ' card-issue' :
                      rpt.hasDelay === 'yes' ? ' card-delay' : ''
                    }${expandedReport === rpt.id ? ' expanded' : ''}`}
                    onClick={() => setExpandedReport(expandedReport === rpt.id ? null : rpt.id)}
                  >
                    <div className="card-top">
                      <span className="rpt-date">{rpt.date}</span>
                      <span className="rpt-dept">{rpt.department}</span>
                      <div className="card-badges">
                        {rpt.hasIssue === 'yes' && <span className="badge danger">問題あり</span>}
                        {rpt.hasDelay === 'yes' && <span className="badge warning">遅延</span>}
                        {rpt.hasPhoto          && <span className="badge info">写真有</span>}
                      </div>
                    </div>
                    <div className="card-middle">
                      {rpt.hasIssue === 'yes' && (
                        <AlertTriangle size={15} className="card-icon-issue" />
                      )}
                      {rpt.hasDelay === 'yes' && (
                        <Clock size={15} className="card-icon-delay" />
                      )}
                      <strong>【{rpt.genre}】</strong>{' '}
                      {expandedReport === rpt.id
                        ? rpt.content
                        : (rpt.content.length > 40 ? rpt.content.substring(0, 40) + '…' : rpt.content)
                      }
                    </div>
                    {/* 担当者連絡ボタン群 */}
                    <div className="card-actions" onClick={e => e.stopPropagation()}>
                      <button
                        className="btn-contact"
                        onClick={() => {
                          if (window.confirm(`${rpt.department}（${rpt.genre}）に電話を発信しますか？`)) {
                            window.location.href = 'tel:';
                          }
                        }}
                      >
                        <Phone size={13} /> 電話
                      </button>
                      <button
                        className="btn-contact btn-contact-line"
                        onClick={() => {
                          const text = `【${rpt.genre}】\n部署：${rpt.department}\n\n${rpt.content}`;
                          window.open(
                            `https://line.me/R/msg/text/?${encodeURIComponent(text)}`,
                            '_blank',
                            'noreferrer',
                          );
                        }}
                      >
                        <MessageCircle size={13} /> LINE
                      </button>
                      <button
                        className="btn-contact"
                        onClick={() => {
                          const subject = encodeURIComponent(`【${rpt.genre}】${rpt.department}の報告書`);
                          const body = encodeURIComponent(
                            `ジャンル：${rpt.genre}\n部署：${rpt.department}\n\n${rpt.content}`,
                          );
                          window.location.href = `mailto:?subject=${subject}&body=${body}`;
                        }}
                      >
                        <Mail size={13} /> メール
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
        </div>

        {/* ③ AIインサイト */}
        <div className="ai-summary glass-panel panel-ai">
          <div className="ai-panel-header">
            <h3 className="section-title text-primary"><Bot size={18} /> AI グローバル要約</h3>
            <button
              className="btn-ai-generate"
              onClick={() => handleGenerateSummary(filteredReports)}
              disabled={aiLoading || filteredReports.length === 0}
            >
              {aiLoading ? <span className="ai-spinner" /> : <Bot size={14} />}
              {aiLoading ? '生成中...' : '要約を更新'}
            </button>
          </div>
          {aiError && <p className="ai-error">{aiError}</p>}
          {aiSummary ? (
            <p className="ai-insight">{aiSummary}</p>
          ) : !aiLoading && (
            <p className="ai-insight ai-placeholder">
              データ読み込み後、AIが自動でインサイトを生成します。
            </p>
          )}
        </div>

      </div>
    </div>
  );
};

export default AdminDashboard;
