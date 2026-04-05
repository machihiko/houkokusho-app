import { useState } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { FileSpreadsheet } from 'lucide-react';

// ── 画像URLをArrayBufferに変換 ─────────────────────────
const fetchImageBuffer = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`画像取得失敗 (${res.status}): ${url}`);
  return res.arrayBuffer();
};

// ── URLの拡張子からExcelJS形式を判定 ─────────────────
const guessExtension = (url) => {
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.png')) return 'png';
  if (lower.endsWith('.gif')) return 'gif';
  return 'jpeg';
};

// ═══════════════════════════════════════════════════════
//   定数
//   列構成（A4縦・A列スタート）:
//   A: ラベル幅広  B: 値①  C: ラベル  D-F: 値②  (計6列 A-F)
// ═══════════════════════════════════════════════════════
const NAVY      = 'FF1E3A5F';
const WHITE     = 'FFFFFFFF';
const LABEL_BG  = 'FFE8F0F8';
const VALUE_BG  = 'FFFFFFFF';
const LABEL_FG  = 'FF1E3A5F';

const T_NAVY = { style: 'thin',   color: { argb: 'FF93A8C0' } };
const M_NAVY = { style: 'medium', color: { argb: NAVY } };
const CELL_B = { top: T_NAVY, left: T_NAVY, bottom: T_NAVY, right: T_NAVY };

// ── ラベルセル ───────────────────────────────────────
const lc = (ws, addr, text) => {
  const cell = ws.getCell(addr);
  cell.value     = text;
  cell.font      = { name: 'メイリオ', size: 10, bold: true, color: { argb: LABEL_FG } };
  cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: LABEL_BG } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.border    = CELL_B;
};

// ── 値セル ───────────────────────────────────────────
const vc = (ws, addr, text, { bold = false, color = '1A1A1A', wrapText = false } = {}) => {
  const cell = ws.getCell(addr);
  cell.value     = text;
  cell.font      = { name: 'メイリオ', size: 10, bold, color: { argb: color } };
  cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: VALUE_BG } };
  cell.alignment = { horizontal: 'left', vertical: wrapText ? 'top' : 'middle', wrapText, indent: 1 };
  cell.border    = CELL_B;
};

// ── セクションヘッダー（A〜F結合済みのセルへ適用）────
const sectionHeader = (ws, addr, text, borderOpts = {}) => {
  const cell = ws.getCell(addr);
  cell.value     = text;
  cell.font      = { name: 'メイリオ', size: 11, bold: true, color: { argb: LABEL_FG } };
  cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: LABEL_BG } };
  cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  cell.border    = { top: M_NAVY, left: M_NAVY, bottom: T_NAVY, right: M_NAVY, ...borderOpts };
};

// ═══════════════════════════════════════════════════════
//   コンポーネント
// ═══════════════════════════════════════════════════════
const SingleReportA4Btn = ({ rpt }) => {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Re-Report';
      wb.created = new Date();

      const ws = wb.addWorksheet('報告書');

      // ── 列幅（A列スタート・6列構成）────────────────
      //   A: ラベル  B: 値①  C: ラベル  D: 値②  E: ラベル  F: 値③
      ws.columns = [
        { width: 14 }, // A ラベル①
        { width: 24 }, // B 値①
        { width: 14 }, // C ラベル②
        { width: 24 }, // D 値②
        { width: 12 }, // E ラベル③
        { width: 16 }, // F 値③
      ];

      // ════════════════════════════════════════════
      //  行1: タイトル「社　内　報　告　書」（A1:F1）
      // ════════════════════════════════════════════
      ws.mergeCells('A1:F1');
      ws.getRow(1).height = 44;
      const titleCell = ws.getCell('A1');
      titleCell.value     = '社　内　報　告　書';
      titleCell.font      = { name: 'メイリオ', bold: true, size: 18, color: { argb: WHITE } };
      titleCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      titleCell.border    = { top: M_NAVY, left: M_NAVY, bottom: M_NAVY, right: M_NAVY };

      // ── 行2: スペーサー ──────────────────────────
      ws.getRow(2).height = 6;

      // ════════════════════════════════════════════
      //  行3: 報告日 / 所属（D3:F3 結合）
      // ════════════════════════════════════════════
      ws.mergeCells('D3:F3');
      ws.getRow(3).height = 24;
      lc(ws, 'A3', '報　告　日');
      vc(ws, 'B3', rpt.date ?? '');
      lc(ws, 'C3', '所　　　属');
      vc(ws, 'D3', rpt.department ?? '');

      // ════════════════════════════════════════════
      //  行4: 氏名 / ジャンル（D4:F4 結合）
      // ════════════════════════════════════════════
      ws.mergeCells('D4:F4');
      ws.getRow(4).height = 24;
      lc(ws, 'A4', '氏　　　名');
      vc(ws, 'B4', rpt.submitter ?? rpt.department ?? '');
      lc(ws, 'C4', 'ジャンル');
      vc(ws, 'D4', rpt.genre ?? '');

      // ════════════════════════════════════════════
      //  行5: 問題の有無 / 進捗（D5:F5 結合）
      // ════════════════════════════════════════════
      ws.mergeCells('D5:F5');
      ws.getRow(5).height = 24;
      lc(ws, 'A5', '問題の有無');
      vc(ws, 'B5', rpt.hasIssue === 'yes' ? '問題あり' : '異常なし', {
        bold: rpt.hasIssue === 'yes',
        color: rpt.hasIssue === 'yes' ? 'FFDC2626' : 'FF16A34A',
      });
      lc(ws, 'C5', '進　　　捗');
      vc(ws, 'D5', rpt.hasDelay === 'yes' ? '遅延あり' : '正常', {
        bold: rpt.hasDelay === 'yes',
        color: rpt.hasDelay === 'yes' ? 'FFD97706' : 'FF16A34A',
      });

      // ── 行6: スペーサー ──────────────────────────
      ws.getRow(6).height = 8;

      // ════════════════════════════════════════════
      //  行7: 「■ 報告内容」セクションヘッダー（A7:F7）
      // ════════════════════════════════════════════
      ws.mergeCells('A7:F7');
      ws.getRow(7).height = 22;
      sectionHeader(ws, 'A7', '■　報　告　内　容');

      // ════════════════════════════════════════════
      //  行8〜13: 報告内容テキスト（A8:F13）
      // ════════════════════════════════════════════
      ws.mergeCells('A8:F13');
      for (let r = 8; r <= 13; r++) ws.getRow(r).height = 18;
      const contentCell = ws.getCell('A8');
      contentCell.value     = rpt.content ?? '';
      contentCell.font      = { name: 'メイリオ', size: 10 };
      contentCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: VALUE_BG } };
      contentCell.alignment = { wrapText: true, vertical: 'top', indent: 1 };
      contentCell.border    = { top: T_NAVY, left: M_NAVY, bottom: M_NAVY, right: M_NAVY };

      // ════════════════════════════════════════════
      //  写真セクション（最大2枚 ─ 横並び）
      // ════════════════════════════════════════════
      const photoUrls = (rpt.photoUrls ?? []).slice(0, 2);

      if (photoUrls.length > 0) {
        // ── 行14: スペーサー ─────────────────────
        ws.getRow(14).height = 8;

        // ── 行15: 「■ 添付写真」セクションヘッダー ─
        ws.mergeCells('A15:F15');
        ws.getRow(15).height = 22;
        sectionHeader(ws, 'A15', '■　添　付　写　真');

        // ── 行16〜35: 写真エリア（横並び2枚）────────
        //   左: A16:C35  右: D16:F35  各20行
        const PHOTO_START = 16;
        const PHOTO_END   = 35;
        const PHOTO_ROWS  = PHOTO_END - PHOTO_START + 1;
        for (let r = PHOTO_START; r <= PHOTO_END; r++) ws.getRow(r).height = 14;

        if (photoUrls.length === 1) {
          // 1枚の場合は全幅（A16:F35）
          ws.mergeCells(`A${PHOTO_START}:F${PHOTO_END}`);
          ws.getCell(`A${PHOTO_START}`).border = { top: T_NAVY, left: M_NAVY, bottom: M_NAVY, right: M_NAVY };
          try {
            const buf   = await fetchImageBuffer(photoUrls[0]);
            const ext   = guessExtension(photoUrls[0]);
            const imgId = wb.addImage({ buffer: buf, extension: ext });
            ws.addImage(imgId, {
              tl:     { col: 0, row: PHOTO_START - 1 },
              br:     { col: 6, row: PHOTO_END },
              editAs: 'oneCell',
            });
          } catch {
            vc(ws, `A${PHOTO_START}`, `[画像を読み込めませんでした] ${photoUrls[0]}`, { color: 'FF9CA3AF' });
          }
        } else {
          // 2枚横並び: 左=A-C, 右=D-F
          ws.mergeCells(`A${PHOTO_START}:C${PHOTO_END}`);
          ws.mergeCells(`D${PHOTO_START}:F${PHOTO_END}`);
          ws.getCell(`A${PHOTO_START}`).border = { top: T_NAVY, left: M_NAVY, bottom: M_NAVY, right: T_NAVY };
          ws.getCell(`D${PHOTO_START}`).border = { top: T_NAVY, left: T_NAVY, bottom: M_NAVY, right: M_NAVY };

          // 左写真
          try {
            const buf   = await fetchImageBuffer(photoUrls[0]);
            const ext   = guessExtension(photoUrls[0]);
            const imgId = wb.addImage({ buffer: buf, extension: ext });
            ws.addImage(imgId, {
              tl:     { col: 0, row: PHOTO_START - 1 }, // A列(0-indexed=0)
              br:     { col: 3, row: PHOTO_END },        // C列まで(0-indexed=3)
              editAs: 'oneCell',
            });
          } catch {
            vc(ws, `A${PHOTO_START}`, '[画像読込失敗]', { color: 'FF9CA3AF' });
          }

          // 右写真
          try {
            const buf   = await fetchImageBuffer(photoUrls[1]);
            const ext   = guessExtension(photoUrls[1]);
            const imgId = wb.addImage({ buffer: buf, extension: ext });
            ws.addImage(imgId, {
              tl:     { col: 3, row: PHOTO_START - 1 }, // D列(0-indexed=3)
              br:     { col: 6, row: PHOTO_END },        // F列まで(0-indexed=6)
              editAs: 'oneCell',
            });
          } catch {
            vc(ws, `D${PHOTO_START}`, '[画像読込失敗]', { color: 'FF9CA3AF' });
          }
        }
      }

      // ── A4縦 印刷設定 ────────────────────────────
      ws.pageSetup = {
        paperSize:   9,
        orientation: 'portrait',
        fitToPage:   true,
        fitToWidth:  1,
        fitToHeight: 0,
        margins: { left: 0.6, right: 0.6, top: 0.7, bottom: 0.7, header: 0.3, footer: 0.3 },
      };

      // ── 出力 ──────────────────────────────────────
      const buffer   = await wb.xlsx.writeBuffer();
      const safeDept = (rpt.department ?? '不明').replace(/[/\\?*[\]]/g, '-');
      saveAs(
        new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `社内報告書_${rpt.date ?? 'nodate'}_${safeDept}.xlsx`,
      );
    } catch (e) {
      console.error('[Excel A4] 出力に失敗:', e);
      alert(`個別出力に失敗しました。\n${e.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      className="btn-contact"
      onClick={handleExport}
      disabled={isExporting}
      title="A4社内報告書をExcel出力"
    >
      <FileSpreadsheet size={13} /> {isExporting ? '出力中...' : '個別出力 (A4)'}
    </button>
  );
};

export default SingleReportA4Btn;
