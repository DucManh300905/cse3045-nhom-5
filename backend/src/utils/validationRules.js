const { body } = require('express-validator');
const { PHONE_REGEX, normalizePhone } = require('./validators');

// Chuỗi bắt buộc, đã trim, giới hạn độ dài. Thêm .optional() cho route PUT.
const textRule = (field, max = 255) =>
    body(field)
        .isString()
        .withMessage(`${field} must be a string`)
        .trim()
        .notEmpty()
        .withMessage(`${field} is required`)
        .isLength({ max })
        .withMessage(`${field} is too long`);

// SĐT: chuẩn hóa rồi kiểm tra dạng 0xxxxxxxxx (BR-02). allowEmpty: gửi "" để xóa.
const phoneRule = (field, { allowEmpty = false } = {}) => {
    const chain = body(field).customSanitizer(normalizePhone);

    return allowEmpty
        ? chain.if((value) => value !== '').matches(PHONE_REGEX).withMessage('Phone is not valid')
        : chain.matches(PHONE_REGEX).withMessage('Phone is not valid');
};

// lat/lng tùy chọn nhưng phải đi cùng nhau
const locationRules = [
    body('lat')
        .optional()
        .isFloat({ min: -90, max: 90 })
        .withMessage('lat is not valid')
        .toFloat()
        .custom((lat, { req }) => req.body.lng !== undefined)
        .withMessage('lat and lng must be sent together'),
    body('lng')
        .optional()
        .isFloat({ min: -180, max: 180 })
        .withMessage('lng is not valid')
        .toFloat()
        .custom((lng, { req }) => req.body.lat !== undefined)
        .withMessage('lat and lng must be sent together')
];

// Tiền: số nguyên VND, không âm (BR-21, BR-50)
const moneyRule = (field, max = 10000000) =>
    body(field)
        .isInt({ min: 0, max })
        .withMessage(`${field} must be an integer between 0 and ${max}`)
        .toInt();

module.exports = {
    textRule,
    phoneRule,
    locationRules,
    moneyRule
};
