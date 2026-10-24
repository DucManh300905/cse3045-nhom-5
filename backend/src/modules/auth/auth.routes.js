const express = require('express');
const { body } = require('express-validator');

const { authenticate } = require('../../middlewares/auth.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const {
    loginLimiter,
    registerLimiter,
    changePasswordLimiter,
    otpSendLimiter,
    otpVerifyLimiter
} = require('../../middlewares/rateLimit.middleware');
const { register, login, changePassword, sendOtp, verifyOtp, forgotPassword, resetPassword } = require('./auth.controller');
const { EMAIL_REGEX, normalizeEmail } = require('../../utils/validators');
const { passwordError } = require('../../utils/passwordPolicy');

const router = express.Router();

const emailRule = body('email')
    .customSanitizer(normalizeEmail)
    .custom((value) => EMAIL_REGEX.test(value || ''))
    .withMessage('Email is not valid');

// Xác thực email bằng OTP trước khi đăng ký
router.post('/otp/send', otpSendLimiter, [emailRule], validate, sendOtp);
router.post(
    '/otp/verify',
    otpVerifyLimiter,
    [emailRule, body('code').matches(/^\d{6}$/).withMessage('Code must be 6 digits')],
    validate,
    verifyOtp
);

const codeRule = body('code').matches(/^\d{6}$/).withMessage('Code must be 6 digits');
const newPasswordRule = body('newPassword').custom((value) => {
    const error = passwordError(value);
    if (error) {
        throw new Error(error);
    }
    return true;
});

// Quên mật khẩu: gửi mã về email -> nhập mã + mật khẩu mới
router.post('/password/forgot', otpSendLimiter, [emailRule], validate, forgotPassword);
router.post('/password/reset', otpVerifyLimiter, [emailRule, codeRule, newPasswordRule], validate, resetPassword);

router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);

router.put(
    '/change-password',
    authenticate,
    changePasswordLimiter,
    [
        body('currentPassword').isString().notEmpty().withMessage('Current password is required'),
        body('newPassword').custom((value) => {
            const error = passwordError(value);
            if (error) {
                throw new Error(error);
            }
            return true;
        })
    ],
    validate,
    changePassword
);

module.exports = router;
