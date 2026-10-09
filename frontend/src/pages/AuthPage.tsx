import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { authApi } from '../api/auth';
import { getErrorCode, getErrorMessage } from '../api/client';
import { LogoMark } from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { Role } from '../types';
import { EMAIL_REGEX, PHONE_REGEX } from '../utils/format';

type Mode = 'login' | 'register' | 'forgot';
type Method = 'email' | 'phone';

/** Khách hàng (/login), chủ quán (/owner/login), quản trị (/admin/login) — cùng form, khác vai trò */
const PORTALS = {
  customer: {
    role: 'CUSTOMER' as Role, home: '/menu', back: { to: '/menu', label: '← Quay lại thực đơn' },
    registerTitle: 'Tạo tài khoản khách hàng', wrongRole: 'Tài khoản này không phải tài khoản khách hàng.',
    loginTitle: 'Chào bạn quay lại', canRegister: true,
  },
  owner: {
    role: 'RESTAURANT_OWNER' as Role, home: '/owner', back: { to: '/', label: '← Về trang chủ' },
    registerTitle: 'Tạo tài khoản chủ quán', wrongRole: 'Tài khoản này không phải tài khoản chủ quán.',
    loginTitle: 'Kênh chủ quán', canRegister: true,
  },
  // Tài khoản admin tạo bằng `npm run seed:admin`, không tự đăng ký được
  admin: {
    role: 'ADMIN' as Role, home: '/admin', back: { to: '/', label: '← Về trang chủ' },
    registerTitle: '', wrongRole: 'Tài khoản này không phải tài khoản quản trị viên.',
    loginTitle: 'Trang quản trị', canRegister: false,
  },
};

export default function AuthPage({ portal = 'customer' }: { portal?: keyof typeof PORTALS }) {
  const cfg = PORTALS[portal];
  const { user, loading, login, register, logout } = useAuth();
  const notify = useToast();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || cfg.home;

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

  // Bước 2 khi đăng ký bằng email: nhập mã OTP 6 số
  const [otpStep, setOtpStep] = useState(false);

  // Quên mật khẩu: bước 1 nhập email, bước 2 nhập mã + mật khẩu mới
  const [fp, setFp] = useState({ email: '', code: '', password: '', confirm: '' });
  const [fpCodeStep, setFpCodeStep] = useState(false);
  const setFpField = (k: keyof typeof fp, v: string) => setFp(f => ({ ...f, [k]: v }));
  const [otpCode, setOtpCode] = useState('');
  const [resendIn, setResendIn] = useState(0);
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  if (loading) return <div className="page-loading">Đang tải...</div>;
  if (user?.role === cfg.role) return <Navigate to={from} replace />;

  const switchMode = (m: Mode) => { setMode(m); setError(''); setOtpStep(false); setFpCodeStep(false); };

  /** Mở "Quên mật khẩu", điền sẵn email nếu ô đăng nhập đang là email */
  const openForgot = () => {
    const id = identifier.trim().toLowerCase();
    setFp({ email: EMAIL_REGEX.test(id) ? id : '', code: '', password: '', confirm: '' });
    switchMode('forgot');
  };

  /** Gửi (lại) mã đặt lại mật khẩu */
  const requestReset = async (e?: FormEvent) => {
    e?.preventDefault();
    const email = fp.email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) return setError('Email không hợp lệ.');
    setError('');
    setSubmitting(true);
    try {
      const { resendInSeconds } = await authApi.forgotPassword(email);
      setFpCodeStep(true);
      setFpField('code', '');
      setResendIn(resendInSeconds);
    } catch (err) {
      if (getErrorCode(err) === 'OTP_TOO_SOON') setFpCodeStep(true);
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const submitReset = async (e: FormEvent) => {
    e.preventDefault();
    const email = fp.email.trim().toLowerCase();
    if (!/^\d{6}$/.test(fp.code)) return setError('Mã xác thực gồm 6 chữ số.');
    if (fp.password.length < 8) return setError('Mật khẩu mới phải có ít nhất 8 ký tự.');
    if (fp.password !== fp.confirm) return setError('Mật khẩu xác nhận không khớp.');
    setError('');
    setSubmitting(true);
    try {
      await authApi.resetPassword(email, fp.code, fp.password);
      notify('Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.');
      setIdentifier(email);
      setPassword('');
      switchMode('login');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  /** Đăng nhập rồi kiểm tra đúng vai trò của cổng này */
  const signIn = async (id: string, pw: string) => {
    const u = await login(id, pw);
    if (u.role !== cfg.role) {
      logout();
      throw new Error(cfg.wrongRole);
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
    if (reg.password.length < 8) return setError('Mật khẩu phải có ít nhất 8 ký tự.');
    if (reg.password !== reg.confirm) return setError('Mật khẩu xác nhận không khớp.');

    setError('');
    // Email: gửi mã OTP trước, tạo tài khoản sau khi nhập đúng mã
    if (method === 'email') return requestOtp(email);
    await createAccount({ phone });
  };

  /** Gửi (lại) mã tới email, chuyển sang bước nhập mã */
  const requestOtp = async (email: string) => {
    setSubmitting(true);
    try {
      const { resendInSeconds } = await authApi.sendOtp(email);
      setOtpStep(true);
      setOtpCode('');
      setResendIn(resendInSeconds);
      setError('');
      notify(`Đã gửi mã xác thực tới ${email}`);
    } catch (err) {
      // Đang trong 60 giây chờ: vẫn cho nhập mã đã gửi trước đó
      if (getErrorCode(err) === 'OTP_TOO_SOON') setOtpStep(true);
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  /** Tạo tài khoản rồi đăng nhập luôn */
  const createAccount = async (contact: { email: string; verificationToken: string } | { phone: string }) => {
    setSubmitting(true);
    try {
      await register({ fullName: reg.fullName.trim(), password: reg.password, role: cfg.role as 'CUSTOMER' | 'RESTAURANT_OWNER', ...contact });
      await signIn('email' in contact ? contact.email : contact.phone, reg.password);
      notify(portal === 'owner' ? 'Tạo tài khoản thành công. Hãy tạo hồ sơ quán của bạn!' : 'Tạo tài khoản thành công. Chào mừng bạn đến MAK!');
    } catch (err) {
      setError(getErrorMessage(err));
      setSubmitting(false);
    }
  };

  const submitOtp = async (e: FormEvent) => {
    e.preventDefault();
    const email = reg.email.trim().toLowerCase();
    if (!/^\d{6}$/.test(otpCode)) return setError('Mã xác thực gồm 6 chữ số.');
    setError('');
    setSubmitting(true);
    try {
      const verificationToken = await authApi.verifyOtp(email, otpCode);
      await createAccount({ email, verificationToken });
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
          {cfg.canRegister && mode !== 'forgot' && <div className="tabs" role="tablist">
            <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>Đăng nhập</button>
            <button role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>Tạo tài khoản</button>
          </div>}

          {mode === 'login' ? (
            <form className="auth-form" onSubmit={submitLogin} noValidate>
              <h1>{cfg.loginTitle}</h1>
              {from === '/checkout' && <p className="auth-hint">Đăng nhập để hoàn tất đơn hàng của bạn.</p>}
              <label>
                <span>Email hoặc số điện thoại</span>
                <input value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="vd: ban@gmail.com hoặc 0912345678" autoComplete="username" autoFocus />
              </label>
              <label>
                <span>Mật khẩu</span>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mật khẩu của bạn" autoComplete="current-password" />
              </label>
              <button type="button" className="link-btn forgot-link" onClick={openForgot}>Quên mật khẩu?</button>
              {error && <div className="form-error" role="alert">{error}</div>}
              <button className="btn-primary wide" type="submit" disabled={submitting}>
                {submitting ? 'Đang đăng nhập...' : 'Đăng nhập →'}
              </button>
              {cfg.canRegister && <p className="auth-switch">Chưa có tài khoản? <button type="button" onClick={() => switchMode('register')}>Tạo tài khoản</button></p>}
            </form>
          ) : mode === 'forgot' ? (
            !fpCodeStep ? (
              <form className="auth-form" onSubmit={requestReset} noValidate>
                <h1>Quên mật khẩu</h1>
                <p className="auth-hint">Nhập email đã đăng ký. Chúng tôi sẽ gửi mã 6 số để bạn đặt mật khẩu mới.</p>
                <label>
                  <span>Email</span>
                  <input type="email" value={fp.email} onChange={e => setFpField('email', e.target.value)} placeholder="ban@gmail.com" autoComplete="email" autoFocus />
                </label>
                {error && <div className="form-error" role="alert">{error}</div>}
                <button className="btn-primary wide" type="submit" disabled={submitting}>
                  {submitting ? 'Đang gửi...' : 'Gửi mã về email →'}
                </button>
                <p className="auth-switch">Tài khoản đăng ký bằng số điện thoại? Hiện chưa hỗ trợ lấy lại mật khẩu qua SĐT.</p>
                <button type="button" className="link-btn" onClick={() => switchMode('login')}>← Quay lại đăng nhập</button>
              </form>
            ) : (
              <form className="auth-form" onSubmit={submitReset} noValidate>
                <h1>Đặt mật khẩu mới</h1>
                <p className="auth-hint">
                  Nếu <b>{fp.email.trim().toLowerCase()}</b> có tài khoản, mã 6 số đã được gửi tới email này (hiệu lực 5 phút — nhớ xem cả thư mục Spam).
                </p>
                <label>
                  <span>Mã xác thực</span>
                  <input
                    className="otp-input"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={fp.code}
                    onChange={e => setFpField('code', e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="______"
                    maxLength={6}
                    autoFocus
                  />
                </label>
                <div className="form-grid">
                  <label>
                    <span>Mật khẩu mới</span>
                    <input type="password" value={fp.password} onChange={e => setFpField('password', e.target.value)} placeholder="Ít nhất 8 ký tự" autoComplete="new-password" />
                  </label>
                  <label>
                    <span>Xác nhận mật khẩu mới</span>
                    <input type="password" value={fp.confirm} onChange={e => setFpField('confirm', e.target.value)} placeholder="Nhập lại mật khẩu" autoComplete="new-password" />
                  </label>
                </div>
                {error && <div className="form-error" role="alert">{error}</div>}
                <button className="btn-primary wide" type="submit" disabled={submitting || fp.code.length !== 6}>
                  {submitting ? 'Đang đặt lại...' : 'Đặt lại mật khẩu →'}
                </button>
                <div className="otp-actions">
                  <button type="button" className="link-btn" onClick={() => { setFpCodeStep(false); setError(''); }}>← Đổi email</button>
                  <button type="button" className="link-btn" disabled={resendIn > 0 || submitting} onClick={() => requestReset()}>
                    {resendIn > 0 ? `Gửi lại mã sau ${resendIn}s` : 'Gửi lại mã'}
                  </button>
                </div>
              </form>
            )
          ) : otpStep ? (
            <form className="auth-form" onSubmit={submitOtp} noValidate>
              <h1>Xác thực email</h1>
              <p className="auth-hint">
                Mã 6 số đã được gửi tới <b>{reg.email.trim().toLowerCase()}</b>. Mã có hiệu lực trong 5 phút — nhớ kiểm tra cả thư mục Spam.
              </p>
              <label>
                <span>Mã xác thực</span>
                <input
                  className="otp-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="______"
                  maxLength={6}
                  autoFocus
                />
              </label>
              {error && <div className="form-error" role="alert">{error}</div>}
              <button className="btn-primary wide" type="submit" disabled={submitting || otpCode.length !== 6}>
                {submitting ? 'Đang xác thực...' : 'Xác nhận và tạo tài khoản →'}
              </button>
              <div className="otp-actions">
                <button type="button" className="link-btn" onClick={() => { setOtpStep(false); setError(''); }}>← Đổi email</button>
                <button type="button" className="link-btn" disabled={resendIn > 0 || submitting} onClick={() => requestOtp(reg.email.trim().toLowerCase())}>
                  {resendIn > 0 ? `Gửi lại mã sau ${resendIn}s` : 'Gửi lại mã'}
                </button>
              </div>
            </form>
          ) : (
            <form className="auth-form" onSubmit={submitRegister} noValidate>
              <h1>{cfg.registerTitle}</h1>
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
                  <input type="password" value={reg.password} onChange={e => setField('password', e.target.value)} placeholder="Ít nhất 8 ký tự" autoComplete="new-password" />
                </label>
                <label>
                  <span>Xác nhận mật khẩu</span>
                  <input type="password" value={reg.confirm} onChange={e => setField('confirm', e.target.value)} placeholder="Nhập lại mật khẩu" autoComplete="new-password" />
                </label>
              </div>

              {error && <div className="form-error" role="alert">{error}</div>}
              <button className="btn-primary wide" type="submit" disabled={submitting}>
                {submitting ? 'Đang xử lý...' : method === 'email' ? 'Tiếp tục: nhận mã qua email →' : 'Tạo tài khoản →'}
              </button>
              <p className="auth-switch">Đã có tài khoản? <button type="button" onClick={() => switchMode('login')}>Đăng nhập</button></p>
            </form>
          )}

          <Link to={cfg.back.to} className="back-link">{cfg.back.label}</Link>
        </section>
      </div>

      <p className="auth-foot">Dự án học tập của sinh viên Trường Đại học Việt Nhật – VNU</p>
    </main>
  );
}
