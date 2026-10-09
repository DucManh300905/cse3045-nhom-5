const express = require('express');
const { param, query } = require('express-validator');

const { authenticate } = require('../../middlewares/auth.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const { paginationRules } = require('../../utils/pagination');
const { listNotifications, markRead, markAllRead } = require('./notification.controller');

// Mount tại /api/notifications — mọi vai trò đã đăng nhập, chỉ thấy thông báo của chính mình (docs/API.md mục 2.8)
const router = express.Router();
router.use(authenticate);

router.get(
    '/',
    [query('unread').optional().isIn(['true', 'false']).withMessage('unread must be true or false'), ...paginationRules],
    validate,
    listNotifications
);

router.patch('/read-all', markAllRead);

router.patch('/:id/read', [param('id').isMongoId().withMessage('Notification not found')], validate, markRead);

module.exports = router;
