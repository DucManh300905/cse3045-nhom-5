const express = require('express');
const { body, param, query } = require('express-validator');

const { authenticate } = require('../../middlewares/auth.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const { paginationRules } = require('../../utils/pagination');
const { listNotifications, markRead, markAllRead, unreadCounts, markTypesRead } = require('./notification.controller');
const { NOTIFICATION_TYPES } = require('./notification.model');

// Mount tại /api/notifications — mọi vai trò đã đăng nhập, chỉ thấy thông báo của chính mình (docs/API.md mục 2.8)
const router = express.Router();
router.use(authenticate);

router.get(
    '/',
    [query('unread').optional().isIn(['true', 'false']).withMessage('unread must be true or false'), ...paginationRules],
    validate,
    listNotifications
);

router.get('/unread-counts', unreadCounts);

router.patch('/read-all', markAllRead);

router.patch(
    '/read-types',
    [
        body('types').isArray({ min: 1, max: 30 }).withMessage('types must be a non-empty array'),
        body('types.*').isIn(NOTIFICATION_TYPES).withMessage('type is not valid')
    ],
    validate,
    markTypesRead
);

router.patch('/:id/read', [param('id').isMongoId().withMessage('Notification not found')], validate, markRead);

module.exports = router;
