import { createContext, useContext, useState } from 'react';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  // role: 'reporter' | 'admin' | null (not logged in)
  // ページリロード・再起動後もログイン状態を維持するため localStorage を利用
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('re_report_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const login = (role) => {
    const userData = { role, name: role === 'admin' ? '管理者' : '現場担当者' };
    setUser(userData);
    localStorage.setItem('re_report_user', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('re_report_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
