// Chính sách mật khẩu dùng chung cho đăng ký, đổi mật khẩu, tạo admin (docs: đề xuất bảo mật P0).
// Tài khoản cũ có mật khẩu 6 ký tự vẫn đăng nhập được; chỉ mật khẩu MỚI phải theo quy tắc này.

const MIN_LENGTH = 8;
// bcrypt chỉ dùng 72 byte đầu: dài hơn thì phần sau bị bỏ qua
const MAX_LENGTH = 72;

// Mật khẩu hay bị dò nhất (rút gọn) — so sánh không phân biệt hoa thường
const COMMON_PASSWORDS = new Set([
    '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', '88888888', '66666666',
    '12341234', '11223344', '12121212', '123123123', 'password', 'password1', 'password123', 'passw0rd',
    'qwertyui', 'qwerty123', 'qwertyuiop', '1q2w3e4r', '1qaz2wsx', 'abcd1234', 'abc12345', 'iloveyou',
    'admin123', 'admin@123', 'administrator', 'welcome1', 'letmein1', 'matkhau123', 'matkhau1', 'anhyeuem',
    'yeuem123', 'vietnam1', 'hanoi123', 'demo@123', 'test1234', 'changeme'
]);

/** Trả về thông báo lỗi (tiếng Anh, FE đã map sang tiếng Việt) hoặc null nếu hợp lệ */
const passwordError = (password) => {
    if (typeof password !== 'string' || password.length < MIN_LENGTH) {
        return `Password must be at least ${MIN_LENGTH} characters`;
    }

    if (Buffer.byteLength(password, 'utf8') > MAX_LENGTH) {
        return `Password must be at most ${MAX_LENGTH} bytes`;
    }

    if (COMMON_PASSWORDS.has(password.toLowerCase())) {
        return 'Password is too common';
    }

    return null;
};

module.exports = {
    MIN_LENGTH,
    passwordError
};
