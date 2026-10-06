const express = require('express');
const { body } = require('express-validator');

const { authenticate } = require('../../middlewares/auth.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const { register, login, changePassword } = require('./auth.controller');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);

router.put(
    '/change-password',
    authenticate,
    [
        body('currentPassword').isString().notEmpty().withMessage('Current password is required'),
        body('newPassword')
            .isString()
            .isLength({ min: 6 })
            .withMessage('Password must be at least 6 characters')
    ],
    validate,
    changePassword
);

module.exports = router;
