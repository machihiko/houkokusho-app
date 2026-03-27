import React, { useState } from 'react';
import { useAuth } from '../../AuthContext';
import { LogOut, Filter, Download, Map as MapIcon, Bot, FileText, Search } from 'lucide-react';
import ExcelExportBtn from './ExcelExportBtn';
import './AdminDashboard.css';

// Mock Data
const MOCK_REPORTS = [
  { id: '1', date: '2026-03-21', genre: '点検', submitter: '山田太郎', department: '設備管理部', hasIssue: 'yes', hasDelay: 'no', hasPhoto: true, content: '第1ポンプ室のバルブから微量の水漏れあり。パッキン交換が必要。' },
  { id: '2', date: '2026-03-21', genre: '清掃', submitter: '佐藤花子', department: '清掃部', hasIssue: 'no', hasDelay: 'no', hasPhoto: false, content: 'エントランスホール、通常清掃完了。異常なし。' },
  { id: '3', date: '2026-03-20', genre: '修理', submitter: '鈴木一郎', department: '設備管理部', hasIssue: 'no', hasDelay: 'yes', hasPhoto: true, content: '空調機Aフィルター交換。部品到着遅れにより作業が1時間遅延。' },
  { id: '4', date: '2026-03-20', genre: '点検', submitter: '高橋健太', department: '警備部', hasIssue: 'yes', hasDelay: 'yes', hasPhoto: true, content: '西側フェンスの一部破損を確認。侵入の痕跡はなし。至急補修を手配。' },
  { id: '5', date: '2026-03-19', genre: '清掃', submitter: '伊藤美咲', department: '清掃部', hasIssue: 'no', hasDelay: 'no', hasPhoto: false, content: '3階フロア全域のワックス掛け完了。' },
];

const AdminDashboard = () => {
  const { logout, user } = useAuth();
  
  // Filters State
  const [filters, setFilters] = useState({
    date: '',
    genre: '',
    submitter: '',
    department: '',
    hasIssue: '',
    hasDelay: '',
    hasPhoto: ''
  });

  const [expandedReport, setExpandedReport] = useState(null);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const filteredReports = MOCK_REPORTS.filter(rpt => {
    if (filters.date && rpt.date !== filters.date) return false;
    if (filters.genre && rpt.genre !== filters.genre) return false;
    if (filters.submitter && !rpt.submitter.includes(filters.submitter)) return false;
    if (filters.department && rpt.department !== filters.department) return false;
    if (filters.hasIssue && rpt.hasIssue !== filters.hasIssue) return false;
    if (filters.hasDelay && rpt.hasDelay !== filters.hasDelay) return false;
    if (filters.hasPhoto === 'yes' && !rpt.hasPhoto) return false;
    if (filters.hasPhoto === 'no' && rpt.hasPhoto) return false;
    return true;
  });

  const issuesCount = filteredReports.filter(r => r.hasIssue === 'yes').length;
  const delayCount = filteredReports.filter(r => r.hasDelay === 'yes').length;
  const noIssueCount = filteredReports.length - issuesCount;

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

      <div className="admin-grid">
        {/* Left Column (Filters & Summary) */}
        <div className="admin-sidebar split-col">
          
          <div className="filter-panel glass-panel">
            <h3 className="section-title"><Filter size={18} /> 検索・フィルター</h3>
            <div className="filter-grid">
              <div className="filter-item">
                <label>日付</label>
                <input type="date" className="input-field-sm" value={filters.date} onChange={e => handleFilterChange('date', e.target.value)} data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" autoComplete="off" data-1p-ignore="true" />
              </div>
              <div className="filter-item">
                <label>ジャンル</label>
                <select className="input-field-sm" value={filters.genre} onChange={e => handleFilterChange('genre', e.target.value)}>
                  <option value="">すべて</option>
                  <option value="清掃">清掃</option>
                  <option value="点検">点検</option>
                  <option value="修理">修理</option>
                </select>
              </div>
              <div className="filter-item">
                <label>提出者名</label>
                <input type="text" className="input-field-sm" placeholder="検索..." value={filters.submitter} onChange={e => handleFilterChange('submitter', e.target.value)} data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" autoComplete="off" data-1p-ignore="true" />
              </div>
              <div className="filter-item">
                <label>部署</label>
                <select className="input-field-sm" value={filters.department} onChange={e => handleFilterChange('department', e.target.value)}>
                  <option value="">すべて</option>
                  <option value="清掃部">清掃部</option>
                  <option value="設備管理部">設備管理部</option>
                  <option value="警備部">警備部</option>
                </select>
              </div>
            </div>
            <div className="filter-item-row toggle-group-sm mt-3">
              <label>問題の有無:</label>
              <select className="input-field-sm" value={filters.hasIssue} onChange={e => handleFilterChange('hasIssue', e.target.value)}>
                <option value="">すべて</option>
                <option value="yes">あり</option>
                <option value="no">なし</option>
              </select>
            </div>
            <div className="filter-item-row toggle-group-sm">
              <label>進捗の遅れ:</label>
              <select className="input-field-sm" value={filters.hasDelay} onChange={e => handleFilterChange('hasDelay', e.target.value)}>
                <option value="">すべて</option>
                <option value="yes">あり</option>
                <option value="no">なし</option>
              </select>
            </div>
            <div className="filter-item-row toggle-group-sm">
              <label>写真の有無:</label>
              <select className="input-field-sm" value={filters.hasPhoto} onChange={e => handleFilterChange('hasPhoto', e.target.value)}>
                <option value="">すべて</option>
                <option value="yes">あり</option>
                <option value="no">なし</option>
              </select>
            </div>
            <button className="btn btn-outline full-width mt-3" onClick={() => setFilters({date:'', genre:'', submitter:'', department:'', hasIssue:'', hasDelay:'', hasPhoto:''})}>
              条件クリア
            </button>
          </div>

          {/* AI Summary Widget */}
          <div className="ai-summary glass-panel">
            <h3 className="section-title text-primary"><Bot size={18} /> AI グローバル要約</h3>
            <div className="ai-stats">
               <div className="stat-box">
                 <span className="stat-val">{noIssueCount}</span>
                 <span className="stat-label">異常なし</span>
               </div>
               <div className="stat-box alert-box">
                 <span className="stat-val">{issuesCount}</span>
                 <span className="stat-label">要確認(問題有)</span>
               </div>
               <div className="stat-box warn-box">
                 <span className="stat-val">{delayCount}</span>
                 <span className="stat-label">進捗遅延</span>
               </div>
            </div>
            <p className="ai-insight">
              【インサイト】設備管理部の「点検」において問題発生が集中しています。西側エリアに特に関連している可能性が高いです。
            </p>
          </div>

          {/* Map Integration Mock */}
          <div className="map-widget glass-panel">
            <h3 className="section-title"><MapIcon size={18} /> 現場マップ</h3>
            <div className="map-container">
               {/* Mocking a map with an iframe (e.g. OpenStreetMap or Google Maps embed mockup) */}
               <iframe 
                title="Mock Map"
                width="100%" 
                height="100%" 
                frameBorder="0" 
                scrolling="no" 
                marginHeight="0" 
                marginWidth="0" 
                src="https://www.openstreetmap.org/export/embed.html?bbox=139.6917%2C35.6895%2C139.6917%2C35.6895&amp;layer=mapnik" 
                style={{ border: 0, borderRadius: '8px' }}>
              </iframe>
              <div className="map-overlay">モックアップ表示</div>
            </div>
          </div>

        </div>

        {/* Right Column (List) */}
        <div className="admin-main split-col">
          <div className="report-list-container glass-panel">
            <div className="list-header">
              <h3 className="section-title"><FileText size={18} /> 届いた報告書 ({filteredReports.length}件)</h3>
              <ExcelExportBtn reports={filteredReports} />
            </div>

            <div className="report-items">
              {filteredReports.length === 0 ? (
                <p className="no-data">該当する報告書はありません。</p>
              ) : (
                filteredReports.map(rpt => (
                  <div key={rpt.id} className={`report-card ${rpt.hasIssue === 'yes' ? 'border-danger' : ''} ${expandedReport === rpt.id ? 'expanded' : ''}`} onClick={() => setExpandedReport(expandedReport === rpt.id ? null : rpt.id)}>
                    <div className="card-top">
                      <span className="rpt-date">{rpt.date}</span>
                      <span className="rpt-dept">{rpt.department}</span>
                      <span className="rpt-submitter">{rpt.submitter}</span>
                      {rpt.hasIssue === 'yes' && <span className="badge danger">問題あり</span>}
                      {rpt.hasDelay === 'yes' && <span className="badge warning">遅延</span>}
                      {rpt.hasPhoto && <span className="badge info">写真有</span>}
                    </div>
                    <div className="card-middle">
                      <strong>【{rpt.genre}】</strong> {expandedReport === rpt.id ? rpt.content : (rpt.content.length > 30 ? rpt.content.substring(0, 30) + '...' : rpt.content)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AdminDashboard;
