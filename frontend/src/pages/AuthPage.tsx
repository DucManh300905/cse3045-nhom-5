import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { getErrorMessage } from '../api/client';
import { LogoMark } from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { EMAIL_REGEX, PHONE_REGEX } from '../utils/format';

type Mode = 'login' | 'register';
type Method = 'email' | 'phone';

export default function AuthPage() {
  const { user, loading, login, register, logout } = useAuth();
  const notify = useToast();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/menu';

  const [mode, setMode] = useState<Mode>('login');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Đăng nhập
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  // Đăng ký
  const [method, setMethod] = useState<Method>('email');
  const [reg, setReg] = useState({ fullName: '', email: '', phone: '', password: '', confirm: '' });
  const setField = (k: keyof typeof reg, v: string) => setReg(r => ({ ...r, [k]: v }));

  if (loading) return <div className="page-loading">Đang tải...</div>;
  if (user?.role === 'CUSTOMER') return <Navigate to={from} replace />;

  const switchMode = (m: Mode) => { setMode(m); setError(''); };

  /** Đăng nhập rồi kiểm tra đúng là tài khoản khách hàng */
  const signIn = async (id: string, pw: string) => {
    const u = await login(id, pw);
    if (u.role !== 'CUSTOMER') {
      logout();
      throw new Error('Tài khoản này không phải tài khoản khách hàng.');
    }
    return u;
  };

  const submitLogin = async (e: FormEvent) => {
    e.preventDefault();
    const id = identifier.trim();
    if (!id || !password) return setError('Vui lòng nhập email/số điện thoại và mật khẩu.');
    setError('');
    setSubmitting(true);
    try {
      const u = await signIn(id, password);
      notify(`Chào mừng ${u.fullName} quay lại!`);
    } catch (err) {
      setError(getErrorMessage(err));
      setSubmitting(false);
    }
  };

  const submitRegister = async (e: FormEvent) => {
    e.preventDefault();
    const fullName = reg.fullName.trim();
    const email = reg.email.trim().toLowerCase();
    const phone = reg.phone.trim();

    if (!fullName) return setError('Vui lòng nhập họ và tên.');
    if (method === 'email' && !EMAIL_REGEX.test(email)) return setError('Email không hợp lệ.');
    if (method === 'phone' && !PHONE_REGEX.test(phone)) return setError('Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.');
    if (reg.password.length < 6) return setError('Mật khẩu phải có ít nhất 6 ký tự.');
    if (reg.password !== reg.confirm) return setError('Mật khẩu xác nhận không khớp.');

    setError('');
    setSubmitting(true);
    try {
      const contact = method === 'email' ? { email } : { phone };
      await register({ fullName, password: reg.password, ...contact });
      await signIn(method === 'email' ? email : phone, reg.password); // đăng nhập luôn sau khi đăng ký
      notify('Tạo tài khoản thành công. Chào mừng bạn đến MAK!');
    } catch (err) {
      setError(getErrorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link to="/" className="auth-logo" aria-label="Về trang chủ">
          <LogoMark size={128} />
        </Link>

        <section className="auth-form-side">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>Đăng nhập</button>
            <button role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>Tạo tài khoản</button>
          </div>

          {mode === 'login' ? (
            <form className="auth-form" onSubmit={submitLogin} noValidate>
              <h1>Chào bạn quay lại</h1>
              {from === '/checkout' && <p className="auth-hint">Đăng nhập để hoàn tất đơn hàng của bạn.</p>}
              <label>
                <span>Email hoặc số điện thoại</span>
                <input value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="vd: ban@gmail.com hoặc 0912345678" autoComplete="username" autoFocus />
              </label>
              <label>
                <span>Mật khẩu</span>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mật khẩu của bạn" autoComplete="current-password" />
              </label>
              {error && <div className="form-error" role="alert">{error}</div>}
              <button className="btn-primary wide" type="submit" disabled={submitting}>
                {submitting ? 'Đang đăng nhập...' : 'Đăng nhập →'}
              </button>
              <p className="auth-switch">Chưa có tài khoản? <button type="button" onClick={() => switchMode('register')}>Tạo tài khoản</button></p>
            </form>
          ) : (
            <form className="auth-form" onSubmit={submitRegister} noValidate>
              <h1>Tạo tài khoản khách hàng</h1>
              <label>
                <span>Họ và tên</span>
                <input value={reg.fullName} onChange={e => setField('fullName', e.target.value)} placeholder="Nguyễn Văn A" autoComplete="name" autoFocus />
              </label>

              <div className="field">
                <span>Đăng ký bằng</span>
                <div className="segmented">
                  <button type="button" className={method === 'email' ? 'active' : ''} onClick={() => { setMethod('email'); setError(''); }}>Email</button>
                  <button type="button" className={method === 'phone' ? 'active' : ''} onClick={() => { setMethod('phone'); setError(''); }}>Số điện thoại</button>
                </div>
              </div>

              {method === 'email' ? (
                <label>
                  <span>Email</span>
                  <input type="email" value={reg.email} onChange={e => setField('email', e.target.value)} placeholder="ban@gmail.com" autoComplete="email" />
                </label>
              ) : (
                <label>
                  <span>Số điện thoại</span>
                  <input type="tel" inputMode="numeric" value={reg.phone} onChange={e => setField('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="0912345678" autoComplete="tel" />
                </label>
              )}

              <div className="form-grid">
                <label>
                  <span>Mật khẩu</span>
                  <input type="password" value={reg.password} onChange={e => setField('password', e.target.value)} placeholder="Ít nhất 6 ký tự" autoComplete="new-password" />
                </label>
                <label>
                  <span>Xác nhận mật khẩu</span>
                  <input type="password" value={reg.confirm} onChange={e => setField('confirm', e.target.value)} placeholder="Nhập lại mật khẩu" autoComplete="new-password" />
                </label>
              </div>

              {error && <div className="form-error" role="alert">{error}</div>}
              <button className="btn-primary wide" type="submit" disabled={submitting}>
                {submitting ? 'Đang tạo tài khoản...' : 'Tạo tài khoản →'}
              </button>
              <p className="auth-switch">Đã có tài khoản? <button type="button" onClick={() => switchMode('login')}>Đăng nhập</button></p>
            </form>
          )}

          <Link to="/menu" className="back-link">← Quay lại thực đơn</Link>
        </section>
      </div>

      <p className="auth-foot">Dự án học tập của sinh viên Trường Đại học Việt Nhật – VNU</p>
    </main>
  );
}
