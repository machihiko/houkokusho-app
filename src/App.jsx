import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { ThemeProvider } from './ThemeContext';
import { useAuth } from './hooks/useAuth';
import Login from './components/Login';
import ReporterDashboard from './components/Reporter/ReporterDashboard';
import AdminDashboard from './components/Admin/AdminDashboard';
import ExportPreviewPage from './components/Admin/ExportPreviewPage';
import SingleExportPreviewPage from './components/Admin/SingleExportPreviewPage';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

const AppContent = () => {
  const { user } = useAuth();

  if (!user) {
    return <Login />;
  }

  return user.role === 'admin' ? <AdminDashboard /> : <ReporterDashboard />;
};

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              {/* 一括 Excel 出力プレビュー（管理者のみ）*/}
              <Route path="/export-preview" element={<ExportPreviewPage />} />
              {/* 個別 A4 出力プレビュー（管理者のみ）*/}
              <Route path="/export-preview-a4" element={<SingleExportPreviewPage />} />
              {/* メインアプリ（認証ベースのルーティング）*/}
              <Route path="*" element={<AppContent />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
