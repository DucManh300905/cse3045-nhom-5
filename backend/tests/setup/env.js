const os = require('os');
const path = require('path');

// Biến môi trường cho test, không đọc từ .env thật
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.CLIENT_URL = 'http://localhost:5173';
// File upload trong test ghi vào thư mục tạm, xóa ở globalTeardown
process.env.UPLOAD_DIR = path.join(os.tmpdir(), 'mak-test-uploads');

// Plugin toJSON (id thay _id) phải đăng ký trước khi nạp bất kỳ model nào —
// app.js làm việc này, nhưng file test có thể require model trước app.
require('../../src/config/mongoose');
