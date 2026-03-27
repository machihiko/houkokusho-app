import { useState } from 'react';
import { ArrowLeft, Send, FileSpreadsheet, Loader } from 'lucide-react';
import { exportToExcel } from '../../utils/exportToExcel';
import './PreviewScreen.css';

const DEPARTMENT_LABELS = {
  cleaning_dept: '清掃部',
  maintenance_dept: '設備管理部',
  security_dept: '警備部',
};

const GENRE_LABELS = {
  cleaning: '清掃',
  inspection: '点検',
  repair: '修理',
};

const PreviewScreen = ({ data, onBack, onConfirm }) => {
  const [exporting, setExporting] = useState(false);

  const handleExport = () => {
    setExporting(true);
    exportToExcel(data)
      .catch(e => {
        alert('Excel出力に失敗しました。\n' + e.message);
        console.error(e);
      })
      .finally(() => setExporting(false));
  };

  const rows = [
    { label: 'ジャンル', value: GENRE_LABELS[data.genre] || data.genre },
    { label: '部署', value: DEPARTMENT_LABELS[data.department] || data.department || '未選択' },
    { label: '作業日', value: data.date },
    { label: '問題の有無', value: data.hasIssue === 'yes' ? '有り' : '無し', highlight: data.hasIssue === 'yes' },
    ...(data.hasIssue === 'yes' && data.issueDetail
      ? [{ label: '問題の詳細', value: data.issueDetail, multiline: true }]
      : []),
    ...(data.genre !== 'cleaning'
      ? [{ label: '進捗の遅れ', value: data.hasDelay === 'yes' ? '有り' : '無し', highlight: data.hasDelay === 'yes' }]
      : []),
  ];

  return (
    <div className="preview-container">
      <div className="preview-header glass-panel">
        <button className="btn btn-outline" onClick={onBack}>
          <ArrowLeft size={18} /> 修正する
        </button>
        <h2>最終確認</h2>
      </div>

      {/* Excel風テンプレート */}
      <div className="excel-sheet glass-panel">

        {/* シートタイトル */}
        <div className="excel-title-bar">
          <FileSpreadsheet size={20} />
          <span>現場報告書</span>
        </div>

        {/* 基本情報テーブル */}
        <div className="excel-section-header">■ 基本情報</div>
        <table className="excel-table">
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.label} className={i % 2 === 0 ? 'excel-row-even' : 'excel-row-odd'}>
                <td className="excel-label">{row.label}</td>
                <td className={`excel-value${row.highlight ? ' excel-value-alert' : ''}${row.multiline ? ' excel-value-multi' : ''}`}>
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 報告内容 */}
        <div className="excel-section-header">■ 報告内容</div>
        <div className="excel-content-cell">
          <pre className="excel-content-text">{data.content}</pre>
        </div>

        {/* 写真 */}
        {data.photos && data.photos.length > 0 && (
          <>
            <div className="excel-section-header">■ 添付写真（{data.photos.length}枚）</div>
            <div className="excel-photos">
              {data.photos.map((p, i) => (
                <div key={i} className="excel-photo-item">
                  <div className="excel-photo-label">写真 {i + 1}</div>
                  <img src={p.url} alt={`写真${i + 1}`} className="excel-photo-img" />
                </div>
              ))}
            </div>
          </>
        )}

        {/* フッター */}
        <div className="excel-footer">
          ※ このファイルは Re-Report により自動生成されました
        </div>
      </div>

      {/* アクションボタン */}
      <div className="preview-actions-row">
        <button
          className="btn btn-excel"
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting
            ? <><Loader size={18} className="spin" /> 出力中...</>
            : <><FileSpreadsheet size={18} /> Excelで保存</>
          }
        </button>
        <button className="btn btn-primary submit-btn" onClick={onConfirm}>
          <Send size={18} /> この内容で報告を送信
        </button>
      </div>
    </div>
  );
};

export default PreviewScreen;
