import ExcelJS from 'exceljs';

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

// ── 定数 ────────────────────────────────────
// 列幅（均等2列構成）
const COL_A_WIDTH = 36; // A列: ラベル / 左写真
const COL_B_WIDTH = 36; // B列: 値    / 右写真

// 写真枠サイズ（px）
// 列幅 36 chars × ~9px ≈ 324px → 余白を引いて 300px
const FRAME_W = 296;
const FRAME_H = 200;
// 写真行の高さ（pt）: 200px / (96/72) ≈ 150pt
const PHOTO_ROW_PT = 150;
// ラベル行の高さ（pt）
const LABEL_ROW_PT = 16;

// 列幅→ピクセル換算（センタリング用）
const COL_PX = COL_A_WIDTH * 9;
const ROW_PX = PHOTO_ROW_PT * 96 / 72;

// ── ヘルパー ─────────────────────────────────
function styleCell(cell, {
  bold = false, size = 11, color = '000000', bgColor = null,
  align = 'left', vAlign = 'middle', wrap = false, border = false,
} = {}) {
  cell.font = { bold, size, color: { argb: 'FF' + color } };
  cell.alignment = { horizontal: align, vertical: vAlign, wrapText: wrap };
  if (bgColor) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgColor } };
  }
  if (border) {
    const b = { style: 'thin', color: { argb: 'FFBDBDBD' } };
    cell.border = { top: b, left: b, bottom: b, right: b };
  }
}

// BlobURLから画像の自然サイズを取得
function getImageDimensions(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 800, h: 600 });
    img.src = url;
  });
}

// ── メイン ──────────────────────────────────
export async function exportToExcel(data) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Re-Report';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('現場報告書', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true },
  });

  // 均等2列構成: A=ラベル/左写真, B=値/右写真
  sheet.columns = [
    { key: 'a', width: COL_A_WIDTH },
    { key: 'b', width: COL_B_WIDTH },
  ];

  // ── タイトル行 ──────────────────────────────
  sheet.mergeCells('A1:B1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = '現場報告書';
  styleCell(titleCell, { bold: true, size: 18, color: 'FFFFFF', bgColor: '1E3A5F', align: 'center' });
  sheet.getRow(1).height = 42;

  // ── 出力日時 ────────────────────────────────
  sheet.mergeCells('A2:B2');
  const now = new Date();
  const dateCell = sheet.getCell('A2');
  dateCell.value = `出力日時：${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  styleCell(dateCell, { size: 10, color: '666666', bgColor: 'F0F4F8', align: 'right' });
  sheet.getRow(2).height = 20;

  // ── 基本情報ヘッダー ────────────────────────
  sheet.mergeCells('A3:B3');
  const infoHeader = sheet.getCell('A3');
  infoHeader.value = '■ 基本情報';
  styleCell(infoHeader, { bold: true, size: 12, color: 'FFFFFF', bgColor: '2563EB' });
  sheet.getRow(3).height = 28;

  // 基本情報行 (A=ラベル, B=値)
  const infoRows = [
    ['ジャンル', GENRE_LABELS[data.genre] || data.genre],
    ['部署', DEPARTMENT_LABELS[data.department] || data.department || '未選択'],
    ['作業日', data.date],
    ['問題の有無', data.hasIssue === 'yes' ? '有り' : '無し'],
  ];
  if (data.hasIssue === 'yes' && data.issueDetail) {
    infoRows.push(['問題の詳細', data.issueDetail]);
  }
  if (data.genre !== 'cleaning') {
    infoRows.push(['進捗の遅れ', data.hasDelay === 'yes' ? '有り' : '無し']);
  }

  infoRows.forEach(([label, value], i) => {
    const rowNum = 4 + i;
    const isMultiline = label === '問題の詳細';
    sheet.getRow(rowNum).height = isMultiline ? 48 : 24;
    const bg = i % 2 === 0 ? 'EFF6FF' : 'FFFFFF';

    const lCell = sheet.getCell(`A${rowNum}`);
    lCell.value = label;
    styleCell(lCell, { bold: true, size: 11, color: '1E3A5F', bgColor: bg, border: true });

    const vCell = sheet.getCell(`B${rowNum}`);
    vCell.value = value;
    styleCell(vCell, { size: 11, bgColor: bg, border: true, wrap: true });
  });

  const contentStartRow = 4 + infoRows.length;

  // ── 報告内容ヘッダー ────────────────────────
  sheet.mergeCells(`A${contentStartRow}:B${contentStartRow}`);
  const contentHeader = sheet.getCell(`A${contentStartRow}`);
  contentHeader.value = '■ 報告内容';
  styleCell(contentHeader, { bold: true, size: 12, color: 'FFFFFF', bgColor: '2563EB' });
  sheet.getRow(contentStartRow).height = 28;

  // 報告内容テキスト（A:B マージ）
  const contentRow = contentStartRow + 1;
  sheet.mergeCells(`A${contentRow}:B${contentRow}`);
  const contentCell = sheet.getCell(`A${contentRow}`);
  contentCell.value = data.content;
  styleCell(contentCell, { size: 11, wrap: true, border: true, bgColor: 'FAFAFA' });
  const lineCount = (data.content.match(/\n/g) || []).length + 1;
  sheet.getRow(contentRow).height = Math.max(80, lineCount * 18);

  // ── 写真セクション ──────────────────────────
  // 基本2枠（空欄でも表示）、3枚以上なら行を追加
  const photos = data.photos || [];
  const photoCount = photos.length;
  const totalSlots = Math.max(2, Math.ceil(photoCount / 2) * 2);
  const totalPhotoRows = totalSlots / 2;

  // 写真セクションヘッダー（A:B マージ → 基本情報と同幅）
  const photoSectionHeaderRow = contentRow + 1;
  sheet.mergeCells(`A${photoSectionHeaderRow}:B${photoSectionHeaderRow}`);
  const photoHeader = sheet.getCell(`A${photoSectionHeaderRow}`);
  photoHeader.value = `■ 添付写真（${photoCount}枚）`;
  styleCell(photoHeader, { bold: true, size: 12, color: 'FFFFFF', bgColor: '2563EB' });
  sheet.getRow(photoSectionHeaderRow).height = 28;

  let photoIndex = 0;
  let currentRow = photoSectionHeaderRow + 1;

  for (let rowIdx = 0; rowIdx < totalPhotoRows; rowIdx++) {
    const labelRowNum = currentRow;
    const photoRowNum = currentRow + 1;

    sheet.getRow(labelRowNum).height = LABEL_ROW_PT;
    sheet.getRow(photoRowNum).height = PHOTO_ROW_PT;

    // 左（A列=colIndex 0）と右（B列=colIndex 1）の2枠
    for (let slotIdx = 0; slotIdx < 2; slotIdx++) {
      const colChar = slotIdx === 0 ? 'A' : 'B';
      const colIndex = slotIdx; // 0=A, 1=B
      const slotNum = rowIdx * 2 + slotIdx + 1;

      // ラベルセル
      const lCell = sheet.getCell(`${colChar}${labelRowNum}`);
      lCell.value = `写真 ${slotNum}`;
      styleCell(lCell, { bold: true, size: 10, color: '444444', bgColor: 'E8F0FE', border: true, align: 'center' });

      // 写真セル
      const pCell = sheet.getCell(`${colChar}${photoRowNum}`);

      const photo = photos[photoIndex];
      if (photo) {
        try {
          const res = await fetch(photo.url);
          const buffer = await res.arrayBuffer();
          const uint8 = new Uint8Array(buffer);

          // 画像形式を先頭バイトで判定
          let extension = 'jpeg';
          if (uint8[0] === 0x89 && uint8[1] === 0x50) extension = 'png';

          // 画像の自然サイズ取得
          const { w: imgW, h: imgH } = await getImageDimensions(photo.url);

          // アスペクト比を維持して枠内に収まるスケールを計算
          const scale = Math.min(FRAME_W / imgW, FRAME_H / imgH);
          const dispW = Math.round(imgW * scale);
          const dispH = Math.round(imgH * scale);

          // 枠内でセンタリングするオフセット（分数列・行単位）
          const fracColOffset = Math.max(0, (COL_PX - dispW) / 2 / COL_PX);
          const fracRowOffset = Math.max(0, (ROW_PX - dispH) / 2 / ROW_PX);

          const imageId = workbook.addImage({ buffer, extension });
          sheet.addImage(imageId, {
            tl: {
              col: colIndex + fracColOffset,
              row: photoRowNum - 1 + fracRowOffset,
            },
            ext: { width: dispW, height: dispH },
          });

          styleCell(pCell, { border: true, bgColor: 'FAFAFA' });
          photoIndex++;
        } catch (e) {
          console.warn(`写真 ${slotNum} の埋め込みに失敗しました:`, e);
          styleCell(pCell, { border: true, bgColor: 'FEF2F2', color: 'DC2626', align: 'center', vAlign: 'middle' });
          pCell.value = '（読み込み失敗）';
        }
      } else {
        // 空枠
        styleCell(pCell, { border: true, bgColor: 'F8FAFC', color: 'BBBBBB', align: 'center', vAlign: 'middle' });
        pCell.value = '（写真なし）';
        pCell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    }

    currentRow += 2;
  }

  // ── フッター ────────────────────────────────
  const footerRowNum = currentRow;
  sheet.mergeCells(`A${footerRowNum}:B${footerRowNum}`);
  const footerCell = sheet.getCell(`A${footerRowNum}`);
  footerCell.value = '※ このファイルは Re-Report により自動生成されました';
  styleCell(footerCell, { size: 9, color: 'AAAAAA', bgColor: 'F9F9F9', align: 'right' });
  sheet.getRow(footerRowNum).height = 18;

  // ── ダウンロード ────────────────────────────
  const buf = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `現場報告書_${data.date}_${DEPARTMENT_LABELS[data.department] || data.department || '未選択'}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
