import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { TOKEN_KEY, UNAUTHORIZED_EVENT } from '../api/client';
import { authApi, type RegisterInput } from '../api/auth';
import { usersApi, type ProfileInput } from '../api/users';
import type { User } from '../types';
import { useToast } from './ToastContext';

interface AuthValue {
  user: User | null;
  /** true khi đang kiểm tra token đã lưu lúc mở trang */
  loading: boolean;
  login: (identifier: string, password: string) => Promise<User>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
  updateProfile: (input: ProfileInput) => Promise<User>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const notify = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => !!localStorage.getItem(TOKEN_KEY));
  const userRef = useRef(user);
  userRef.current = user;

  // Mở lại trang: nếu còn token thì lấy thông tin người dùng
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return;
    usersApi.getMe()
      .then(setUser)
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  // Axios báo token hết hạn hoặc tài khoản bị khóa
  useEffect(() => {
    const onUnauthorized = (e: Event) => {
      if (userRef.current) {
        const code = (e as CustomEvent<string>).detail;
        notify(code === 'ACCOUNT_BLOCKED'
          ? 'Tài khoản của bạn đã bị khóa.'
          : 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
      }
      setUser(null);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [notify]);

  const login = async (identifier: string, password: string) => {
    const { token, user } = await authApi.login(identifier, password);
    localStorage.setItem(TOKEN_KEY, token);
    setUser(user);
    return user;
  };
  const register = async (input: RegisterInput) => { await authApi.register(input); };
  const logout = () => { localStorage.removeItem(TOKEN_KEY); setUser(null); };

  const updateProfile = async (input: ProfileInput) => {
    const updated = await usersApi.updateMe(input);
    setUser(updated);
    return updated;
  };

  // Token cũ hết hiệu lực sau khi đổi mật khẩu -> phải lưu token mới
  const changePassword = async (currentPassword: string, newPassword: string) => {
    const token = await authApi.changePassword(currentPassword, newPassword);
    localStorage.setItem(TOKEN_KEY, token);
  };

  return (
    <Ctx.Provider value={{ user, loading, login, register, logout, updateProfile, changePassword }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used inside AuthProvider');
  return c;
};
