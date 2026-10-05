import axios from 'axios';

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8080/api';
export const TOKEN_KEY = 'mak-token';
export const UNAUTHORIZED_EVENT = 'mak:unauthorized';

const client = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Tự gắn JWT vào mọi request
client.interceptors.request.use(config => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Token hết hạn: xóa token và báo AuthContext đăng xuất.
// Chỉ xử lý khi request có gửi token, để đăng nhập sai mật khẩu (cũng là 401) không bị ảnh hưởng.
client.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401 && err.config?.headers?.Authorization) {
      localStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    return Promise.reject(err);
  }
);

// Backend trả lỗi bằng tiếng Anh, đổi sang tiếng Việt để hiển thị
const MESSAGES: Record<string, string> = {
  'Invalid email or password': 'Sai tài khoản hoặc mật khẩu.',
  'Invalid credentials': 'Sai tài khoản hoặc mật khẩu.',
  'Email already exists': 'Email này đã được đăng ký.',
  'Phone already exists': 'Số điện thoại này đã được đăng ký.',
  'Your account is blocked': 'Tài khoản của bạn đã bị khóa.',
  'Email is not valid': 'Email không hợp lệ.',
  'Phone is not valid': 'Số điện thoại không hợp lệ.',
  'Password must be at least 6 characters': 'Mật khẩu phải có ít nhất 6 ký tự.',
};

export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) return 'Không kết nối được máy chủ. Vui lòng thử lại.';
    const msg = (err.response.data as { message?: string } | undefined)?.message;
    return (msg && MESSAGES[msg]) || msg || 'Đã có lỗi xảy ra.';
  }
  return err instanceof Error ? err.message : 'Đã có lỗi xảy ra.';
}

export default client;
