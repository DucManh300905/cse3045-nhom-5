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
  VOUCHER_USER_LIMIT: 'Bạn đã dùng hết lượt của mã giảm giá này.',
  VOUCHER_STACK_LIMIT: 'Mỗi đơn chỉ dùng tối đa 1 voucher quán và 1 voucher MAK.',
  VOUCHER_IN_USE: 'Voucher đã có người dùng: không đổi được mức giảm và không xóa được — hãy tắt voucher.',
  IDEMPOTENCY_KEY_REQUIRED: 'Thiếu mã chống đặt trùng, vui lòng thử lại.',
  PAYMENT_METHOD_UNAVAILABLE: 'Hiện chưa nhận thanh toán chuyển khoản, vui lòng chọn tiền mặt.',
  LOCATION_REQUIRED: 'Vui lòng ghim vị trí nhận hàng trên bản đồ.',
  PREPAID_REQUIRED: 'Quán giao bằng tài xế MAK: đơn giao tận nơi cần thanh toán chuyển khoản trước.',
  SHIPPER_PROFILE_REQUIRED: 'Bạn chưa tạo hồ sơ tài xế.',
  SHIPPER_PROFILE_EXISTS: 'Bạn đã có hồ sơ tài xế.',
  SHIPPER_PROFILE_LOCKED: 'Hồ sơ đã nộp / đã duyệt, không sửa được. Cần đổi thông tin xe hãy liên hệ MAK.',
  SHIPPER_NOT_APPROVED: 'Hồ sơ tài xế chưa được duyệt.',
  SHIPPER_BLOCKED: 'Tài khoản tài xế đang bị khóa.',
  SHIPPER_BUSY: 'Tài xế đang giao một đơn khác.',
  SHIPPER_DISPATCH_BLOCKED: 'Bạn đang bị tạm khóa nhận đơn — xem chi tiết ở trang Ca làm.',
  OFFER_EXPIRED: 'Lời mời đã hết hạn hoặc đơn đã có người nhận.',
  ORDER_TAKEN: 'Đơn này đã có tài xế khác nhận.',
  ALREADY_RATED: 'Bạn đã đánh giá tài xế của đơn này.',
  SCHEDULE_CLOSED: 'Đã qua giờ chốt lịch: chỉ bỏ được khung, không thêm được.',
  SHIFT_REGISTRATION_CLOSED: 'Ca này đã chốt đăng ký (2 giờ trước giờ bắt đầu).',
  SHIFT_OVERLAP: 'Bạn đã có ca trùng giờ.',
  SHIFT_STARTED: 'Ca đã bắt đầu, không hủy được nữa.',
  EMAIL_REQUIRED: 'Tài xế phải đăng ký bằng email.',
  EMAIL_VERIFICATION_REQUIRED: 'Bạn cần thêm và xác thực email trước (trang Hồ sơ / Ca làm).',
  OUT_OF_DELIVERY_RANGE: 'Nơi nhận ở ngoài phạm vi giao hàng của quán — hãy chọn "Tự đến lấy".',
  GEO_UNAVAILABLE: 'Chưa bật tìm địa chỉ bằng chữ — hãy bấm lên bản đồ để ghim.',
  GEO_FAILED: 'Dịch vụ bản đồ đang lỗi, thử lại sau hoặc ghim tay trên bản đồ.',
  WALLET_LOCKED: 'Quán đang tạm ngưng vì ví âm. Nạp tiền ở trang Ví để mở lại.',
  BANK_ACCOUNT_REQUIRED: 'Hãy lưu tài khoản ngân hàng nhận tiền trước khi rút.',
  INSUFFICIENT_BALANCE: 'Số dư ví không đủ.',
  PAYOUT_PENDING: 'Bạn đang có một yêu cầu rút tiền chờ xử lý.',
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
  'accountNumber must be 6-20 digits': 'Số tài khoản gồm 6–20 chữ số.',
  'Voucher code already exists': 'Mã voucher đã tồn tại, hãy chọn mã khác.',
  'code must be 4-20 letters or digits': 'Mã voucher gồm 4–20 chữ cái hoặc chữ số, không dấu, không khoảng trắng.',
  'maxDiscount is required for percent vouchers': 'Voucher giảm theo % cần nhập mức giảm tối đa.',
  'Percent value must be between 1 and 100': 'Phần trăm giảm phải từ 1 đến 100.',
  'endAt must be after startAt': 'Thời gian kết thúc phải sau thời gian bắt đầu.',
  'usageLimit cannot be lower than the number of uses': 'Tổng lượt không được nhỏ hơn số lượt đã dùng.',
  'License plate is required': 'Xe máy cần nhập biển số.',
  'Driver profile is incomplete': 'Hồ sơ tài xế còn thiếu giấy tờ bắt buộc hoặc chưa xác thực email.',
  'A custom window must be 1 to 4 hours long': 'Khung tự chọn phải dài từ 1 đến 4 giờ.',
  'Time must be HH:00 or HH:30': 'Giờ của khung tự chọn phải tròn hoặc rưỡi (vd 06:00, 06:30).',
  'Windows overlap': 'Các khung trong cùng một ngày bị chồng nhau.',
  'end must be after start': 'Giờ kết thúc phải sau giờ bắt đầu.',
  'MAK drivers need bank transfer payments, which are not enabled yet': 'Tài xế MAK chỉ nhận đơn trả trước, nhưng MAK chưa bật thanh toán chuyển khoản.',
  'idNumber must be 9-12 digits': 'Số CCCD gồm 9–12 chữ số.',
  'licensePlate is not valid': 'Biển số không hợp lệ (vd 29A-123.45).',
  'Restaurant location is required': 'Cần ghim vị trí quán trên bản đồ (ở phần Thông tin quán) trước khi nộp hồ sơ.',
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

/** Chi tiết lỗi đầu tiên (vd lý do voucher không áp được) */
export const getErrorDetail = (err: unknown): Record<string, unknown> | undefined =>
  axios.isAxiosError(err) ? ((err.response?.data as ApiError | undefined)?.errors?.[0] as Record<string, unknown> | undefined) : undefined;

/** Mã lỗi máy đọc được của response (nếu có) */
export const getErrorCode = (err: unknown): string | undefined =>
  axios.isAxiosError(err) ? (err.response?.data as ApiError | undefined)?.code : undefined;

export default client;
