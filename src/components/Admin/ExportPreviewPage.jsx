import { useState, useMemo } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { ArrowLeft, Download, FileSpreadsheet, Camera } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import './ExportPreviewPage.css';

// ── ジャンル表示名 ─────────────────────────────────────────
const GENRE_LABELS = {
  cleaning: '清掃', inspection: '点検', repair: '修理',
  patrol: '巡回', emergency: '緊急対応',
};

// ── ExcelJS スタイル定数 ──────────────────────────────────
const NAVY  = 'FF1E3A5F';
const WHITE = 'FFFFFFFF';

// ── 出力列定義 ────────────────────────────────────────────
export const EXPORT_COLUMNS = [
  { key: 'date',         label: '日付',     category: '基本情報', defaultOn: true,  width: 14 },
  { key: 'startTime',    label: '開始時間', category: '基本情報', defaultOn: true,  width: 10 },
  { key: 'endTime',      label: '終了時間', category: '基本情報', defaultOn: true,  width: 10 },
  { key: 'locationName', label: '現場',     category: '基本情報', defaultOn: true,  width: 22 },
  { key: 'department',   label: '案件名',   category: '基本情報', defaultOn: true,  width: 18 },
  { key: 'submitter',    label: '提出者名', category: '基本情報', defaultOn: true,  width: 18 },
  { key: 'genre',        label: 'ジャンル', category: '作業詳細', defaultOn: true,  width: 12 },
  { key: 'target_place', label: '担当場所', category: '作業詳細', defaultOn: true,  width: 16 },
  { key: 'task_detail',  label: '作業内容', category: '作業詳細', defaultOn: true,  width: 22 },
  { key: 'symptom',      label: '症状',     category: '作業詳細', defaultOn: false, width: 16 },
  { key: 'action_taken', label: '対応内容', category: '作業詳細', defaultOn: false, width: 22 },
  { key: 'findings',     label: '報告内容', category: '作業詳細', defaultOn: true,  width: 50 },
  { key: 'hasIssue',     label: '問題の有無', category: '状態',   defaultOn: true,  width: 14 },
  { key: 'hasDelay',     label: '進捗状況',   category: '状態',   defaultOn: true,  width: 12 },
  { key: 'photos',       label: '写真',       category: 'メディア', defaultOn: false, width: 28 },
];
const CATEGORIES = ['基本情報', '作業詳細', '状態', 'メディア'];
const RPT_KEYS   = new Set(['date','startTime','endTime','locationName','department','submitter','hasDelay']);

// ── 画像ユーティリティ（SingleReportA4Btn と共通ロジック）──
const fetchImageBuffer = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`画像取得失敗 (${res.status}): ${url}`);
  return res.arrayBuffer();
};

const getImageSize = (buffer) => new Promise((resolve) => {
  const blob = new Blob([buffer]);
  const url  = URL.createObjectURL(blob);
  const img  = new Image();
  img.onload  = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
  img.onerror = () => { resolve({ w: 4, h: 3 }); URL.revokeObjectURL(url); };
  img.src = url;
});

const guessExtension = (url) => {
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.png')) return 'png';
  if (lower.endsWith('.gif')) return 'gif';
  return 'jpeg';
};

// ── ExcelJS セルユーティリティ ─────────────────────────────
const fillMerged = (ws, addr, value, {
  size = 10, bold = false, fgColor, color = NAVY, halign = 'left',
} = {}) => {
  const cell = ws.getCell(addr);
  cell.value     = value;
  cell.font      = { name: 'メイリオ', size, bold, color: { argb: color } };
  cell.alignment = { horizontal: halign, vertical: 'middle', indent: halign === 'left' ? 1 : 0 };
  if (fgColor) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fgColor } };
};

// ── 値取得ヘルパー ────────────────────────────────────────
const getTaskVal = (task, key) => {
  let cd = task.custom_data;
  if (typeof cd === 'string') {
    try { cd = JSON.parse(cd); } catch { cd = null; }
  }
  switch (key) {
    case 'genre':        return GENRE_LABELS[task.genre] ?? task.genre ?? '';
    case 'target_place': return cd?.target_place ?? task.target_place ?? '';
    case 'task_detail':  return cd?.task_detail  ?? task.task_detail  ?? '';
    case 'symptom':      return cd?.symptom       ?? task.symptom      ?? '';
    case 'action_taken': return cd?.action_taken  ?? task.action_taken ?? '';
    case 'findings':     return task.findings ?? '';
    case 'hasIssue':     return task.has_problem ? '問題あり' : '異常なし';
    case 'photos':       return (task.photos ?? []).map(p => p.photo_url).filter(Boolean).join('\n');
    default:             return '';
  }
};

const getRptVal = (rpt, key) => {
  switch (key) {
    case 'date':         return rpt.date ?? '';
    case 'startTime':    return rpt.startTime ?? '';
    case 'endTime':      return rpt.endTime ?? '';
    case 'locationName': return rpt.locationName ?? '';
    case 'department':   return rpt.department ?? '';
    case 'submitter':    return rpt.submitter ?? '';
    case 'hasDelay':     return rpt.hasDelay === 'yes' ? '遅延あり' : '正常';
    default:             return '';
  }
};

// ── デフォルトファイル名生成（null 除去済み）─────────────
const buildDefaultFileName = (reports) => {
  const d   = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const locs = [...new Set(reports.map(r => r.locationName).filter(Boolean))]
    .slice(0, 2).join('・') || '全体';
  const genKeys = [...new Set(
    reports.flatMap(r => (r.tasks ?? []).map(t => t.genre).filter(Boolean))
  )];
  const gens = genKeys.map(g => GENRE_LABELS[g] ?? g).slice(0, 2).join('・') || '報告';
  return `${ymd}_${locs}_${gens}_報告書`;
};

// ════════════════════════════════════════════════════════════
//   コンポーネント
// ════════════════════════════════════════════════════════════
const ExportPreviewPage = () => {
  const { user }  = useAuth();
  const { state } = useLocation();
  const navigate  = useNavigate();
  const reports   = state?.targetReports ?? [];

  const [fileName,    setFileName]    = useState(() => buildDefaultFileName(reports));
  const [colChecked,  setColChecked]  = useState(
    () => Object.fromEntries(EXPORT_COLUMNS.map(c => [c.key, c.defaultOn]))
  );
  const [isExporting, setIsExporting] = useState(false);

  // ── アクティブ列（チェック済み）─────────────────────────
  const activeCols = useMemo(
    () => EXPORT_COLUMNS.filter(c => colChecked[c.key]),
    [colChecked],
  );

  // ── プレビュー行（全タスクを展開、列は全列分事前計算）──
  const previewRows = useMemo(() => {
    const rows = [];
    for (const rpt of reports) {
      const tasks = rpt.tasks ?? [];
      const items = tasks.length > 0 ? tasks : [null];
      for (const task of items) {
        rows.push({
          _rpt:  rpt,
          _task: task,
          ...Object.fromEntries(
            EXPORT_COLUMNS.map(col => [
              col.key,
              RPT_KEYS.has(col.key)
                ? getRptVal(rpt, col.key)
                : task ? getTaskVal(task, col.key) : '',
            ])
          ),
        });
      }
    }
    return rows;
  }, [reports]);

  // ── Excelドキュメントプレビュー用メタ情報 ────────────────
  const previewMeta = useMemo(() => {
    const dates   = reports.map(r => r.date).filter(Boolean).sort();
    const oldest  = dates[0] ?? '―';
    const newest  = dates[dates.length - 1] ?? '―';
    const total   = reports.length;
    const noIssue = reports.filter(r => r.hasIssue !== 'yes').length;
    const hasIssueCnt = reports.filter(r => r.hasIssue === 'yes').length;
    const delayed = reports.filter(r => r.hasDelay === 'yes').length;
    const deptMap = reports.reduce((acc, r) => {
      const dept = r.department ?? '不明';
      acc[dept] = (acc[dept] ?? 0) + 1;
      return acc;
    }, {});
    return { oldest, newest, total, noIssue, hasIssueCnt, delayed, deptMap };
  }, [reports]);

  // ── チェックボックス操作 ──────────────────────────────────
  const toggleCol = (key) => setColChecked(prev => ({ ...prev, [key]: !prev[key] }));
  const toggleAll = (cat, on) =>
    setColChecked(prev => {
      const next = { ...prev };
      EXPORT_COLUMNS.filter(c => c.category === cat).forEach(c => { next[c.key] = on; });
      return next;
    });

  // ── 認証ガード（全フック呼び出しの後に配置）────────────
  if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) return <Navigate to="/" replace />;

  // ── Excel 出力（SingleReportA4Btn の写真ロジックを完全保存）──
  const handleExport = async () => {
    if (!activeCols.length) {
      alert('出力する列を1つ以上選択してください。');
      return;
    }
    const COL         = activeCols.length;
    const hasFindings = activeCols.some(c => c.key === 'findings');
    // ★ 写真列がONの場合のみ、アスペクト比維持・高さ制限ロジックを実行
    const hasPhotoCol = activeCols.some(c => c.key === 'photos');
    const photoColIdx = activeCols.findIndex(c => c.key === 'photos'); // 0-based

    setIsExporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Re-Report';
      wb.created = new Date();
      const ws  = wb.addWorksheet('報告書集計一覧');

      ws.columns = activeCols.map(c => ({ key: c.key, width: c.width }));

      // ── 行1: 大タイトル ────────────────────────────────────
      ws.mergeCells(1, 1, 1, COL);
      ws.getRow(1).height = 38;
      fillMerged(ws, 'A1', '報　告　書　集　計　一　覧', {
        size: 18, bold: true, fgColor: NAVY, color: WHITE, halign: 'center',
      });

      // ── 行2: 作成者 / 対象期間 ─────────────────────────────
      const dates  = reports.map(r => r.date).filter(Boolean).sort();
      const oldest = dates[0] ?? '―';
      const newest = dates[dates.length - 1] ?? '―';
      const splitAt = Math.min(3, COL);
      ws.mergeCells(2, 1, 2, splitAt);
      ws.getRow(2).height = 22;
      fillMerged(ws, 'A2', '作成者：管理者', { bold: true, fgColor: 'FFE8F0F8' });
      if (COL > splitAt) {
        ws.mergeCells(2, splitAt + 1, 2, COL);
        fillMerged(ws, ws.getCell(2, splitAt + 1).address,
          `対象期間：${oldest}  〜  ${newest}`,
          { fgColor: 'FFF0F4F8', color: 'FF475569' },
        );
      }

      // ── 行3: スペーサー ────────────────────────────────────
      ws.getRow(3).height = 8;

      // ── 行4: 全体サマリー ──────────────────────────────────
      const total    = reports.length;
      const noIssue  = reports.filter(r => r.hasIssue !== 'yes').length;
      const hasIssue = reports.filter(r => r.hasIssue === 'yes').length;
      const delayed  = reports.filter(r => r.hasDelay === 'yes').length;
      ws.mergeCells(4, 1, 4, COL);
      ws.getRow(4).height = 22;
      fillMerged(ws, 'A4',
        `全体状況: 総件数 ${total}件 / 異常なし ${noIssue}件 / 問題あり ${hasIssue}件 / 進捗遅延 ${delayed}件`,
        { bold: true, size: 11, fgColor: 'FFEEF6FF', color: NAVY },
      );
      ws.getCell('A4').border = {
        top:    { style: 'thin',   color: { argb: 'FF93A8C0' } },
        bottom: { style: 'thin',   color: { argb: 'FF93A8C0' } },
        left:   { style: 'medium', color: { argb: NAVY } },
        right:  { style: 'medium', color: { argb: NAVY } },
      };

      // ── 行5: 部署別件数 ────────────────────────────────────
      const deptMap = reports.reduce((acc, r) => {
        const dept = r.department ?? '不明';
        acc[dept] = (acc[dept] ?? 0) + 1;
        return acc;
      }, {});
      ws.mergeCells(5, 1, 5, COL);
      ws.getRow(5).height = 20;
      fillMerged(ws, 'A5',
        '案件名別件数: ' + Object.entries(deptMap).map(([d, n]) => `${d} ${n}件`).join(' / '),
        { fgColor: 'FFFAFBFC', color: 'FF475569' },
      );
      ws.getCell('A5').border = {
        bottom: { style: 'medium', color: { argb: NAVY } },
        left:   { style: 'medium', color: { argb: NAVY } },
        right:  { style: 'medium', color: { argb: NAVY } },
      };

      // ── 行6: 列ヘッダー ────────────────────────────────────
      ws.getRow(6).height = 22;
      activeCols.forEach((col, i) => {
        const cell = ws.getCell(6, i + 1);
        cell.value     = col.label;
        cell.font      = { name: 'メイリオ', bold: true, size: 10, color: { argb: WHITE } };
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        const S = { style: 'thin', color: { argb: 'FF475569' } };
        cell.border = { top: S, left: S, bottom: S, right: S };
      });

      // ── 行7〜: データ行（1タスク = 1行、for...of で await 対応）──
      const THIN    = { style: 'thin', color: { argb: 'FFCBD5E1' } };
      const CBORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
      let rowIdx = 0;

      for (const rpt of reports) {
        const tasks = rpt.tasks ?? [];
        const items = tasks.length > 0 ? tasks : [null];

        for (const task of items) {
          const rowData = Object.fromEntries(
            activeCols.map(col => {
              // 写真列はアスペクト比維持ロジックで後処理するため空文字をセット
              if (col.key === 'photos') return [col.key, ''];
              return [
                col.key,
                RPT_KEYS.has(col.key)
                  ? getRptVal(rpt, col.key)
                  : task ? getTaskVal(task, col.key) : '',
              ];
            })
          );

          const row    = ws.addRow(rowData);
          const rowNum = row.number; // 1-based

          // ── ★ 写真列チェックON時のみ: アスペクト比維持・2列配置・高さ制限ロジック ──
          // （SingleReportA4Btn.jsx の fetchImageBuffer/getImageSize/guessExtension と同一）
          let photoRowHeight = hasFindings ? 36 : 26;
          if (hasPhotoCol && task?.photos?.length > 0) {
            const photoUrls = task.photos.map(p => p.photo_url).filter(Boolean);
            try {
              const firstUrl = photoUrls[0];
              const buf      = await fetchImageBuffer(firstUrl);
              const size     = await getImageSize(buf);

              // 固定幅200px基準、縦長すぎる場合は300pxでキャップ（高さ制限）
              let outW = 200;
              let outH = outW * (size.h / size.w);
              if (outH > 300) {
                outH = 300;
                outW = outH * (size.w / size.h);
              }

              // px → pt 変換（96dpi基準: 1px = 0.75pt）+ 上下余白
              photoRowHeight = Math.max(photoRowHeight, (outH * 0.75) + 12);

              // 写真を写真列セルに埋め込む（twoCell: セル境界に追従）
              const imgId = wb.addImage({ buffer: buf, extension: guessExtension(firstUrl) });
              ws.addImage(imgId, {
                tl: { col: photoColIdx,     row: rowNum - 1 }, // 0-based
                br: { col: photoColIdx + 1, row: rowNum     }, // 0-based
                editAs: 'twoCell',
              });

              // 複数枚ある場合はセルに枚数をテキスト表示
              if (photoUrls.length > 1) {
                row.getCell(photoColIdx + 1).value = `${photoUrls.length}枚`;
              }
            } catch {
              // 画像取得失敗時は URL テキストにフォールバック
              row.getCell(photoColIdx + 1).value =
                task.photos.map(p => p.photo_url).filter(Boolean).join('\n');
            }
          }
          row.height = photoRowHeight;

          // 行スタイリング
          const bg = rowIdx % 2 === 0 ? 'FFFAFAFA' : 'FFFFFFFF';
          row.eachCell({ includeEmpty: true }, (cell, colNum) => {
            const colKey = activeCols[colNum - 1]?.key ?? '';
            cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
            cell.font      = { name: 'メイリオ', size: 10 };
            cell.alignment = {
              vertical: 'top',
              wrapText: ['findings', 'task_detail', 'photos'].includes(colKey),
              indent:   1,
            };
            cell.border = CBORDER;
          });

          // 問題あり → 赤文字
          if (task?.has_problem && colChecked['hasIssue']) {
            const c = row.getCell('hasIssue');
            if (c) c.font = { name: 'メイリオ', size: 10, bold: true, color: { argb: 'FFDC2626' } };
          }
          // 遅延あり → 橙文字
          if (rpt.hasDelay === 'yes' && colChecked['hasDelay']) {
            const c = row.getCell('hasDelay');
            if (c) c.font = { name: 'メイリオ', size: 10, bold: true, color: { argb: 'FFD97706' } };
          }

          rowIdx++;
        }
      }

      // ウィンドウ枠固定（6行目 = 列ヘッダーで固定）
      ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 6 }];

      const buffer = await wb.xlsx.writeBuffer();
      saveAs(
        new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `${fileName.trim() || '報告書集計一覧'}.xlsx`,
      );
    } catch (e) {
      console.error('[Excel] 出力に失敗:', e);
      alert(`Excelの出力に失敗しました。\n${e.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // データなし（直接URLアクセスなど）
  if (!state?.targetReports) {
    return (
      <div className="ep-no-data">
        <p>出力対象データがありません。</p>
        <button className="btn btn-outline" onClick={() => navigate('/')}>
          <ArrowLeft size={16} /> 管理画面に戻る
        </button>
      </div>
    );
  }

  // ── JSX ──────────────────────────────────────────────────
  return (
    <div className="ep-root">

      {/* ── 上部ヘッダーバー ── */}
      <header className="ep-header glass-panel">
        <button className="btn btn-outline ep-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> 一覧に戻る
        </button>
        <div className="ep-header-title">
          <FileSpreadsheet size={20} />
          <div>
            <h2>Excel出力プレビュー</h2>
            <p>対象：{reports.length}件の報告書 / {previewRows.length}行</p>
          </div>
        </div>
        <button
          className="btn btn-primary ep-download-btn"
          onClick={handleExport}
          disabled={isExporting || activeCols.length === 0}
        >
          <Download size={16} />
          {isExporting ? '出力中...' : 'ダウンロード実行'}
        </button>
      </header>

      {/* ── メインボディ（2ペイン）── */}
      <div className="ep-body">

        {/* ① 設定パネル（左）*/}
        <aside className="ep-sidebar glass-panel">

          {/* ファイル名 */}
          <div className="ep-sidebar-section">
            <p className="ep-sidebar-label">ファイル名</p>
            <div className="ep-filename-row">
              <input
                type="text"
                className="ep-filename-input"
                value={fileName}
                onChange={e => setFileName(e.target.value)}
                placeholder="ファイル名を入力..."
                data-gramm="false"
                autoComplete="off"
              />
              <span className="ep-filename-ext">.xlsx</span>
            </div>
          </div>

          {/* 出力列選択 */}
          <div className="ep-sidebar-section ep-sidebar-section-cols">
            <p className="ep-sidebar-label">出力する列</p>
            {CATEGORIES.map(cat => {
              const cols   = EXPORT_COLUMNS.filter(c => c.category === cat);
              const allOn  = cols.every(c => colChecked[c.key]);
              const allOff = cols.every(c => !colChecked[c.key]);
              return (
                <div key={cat} className="ep-cat-group">
                  <div className="ep-cat-header">
                    <span className="ep-cat-label">{cat}</span>
                    <div className="ep-cat-btns">
                      <button
                        className={`ep-toggle-btn${allOn ? ' active' : ''}`}
                        onClick={() => toggleAll(cat, true)}
                      >全ON</button>
                      <button
                        className={`ep-toggle-btn${allOff ? ' active' : ''}`}
                        onClick={() => toggleAll(cat, false)}
                      >全OFF</button>
                    </div>
                  </div>
                  <div className="ep-col-list">
                    {cols.map(col => (
                      <label key={col.key} className="ep-col-item">
                        <input
                          type="checkbox"
                          checked={!!colChecked[col.key]}
                          onChange={() => toggleCol(col.key)}
                        />
                        {col.label}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 選択状況 */}
          <p className="ep-col-count">
            {activeCols.length} / {EXPORT_COLUMNS.length} 列を出力
          </p>

        </aside>

        {/* ② プレビューエリア（右）*/}
        <main className="ep-preview">
          <div className="ep-preview-topbar">
            <span className="ep-preview-info">
              プレビュー — {activeCols.length}列 × {previewRows.length}行
            </span>
            {activeCols.some(c => c.key === 'photos') && (
              <span className="ep-preview-photo-note">
                <Camera size={12} /> 写真列：ダウンロード時に実際の画像が埋め込まれます
              </span>
            )}
          </div>

          <div className="ep-preview-scroll">
            {/* ── Excelドキュメント風プレビュー ── */}
            <div className="ep-excel-doc">

              {/* 行1: タイトルバー */}
              <div className="ep-xls-row ep-xls-row--title">
                <div className="ep-xls-title-cell">報　告　書　集　計　一　覧</div>
              </div>

              {/* 行2: 作成者 / 対象期間 */}
              <div className="ep-xls-row ep-xls-row--meta">
                <div className="ep-xls-meta-left">作成者：管理者</div>
                <div className="ep-xls-meta-right">
                  対象期間：{previewMeta.oldest}　〜　{previewMeta.newest}
                </div>
              </div>

              {/* 行3: スペーサー */}
              <div className="ep-xls-spacer" />

              {/* 行4: 全体サマリー */}
              <div className="ep-xls-row ep-xls-row--summary">
                <div className="ep-xls-summary-cell">
                  全体状況: 総件数 {previewMeta.total}件 ／ 異常なし {previewMeta.noIssue}件 ／ 問題あり {previewMeta.hasIssueCnt}件 ／ 進捗遅延 {previewMeta.delayed}件
                </div>
              </div>

              {/* 行5: 案件名別件数 */}
              <div className="ep-xls-row ep-xls-row--depts">
                <div className="ep-xls-dept-cell">
                  案件名別件数: {Object.entries(previewMeta.deptMap).map(([d, n]) => `${d} ${n}件`).join(' ／ ')}
                </div>
              </div>

              {/* 行6〜: データテーブル */}
              {activeCols.length === 0 ? (
                <div className="ep-preview-empty">左パネルで出力する列を1つ以上選択してください</div>
              ) : previewRows.length === 0 ? (
                <div className="ep-preview-empty">対象データがありません</div>
              ) : (
                <table className="ep-table">
                  <thead>
                    <tr>
                      <th className="ep-th-num">#</th>
                      {activeCols.map(col => (
                        <th key={col.key} className={`ep-th ep-th-${col.key}`}>
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => {
                      const isIssue = row._rpt?.hasIssue === 'yes';
                      const isDelay = row._rpt?.hasDelay === 'yes';
                      const rowClass =
                        isIssue && isDelay ? 'ep-tr-issue-delay' :
                        isIssue            ? 'ep-tr-issue'       :
                        isDelay            ? 'ep-tr-delay'       : '';
                      return (
                        <tr key={i} className={rowClass}>
                          <td className="ep-td-num">{i + 1}</td>
                          {activeCols.map(col => {
                            const rawVal = String(row[col.key] ?? '');
                            // 写真列：URL羅列を件数バッジに変換
                            if (col.key === 'photos') {
                              const cnt = rawVal.split('\n').filter(Boolean).length;
                              return (
                                <td key={col.key} className="ep-td ep-td-photos">
                                  {cnt > 0
                                    ? <span className="ep-photo-badge"><Camera size={11} /> {cnt}枚</span>
                                    : <span className="ep-no-photo">—</span>}
                                </td>
                              );
                            }
                            // 問題の有無：色付きバッジ
                            if (col.key === 'hasIssue') {
                              return (
                                <td key={col.key} className="ep-td ep-td-center">
                                  <span className={`ep-badge ${rawVal === '問題あり' ? 'ep-badge-alert' : 'ep-badge-ok'}`}>
                                    {rawVal}
                                  </span>
                                </td>
                              );
                            }
                            // 進捗状況：色付きバッジ
                            if (col.key === 'hasDelay') {
                              return (
                                <td key={col.key} className="ep-td ep-td-center">
                                  <span className={`ep-badge ${rawVal === '遅延あり' ? 'ep-badge-warn' : 'ep-badge-ok'}`}>
                                    {rawVal}
                                  </span>
                                </td>
                              );
                            }
                            // ジャンル：カラーピル
                            if (col.key === 'genre') {
                              const genreKey = Object.keys(GENRE_LABELS)
                                .find(k => GENRE_LABELS[k] === rawVal) ?? '';
                              return (
                                <td key={col.key} className="ep-td">
                                  <span className={`ep-genre-pill ep-genre-${genreKey}`}>{rawVal}</span>
                                </td>
                              );
                            }
                            // 長文フィールド（報告内容・作業内容）はテキスト折り返し
                            const isLong = ['findings', 'task_detail', 'symptom', 'action_taken'].includes(col.key);
                            return (
                              <td
                                key={col.key}
                                className={`ep-td${isLong ? ' ep-td-wrap' : ''}`}
                                title={isLong ? rawVal : undefined}
                              >
                                {rawVal}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

            </div>{/* /ep-excel-doc */}
          </div>
        </main>

      </div>{/* /ep-body */}
    </div>
  );
};

export default ExportPreviewPage;
