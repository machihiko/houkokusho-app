import { useState } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Download } from 'lucide-react';

// ── 列定義（写真URLなし）──────────────────────────────
const HEADERS = [
  { header: '日付',       key: 'date',       width: 14 },
  { header: '部署',       key: 'department', width: 20 },
  { header: '氏名',       key: 'submitter',  width: 18 },
  { header: 'ジャンル',   key: 'genre',      width: 12 },
  { header: '報告内容',   key: 'content',    width: 60 }, // 広め + 折り返し
  { header: '問題の有無', key: 'hasIssue',   width: 14 },
  { header: '進捗',       key: 'hasDelay',   width: 12 },
];
const COL = HEADERS.length; // 7

const NAVY  = 'FF1E3A5F';
const WHITE = 'FFFFFFFF';

// ── 結合セルに値とスタイルをまとめてセット ────────────
const fillMerged = (ws, addr, value, { size = 10, bold = false, fgColor, color = NAVY, halign = 'left' } = {}) => {
  const cell = ws.getCell(addr);
  cell.value     = value;
  cell.font      = { name: 'メイリオ', size, bold, color: { argb: color } };
  cell.alignment = { horizontal: halign, vertical: 'middle', indent: halign === 'left' ? 1 : 0 };
  if (fgColor)   cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fgColor } };
};

const ExcelExportBtn = ({ reports }) => {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (!reports.length) {
      alert('書き出すレポートがありません。');
      return;
    }

    setIsExporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Re-Report';
      wb.created = new Date();

      const ws = wb.addWorksheet('報告書集計一覧');

      // ── 列幅設定 ─────────────────────────────────────
      ws.columns = HEADERS.map(({ key, width }) => ({ key, width }));

      // ════════════════════════════════════════════════
      //  行1: 大タイトル「報告書集計一覧」
      // ════════════════════════════════════════════════
      ws.mergeCells(1, 1, 1, COL);
      ws.getRow(1).height = 38;
      fillMerged(ws, 'A1', '報　告　書　集　計　一　覧', {
        size: 18, bold: true, fgColor: NAVY, color: WHITE, halign: 'center',
      });

      // ════════════════════════════════════════════════
      //  行2: 作成者（左半）/ 対象期間（右半）
      // ════════════════════════════════════════════════
      const dates  = reports.map(r => r.date).filter(Boolean).sort();
      const oldest = dates[0] ?? '―';
      const newest = dates[dates.length - 1] ?? '―';

      // 左: A2:C2
      ws.mergeCells(2, 1, 2, 3);
      ws.getRow(2).height = 22;
      fillMerged(ws, 'A2', '作成者：管理者', { bold: true, fgColor: 'FFE8F0F8' });
      // 右: D2:G2
      ws.mergeCells(2, 4, 2, COL);
      fillMerged(ws, 'D2', `対象期間：${oldest}  〜  ${newest}`, { fgColor: 'FFF0F4F8', color: 'FF475569' });
      // 区切り線
      ws.getCell('A2').border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
      ws.getCell('D2').border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };

      // ════════════════════════════════════════════════
      //  行3: 空白スペーサー
      // ════════════════════════════════════════════════
      ws.getRow(3).height = 8;

      // ════════════════════════════════════════════════
      //  行4: 全体集計サマリー
      // ════════════════════════════════════════════════
      const total    = reports.length;
      const noIssue  = reports.filter(r => r.hasIssue !== 'yes').length;
      const hasIssue = reports.filter(r => r.hasIssue === 'yes').length;
      const delayed  = reports.filter(r => r.hasDelay === 'yes').length;
      const summaryText =
        `全体状況：  総件数 ${total}件　／　異常なし ${noIssue}件　／　問題あり ${hasIssue}件　／　進捗遅延 ${delayed}件`;

      ws.mergeCells(4, 1, 4, COL);
      ws.getRow(4).height = 22;
      fillMerged(ws, 'A4', summaryText, { bold: true, size: 11, fgColor: 'FFEEF6FF', color: NAVY });
      ws.getCell('A4').border = {
        top:    { style: 'thin',   color: { argb: 'FF93A8C0' } },
        bottom: { style: 'thin',   color: { argb: 'FF93A8C0' } },
        left:   { style: 'medium', color: { argb: NAVY } },
        right:  { style: 'medium', color: { argb: NAVY } },
      };

      // ════════════════════════════════════════════════
      //  行5: 部署別件数
      // ════════════════════════════════════════════════
      const deptMap = reports.reduce((acc, r) => {
        const d = r.department ?? '不明';
        acc[d] = (acc[d] ?? 0) + 1;
        return acc;
      }, {});
      const deptText =
        '部署別件数：  ' +
        Object.entries(deptMap)
          .map(([dept, cnt]) => `${dept} ${cnt}件`)
          .join('　／　');

      ws.mergeCells(5, 1, 5, COL);
      ws.getRow(5).height = 20;
      fillMerged(ws, 'A5', deptText, { fgColor: 'FFFAFBFC', color: 'FF475569' });
      ws.getCell('A5').border = {
        bottom: { style: 'medium', color: { argb: NAVY } },
        left:   { style: 'medium', color: { argb: NAVY } },
        right:  { style: 'medium', color: { argb: NAVY } },
      };

      // ════════════════════════════════════════════════
      //  行6: 列ヘッダー（ネイビー背景）
      // ════════════════════════════════════════════════
      const headerRow = ws.getRow(6);
      headerRow.height = 22;
      HEADERS.forEach((h, i) => {
        const cell = ws.getCell(6, i + 1);
        cell.value     = h.header;
        cell.font      = { name: 'メイリオ', bold: true, size: 10, color: { argb: WHITE } };
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        const S = { style: 'thin', color: { argb: 'FF475569' } };
        cell.border = { top: S, left: S, bottom: S, right: S };
      });

      // ════════════════════════════════════════════════
      //  行7〜: データ行
      // ════════════════════════════════════════════════
      const THIN   = { style: 'thin', color: { argb: 'FFCBD5E1' } };
      const CBORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

      reports.forEach((rpt, idx) => {
        const row = ws.addRow({
          date:       rpt.date ?? '',
          department: rpt.department ?? '',
          submitter:  rpt.submitter ?? '',
          genre:      rpt.genre ?? '',
          content:    rpt.content ?? '',
          hasIssue:   rpt.hasIssue === 'yes' ? '問題あり' : '異常なし',
          hasDelay:   rpt.hasDelay === 'yes' ? '遅延あり' : '正常',
        });
        row.height = 36; // 折り返しのためやや高め

        const bg = idx % 2 === 0 ? 'FFFAFAFA' : 'FFFFFFFF';
        row.eachCell({ includeEmpty: true }, (cell, colNum) => {
          cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
          cell.font      = { name: 'メイリオ', size: 10 };
          // 報告内容（5列目）は折り返して全体を表示
          cell.alignment = { vertical: 'top', wrapText: colNum === 5, indent: 1 };
          cell.border    = CBORDER;
        });

        if (rpt.hasIssue === 'yes') {
          row.getCell('hasIssue').font = { name: 'メイリオ', size: 10, bold: true, color: { argb: 'FFDC2626' } };
        }
        if (rpt.hasDelay === 'yes') {
          row.getCell('hasDelay').font = { name: 'メイリオ', size: 10, bold: true, color: { argb: 'FFD97706' } };
        }
      });

      // ── ウィンドウ枠固定（6行目 = 列ヘッダーで固定）─
      ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 6 }];

      // ── 出力 ──────────────────────────────────────
      const buffer = await wb.xlsx.writeBuffer();
      const today  = new Date().toISOString().split('T')[0];
      saveAs(
        new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `報告書集計一覧_${today}.xlsx`,
      );
    } catch (e) {
      console.error('[Excel] 出力に失敗:', e);
      alert(`Excelの出力に失敗しました。\n${e.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button className="btn btn-primary" onClick={handleExport} disabled={isExporting}>
      <Download size={18} /> {isExporting ? '出力中...' : 'Excel一括出力'}
    </button>
  );
};

export default ExcelExportBtn;
