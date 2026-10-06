const { validationResult } = require('express-validator');

// Dùng sau các rule của express-validator:
// router.post('/', [body('name').notEmpty()], validate, controller)
const validate = (req, res, next) => {
    const result = validationResult(req);

    if (result.isEmpty()) {
        return next();
    }

    const errors = result.array().map((e) => ({ field: e.path, msg: e.msg }));

    return res.status(400).json({
        success: false,
        message: errors[0].msg,
        code: 'VALIDATION_ERROR',
        errors
    });
};

module.exports = {
    validate
};
