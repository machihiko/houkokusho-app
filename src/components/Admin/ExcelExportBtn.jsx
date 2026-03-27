import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Download } from 'lucide-react';

const ExcelExportBtn = ({ reports }) => {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = () => {
    if (reports.length === 0) {
      alert('書き出すレポートがありません。');
      return;
    }

    setIsExporting(true);

    try {
      const wb = XLSX.utils.book_new();

      reports.forEach((report, index) => {
        // Layout designed for A4 single sheet printing format 
        const wsData = [
          ['現場報告書'], // A1
          [], // A2 (Empty row)
          ['報告日', report.date, '提出者', report.submitter], // A3
          ['ジャンル', report.genre, '部署', report.department], // A4
          ['問題の有無', report.hasIssue === 'yes' ? 'あり' : 'なし', '進捗遅れ', report.hasDelay === 'yes' ? 'あり' : 'なし'], // A5
          [], // A6
          ['■ 報告内容'], // A7
          [report.content], // A8
          [],
          ['■ 添付写真'],
          [report.hasPhoto ? '※システム上に写真データあり' : '写真なし']
        ];

        // Create sheet
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // Styling (basic widths)
        ws['!cols'] = [{ width: 15 }, { width: 30 }, { width: 15 }, { width: 30 }];
        
        // Add to workbook. Sheet names must be max 31 chars and unique
        const sheetName = `${report.date}_${report.submitter}`.substring(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      });

      // Export file
      XLSX.writeFile(wb, `Reports_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (e) {
      console.error('Excel export failed', e);
      alert('Excelの出力に失敗しました。');
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
