import React, { useState } from 'react';
import { useAuth } from '../AuthContext';
import { useTheme } from '../ThemeContext';
import { ShieldAlert, User, LogIn, Palette } from 'lucide-react';
import './Login.css';

const Login = () => {
  const { login } = useAuth();
  const { theme, setTheme, themes } = useTheme();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState('reporter'); // 'reporter' or 'admin'

  const handleLogin = (e) => {
    e.preventDefault();
    login(selectedRole);
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
          <div className="role-toggle">
            <button
              type="button"
              className={`role-btn ${selectedRole === 'reporter' ? 'active' : ''}`}
              onClick={() => setSelectedRole('reporter')}
            >
              <User size={18} /> 報告者
            </button>
            <button
              type="button"
              className={`role-btn ${selectedRole === 'admin' ? 'active' : ''}`}
              onClick={() => setSelectedRole('admin')}
            >
              <ShieldAlert size={18} /> 管理者
            </button>
          </div>

          <div className="input-group">
            <label>ユーザーID</label>
            <input
              type="text"
              className="input-field"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="user123"
              required
              data-gramm="false"
              data-gramm_editor="false"
              data-enable-grammarly="false"
              autoComplete="off"
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
              data-gramm="false"
              data-gramm_editor="false"
              data-enable-grammarly="false"
              autoComplete="new-password"
              data-1p-ignore="true"
            />
          </div>

          <button type="submit" className="btn btn-primary login-submit">
            <LogIn size={20} /> ログイン
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
