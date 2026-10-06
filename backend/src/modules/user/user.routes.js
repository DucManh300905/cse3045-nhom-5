const express = require('express');
const { body, param } = require('express-validator');

const { authenticate } = require('../../middlewares/auth.middleware');
const { authorizeRoles } = require('../../middlewares/role.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const { textRule, phoneRule, locationRules } = require('../../utils/validationRules');
const {
    getMyProfile,
    updateMyProfile
} = require('./user.controller');
const {
    listAddresses,
    createAddress,
    updateAddress,
    deleteAddress
} = require('./address.controller');

const router = express.Router();

router.get('/me', authenticate, getMyProfile);

router.put(
    '/me',
    authenticate,
    [
        textRule('fullName', 100).optional(),
        // Gửi "" để xóa SĐT
        phoneRule('phone', { allowEmpty: true }).optional(),
        body('avatarUrl').optional().isString().trim()
    ],
    validate,
    updateMyProfile
);

// Sổ địa chỉ giao hàng — chỉ khách hàng
const addressRouter = express.Router();
addressRouter.use(authenticate, authorizeRoles('CUSTOMER'));

const addressIdRule = param('addressId').isMongoId().withMessage('Address not found');

addressRouter.get('/', listAddresses);

addressRouter.post(
    '/',
    [
        textRule('receiverName', 100),
        phoneRule('phone'),
        textRule('addressLine', 255),
        body('label').optional().isString().trim().isLength({ max: 50 }),
        body('isDefault').optional().isBoolean().toBoolean(),
        ...locationRules
    ],
    validate,
    createAddress
);

addressRouter.put(
    '/:addressId',
    [
        addressIdRule,
        textRule('receiverName', 100).optional(),
        phoneRule('phone').optional(),
        textRule('addressLine', 255).optional(),
        body('label').optional().isString().trim().isLength({ max: 50 }),
        body('isDefault').optional().isBoolean().toBoolean(),
        ...locationRules
    ],
    validate,
    updateAddress
);

addressRouter.delete('/:addressId', [addressIdRule], validate, deleteAddress);

router.use('/me/addresses', addressRouter);

module.exports = router;
