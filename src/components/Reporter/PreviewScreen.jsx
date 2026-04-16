import { ArrowLeft, Send, FileSpreadsheet, Camera } from 'lucide-react';
import './PreviewScreen.css';

const GENRE_LABELS = {
  cleaning:   '清掃',
  inspection: '点検',
  repair:     '修理',
  patrol:     '巡回',
  emergency:  '緊急対応',
};

// ── コンポーネント ──────────────────────────────────
const PreviewScreen = ({ tasks, commonData, profiles, onBack, onConfirm }) => {
  // 同行者の表示名を ID から解決する
  const coWorkerNames = (commonData.coWorkers ?? [])
    .map(id => profiles.find(p => p.id === id)?.display_name ?? id)
    .join('、');

  // 共通情報の行データ
  const commonRows = [
    { label: '作業日',    value: commonData.date || '未設定' },
    { label: '対応時間',
      value: `${commonData.startTime || '未設定'} ～ ${commonData.endTime || '未設定'}` },
    ...(commonData.locationName
      ? [{ label: '現場',   value: commonData.locationName   }] : []),
    ...(commonData.departmentName
      ? [{ label: '案件名', value: commonData.departmentName }] : []),
    { label: '全体の進捗',
      value: commonData.isOnSchedule ? '予定通り' : '遅延あり',
      alert: !commonData.isOnSchedule },
    ...(!commonData.isOnSchedule && commonData.delayReason
      ? [{ label: '遅延の理由', value: commonData.delayReason }] : []),
    { label: '同行者',    value: coWorkerNames || 'なし（1人作業）' },
    { label: '作業件数',  value: `${tasks.length} 件` },
  ];

  return (
    <div className="preview-container">

      {/* ── ヘッダー ── */}
      <div className="preview-header glass-panel">
        <button className="btn btn-outline" onClick={onBack}>
          <ArrowLeft size={18} /> 修正する
        </button>
        <h2>最終確認</h2>
      </div>

      {/* ── Excel 風プレビューシート ── */}
      <div className="excel-sheet">

        {/* タイトルバー */}
        <div className="excel-title-bar">
          <FileSpreadsheet size={20} />
          <span>現場報告書</span>
        </div>

        {/* 共通情報 */}
        <div className="excel-section-header">■ 共通情報</div>
        <table className="excel-table">
          <tbody>
            {commonRows.map((row, i) => (
              <tr key={row.label} className={i % 2 === 0 ? 'excel-row-even' : 'excel-row-odd'}>
                <td className="excel-label">{row.label}</td>
                <td className={`excel-value${row.alert ? ' excel-value-alert' : ''}`}>
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 各タスク */}
        {tasks.map((task, idx) => {
          const genreLabel = GENRE_LABELS[task.genre] ?? task.genre;

          // タスク詳細の行データ
          const taskRows = [
            ...(task.targetPlace ? [{ label: '担当場所', value: task.targetPlace }] : []),
            ...(task.taskDetail   ? [{ label: '作業内容', value: task.taskDetail   }] : []),
            ...(task.symptom      ? [{ label: '症状',     value: task.symptom      }] : []),
            ...(task.actionTaken  ? [{ label: '対応内容', value: task.actionTaken  }] : []),
            ...(task.genre !== 'emergency'
              ? [{
                  label: ['inspection', 'patrol'].includes(task.genre) ? '異常の有無' : '問題の有無',
                  value: task.hasProblem
                    ? (['inspection', 'patrol'].includes(task.genre) ? '異常あり' : '問題あり')
                    : (['inspection', 'patrol'].includes(task.genre) ? '異常無し' : '問題無し'),
                  alert: task.hasProblem,
                }]
              : []),
            ...(task.memo ? [{ label: '備考', value: task.memo }] : []),
          ];

          return (
            <div key={task._id}>

              {/* タスクセクションヘッダー（ジャンルで色分け） */}
              <div className={`excel-section-header excel-task-header-${task.genre}`}>
                ■ 作業 {idx + 1}（{genreLabel}）
              </div>

              {/* タスク詳細テーブル */}
              {taskRows.length > 0 && (
                <table className="excel-table">
                  <tbody>
                    {taskRows.map((row, i) => (
                      <tr key={row.label} className={i % 2 === 0 ? 'excel-row-even' : 'excel-row-odd'}>
                        <td className="excel-label">{row.label}</td>
                        <td className={`excel-value${row.alert ? ' excel-value-alert' : ''}`}>
                          {row.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* 報告内容 */}
              {task.findings && (
                <>
                  <div className="excel-subsection-label">報告内容</div>
                  <div className="excel-content-cell">
                    <pre className="excel-content-text">{task.findings}</pre>
                  </div>
                </>
              )}

              {/* 添付写真 */}
              {task.photos?.length > 0 && (
                <>
                  <div className="excel-subsection-label">
                    <Camera size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                    添付写真（{task.photos.length}枚）
                  </div>
                  <div className="excel-photos">
                    {task.photos.map((p, pIdx) => (
                      <div key={pIdx} className="excel-photo-item">
                        <div className="excel-photo-label">写真 {pIdx + 1}</div>
                        <img src={p.url} alt={`写真${pIdx + 1}`} className="excel-photo-img" />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}

        {/* フッター */}
        <div className="excel-footer">
          ※ このファイルは Re-Report により自動生成されました
        </div>
      </div>

      {/* ── 送信ボタン ── */}
      <div className="preview-actions-row">
        <button className="btn btn-primary preview-submit-btn" onClick={onConfirm}>
          <Send size={18} /> この内容で報告を送信
        </button>
      </div>
    </div>
  );
};

export default PreviewScreen;
