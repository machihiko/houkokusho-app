import React from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { ThemeProvider } from './ThemeContext';
import Login from './components/Login';
import ReporterDashboard from './components/Reporter/ReporterDashboard';
import AdminDashboard from './components/Admin/AdminDashboard';
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
          <AppContent />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
