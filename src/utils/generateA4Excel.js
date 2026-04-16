/**
 * generateA4Excel.js
 * A4 社内報告書 ExcelJS 生成ロジック（SingleReportA4Btn から抽出）
 *
 * V5: セルマッピング方式（絶対番地への流し込み）
 *   - CELL_MAP : 共通情報を固定行番号で管理
 *   - OFF      : タスクブロック内の相対オフセット
 *   - TASK_BLOCK_START / TASK_BLOCK_SIZE : タスク配置の固定ルール
 */
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { normalizeTemplateMapping } from './templateMapping';

// ── ジャンル表示名 ─────────────────────────────────────────
const GENRE_LABELS = {
  cleaning:   '清掃',
  inspection: '点検',
  repair:     '修理',
  patrol:     '巡回',
  emergency:  '緊急対応',
};

// ── スタイル定数 ───────────────────────────────────────────
const NAVY     = 'FF1E3A5F';
const WHITE    = 'FFFFFFFF';
const LABEL_BG = 'FFE8F0F8';
const VALUE_BG = 'FFFFFFFF';
const LABEL_FG = 'FF1E3A5F';
const T_NAVY   = { style: 'thin',   color: { argb: 'FF93A8C0' } };
const M_NAVY   = { style: 'medium', color: { argb: NAVY } };
const CELL_B   = { top: T_NAVY, left: T_NAVY, bottom: T_NAVY, right: T_NAVY };

// ── custom_data 優先のフィールド取得 ──────────────────────
export const getTaskField = (task, key) => {
  let cd = task.custom_data;
  if (typeof cd === 'string') {
    try { cd = JSON.parse(cd); } catch { cd = null; }
  }
  return cd?.[key] ?? task[key] ?? '';
};

// ── デフォルトファイル名生成（null 安全）─────────────────
export const buildA4DefaultFileName = (rpt) => {
  const rawDate = rpt.date ?? '';
  const ymd     = rawDate.replace(/-/g, '') || (() => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  })();
  const loc = (rpt.locationName || rpt.department || '不明')
    .replace(/[/\\?*[\]:]/g, '-').slice(0, 20);
  return `${ymd}_${loc}_個別報告書`;
};

// ── 画像 URL → ArrayBuffer ──────────────────────────────
const fetchImageBuffer = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`画像取得失敗 (${res.status}): ${url}`);
  return res.arrayBuffer();
};

// ── ArrayBuffer → 自然サイズ（ブラウザ Image API）──────
const getImageSize = (buffer) => new Promise((resolve) => {
  const blob = new Blob([buffer]);
  const url  = URL.createObjectURL(blob);
  const img  = new Image();
  img.onload  = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
  img.onerror = () => { resolve({ w: 4, h: 3 }); URL.revokeObjectURL(url); };
  img.src = url;
});

// ── 拡張子推定 ──────────────────────────────────────────
const guessExtension = (url) => {
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.png')) return 'png';
  if (lower.endsWith('.gif')) return 'gif';
  return 'jpeg';
};

// ── セルユーティリティ ──────────────────────────────────
const lc = (ws, addr, text) => {
  const c = ws.getCell(addr);
  c.value     = text;
  c.font      = { name: 'メイリオ', size: 10, bold: true, color: { argb: LABEL_FG } };
  c.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: LABEL_BG } };
  c.alignment = { horizontal: 'center', vertical: 'middle' };
  c.border    = CELL_B;
};

const vc = (ws, addr, text, { bold = false, color = 'FF1A1A1A', wrapText = false } = {}) => {
  const c = ws.getCell(addr);
  c.value     = text;
  c.font      = { name: 'メイリオ', size: 10, bold, color: { argb: color } };
  c.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: VALUE_BG } };
  c.alignment = { horizontal: 'left', vertical: wrapText ? 'top' : 'middle', wrapText, indent: 1 };
  c.border    = CELL_B;
};

const sectionHeader = (ws, addr, text, borderOpts = {}) => {
  const c = ws.getCell(addr);
  c.value     = text;
  c.font      = { name: 'メイリオ', size: 11, bold: true, color: { argb: LABEL_FG } };
  c.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: LABEL_BG } };
  c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  c.border    = { top: M_NAVY, left: M_NAVY, bottom: T_NAVY, right: M_NAVY, ...borderOpts };
};

const mergedContent = (ws, r1, c1, r2, c2, text) => {
  try { ws.mergeCells(r1, c1, r2, c2); } catch (e) { console.warn('[generateA4Excel] Merge skipped:', e.message); }
  for (let ri = r1; ri <= r2; ri++) ws.getRow(ri).height = 18;
  const c     = ws.getCell(r1, c1);
  c.value     = text;
  c.font      = { name: 'メイリオ', size: 10 };
  c.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: VALUE_BG } };
  c.alignment = { wrapText: true, vertical: 'top', indent: 1 };
  c.border    = { top: T_NAVY, left: M_NAVY, bottom: M_NAVY, right: M_NAVY };
};

// ══════════════════════════════════════════════════════════════
//  セルマッピング設定（共通情報）
//  各キーを固定行番号に対応させる。この行番号がレイアウトの基準。
// ══════════════════════════════════════════════════════════════
const CELL_MAP = {
  date:        { row: 3, label: '報　告　日' },
  department:  { row: 4, label: '所　　属' },
  submitter:   { row: 5, label: '氏　　名' },
  time:        { row: 6, label: '対応時間' },
  progress:    { row: 7, label: '全体進捗' },
  delayReason: { row: 8, label: '遅延理由' },
};

// ── タスクブロック内オフセット（先頭行からの相対行番号）──────
//   R = TASK_BLOCK_START + tIdx * TASK_BLOCK_SIZE
//   各フィールドは R + OFF.X の絶対行に書き込む
const OFF = {
  header:        0,   // タスクヘッダー行
  target_place:  1,   // 担当場所
  task_detail:   2,   // 作業内容
  symptom:       3,   // 症状
  action_taken:  4,   // 対応内容
  has_problem:   5,   // 問題/異常の有無
  findings_hdr:  6,   // 報告内容ヘッダー
  findings_body: 7,   // 報告内容本文（7〜10 の4行マージ）
  photos_hdr:    11,  // 添付写真ヘッダー
  photo_pair_0:  12,  // 写真ペア1枚目・2枚目（左右2列）
  photo_pair_1:  13,  // 写真ペア3枚目・4枚目（左右2列）
};

// ── タスクブロック定数 ─────────────────────────────────────
const TASK_BLOCK_START = 10; // タスク1の先頭行（1-indexed）
const TASK_BLOCK_SIZE  = 20; // 1タスクあたりの行数（10〜29, 30〜49, ...）

// ══════════════════════════════════════════════════════════════
//  generateA4Excel — メイン関数
//
//  @param rpt           報告書オブジェクト（AdminDashboard の mapReport 結果）
//  @param settings.fileName            出力ファイル名（拡張子なし）
//  @param settings.enabledFields       各フィールドのON/OFF
//                                      { target_place, task_detail, symptom,
//                                        action_taken, has_problem, findings }
//  @param settings.incPhotos           写真セクションを含めるか
//  @param settings.commonFieldEnabled  共通情報フィールドのON/OFF（false で空文字列）
//                                      { date, department, submitter, time, progress }
//  @param settings.enabledTasks        出力対象タスク配列（未指定時は rpt.tasks を使用）
//  @param settings.templateConfig      テンプレート設定オブジェクト（省略時は定数値を使用）
//                                      { commonFields: {key: row}, taskBlock: {startRow, blockSize},
//                                        offsets: {key: offset} }
// ══════════════════════════════════════════════════════════════
export const generateA4Excel = async (rpt, {
  fileName,
  enabledFields,
  incPhotos,
  commonFieldEnabled = {},
  enabledTasks,
  templateConfig = null,
}) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Re-Report';
  wb.created = new Date();
  const ws = wb.addWorksheet('報告書');
  const safeTemplateConfig = normalizeTemplateMapping(templateConfig);

  // 6列均等（左右写真エリアが対称）
  ws.columns = Array.from({ length: 6 }, () => ({ width: 14 }));

  // ── templateConfig から実効値を計算（未指定時はモジュール定数にフォールバック）──
  // commonFields: 共通情報キー → 行番号（テンプレートで上書き可）
  const effectiveCellMap = Object.fromEntries(
    Object.entries(CELL_MAP).map(([k, v]) => [k, {
      label: v.label,
      row:   safeTemplateConfig.commonFields[k] ?? v.row,
    }])
  );
  // taskBlock: 開始行・ブロックサイズ
  const taskStart = safeTemplateConfig.taskBlock.startRow ?? TASK_BLOCK_START;
  const taskSize  = safeTemplateConfig.taskBlock.blockSize ?? TASK_BLOCK_SIZE;
  // offsets: テンプレートの値を OFF のデフォルトにマージ（部分的な上書きを許容）
  const off = { ...OFF, ...safeTemplateConfig.offsets };
  // spacer 行（共通情報の最終行 + 1）
  const spacerRow = Math.max(...Object.values(effectiveCellMap).map(v => v.row)) + 1;

  // ════════════════════════════════════════
  //  行1: タイトル行
  // ════════════════════════════════════════
  try { ws.mergeCells(1, 1, 1, 6); } catch (e) { console.warn('[generateA4Excel] Merge skipped:', e.message); }
  ws.getRow(1).height = 44;
  const tc     = ws.getCell('A1');
  tc.value     = '社内報告書';
  tc.font      = { name: 'メイリオ', bold: true, size: 18, color: { argb: WHITE } };
  tc.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  tc.alignment = { horizontal: 'center', vertical: 'middle' };
  tc.border    = { top: M_NAVY, left: M_NAVY, bottom: M_NAVY, right: M_NAVY };

  // 行2: スペーサー
  ws.getRow(2).height = 6;

  // ════════════════════════════════════════
  //  行3〜8: 共通情報（CELL_MAP で絶対番地に流し込み）
  //  OFF の場合は空文字列を書き込み、行レイアウトを維持する
  // ════════════════════════════════════════

  // 共通情報の値マップ
  const commonValues = {
    date:        rpt.date ?? '',
    department:  rpt.department ?? '',
    submitter:   rpt.submitter || rpt.department || '',
    time:        `${rpt.startTime || '未設定'} ～ ${rpt.endTime || '未設定'}`,
    progress:    rpt.isOnSchedule ? '予定通り' : '遅延あり',
    delayReason: rpt.delayReason || '（記載なし）',
  };

  // 共通情報のスタイルマップ（progress のみ色分け）
  const commonStyles = {
    progress: { bold: !rpt.isOnSchedule, color: rpt.isOnSchedule ? 'FF16A34A' : 'FFDC2626' },
  };

  for (const [key, def] of Object.entries(effectiveCellMap)) {
    const { row, label } = def;
    ws.getRow(row).height = 24;
    try { ws.mergeCells(row, 2, row, 6); } catch (e) { console.warn('[generateA4Excel] Merge skipped:', e.message); }
    lc(ws, `A${row}`, label);

    // フィールドが OFF の場合は空文字列（行は残す）
    // delayReason は progress が ON かつ遅延中のときのみ表示
    let value = '';
    if (commonFieldEnabled[key] !== false) {
      if (key === 'delayReason') {
        value = (commonFieldEnabled.progress !== false && !rpt.isOnSchedule)
          ? commonValues.delayReason
          : '';
      } else {
        value = commonValues[key];
      }
    }
    vc(ws, `B${row}`, value, commonStyles[key] ?? {});
  }

  // 共通情報末尾の次の行をスペーサーとして設定
  ws.getRow(spacerRow).height = 10;

  // ════════════════════════════════════════
  //  タスクブロック（動的ブロック流し込み）
  //  タスクn の先頭行 R = taskStart + (n-1) * taskSize
  // ════════════════════════════════════════
  const tasks = enabledTasks ?? rpt.tasks ?? [];
  for (const [tIdx, task] of tasks.entries()) {
    const R      = taskStart + tIdx * taskSize; // ブロック先頭行
    const gLabel = GENRE_LABELS[task.genre] ?? task.genre;

    // ── ヘッダー行（R + off.header）────────────────────────
    try { ws.mergeCells(R + off.header, 1, R + off.header, 6); } catch (e) { console.warn('[generateA4Excel] Merge skipped:', e.message); }
    ws.getRow(R + off.header).height = 24;
    sectionHeader(ws, `A${R + off.header}`, `■ 作業${tIdx + 1}：${gLabel}`);

    // ── テキストフィールド行（各オフセットに絶対配置）────────
    const fieldDefs = [
      { key: 'target_place', off: off.target_place, label: '担当場所' },
      { key: 'task_detail',  off: off.task_detail,  label: '作業内容' },
      { key: 'symptom',      off: off.symptom,      label: '症　　状' },
      { key: 'action_taken', off: off.action_taken, label: '対応内容' },
    ];

    for (const fd of fieldDefs) {
      const row = R + fd.off;
      ws.getRow(row).height = 24;
      try { ws.mergeCells(row, 2, row, 6); } catch (e) { console.warn('[generateA4Excel] Merge skipped:', e.message); }
      lc(ws, `A${row}`, fd.label);
      // OFFの場合は空文字列（行は残す）
      const val = enabledFields[fd.key] ? (getTaskField(task, fd.key) || '') : '';
      vc(ws, `B${row}`, val);
    }

    // ── 問題/異常の有無（R + off.has_problem）─────────────
    {
      const row  = R + off.has_problem;
      const isIP = ['inspection', 'patrol'].includes(task.genre);
      ws.getRow(row).height = 24;
      try { ws.mergeCells(row, 2, row, 6); } catch (e) { console.warn('[generateA4Excel] Merge skipped:', e.message); }
      lc(ws, `A${row}`, isIP ? '異常の有無' : '問題の有無');

      if (enabledFields.has_problem && task.genre !== 'emergency') {
        const pValue = task.has_problem
          ? (isIP ? '異常あり' : '問題あり')
          : (isIP ? '異常無し' : '問題無し');
        vc(ws, `B${row}`, pValue, {
          bold:  task.has_problem,
          color: task.has_problem ? 'FFDC2626' : 'FF16A34A',
        });
      } else {
        vc(ws, `B${row}`, '');
      }
    }

    // ── 報告内容（findings_hdr + findings_body 4行マージ）──
    {
      const hRow = R + off.findings_hdr;
      const bRow = R + off.findings_body;
      try { ws.mergeCells(hRow, 1, hRow, 6); } catch (e) { console.warn('[generateA4Excel] Merge skipped:', e.message); }
      ws.getRow(hRow).height = 20;
      sectionHeader(ws, `A${hRow}`, '　報告内容');
      // OFFの場合は空文字列（セル結合・スタイルは維持）
      const bodyText = (enabledFields.findings && task.findings) ? task.findings : '';
      mergedContent(ws, bRow, 1, bRow + 3, 6, bodyText);
    }

    // ── 添付写真（photos_hdr + photo_pair_0/1）─────────────
    // ★ 2列配置・アスペクト比維持・高さ制限ロジック（変更厳禁）
    if (incPhotos) {
      const taskPhotos = (task.photos ?? []).map(p => p.photo_url).filter(Boolean).slice(0, 4);

      const pHdrRow = R + off.photos_hdr;
      try { ws.mergeCells(pHdrRow, 1, pHdrRow, 6); } catch (e) { console.warn('[generateA4Excel] Merge skipped:', e.message); }
      ws.getRow(pHdrRow).height = 20;
      sectionHeader(ws, `A${pHdrRow}`, `　添付写真（${taskPhotos.length}枚）`);

      // 2枚ずつペアで処理（最大2ペア = 4枚）
      for (let pi = 0; pi < taskPhotos.length; pi += 2) {
        const pairUrls = taskPhotos.slice(pi, pi + 2);
        const pairRow  = R + off[`photo_pair_${pi / 2}`]; // photo_pair_0 or photo_pair_1

        // バッファ取得 + 自然サイズ取得（並列）
        const pairData = await Promise.all(pairUrls.map(async (url) => {
          try {
            const buf  = await fetchImageBuffer(url);
            const size = await getImageSize(buf);
            return { buf, size, ext: guessExtension(url), ok: true };
          } catch {
            return { ok: false };
          }
        }));

        // 固定幅240px基準、縦長すぎる場合は400pxでキャップ
        const sizes = pairData.map(p => {
          if (!p.ok) return { w: 240, h: 180 };
          let outW = 240;
          let outH = outW * (p.size.h / p.size.w);
          if (outH > 400) {
            outH = 400;
            outW = outH * (p.size.w / p.size.h);
          }
          return { w: outW, h: outH };
        });

        // 2枚のうち高い方に合わせて行高さを設定
        const maxOutH = Math.max(...sizes.map(s => s.h));
        // px → pt 変換（96dpi 基準: 1px = 0.75pt）+ 上下余白 15pt
        ws.getRow(pairRow).height = (maxOutH * 0.75) + 15;

        // セル枠線（左: A-C、右: D-F）
        try { ws.mergeCells(pairRow, 1, pairRow, 3); } catch {/* 既マージ無視 */}
        ws.getCell(`A${pairRow}`).border = { top: T_NAVY, left: M_NAVY, bottom: M_NAVY, right: T_NAVY };
        try { ws.mergeCells(pairRow, 4, pairRow, 6); } catch {/* 既マージ無視 */}
        ws.getCell(`D${pairRow}`).border = { top: T_NAVY, left: T_NAVY, bottom: M_NAVY, right: M_NAVY };

        // 写真を2列に配置（アスペクト比を維持）
        for (let side = 0; side < pairData.length; side++) {
          const p = pairData[side];
          if (p.ok) {
            const imgId = wb.addImage({ buffer: p.buf, extension: p.ext });
            ws.addImage(imgId, {
              tl: { col: side * 3, row: pairRow - 1 },
              ext: { width: sizes[side].w, height: sizes[side].h },
              editAs: 'oneCell',
            });
          } else {
            vc(ws, side === 0 ? `A${pairRow}` : `D${pairRow}`, '[画像読込失敗]', { color: 'FF9CA3AF' });
          }
        }
      }
    }
  }

  // ── A4縦 印刷設定 ─────────────────────────────────────────
  ws.pageSetup = {
    paperSize:   9,
    orientation: 'portrait',
    fitToPage:   true,
    fitToWidth:  1,
    fitToHeight: 0,
    margins: { left: 0.6, right: 0.6, top: 0.7, bottom: 0.7, header: 0.3, footer: 0.3 },
  };

  // ── 出力 ──────────────────────────────────────────────────
  const buffer   = await wb.xlsx.writeBuffer();
  const safeName = (fileName?.trim() || buildA4DefaultFileName(rpt)).replace(/[/\\?*[\]:]/g, '-');
  saveAs(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${safeName}.xlsx`,
  );
};
