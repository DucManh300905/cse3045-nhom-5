const nodemailer = require('nodemailer');

// Gửi email (OTP đăng ký). MAIL_TRANSPORT:
//   smtp   — gửi thật qua Gmail (SMTP_USER + SMTP_PASS = App Password 16 ký tự)
//   log    — in nội dung ra console (chạy trên máy chưa cấu hình Gmail) — KHÔNG dùng khi deploy
//   memory — lưu vào `outbox` để test đọc mã (không gửi gì ra ngoài)
// Không đặt MAIL_TRANSPORT: có SMTP_USER thì smtp, không thì log.

const outbox = [];
let transporter = null;

const mode = () => process.env.MAIL_TRANSPORT || (process.env.SMTP_USER ? 'smtp' : 'log');

const getTransporter = () => {
    if (!transporter) {
        const port = Number(process.env.SMTP_PORT) || 465;
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port,
            secure: port === 465,
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        });
    }
    return transporter;
};

/** @param {{ to: string, subject: string, text: string, html?: string }} mail */
const sendMail = async (mail) => {
    switch (mode()) {
        case 'memory':
            outbox.push({ ...mail, sentAt: new Date() });
            return;
        case 'log':
            console.log(`[mail:log] to=${mail.to} | ${mail.subject}\n${mail.text}`);
            return;
        default:
            await getTransporter().sendMail({
                from: process.env.MAIL_FROM || `MAK Food <${process.env.SMTP_USER}>`,
                ...mail
            });
    }
};

module.exports = {
    sendMail,
    outbox,
    mailMode: mode
};
