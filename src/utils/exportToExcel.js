import ExcelJS from 'exceljs';

const DEPARTMENT_LABELS = {
  shinjuku_cleaning: '新宿ビル 定期清掃案件',
  iruma_ac:          '入間パーク 空調保守・点検',
  tower_patrol:      '〇〇タワー 巡回警備業務',
};

const GENRE_LABELS = {
  cleaning: '清掃',
  inspection: '点検',
  repair: '修理',
};

// ── 列構成 ───────────────────────────────────
// A(16) + B(17) + C(17) + D(17) = 合計67文字幅
// 基本情報: A=見出し, B:D結合=値
// 写真枠:   A:B結合=左写真(33文字幅), C:D結合=右写真(34文字幅)
const COL_A = 16;
const COL_BCD = 17; // B, C, D は均等

// 写真枠サイズ（px）
// A:B 結合幅 ≈ (16+17)*9 = 297px → FRAME_W は余白を引いて 270px
const FRAME_W = 268;
const FRAME_H = 195;
// 写真行の高さ（pt）
const PHOTO_ROW_PT = 148;
// ラベル行の高さ（pt）
const LABEL_ROW_PT = 16;
// センタリング計算用
const MERGED_COL_PX = (COL_A + COL_BCD) * 9; // A:B or C:D の合計幅(px)
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

  // 4列構成
  sheet.columns = [
    { key: 'a', width: COL_A   },  // A: 見出し
    { key: 'b', width: COL_BCD },  // B: 値左 / 左写真右半
    { key: 'c', width: COL_BCD },  // C: 値右 / 右写真左半
    { key: 'd', width: COL_BCD },  // D: 値右 / 右写真右半
  ];

  // ── タイトル行（A:D 結合）──────────────────
  sheet.mergeCells('A1:D1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = '現場報告書';
  styleCell(titleCell, { bold: true, size: 18, color: 'FFFFFF', bgColor: '1E3A5F', align: 'center' });
  sheet.getRow(1).height = 42;

  // ── 出力日時（A:D 結合）────────────────────
  sheet.mergeCells('A2:D2');
  const now = new Date();
  const dateCell = sheet.getCell('A2');
  dateCell.value = `出力日時：${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  styleCell(dateCell, { size: 10, color: '666666', bgColor: 'F0F4F8', align: 'right' });
  sheet.getRow(2).height = 20;

  // ── 基本情報ヘッダー（A:D 結合）────────────
  sheet.mergeCells('A3:D3');
  const infoHeader = sheet.getCell('A3');
  infoHeader.value = '■ 基本情報';
  styleCell(infoHeader, { bold: true, size: 12, color: 'FFFFFF', bgColor: '2563EB' });
  sheet.getRow(3).height = 28;

  // 基本情報行: A=見出し, B:D 結合=値
  const infoRows = [
    ['ジャンル', GENRE_LABELS[data.genre] || data.genre],
    ['案件名', DEPARTMENT_LABELS[data.department] || data.department || '未選択'],
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

    // A列: 見出し
    const lCell = sheet.getCell(`A${rowNum}`);
    lCell.value = label;
    styleCell(lCell, { bold: true, size: 11, color: '1E3A5F', bgColor: bg, border: true });

    // B:D 結合: 値
    sheet.mergeCells(`B${rowNum}:D${rowNum}`);
    const vCell = sheet.getCell(`B${rowNum}`);
    vCell.value = value;
    styleCell(vCell, { size: 11, bgColor: bg, border: true, wrap: true });
  });

  const contentStartRow = 4 + infoRows.length;

  // ── 報告内容ヘッダー（A:D 結合）────────────
  sheet.mergeCells(`A${contentStartRow}:D${contentStartRow}`);
  const contentHeader = sheet.getCell(`A${contentStartRow}`);
  contentHeader.value = '■ 報告内容';
  styleCell(contentHeader, { bold: true, size: 12, color: 'FFFFFF', bgColor: '2563EB' });
  sheet.getRow(contentStartRow).height = 28;

  // 報告内容テキスト（A:D 結合）
  const contentRow = contentStartRow + 1;
  sheet.mergeCells(`A${contentRow}:D${contentRow}`);
  const contentCell = sheet.getCell(`A${contentRow}`);
  contentCell.value = data.content;
  styleCell(contentCell, { size: 11, wrap: true, border: true, bgColor: 'FAFAFA' });
  const lineCount = (data.content.match(/\n/g) || []).length + 1;
  sheet.getRow(contentRow).height = Math.max(80, lineCount * 18);

  // ── 写真セクション ──────────────────────────
  const photos = data.photos || [];
  const photoCount = photos.length;
  const totalSlots = Math.max(2, Math.ceil(photoCount / 2) * 2);
  const totalPhotoRows = totalSlots / 2;

  // 写真ヘッダー（A:D 結合）
  const photoSectionHeaderRow = contentRow + 1;
  sheet.mergeCells(`A${photoSectionHeaderRow}:D${photoSectionHeaderRow}`);
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

    // 左枠（A:B 結合）と右枠（C:D 結合）
    const slots = [
      { labelMerge: `A${labelRowNum}:B${labelRowNum}`, photoMerge: `A${photoRowNum}:B${photoRowNum}`, colIndex: 0 },
      { labelMerge: `C${labelRowNum}:D${labelRowNum}`, photoMerge: `C${photoRowNum}:D${photoRowNum}`, colIndex: 2 },
    ];

    for (const slot of slots) {
      const slotNum = rowIdx * 2 + slots.indexOf(slot) + 1;

      // ラベル行（結合）
      sheet.mergeCells(slot.labelMerge);
      const lCell = sheet.getCell(slot.labelMerge.split(':')[0]);
      lCell.value = `写真 ${slotNum}`;
      styleCell(lCell, { bold: true, size: 10, color: '444444', bgColor: 'E8F0FE', border: true, align: 'center' });

      // 写真行（結合）
      sheet.mergeCells(slot.photoMerge);
      const pCell = sheet.getCell(slot.photoMerge.split(':')[0]);

      const photo = photos[photoIndex];
      if (photo) {
        try {
          const res = await fetch(photo.url);
          const buffer = await res.arrayBuffer();
          const uint8 = new Uint8Array(buffer);

          let extension = 'jpeg';
          if (uint8[0] === 0x89 && uint8[1] === 0x50) extension = 'png';

          const { w: imgW, h: imgH } = await getImageDimensions(photo.url);
          const scale = Math.min(FRAME_W / imgW, FRAME_H / imgH);
          const dispW = Math.round(imgW * scale);
          const dispH = Math.round(imgH * scale);

          // 結合セル内でセンタリング
          const fracColOffset = Math.max(0, (MERGED_COL_PX - dispW) / 2 / MERGED_COL_PX);
          const fracRowOffset = Math.max(0, (ROW_PX - dispH) / 2 / ROW_PX);

          const imageId = workbook.addImage({ buffer, extension });
          sheet.addImage(imageId, {
            tl: {
              col: slot.colIndex + fracColOffset,
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

  // ── フッター（A:D 結合）────────────────────
  const footerRowNum = currentRow;
  sheet.mergeCells(`A${footerRowNum}:D${footerRowNum}`);
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
