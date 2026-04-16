import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet } from 'lucide-react';

// 個別出力 (A4)：専用プレビューページへ遷移
const SingleReportA4Btn = ({ rpt }) => {
  const navigate = useNavigate();

  return (
    <button
      className="btn-contact"
      onClick={() => navigate('/export-preview-a4', { state: { rpt } })}
      title="A4社内報告書をExcelで個別出力"
    >
      <FileSpreadsheet size={13} /> 個別出力 (A4)
    </button>
  );
};

export default SingleReportA4Btn;
