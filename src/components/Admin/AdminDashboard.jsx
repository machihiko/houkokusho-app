import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import {
  LogOut, Filter, Bot, FileText, Phone, Mail, MessageCircle,
  AlertTriangle, Clock, RefreshCw, Camera, ChevronDown, ChevronUp,
  Table2, LayoutGrid, ArrowUpDown,
} from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';
import ExcelExportBtn from './ExcelExportBtn';
import SingleReportA4Btn from './SingleReportA4Btn';
import TemplateSettings from './TemplateSettings';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import './AdminDashboard.css';

// ── ジャンルキー → 表示名 ──────────────────────────────
const GENRE_LABELS = {
  cleaning:   '清掃',
  inspection: '点検',
  repair:     '修理',
  patrol:     '巡回',
  emergency:  '緊急対応',
};

// ── DB行 → ダッシュボード用オブジェクト ────────────────
const mapReport = (r) => {
  const tasks     = r.report_tasks ?? [];
  const allPhotos = tasks.flatMap(t => t.photos ?? []);

  // 問題あり：いずれかのタスクに has_problem = true
  const hasIssue = tasks.some(t => t.has_problem) ? 'yes' : 'no';
  // 遅延：is_on_schedule = false
  const hasDelay = r.is_on_schedule === false ? 'yes' : 'no';

  // Excel / SingleReport 用テキスト（全タスク結合）
  const content = tasks.map((t, i) => {
    const parts = [
      `【${GENRE_LABELS[t.genre] ?? t.genre}】`,
      t.target_place && `担当場所: ${t.target_place}`,
      t.task_detail  && `作業内容: ${t.task_detail}`,
      t.symptom      && `症状: ${t.symptom}`,
      t.action_taken && `対応: ${t.action_taken}`,
      t.findings     && `報告: ${t.findings}`,
    ].filter(Boolean).join(' / ');
    return `作業${i + 1}: ${parts}`;
  }).join('\n');

  // ジャンル表示用（ユニーク結合）
  const genre =
    [...new Set(tasks.map(t => GENRE_LABELS[t.genre] ?? t.genre))].join('・') || '（なし）';

  return {
    id:           String(r.id),
    date:         r.work_date     ?? '',
    startTime:    (r.start_time ?? '').slice(0, 5),
    endTime:      (r.end_time   ?? '').slice(0, 5),
    locationName: r.locations?.name    ?? '',
    department:   r.departments?.name  ?? '',
    submitter:    r.profiles?.display_name ?? '',
    coWorkers:    r.co_workers    ?? [],
    isOnSchedule: r.is_on_schedule ?? true,
    delayReason:  r.delay_reason  ?? '',
    tasks,
    hasIssue,
    hasDelay,
    hasPhoto:     allPhotos.length > 0,
    photoUrls:    allPhotos.map(p => p.photo_url),
    genre,
    content:      content || '（詳細なし）',
    taskCount:    tasks.length,
    photoCount:   allPhotos.length,
  };
};

// ── サマリーブロックの定義 ──────────────────────────────
const SUMMARY_BLOCKS = [
  { key: 'no_issue',  label: '異常なし',  colorClass: 'no-issue',  count: (rs) => rs.filter(r => r.hasIssue === 'no').length },
  { key: 'has_issue', label: '問題あり',  colorClass: 'has-issue', count: (rs) => rs.filter(r => r.hasIssue === 'yes').length },
  { key: 'delayed',   label: '進捗遅延',  colorClass: 'delayed',   count: (rs) => rs.filter(r => r.hasDelay === 'yes').length },
];

// ── AI 要約生成（Gemini API） ──────────────────────────
const generateSummary = async (reports) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('APIキーが未設定です（VITE_GEMINI_API_KEY）');

  const reportText = reports.map(r => {
    const taskSummary = r.tasks.map(t =>
      `  - [${GENRE_LABELS[t.genre] ?? t.genre}] ${t.target_place ?? ''} ${t.findings ?? t.task_detail ?? ''}`
    ).join('\n');
    return (
      `・[${r.date}] ${r.department}（${r.submitter}）` +
      `${r.hasDelay === 'yes' ? ' ★遅延' : ''}${r.hasIssue === 'yes' ? ' ⚠問題あり' : ''}\n` +
      taskSummary
    );
  }).join('\n');

  const prompt =
    '以下の業務報告書データを分析し、現在発生している主な問題点と、管理者が取るべき推奨アクションを200文字程度のインサイトとして要約してください。箇条書きは使わず、流れるような文章で出力してください。\n\n' +
    reportText;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
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

  const [reports,        setReports]        = useState([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError,   setReportsError]   = useState('');

  const [activeFilter, setActiveFilter] = useState(null);
  const [selectedDate, setSelectedDate]  = useState(new Date()); // カレンダー基準日
  const [filters, setFilters] = useState({
    location: '', genre: '', submitter: '', department: '',
    hasIssue: '', hasDelay: '', hasPhoto: '',
  });
  const [expandedReport, setExpandedReport] = useState(null);
  const [viewTab,        setViewTab]        = useState('daily');  // 'daily' | 'weekly' | 'monthly'
  const [viewMode,       setViewMode]       = useState('card');   // 'table' | 'card'
  const [sortOrder,      setSortOrder]      = useState('desc');  // 'desc'=新しい順 / 'asc'=古い順
  const [showTemplateSettings, setShowTemplateSettings] = useState(false);

  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError,   setAiError]   = useState('');

  // 場所リスト・部署リスト（フィルター用 — DBから自動収集）
  const locationList   = [...new Set(reports.map(r => r.locationName).filter(Boolean))].sort();
  const departmentList = [...new Set(reports.map(r => r.department).filter(Boolean))].sort();

  // ── Supabase V2 fetch ─────────────────────────────────
  const fetchReports = async () => {
    setReportsLoading(true);
    setReportsError('');
    try {
      const { data, error } = await supabase
        .from('reports')
        .select(`
          *,
          locations   ( name ),
          departments ( name ),
          profiles!reports_reporter_id_fkey ( display_name ),
          report_tasks (
            id, genre, target_place, task_detail,
            symptom, action_taken, has_problem, findings, custom_data,
            photos ( photo_url )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReports(data.map(mapReport));
    } catch (e) {
      console.error('[Supabase] 報告書の取得に失敗:', e);
      setReportsError(e.message);
    } finally {
      setReportsLoading(false);
    }
  };

  // 初回マウント：データ取得 + Realtime購読
  useEffect(() => {
    fetchReports();

    const channel = supabase
      .channel('admin_reports_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, fetchReports)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // 初回データ取得後に AI 要約を自動生成
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
      const msg = e.message ?? '';
      // 混雑・レート制限エラーを日本語に変換
      if (
        msg.includes('429') ||
        /quota|rate.?limit|high.?demand|overload|resource.?exhaust/i.test(msg)
      ) {
        setAiError('現在AIサーバーが混み合っています。少し時間をおいて再度お試しください。');
      } else {
        setAiError(`AI要約の生成に失敗しました。（${msg}）`);
      }
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

  // ── カレンダー選択日を基準とした日付範囲 ────────────────────
  // タイムゾーンのズレを防ぐためローカル時刻で文字列化
  const toLocalDateStr = (d) => {
    const y  = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${da}`;
  };
  const today          = toLocalDateStr(new Date());
  const selectedDateStr = toLocalDateStr(selectedDate);
  const selectedMonth   = selectedDateStr.slice(0, 7);
  const selectedWeekStart = (() => {
    const d   = new Date(selectedDate);
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return toLocalDateStr(d);
  })();
  const selectedWeekEnd = (() => {
    const d = new Date(selectedDate);
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1) + 6);
    return toLocalDateStr(d);
  })();

  // 報告書が存在する日付のSet（カレンダードット表示用）
  const reportDatesSet = new Set(reports.map(r => r.date).filter(Boolean));

  // ── フィルター適用 ────────────────────────────────────
  const filteredReports = reports.filter(rpt => {
    if (filters.location   && rpt.locationName !== filters.location)    return false;
    if (filters.genre      && !rpt.genre.includes(filters.genre))      return false;
    if (filters.submitter  && !rpt.submitter.includes(filters.submitter)) return false;
    if (filters.department && rpt.department !== filters.department)    return false;
    if (filters.hasIssue   && rpt.hasIssue !== filters.hasIssue)       return false;
    if (filters.hasDelay   && rpt.hasDelay !== filters.hasDelay)       return false;
    if (filters.hasPhoto === 'yes' && !rpt.hasPhoto)  return false;
    if (filters.hasPhoto === 'no'  &&  rpt.hasPhoto)  return false;
    if (activeFilter === 'no_issue'  && rpt.hasIssue !== 'no')  return false;
    if (activeFilter === 'has_issue' && rpt.hasIssue !== 'yes') return false;
    if (activeFilter === 'delayed'   && rpt.hasDelay !== 'yes') return false;
    // 期間タブ × カレンダー選択日によるフィルター
    if (viewTab === 'daily'   && rpt.date !== selectedDateStr)                                    return false;
    if (viewTab === 'weekly'  && (rpt.date < selectedWeekStart || rpt.date > selectedWeekEnd))    return false;
    if (viewTab === 'monthly' && !rpt.date.startsWith(selectedMonth))                             return false;
    return true;
  });

  // ── ソート（日付+開始時刻、デフォルト降順）────────────────────
  const sortedReports = [...filteredReports].sort((a, b) => {
    const keyA = `${a.date ?? ''}${a.startTime ?? ''}`;
    const keyB = `${b.date ?? ''}${b.startTime ?? ''}`;
    return sortOrder === 'desc' ? keyB.localeCompare(keyA) : keyA.localeCompare(keyB);
  });
  const toggleSort = () => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');

  // ── 日毎テーブル用：レポート → タスク行に展開 ────────────────
  const KNOWN_CUSTOM_KEYS = ['target_place', 'task_detail', 'symptom', 'action_taken'];
  const CUSTOM_DATA_LABELS = {
    target_place: '担当場所',
    task_detail:  '作業内容',
    symptom:      '症状',
    action_taken: '対応内容',
  };

  // V3はcustom_data優先、V2は個別カラムをフォールバック
  // Supabaseがjsonbカラムを文字列で返す場合にも対応
  const getCustomValue = (task, key) => {
    let cd = task.custom_data;
    if (typeof cd === 'string') {
      try { cd = JSON.parse(cd); } catch { cd = null; }
    }
    if (cd != null && typeof cd === 'object' && key in cd) return cd[key] ?? '';
    return task[key] ?? '';
  };

  const dailyRows = sortedReports.flatMap(rpt =>
    rpt.tasks.map(task => ({ ...task, _rpt: rpt }))
  );

  const extraCustomKeys = [...new Set(
    dailyRows.flatMap(row => Object.keys(row.custom_data ?? {}))
  )].filter(k => !KNOWN_CUSTOM_KEYS.includes(k));

  const activeCustomKeys = [...KNOWN_CUSTOM_KEYS, ...extraCustomKeys].filter(key =>
    dailyRows.some(row => getCustomValue(row, key) !== '')
  );

  // ── サマリーブロック上のコンテキストタイトル ─────────────
  const summaryTitle =
    viewTab === 'daily'
      ? (selectedDateStr === today ? `本日（${today}）の状況` : `「${selectedDateStr}」の状況`)
      : viewTab === 'weekly'
        ? `${selectedWeekStart} 〜 ${selectedWeekEnd} の状況`
        : `${selectedMonth} の状況`;

  return (
    <div className="admin-container">
      {showTemplateSettings && (
        <TemplateSettings onClose={() => setShowTemplateSettings(false)} />
      )}

      <header className="admin-header glass-panel">
        <div>
          <h2>報告書管理ダッシュボード</h2>
          <p className="subtitle">{user?.name} ログイン中</p>
        </div>
        <div className="admin-header-actions">
          {(user?.role === 'admin' || user?.role === 'super_admin') && (
            <button
              className="btn btn-outline"
              onClick={() => setShowTemplateSettings(true)}
              title="Excelテンプレートのセルマッピングを設定"
            >
              Excelテンプレート設定
            </button>
          )}
          <button className="btn btn-outline logout-btn" onClick={logout}>
            <LogOut size={16} /> ログアウト
          </button>
        </div>
      </header>

      {/* ── サマリーコンテキストタイトル ── */}
      <div className="summary-context">
        <span className="summary-context-title">{summaryTitle}</span>
        <span className="summary-context-sub">{filteredReports.length}件表示中</span>
      </div>

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
            <span className="summary-count">{block.count(filteredReports)}</span>
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
          {/* ── カレンダー（基準日コントローラー） ── */}
          <div className="filter-item filter-item-calendar">
            <label>
              基準日
              <span className="cal-selected-label">
                {selectedDateStr === today ? '今日' : selectedDateStr}
              </span>
            </label>
            <Calendar
              value={selectedDate}
              onChange={setSelectedDate}
              locale="ja-JP"
              tileContent={({ date, view }) => {
                if (view !== 'month') return null;
                const y  = date.getFullYear();
                const mo = String(date.getMonth() + 1).padStart(2, '0');
                const da = String(date.getDate()).padStart(2, '0');
                const d  = `${y}-${mo}-${da}`;
                return reportDatesSet.has(d) ? <span className="cal-dot" /> : null;
              }}
            />
          </div>

          <div className="filter-grid">
            <div className="filter-item">
              <label>場所（現場）</label>
              <select className="input-field-sm" value={filters.location}
                onChange={e => handleFilterChange('location', e.target.value)}>
                <option value="">すべて</option>
                {locationList.map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>
            <div className="filter-item">
              <label>ジャンル</label>
              <select className="input-field-sm" value={filters.genre}
                onChange={e => handleFilterChange('genre', e.target.value)}>
                <option value="">すべて</option>
                <option value="清掃">清掃</option>
                <option value="点検">点検</option>
                <option value="修理">修理</option>
                <option value="巡回">巡回</option>
                <option value="緊急対応">緊急対応</option>
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
              <label>案件名</label>
              <select className="input-field-sm" value={filters.department}
                onChange={e => handleFilterChange('department', e.target.value)}>
                <option value="">すべて</option>
                {departmentList.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
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
              setFilters({ location: '', genre: '', submitter: '', department: '',
                           hasIssue: '', hasDelay: '', hasPhoto: '' });
              setActiveFilter(null);
              setSelectedDate(new Date());
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

          {/* ── 期間 & 表示形式コントロール ── */}
          <div className="view-controls">
            {/* 左：期間選択 */}
            <div className="view-period-tabs">
              {[
                { key: 'daily',   label: '日ごと' },
                { key: 'weekly',  label: '週ごと' },
                { key: 'monthly', label: '月ごと' },
              ].map(t => (
                <button
                  key={t.key}
                  className={`view-period-tab${viewTab === t.key ? ' active' : ''}`}
                  onClick={() => setViewTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* 右：ソート + 表示形式トグル */}
            <div className="view-controls-right">
              <button
                className="sort-order-btn"
                onClick={toggleSort}
                title={sortOrder === 'desc' ? '新しい順で表示中' : '古い順で表示中'}
              >
                <ArrowUpDown size={13} />
                {sortOrder === 'desc' ? '新しい順' : '古い順'}
              </button>
              <div className="view-mode-toggle">
                <button
                  className={`view-mode-btn${viewMode === 'table' ? ' active' : ''}`}
                  onClick={() => setViewMode('table')}
                  title="テーブル表示"
                >
                  <Table2 size={13} /> テーブル
                </button>
                <button
                  className={`view-mode-btn${viewMode === 'card' ? ' active' : ''}`}
                  onClick={() => setViewMode('card')}
                  title="カード表示"
                >
                  <LayoutGrid size={13} /> カード
                </button>
              </div>
            </div>
          </div>

          {/* ── ローディング / エラー ── */}
          {reportsLoading ? (
            <p className="no-data">読み込み中...</p>
          ) : reportsError ? (
            <p className="no-data" style={{ color: 'var(--danger)' }}>
              取得エラー: {reportsError}
              <button className="btn-text-refresh" onClick={fetchReports}>
                <RefreshCw size={14} /> 再試行
              </button>
            </p>
          ) : viewMode === 'table' ? (
            /* ── テーブル形式 ── */
            <div className="daily-table-wrap">
              {dailyRows.length === 0 ? (
                <p className="no-data">該当するデータはありません。</p>
              ) : (
                <table className="daily-table">
                  <thead>
                    <tr>
                      <th>日付</th>
                      <th>時間</th>
                      <th>現場</th>
                      <th>案件名</th>
                      <th>担当者</th>
                      <th>ジャンル</th>
                      {activeCustomKeys.map(k => (
                        <th key={k}>{CUSTOM_DATA_LABELS[k] ?? k}</th>
                      ))}
                      <th>遅延</th>
                      <th>報告内容</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyRows.map((row, i) => (
                      <tr
                        key={`${row._rpt.id}-${row.id ?? i}`}
                        className={
                          row._rpt.hasIssue === 'yes' && row._rpt.hasDelay === 'yes' ? 'tr-issue-delay' :
                          row._rpt.hasIssue === 'yes' ? 'tr-issue' :
                          row._rpt.hasDelay === 'yes' ? 'tr-delay' : ''
                        }
                      >
                        <td>{row._rpt.date}</td>
                        <td className="td-nowrap">
                          {row._rpt.startTime}～{row._rpt.endTime}
                        </td>
                        <td>{row._rpt.locationName}</td>
                        <td>{row._rpt.department}</td>
                        <td>{row._rpt.submitter}</td>
                        <td>
                          <span className={`genre-pill genre-pill-${row.genre}`}>
                            {GENRE_LABELS[row.genre] ?? row.genre}
                          </span>
                        </td>
                        {activeCustomKeys.map(k => (
                          <td key={k}>{getCustomValue(row, k)}</td>
                        ))}
                        <td>
                          <span className={`exp-badge ${row._rpt.hasDelay === 'yes' ? 'badge-alert' : 'badge-ok'}`}>
                            {row._rpt.hasDelay === 'yes' ? 'あり' : 'なし'}
                          </span>
                        </td>
                        <td className="td-findings">{row.findings ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            /* ── カード形式 ── */
            <div className="report-items">
              {sortedReports.length === 0 ? (
                <p className="no-data">該当する報告書はありません。</p>
              ) : (
              sortedReports.map(rpt => (
                <div
                  key={rpt.id}
                  className={`report-card${
                    rpt.hasIssue === 'yes' && rpt.hasDelay === 'yes' ? ' card-issue-delay' :
                    rpt.hasIssue === 'yes' ? ' card-issue' :
                    rpt.hasDelay === 'yes' ? ' card-delay' : ''
                  }${expandedReport === rpt.id ? ' expanded' : ''}`}
                >
                  {/* カードヘッダー（クリックで開閉）*/}
                  <div
                    className="card-top"
                    onClick={() => setExpandedReport(expandedReport === rpt.id ? null : rpt.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="rpt-date">{rpt.date}</span>
                    {(rpt.startTime || rpt.endTime) && (
                      <span className="rpt-time">
                        <Clock size={12} style={{ verticalAlign: 'middle' }} />
                        {rpt.startTime}～{rpt.endTime}
                      </span>
                    )}
                    <span className="rpt-dept">{rpt.department}</span>
                    <div className="card-badges">
                        {rpt.hasDelay === 'yes' && <span className="badge warning">遅延</span>}
                      {rpt.hasPhoto          && <span className="badge info">写真有</span>}
                      <span className="badge neutral">{rpt.taskCount}件</span>
                    </div>
                    <span className="card-chevron">
                      {expandedReport === rpt.id
                        ? <ChevronUp size={16} />
                        : <ChevronDown size={16} />}
                    </span>
                  </div>

                  {/* カードサマリー（常に表示）*/}
                  <div className="card-middle">
                    {rpt.hasIssue === 'yes' && <AlertTriangle size={15} className="card-icon-issue" />}
                    {rpt.hasDelay === 'yes' && <Clock size={15} className="card-icon-delay" />}
                    <strong>{rpt.submitter || rpt.department}</strong>
                    {rpt.locationName && (
                      <span className="rpt-location">{rpt.locationName}</span>
                    )}
                    <span className="rpt-genre-pills">
                      {[...new Set(rpt.tasks.map(t => t.genre))].map(g => (
                        <span key={g} className={`genre-pill genre-pill-${g}`}>
                          {GENRE_LABELS[g] ?? g}
                        </span>
                      ))}
                    </span>
                  </div>

                  {/* 展開時：詳細表示 */}
                  {expandedReport === rpt.id && (
                    <div className="card-expanded-body">

                      {/* 共通情報 */}
                      <div className="expanded-common-info">
                        <p className="exp-section-title">■ 共通情報</p>
                        <div className="exp-row">
                          <span className="exp-label">担当者</span>
                          <span className="exp-value">{rpt.submitter || '（未設定）'}</span>
                        </div>
                        {rpt.locationName && (
                          <div className="exp-row">
                            <span className="exp-label">現場</span>
                            <span className="exp-value">{rpt.locationName}</span>
                          </div>
                        )}
                        <div className="exp-row">
                          <span className="exp-label">対応時間</span>
                          <span className="exp-value">
                            {rpt.startTime || '未設定'} ～ {rpt.endTime || '未設定'}
                          </span>
                        </div>
                        <div className="exp-row">
                          <span className="exp-label">全体進捗</span>
                          <span className={`exp-value exp-badge ${rpt.isOnSchedule ? 'badge-ok' : 'badge-alert'}`}>
                            {rpt.isOnSchedule ? '予定通り' : '遅延あり'}
                          </span>
                        </div>
                        {!rpt.isOnSchedule && rpt.delayReason && (
                          <div className="exp-row">
                            <span className="exp-label">遅延理由</span>
                            <span className="exp-value">{rpt.delayReason}</span>
                          </div>
                        )}
                        {rpt.coWorkers?.length > 0 && (
                          <div className="exp-row">
                            <span className="exp-label">同行者</span>
                            <span className="exp-value">{rpt.coWorkers.join('、')}</span>
                          </div>
                        )}
                      </div>

                      {/* 作業タスク一覧 */}
                      {rpt.tasks.map((task, tIdx) => (
                        <div key={task.id ?? tIdx} className={`exp-task-card exp-task-${task.genre}`}>
                          <div className={`exp-task-header exp-task-header-${task.genre}`}>
                            <span className="exp-task-num">作業 {tIdx + 1}</span>
                            <span className="exp-task-genre">{GENRE_LABELS[task.genre] ?? task.genre}</span>
                          </div>
                          <div className="exp-task-body">
                            {task.target_place && (
                              <div className="exp-row">
                                <span className="exp-label">担当場所</span>
                                <span className="exp-value">{task.target_place}</span>
                              </div>
                            )}
                            {task.task_detail && (
                              <div className="exp-row">
                                <span className="exp-label">作業内容</span>
                                <span className="exp-value">{task.task_detail}</span>
                              </div>
                            )}
                            {task.symptom && (
                              <div className="exp-row">
                                <span className="exp-label">症状</span>
                                <span className="exp-value">{task.symptom}</span>
                              </div>
                            )}
                            {task.action_taken && (
                              <div className="exp-row">
                                <span className="exp-label">対応内容</span>
                                <span className="exp-value">{task.action_taken}</span>
                              </div>
                            )}
                            {task.genre !== 'emergency' && (
                              <div className="exp-row">
                                <span className="exp-label">
                                  {['inspection', 'patrol'].includes(task.genre) ? '異常の有無' : '問題の有無'}
                                </span>
                                <span className={`exp-value exp-badge ${task.has_problem ? 'badge-alert' : 'badge-ok'}`}>
                                  {task.has_problem
                                    ? (['inspection', 'patrol'].includes(task.genre) ? '異常あり' : '問題あり')
                                    : (['inspection', 'patrol'].includes(task.genre) ? '異常無し' : '問題無し')}
                                </span>
                              </div>
                            )}
                            {task.findings && (
                              <div className="exp-content-block">
                                <p className="exp-content-title">報告内容</p>
                                <pre className="exp-content-text">{task.findings}</pre>
                              </div>
                            )}
                            {/* 添付写真 */}
                            {task.photos?.length > 0 && (
                              <div className="exp-photos">
                                <p className="exp-photos-title">
                                  <Camera size={13} /> 添付写真（{task.photos.length}枚）
                                </p>
                                <div className="exp-photos-grid">
                                  {task.photos.map((p, pIdx) => (
                                    <img
                                      key={pIdx}
                                      src={p.photo_url}
                                      alt={`写真${pIdx + 1}`}
                                      className="exp-photo-img"
                                    />
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* アクションボタン群 */}
                  <div className="card-actions" onClick={e => e.stopPropagation()}>
                    <SingleReportA4Btn rpt={rpt} />
                    <button
                      className="btn-contact"
                      onClick={() => {
                        if (window.confirm(`${rpt.department}（${rpt.submitter}）に電話を発信しますか？`)) {
                          window.location.href = 'tel:';
                        }
                      }}
                    >
                      <Phone size={13} /> 電話
                    </button>
                    <button
                      className="btn-contact btn-contact-line"
                      onClick={() => {
                        const text =
                          `【報告書】\n担当者：${rpt.submitter}\n案件名：${rpt.department}\n${rpt.date}\n\n${rpt.content}`;
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
                        const subject = encodeURIComponent(`【報告書】${rpt.department} ${rpt.date}`);
                        const body    = encodeURIComponent(
                          `担当者：${rpt.submitter}\n案件名：${rpt.department}\n${rpt.date}\n\n${rpt.content}`,
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
          )}
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
