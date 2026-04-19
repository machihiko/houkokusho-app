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
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p>読み込み中...</p>
      </div>
    );
  }

  if (!user) return <Login />;

  // role: 'super_admin' | 'admin' → 管理ダッシュボード
  // role: 'user' → 報告書作成画面
  return (user.role === 'admin' || user.role === 'super_admin')
    ? <AdminDashboard />
    : <ReporterDashboard />;
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
