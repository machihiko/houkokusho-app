import { useState } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Download } from 'lucide-react';

// ── 罫線定義 ─────────────────────────────────────────────
const THIN     = { style: 'thin',   color: { argb: 'FF94A3B8' } };
const MED      = { style: 'medium', color: { argb: 'FF475569' } };
const BORDER     = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const BORDER_MED = { top: MED,  left: MED,  bottom: MED,  right: MED  };

// ── セルスタイル適用ヘルパー ───────────────────────────
const applyStyle = (cell, opts = {}) => {
  if (opts.bold != null || opts.size != null || opts.color != null) {
    cell.font = {
      name: 'メイリオ',
      ...(cell.font ?? {}),
      ...(opts.bold  != null ? { bold:  opts.bold  }            : {}),
      ...(opts.size  != null ? { size:  opts.size  }            : {}),
      ...(opts.color != null ? { color: { argb: opts.color } }  : {}),
    };
  }
  if (opts.bg != null)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.bg } };
  if (opts.align != null || opts.valign != null || opts.wrap != null)
    cell.alignment = {
      ...(cell.alignment ?? {}),
      ...(opts.align  != null ? { horizontal: opts.align  } : {}),
      ...(opts.valign != null ? { vertical:   opts.valign } : {}),
      ...(opts.wrap   != null ? { wrapText:   opts.wrap   } : {}),
    };
  if (opts.border != null) cell.border = opts.border;
};

const labelCell = (cell) => applyStyle(cell, {
  bg: 'FFF1F5F9', bold: true, size: 10,
  align: 'center', valign: 'middle', border: BORDER,
});
const valueCell = (cell, extra = {}) => applyStyle(cell, {
  size: 10, valign: 'middle', border: BORDER, ...extra,
});

// ── URL から画像 ArrayBuffer を取得 ───────────────────
const fetchImageBuffer = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.arrayBuffer();
};

// URL の拡張子から exceljs の extension 文字列を返す
const imageExtension = (url) => {
  const ext = url.split('?')[0].split('.').pop().toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';
  if (ext === 'png')  return 'png';
  if (ext === 'gif')  return 'gif';
  if (ext === 'webp') return 'webp';
  return 'jpeg'; // fallback
};

// ── 1件分のシートを非同期で生成 ──────────────────────
const buildReportSheet = async (wb, rpt, includeAI, aiSummary) => {
  // シート名：日付_部署_id（31文字以内・一意）
  const base   = `${rpt.date}_${rpt.department}`;
  const suffix = `_${rpt.id}`;
  const sheetName = (base.length + suffix.length <= 31)
    ? base + suffix
    : base.substring(0, 31 - suffix.length) + suffix;

  const ws = wb.addWorksheet(sheetName);
  ws.pageSetup.paperSize    = 9;           // A4
  ws.pageSetup.orientation  = 'portrait';
  ws.pageSetup.fitToPage    = true;
  ws.pageSetup.fitToWidth   = 1;
  ws.pageSetup.fitToHeight  = 1;

  // 列幅: A=17, B-D=12, E=17, F-H=12
  ws.columns = [
    { width: 17 },
    { width: 12 }, { width: 12 }, { width: 12 },
    { width: 17 },
    { width: 12 }, { width: 12 }, { width: 12 },
  ];

  // ── Row 1: タイトル ────────────────────────────────
  ws.mergeCells('A1:H1');
  applyStyle(ws.getCell('A1'), {
    bg: 'FF1E3A5F', color: 'FFFFFFFF', bold: true, size: 20,
    align: 'center', valign: 'middle', border: BORDER_MED,
  });
  ws.getCell('A1').value = '社 内 報 告 書';
  ws.getRow(1).height = 46;

  // ── Row 2: スペーサー ─────────────────────────────
  ws.getRow(2).height = 6;

  // ── Row 3: 報告日 / 所属 ────────────────────────────
  ws.getRow(3).height = 24;
  ws.getCell('A3').value = '報告日';       labelCell(ws.getCell('A3'));
  ws.mergeCells('B3:D3');
  ws.getCell('B3').value = rpt.date ?? ''; valueCell(ws.getCell('B3'));
  ws.getCell('E3').value = '所属（部署）'; labelCell(ws.getCell('E3'));
  ws.mergeCells('F3:H3');
  ws.getCell('F3').value = rpt.department ?? ''; valueCell(ws.getCell('F3'));

  // ── Row 4: 氏名 / ジャンル ────────────────────────
  ws.getRow(4).height = 24;
  ws.getCell('A4').value = '氏名';     labelCell(ws.getCell('A4'));
  ws.mergeCells('B4:D4');
  ws.getCell('B4').value = rpt.submitter ?? ''; valueCell(ws.getCell('B4'));
  ws.getCell('E4').value = 'ジャンル'; labelCell(ws.getCell('E4'));
  ws.mergeCells('F4:H4');
  ws.getCell('F4').value = rpt.genre ?? ''; valueCell(ws.getCell('F4'));

  // ── Row 5: スペーサー ─────────────────────────────
  ws.getRow(5).height = 6;

  // ── Row 6: 報告内容ヘッダー ────────────────────────
  ws.mergeCells('A6:H6');
  applyStyle(ws.getCell('A6'), {
    bg: 'FFDBEAFE', bold: true, size: 11, valign: 'middle', border: BORDER,
  });
  ws.getCell('A6').value = '■ 報告内容';
  ws.getRow(6).height = 22;

  // ── Row 7-16: 報告内容本文 ────────────────────────
  ws.mergeCells('A7:H16');
  applyStyle(ws.getCell('A7'), { size: 10, valign: 'top', wrap: true, border: BORDER });
  ws.getCell('A7').value = rpt.content ?? '';
  for (let r = 7; r <= 16; r++) ws.getRow(r).height = 18;

  // ── Row 17: スペーサー ────────────────────────────
  ws.getRow(17).height = 6;

  // ── Row 18: 問題の有無 / 進捗の遅れ / 写真添付 ───
  ws.getRow(18).height = 24;
  ws.getCell('A18').value = '問題の有無'; labelCell(ws.getCell('A18'));
  ws.mergeCells('B18:C18');
  ws.getCell('B18').value = rpt.hasIssue === 'yes' ? '問題あり' : '異常なし';
  valueCell(ws.getCell('B18'), {
    align: 'center', bold: true,
    color: rpt.hasIssue === 'yes' ? 'FFDC2626' : 'FF16A34A',
  });
  ws.getCell('D18').value = '進捗の遅れ'; labelCell(ws.getCell('D18'));
  ws.mergeCells('E18:F18');
  ws.getCell('E18').value = rpt.hasDelay === 'yes' ? '遅延あり' : '正常';
  valueCell(ws.getCell('E18'), {
    align: 'center', bold: true,
    color: rpt.hasDelay === 'yes' ? 'FFD97706' : 'FF16A34A',
  });
  ws.getCell('G18').value = '写真添付'; labelCell(ws.getCell('G18'));
  ws.getCell('H18').value = rpt.hasPhoto ? 'あり' : 'なし';
  valueCell(ws.getCell('H18'), { align: 'center' });

  // ── 動的行カーソル（写真・AI要約の配置に使用） ────
  let cur = 19;

  // ── 写真セクション（添付画像がある場合） ──────────
  const photoUrls = rpt.photoUrls ?? [];
  if (photoUrls.length > 0) {
    ws.getRow(cur).height = 6; cur++;

    ws.mergeCells(`A${cur}:H${cur}`);
    applyStyle(ws.getCell(`A${cur}`), {
      bg: 'FFE0F2FE', bold: true, size: 11, valign: 'middle', border: BORDER,
    });
    ws.getCell(`A${cur}`).value = '■ 添付写真';
    ws.getRow(cur).height = 22;
    cur++;

    for (const url of photoUrls) {
      try {
        const buffer = await fetchImageBuffer(url);
        const ext    = imageExtension(url);
        const imgId  = wb.addImage({ buffer, extension: ext });

        // 画像1枚あたり約20行（row高さ18px × 20 = 360px）を確保
        const IMG_ROWS = 20;
        const IMG_W    = 600; // px
        const IMG_H    = 440; // px
        ws.addImage(imgId, {
          tl: { col: 0, row: cur - 1 },          // 0-indexed
          ext: { width: IMG_W, height: IMG_H },
        });
        for (let r = cur; r < cur + IMG_ROWS; r++) ws.getRow(r).height = IMG_H / IMG_ROWS;
        cur += IMG_ROWS + 1; // +1 は画像間スペーサー
      } catch (imgErr) {
        console.warn(`[Excel] 画像取得失敗 (${url}):`, imgErr);
        // 画像取得失敗時はセルにエラーテキストを表示
        ws.mergeCells(`A${cur}:H${cur}`);
        ws.getCell(`A${cur}`).value = `※ 画像の取得に失敗しました: ${url}`;
        applyStyle(ws.getCell(`A${cur}`), { size: 9, color: 'FFDC2626', border: BORDER });
        ws.getRow(cur).height = 18;
        cur++;
      }
    }
  }

  // ── AI要約（「含める」選択時のみ） ─────────────────
  if (includeAI && aiSummary) {
    ws.getRow(cur).height = 6; cur++;

    ws.mergeCells(`A${cur}:H${cur}`);
    applyStyle(ws.getCell(`A${cur}`), {
      bg: 'FFFEF9C3', bold: true, size: 11, valign: 'middle', border: BORDER,
    });
    ws.getCell(`A${cur}`).value = '■ AI グローバル要約';
    ws.getRow(cur).height = 22;
    cur++;

    const AI_ROWS = 8;
    ws.mergeCells(`A${cur}:H${cur + AI_ROWS - 1}`);
    applyStyle(ws.getCell(`A${cur}`), { size: 10, valign: 'top', wrap: true, border: BORDER });
    ws.getCell(`A${cur}`).value = aiSummary;
    for (let r = cur; r < cur + AI_ROWS; r++) ws.getRow(r).height = 16;
  }
};

// ── コンポーネント ─────────────────────────────────────
const ExcelExportBtn = ({ reports, aiSummary = '' }) => {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (!reports.length) {
      alert('書き出すレポートがありません。');
      return;
    }

    const includeAI = aiSummary
      ? window.confirm('出力する報告書にAI要約を含めますか？')
      : false;

    setIsExporting(true);
    const errors = [];
    try {
      const wb = new ExcelJS.Workbook();
      wb.creator  = 'Re-Report';
      wb.created  = new Date();
      wb.modified = new Date();

      // 全件ループ：1シートでエラーが出ても次のシートを続行
      for (const rpt of reports) {
        try {
          await buildReportSheet(wb, rpt, includeAI, aiSummary);
        } catch (sheetErr) {
          console.error(`[Excel] シート生成エラー (id=${rpt.id}):`, sheetErr);
          errors.push(`id=${rpt.id}: ${sheetErr.message}`);
        }
      }

      if (wb.worksheets.length === 0) {
        throw new Error('出力できたシートが0件です。');
      }

      const buffer   = await wb.xlsx.writeBuffer();
      const today    = new Date().toISOString().split('T')[0];
      saveAs(
        new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `社内報告書_${today}.xlsx`,
      );

      if (errors.length > 0) {
        alert(`出力完了（${wb.worksheets.length}件）\n以下のシートはエラーでスキップされました:\n${errors.join('\n')}`);
      }
    } catch (e) {
      console.error('[Excel] 出力に失敗:', e);
      alert(`Excelの出力に失敗しました。\n${e.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button className="btn btn-primary" onClick={handleExport} disabled={isExporting}>
      <Download size={18} /> {isExporting ? '出力中...' : 'Excel一括出力 (A4版)'}
    </button>
  );
};

export default ExcelExportBtn;
