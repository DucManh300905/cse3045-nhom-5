import axios from 'axios';

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8080/api';
/** Gốc server (bỏ /api) — ảnh upload nằm ở /uploads/... không có tiền tố /api */
export const API_ORIGIN = API_URL.replace(/\/api\/?$/, '');
export const TOKEN_KEY = 'mak-token';
/** Phát khi phiên đăng nhập hết hiệu lực; detail = mã lỗi (TOKEN_EXPIRED, ACCOUNT_BLOCKED...) */
export const UNAUTHORIZED_EVENT = 'mak:unauthorized';

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

interface ApiError {
  message?: string;
  code?: string;
  errors?: { field?: string; msg?: string }[];
}

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

// Chỉ xử lý khi request có gửi token, để đăng nhập sai mật khẩu (cũng là 401) không bị ảnh hưởng.
// - 401: token hết hạn / cấp trước khi đổi mật khẩu
// - 403 ACCOUNT_BLOCKED: tài khoản bị khóa giữa chừng (BR-04)
client.interceptors.response.use(
  res => res,
  err => {
    const status = err.response?.status;
    const code = (err.response?.data as ApiError | undefined)?.code;
    const hadToken = !!err.config?.headers?.Authorization;
    if (hadToken && (status === 401 || (status === 403 && code === 'ACCOUNT_BLOCKED'))) {
      localStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT, { detail: code ?? 'TOKEN_EXPIRED' }));
    }
    return Promise.reject(err);
  }
);

/** Đường dẫn ảnh từ backend: "/uploads/..." -> URL đầy đủ; URL ngoài giữ nguyên */
export const assetUrl = (url?: string) => (url && url.startsWith('/') ? API_ORIGIN + url : url);

// Map theo `code` (docs/API.md mục 4)
const CODE_MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: 'Dữ liệu chưa hợp lệ, vui lòng kiểm tra lại.',
  INVALID_PASSWORD: 'Mật khẩu hiện tại không đúng.',
  INVALID_FILE_TYPE: 'File không đúng định dạng cho phép.',
  INVALID_FILE: 'File không hợp lệ hoặc vượt quá 2MB.',
  UNAUTHORIZED: 'Vui lòng đăng nhập để tiếp tục.',
  TOKEN_EXPIRED: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  ACCOUNT_BLOCKED: 'Tài khoản của bạn đã bị khóa.',
  RESTAURANT_BLOCKED: 'Quán đang bị khóa.',
  NOT_FOUND: 'Không tìm thấy dữ liệu.',
  DUPLICATE: 'Dữ liệu này đã tồn tại.',
  ADDRESS_LIMIT: 'Bạn chỉ lưu được tối đa 5 địa chỉ.',
  RESTAURANT_ALREADY_EXISTS: 'Bạn đã có quán rồi (mỗi tài khoản một quán).',
  RESTAURANT_UNDER_REVIEW: 'Hồ sơ đang chờ duyệt, tạm thời không sửa được.',
  RESTAURANT_DOCUMENTS_LOCKED: 'Không sửa giấy tờ sau khi đã nộp hồ sơ.',
  INVALID_STATUS_TRANSITION: 'Trạng thái hiện tại không cho phép thao tác này.',
  PROFILE_INCOMPLETE: 'Hồ sơ còn thiếu giờ mở cửa hoặc giấy tờ bắt buộc.',
  RESTAURANT_NOT_APPROVED: 'Quán cần được duyệt trước khi nhận đơn.',
  CATEGORY_NOT_EMPTY: 'Danh mục còn món — hãy chuyển hoặc xóa các món trước.',
  INVALID_CATEGORY: 'Danh mục không hợp lệ.',
  RESTAURANT_CLOSED: 'Quán hiện không nhận đơn.',
  BELOW_MIN_ORDER: 'Đơn chưa đạt giá trị tối thiểu của quán.',
  MULTIPLE_RESTAURANTS: 'Mỗi đơn chỉ được đặt món của một quán.',
  INVALID_OPTIONS: 'Lựa chọn size/topping chưa hợp lệ.',
  ITEM_OUT_OF_STOCK: 'Món đã hết suất.',
  VOUCHER_INVALID: 'Mã giảm giá không hợp lệ.',
  VOUCHER_EXHAUSTED: 'Mã giảm giá đã hết lượt.',
  IDEMPOTENCY_KEY_REQUIRED: 'Thiếu mã chống đặt trùng, vui lòng thử lại.',
  REVIEW_NOT_ALLOWED: 'Bạn cần nhận ít nhất 1 đơn từ quán này mới đánh giá được.',
  OTP_REQUIRED: 'Vui lòng xác thực email bằng mã OTP trước khi tạo tài khoản.',
  OTP_INVALID: 'Mã xác thực không đúng.',
  OTP_EXPIRED: 'Mã xác thực đã hết hạn. Bấm "Gửi lại mã" để nhận mã mới.',
  OTP_TOO_MANY_ATTEMPTS: 'Bạn đã nhập sai quá nhiều lần. Bấm "Gửi lại mã" để nhận mã mới.',
  OTP_TOO_SOON: 'Vui lòng đợi một chút rồi mới gửi lại mã.',
  OTP_LIMIT: 'Email này đã yêu cầu quá nhiều mã. Vui lòng thử lại sau 1 giờ.',
  MAIL_FAILED: 'Không gửi được email xác thực. Vui lòng thử lại.',
  RATE_LIMITED: 'Bạn thử quá nhiều lần. Vui lòng đợi khoảng 15 phút rồi thử lại.',
  INTERNAL_ERROR: 'Máy chủ gặp sự cố, vui lòng thử lại sau.',
};

// Một số lỗi (đăng nhập/đăng ký, lỗi validate cụ thể) chưa có `code` riêng -> map theo message
const MESSAGES: Record<string, string> = {
  'Invalid email or password': 'Sai tài khoản hoặc mật khẩu.',
  'Invalid credentials': 'Sai tài khoản hoặc mật khẩu.',
  'Email already exists': 'Email này đã được đăng ký.',
  'Phone already exists': 'Số điện thoại này đã được đăng ký.',
  'Your account is blocked': 'Tài khoản của bạn đã bị khóa.',
  'Email is not valid': 'Email không hợp lệ.',
  'Phone is not valid': 'Số điện thoại không hợp lệ.',
  'Password must be at least 6 characters': 'Mật khẩu phải có ít nhất 6 ký tự.',
  'Password must be at least 8 characters': 'Mật khẩu phải có ít nhất 8 ký tự.',
  'Password is too common': 'Mật khẩu quá phổ biến, dễ bị đoán. Hãy chọn mật khẩu khác.',
  'Password must be at most 72 bytes': 'Mật khẩu quá dài.',
  'File content does not match its type': 'Nội dung file không đúng định dạng (chỉ nhận ảnh JPG, PNG, WEBP hoặc PDF thật).',
  'Request body is too large': 'Dữ liệu gửi lên quá lớn.',
  'New password must be different from current password': 'Mật khẩu mới phải khác mật khẩu hiện tại.',
  'Access denied': 'Bạn không có quyền thực hiện thao tác này.',
  'Restaurant is not accepting orders right now': 'Quán hiện không nhận đơn (ngoài giờ mở cửa hoặc tạm nghỉ).',
  'Address not found': 'Không tìm thấy địa chỉ trong sổ, vui lòng chọn lại.',
  'Category name already exists': 'Tên danh mục đã tồn tại.',
  'Opening hours overlap in the same day': 'Các khung giờ trong cùng một ngày bị chồng nhau.',
};

export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) return 'Không kết nối được máy chủ. Vui lòng thử lại.';
    const { message, code } = (err.response.data as ApiError | undefined) ?? {};
    return (message && MESSAGES[message]) || (code && CODE_MESSAGES[code]) || message || 'Đã có lỗi xảy ra.';
  }
  return err instanceof Error ? err.message : 'Đã có lỗi xảy ra.';
}

/** Mã lỗi máy đọc được của response (nếu có) */
export const getErrorCode = (err: unknown): string | undefined =>
  axios.isAxiosError(err) ? (err.response?.data as ApiError | undefined)?.code : undefined;

export default client;
