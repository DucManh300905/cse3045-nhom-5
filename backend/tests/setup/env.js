const os = require('os');
const path = require('path');

// Biến môi trường cho test, không đọc từ .env thật
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.CLIENT_URL = 'http://localhost:5173';
// Test đăng nhập rất nhiều lần từ cùng IP -> nới rate limit (tests/auth/security.test.js tự đặt lại số nhỏ)
process.env.AUTH_RATE_LIMIT = '100000';
// Email OTP lưu vào bộ nhớ (config/mailer.js `outbox`), không gửi ra ngoài
process.env.MAIL_TRANSPORT = 'memory';
// File upload trong test ghi vào thư mục tạm, xóa ở globalTeardown
process.env.UPLOAD_DIR = path.join(os.tmpdir(), 'mak-test-uploads');

// Plugin toJSON (id thay _id) phải đăng ký trước khi nạp bất kỳ model nào —
// app.js làm việc này, nhưng file test có thể require model trước app.
require('../../src/config/mongoose');
