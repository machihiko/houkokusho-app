import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet } from 'lucide-react';

// 一括 Excel出力：プレビューページへ遷移
const ExcelExportBtn = ({ reports }) => {
  const navigate = useNavigate();

  const handleClick = () => {
    if (!reports.length) {
      alert('書き出すレポートがありません。');
      return;
    }
    navigate('/export-preview', { state: { targetReports: reports } });
  };

  return (
    <button className="btn btn-primary" onClick={handleClick}>
      <FileSpreadsheet size={16} /> Excel一括出力
    </button>
  );
};

export default ExcelExportBtn;
