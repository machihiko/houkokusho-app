import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { LogIn, Palette } from 'lucide-react';
import './Login.css';

const Login = () => {
  const { login } = useAuth();
  const { theme, setTheme, themes } = useTheme();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(email, password);
    } catch {
      setError('ログインに失敗しました。メールアドレスとパスワードを確認してください。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="theme-selector glass-panel">
        <div className="theme-header">
          <Palette size={18} /> Theme
        </div>
        <div className="theme-options">
          {themes.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`theme-btn ${theme === t.id ? 'active' : ''}`}
              onClick={() => setTheme(t.id)}
              title={t.name}
            >
              <div className="color-circle" data-color={t.id}></div>
            </button>
          ))}
        </div>
      </div>

      <div className="login-card glass-panel">
        <div className="login-header">
          <h2>現場報告システム</h2>
          <p>ログインして開始してください</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <div className="input-group">
            <label>メールアドレス</label>
            <input
              type="email"
              className="input-field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              required
              autoComplete="email"
              data-gramm="false"
              data-1p-ignore="true"
            />
          </div>

          <div className="input-group">
            <label>パスワード</label>
            <input
              type="password"
              className="input-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              data-gramm="false"
              data-1p-ignore="true"
            />
          </div>

          {error && (
            <p style={{ color: '#dc2626', fontSize: '0.875rem', margin: '0' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary login-submit"
            disabled={isLoading}
          >
            <LogIn size={20} /> {isLoading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
