import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { TOKEN_KEY, UNAUTHORIZED_EVENT } from '../api/client';
import { authApi, type RegisterInput } from '../api/auth';
import type { User } from '../types';

interface AuthValue {
  user: User | null;
  /** true khi đang kiểm tra token đã lưu lúc mở trang */
  loading: boolean;
  login: (identifier: string, password: string) => Promise<User>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => !!localStorage.getItem(TOKEN_KEY));

  // Mở lại trang: nếu còn token thì lấy thông tin người dùng
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return;
    authApi.getMe()
      .then(setUser)
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  // Axios báo token hết hạn
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const login = async (identifier: string, password: string) => {
    const { token, user } = await authApi.login(identifier, password);
    localStorage.setItem(TOKEN_KEY, token);
    setUser(user);
    return user;
  };
  const register = async (input: RegisterInput) => { await authApi.register(input); };
  const logout = () => { localStorage.removeItem(TOKEN_KEY); setUser(null); };

  return <Ctx.Provider value={{ user, loading, login, register, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used inside AuthProvider');
  return c;
};
