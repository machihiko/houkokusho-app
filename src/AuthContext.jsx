import { useState, useEffect, useCallback } from 'react';
import AuthContext from './auth-context';
import { supabase } from './utils/supabaseClient';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  // 初回セッション確認中はローディング状態
  const [loading, setLoading] = useState(true);

  // Supabase Auth ユーザーから profiles を取得して user state をセット
  const fetchAndSetUser = useCallback(async (authUser) => {
    if (!authUser) {
      setUser(null);
      localStorage.removeItem('re_report_user');
      return;
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, role, company_id')
      .eq('id', authUser.id)
      .single();
    const userData = {
      id:        authUser.id,
      role:      profile?.role      ?? 'user',
      name:      profile?.display_name ?? authUser.email,
      companyId: profile?.company_id   ?? null,
    };
    setUser(userData);
    localStorage.setItem('re_report_user', JSON.stringify(userData));
  }, []);

  useEffect(() => {
    // ページリロード時に既存セッションを確認
    supabase.auth.getSession().then(({ data: { session } }) => {
      fetchAndSetUser(session?.user ?? null).finally(() => setLoading(false));
    });

    // サインアウトイベントを監視して state をクリア
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === 'SIGNED_OUT') {
          setUser(null);
          localStorage.removeItem('re_report_user');
        }
      }
    );
    return () => subscription.unsubscribe();
  }, [fetchAndSetUser]);

  // メールアドレス + パスワードでログイン
  const login = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const { data: { session } } = await supabase.auth.getSession();
    await fetchAndSetUser(session?.user ?? null);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    localStorage.removeItem('re_report_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
