require('dotenv').config();

const http = require('http');
const app = require('./app');
const connectDatabase = require('./config/database');
const { initSocket } = require('./realtime/socket');
const { startJobs } = require('./jobs');
const { mailMode } = require('./config/mailer');

const PORT = process.env.PORT || 8080;

const startServer = async () => {
    if (!process.env.JWT_SECRET || !process.env.MONGODB_URI) {
        console.error('Missing JWT_SECRET or MONGODB_URI in .env');
        process.exit(1);
    }

    // Secret ngắn / mặc định -> đoán được -> giả mạo được token admin. Tạo: openssl rand -hex 48
    if (process.env.JWT_SECRET.length < 32 || /change-me/i.test(process.env.JWT_SECRET)) {
        console.error('JWT_SECRET is too weak (need >= 32 random characters). Generate one: openssl rand -hex 48');
        process.exit(1);
    }

    await connectDatabase();

    // Chưa cấu hình Gmail: mã OTP chỉ in ra log, người dùng không nhận được email
    if (mailMode() === 'log') {
        console.warn('Warning: email is in LOG mode (no SMTP_USER) -> OTP codes are printed here, not emailed. Set SMTP_USER / SMTP_PASS in .env to send real emails.');
    }

    // REST + Socket.IO dùng chung một cổng
    const server = http.createServer(app);
    initSocket(server);
    startJobs();

    server.listen(PORT, () => {
        console.log(`Server is running at http://localhost:${PORT}`);
    });
};

startServer();
