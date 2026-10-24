const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const Otp = require('./otp.model');
const User = require('../user/user.model');
const AppError = require('../../utils/AppError');
// Gọi qua module (không destructure) để test thay được hàm gửi
const mailer = require('../../config/mailer');

// Mã OTP 6 số qua email cho 2 mục đích (quyết định 08–09/10/2026: chỉ email, SĐT chưa áp dụng):
//   REGISTER       — xác thực email khi đăng ký: gửi mã -> nhập mã -> verificationToken (15 phút) -> đăng ký
//   RESET_PASSWORD — quên mật khẩu: gửi mã -> nhập mã + mật khẩu mới -> đặt lại
// Mã của mục đích này không dùng được cho mục đích kia (băm kèm mục đích).

const CODE_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;
const TOKEN_TTL = '15m';

// Băm có khóa bí mật: lộ DB cũng không dò ngược được 1 triệu khả năng của mã 6 số
const hashCode = (purpose, target, code) =>
    crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${purpose}:${target}:${code}`).digest('hex');

const sameHash = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** 6 chữ số, có thể bắt đầu bằng 0 */
const generateCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

const layout = (intro, code) => `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;border:1px solid #f0e2d5;border-radius:16px">
<h2 style="color:#d4540c;margin:0 0 12px">MAK Food and Drink</h2>
<p>${intro}</p>
<p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:16px 0;color:#2a1b12">${code}</p>
<p style="color:#7d6758;font-size:14px">Mã có hiệu lực trong <b>5 phút</b>. Không chia sẻ mã này cho bất kỳ ai.<br>Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
</div>`;

const MAILS = {
    REGISTER: (code) => ({
        subject: `${code} là mã xác thực MAK Food của bạn`,
        text: `Mã xác thực đăng ký tài khoản MAK Food: ${code}\nMã có hiệu lực trong 5 phút. Không chia sẻ mã này cho bất kỳ ai.\nNếu bạn không yêu cầu, hãy bỏ qua email này.`,
        html: layout('Mã xác thực đăng ký tài khoản của bạn:', code)
    }),
    RESET_PASSWORD: (code) => ({
        subject: `${code} là mã đặt lại mật khẩu MAK Food`,
        text: `Mã đặt lại mật khẩu MAK Food: ${code}\nMã có hiệu lực trong 5 phút. Không chia sẻ mã này cho bất kỳ ai.\nNếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này — mật khẩu của bạn không thay đổi.`,
        html: layout('Mã đặt lại mật khẩu tài khoản của bạn:', code)
    })
};

/**
 * Tạo mã mới và gửi email (giới hạn: chờ 60 giây giữa 2 lần, tối đa 5 mã / giờ / email / mục đích).
 * @returns { expiresInSeconds, resendInSeconds }
 */
const issueOtp = async (email, purpose) => {
    const now = Date.now();
    const existing = await Otp.findOne({ target: email, purpose });

    if (existing && now - existing.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
        const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - existing.lastSentAt.getTime())) / 1000);
        throw new AppError(429, 'OTP_TOO_SOON', `Please wait ${wait}s before requesting a new code`, [
            { field: 'email', msg: 'Resend cooldown', retryAfter: wait }
        ]);
    }

    const sameWindow = existing && now - existing.windowStart.getTime() < 60 * 60 * 1000;
    if (sameWindow && existing.sendCount >= MAX_SENDS_PER_HOUR) {
        throw new AppError(429, 'OTP_LIMIT', 'Too many codes requested for this email, try again later');
    }

    const code = generateCode();
    await Otp.findOneAndUpdate(
        { target: email, purpose },
        {
            $set: {
                codeHash: hashCode(purpose, email, code),
                expiresAt: new Date(now + CODE_TTL_MS),
                attempts: 0,
                lastSentAt: new Date(now),
                sendCount: sameWindow ? existing.sendCount + 1 : 1,
                windowStart: sameWindow ? existing.windowStart : new Date(now)
            }
        },
        { upsert: true }
    );

    try {
        await mailer.sendMail({ to: email, ...MAILS[purpose](code) });
    } catch (error) {
        // Không gửi được: cho phép xin mã lại ngay
        await Otp.updateOne({ target: email, purpose }, { $set: { lastSentAt: new Date(0) } });
        console.error('[otp] send mail failed:', error.message);
        throw new AppError(502, 'MAIL_FAILED', 'Could not send the verification email, please try again');
    }

    return { expiresInSeconds: CODE_TTL_MS / 1000, resendInSeconds: RESEND_COOLDOWN_MS / 1000 };
};

/** Kiểm tra mã; đúng -> vô hiệu mã (mỗi mã dùng 1 lần). Sai -> lỗi, sai 5 lần -> khóa mã. */
const consumeOtp = async (email, purpose, code) => {
    const otp = await Otp.findOne({ target: email, purpose });

    if (!otp || otp.expiresAt.getTime() < Date.now()) {
        throw new AppError(400, 'OTP_EXPIRED', 'The code has expired, please request a new one');
    }

    if (otp.attempts >= MAX_ATTEMPTS) {
        throw new AppError(429, 'OTP_TOO_MANY_ATTEMPTS', 'Too many wrong attempts, please request a new code');
    }

    if (!sameHash(otp.codeHash, hashCode(purpose, email, String(code)))) {
        // Tăng nguyên tử để nhiều request đoán song song cũng bị tính đủ
        const updated = await Otp.findOneAndUpdate({ _id: otp._id }, { $inc: { attempts: 1 } }, { returnDocument: 'after' });
        const left = Math.max(0, MAX_ATTEMPTS - updated.attempts);
        throw new AppError(400, 'OTP_INVALID', 'The code is incorrect', [{ field: 'code', msg: 'Incorrect code', attemptsLeft: left }]);
    }

    // Vô hiệu mã nhưng giữ bản ghi để vẫn đếm số lần gửi trong giờ
    await Otp.updateOne({ _id: otp._id }, { $set: { expiresAt: new Date(0), codeHash: 'used' } });
};

// ======================= Đăng ký =======================

const sendRegisterOtp = async (email) => {
    if (await User.exists({ email })) {
        throw new AppError(409, 'DUPLICATE', 'Email already exists');
    }
    return issueOtp(email, 'REGISTER');
};

const verifyRegisterOtp = async (email, code) => {
    await consumeOtp(email, 'REGISTER', code);
    return issueVerificationToken(email);
};

/** Vé chứng minh email đã xác thực (dùng ngay ở bước đăng ký, hết hạn 15 phút) */
const issueVerificationToken = (email) =>
    jwt.sign({ purpose: 'REGISTER', email }, process.env.JWT_SECRET, { expiresIn: TOKEN_TTL, subject: 'email-verification' });

/** true nếu token hợp lệ và đúng email đang đăng ký */
const isVerifiedEmail = (token, email) => {
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET, { subject: 'email-verification' });
        return payload.purpose === 'REGISTER' && payload.email === email;
    } catch {
        return false;
    }
};

// ======================= Quên mật khẩu =======================

/**
 * Gửi mã đặt lại mật khẩu. Email không có tài khoản (hoặc tài khoản bị khóa) vẫn trả cùng kết quả
 * nhưng không gửi gì — để người ngoài không dò được email nào đã đăng ký.
 */
const sendResetOtp = async (email) => {
    const user = await User.findOne({ email }).select('status').lean();

    if (!user || user.status !== 'ACTIVE') {
        return { expiresInSeconds: CODE_TTL_MS / 1000, resendInSeconds: RESEND_COOLDOWN_MS / 1000 };
    }

    return issueOtp(email, 'RESET_PASSWORD');
};

module.exports = {
    MAX_ATTEMPTS,
    consumeOtp,
    sendRegisterOtp,
    verifyRegisterOtp,
    issueVerificationToken,
    isVerifiedEmail,
    sendResetOtp
};
