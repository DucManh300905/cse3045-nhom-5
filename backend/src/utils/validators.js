const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Số di động Việt Nam: 10 chữ số, bắt đầu bằng 0
const PHONE_REGEX = /^0\d{9}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const normalizeEmail = (email) =>
    typeof email === 'string' ? email.trim().toLowerCase() : '';

// Bỏ khoảng trắng, dấu chấm, gạch nối; đổi +84 thành 0 (BR-02)
const normalizePhone = (phone) =>
    typeof phone === 'string'
        ? phone.replace(/[\s.-]/g, '').replace(/^\+84/, '0')
        : '';

module.exports = {
    EMAIL_REGEX,
    PHONE_REGEX,
    TIME_REGEX,
    normalizeEmail,
    normalizePhone
};
