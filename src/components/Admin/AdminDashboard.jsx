import React, { useState } from 'react';
import { useAuth } from '../../AuthContext';
import { LogOut, Filter, Bot, FileText, Phone, Mail, MessageCircle, AlertTriangle, Clock } from 'lucide-react';
import ExcelExportBtn from './ExcelExportBtn';
import './AdminDashboard.css';

// モックデータ
const MOCK_REPORTS = [
  { id: '1', date: '2026-03-21', genre: '点検', submitter: '山田太郎', department: '設備管理部', hasIssue: 'yes', hasDelay: 'no',  hasPhoto: true,  content: '第1ポンプ室のバルブから微量の水漏れあり。パッキン交換が必要。' },
  { id: '2', date: '2026-03-21', genre: '清掃', submitter: '佐藤花子', department: '清掃部',     hasIssue: 'no',  hasDelay: 'no',  hasPhoto: false, content: 'エントランスホール、通常清掃完了。異常なし。' },
  { id: '3', date: '2026-03-20', genre: '修理', submitter: '鈴木一郎', department: '設備管理部', hasIssue: 'no',  hasDelay: 'yes', hasPhoto: true,  content: '空調機Aフィルター交換。部品到着遅れにより作業が1時間遅延。' },
  { id: '4', date: '2026-03-20', genre: '点検', submitter: '高橋健太', department: '警備部',     hasIssue: 'yes', hasDelay: 'yes', hasPhoto: true,  content: '西側フェンスの一部破損を確認。侵入の痕跡はなし。至急補修を手配。' },
  { id: '5', date: '2026-03-19', genre: '清掃', submitter: '伊藤美咲', department: '清掃部',     hasIssue: 'no',  hasDelay: 'no',  hasPhoto: false, content: '3階フロア全域のワックス掛け完了。' },
];

// ── サマリーブロックの定義 ──────────────────────────
const SUMMARY_BLOCKS = [
  {
    key:        'no_issue',
    label:      '異常なし',
    colorClass: 'no-issue',
    count: (reports) => reports.filter(r => r.hasIssue === 'no').length,
  },
  {
    key:        'has_issue',
    label:      '要確認（問題あり）',
    colorClass: 'has-issue',
    count: (reports) => reports.filter(r => r.hasIssue === 'yes').length,
  },
  {
    key:        'delayed',
    label:      '進捗遅延',
    colorClass: 'delayed',
    count: (reports) => reports.filter(r => r.hasDelay === 'yes').length,
  },
];

const AdminDashboard = () => {
  const { logout, user } = useAuth();

  // サマリーブロックのアクティブフィルター（null = すべて表示）
  const [activeFilter, setActiveFilter] = useState(null);

  // 詳細フィルター
  const [filters, setFilters] = useState({
    date: '', genre: '', submitter: '', department: '',
    hasIssue: '', hasDelay: '', hasPhoto: '',
  });

  const [expandedReport, setExpandedReport] = useState(null);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  // サマリーブロッククリック：再クリックで解除
  const handleSummaryClick = (key) => {
    setActiveFilter(prev => prev === key ? null : key);
  };

  // 全件に対するサマリー件数（フィルター前）
  const summaryTotal = MOCK_REPORTS;

  // フィルター適用後の一覧
  const filteredReports = MOCK_REPORTS.filter(rpt => {
    if (filters.date       && rpt.date !== filters.date) return false;
    if (filters.genre      && rpt.genre !== filters.genre) return false;
    if (filters.submitter  && !rpt.submitter.includes(filters.submitter)) return false;
    if (filters.department && rpt.department !== filters.department) return false;
    if (filters.hasIssue   && rpt.hasIssue !== filters.hasIssue) return false;
    if (filters.hasDelay   && rpt.hasDelay !== filters.hasDelay) return false;
    if (filters.hasPhoto === 'yes' && !rpt.hasPhoto) return false;
    if (filters.hasPhoto === 'no'  &&  rpt.hasPhoto) return false;
    // サマリーブロックによる絞り込み
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

      {/* ── サマリーブロック（ドリルダウン用） ── */}
      <div className="summary-blocks">
        {SUMMARY_BLOCKS.map(block => (
          <button
            key={block.key}
            type="button"
            className={`summary-block ${block.colorClass}${activeFilter === block.key ? ' active' : ''}`}
            onClick={() => handleSummaryClick(block.key)}
            title={activeFilter === block.key ? 'クリックで絞り込みを解除' : 'クリックで絞り込む'}
          >
            <span className="summary-count">{block.count(summaryTotal)}</span>
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
                {activeFilter && (
                  <span className="filter-active-note">
                    ― {SUMMARY_BLOCKS.find(b => b.key === activeFilter)?.label} で絞込中
                  </span>
                )}
              </h3>
              <ExcelExportBtn reports={filteredReports} />
            </div>

            <div className="report-items">
              {filteredReports.length === 0 ? (
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
                      <span className="rpt-submitter">{rpt.submitter}</span>
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
                      <a className="btn-contact" href="tel:">
                        <Phone size={13} /> 電話
                      </a>
                      <a className="btn-contact btn-contact-line" href="https://line.me/R/" target="_blank" rel="noreferrer">
                        <MessageCircle size={13} /> LINE
                      </a>
                      <a className="btn-contact" href="mailto:">
                        <Mail size={13} /> メール
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
        </div>

        {/* ③ AIインサイト */}
        <div className="ai-summary glass-panel panel-ai">
          <h3 className="section-title text-primary"><Bot size={18} /> AI グローバル要約</h3>
          <p className="ai-insight">
            🤖 【インサイト】設備管理部の「点検」報告において、西側フェンスに関連する「問題あり」のケースが過去1週間で集中しています。早急な現地確認と補修手配を推奨します。
          </p>
        </div>

      </div>
    </div>
  );
};

export default AdminDashboard;
