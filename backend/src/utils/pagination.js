const { query } = require('express-validator');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// Rule cho ?page=&limit= (docs/API.md mục 1.3)
const paginationRules = [
    query('page').optional().isInt({ min: 1 }).withMessage('page must be >= 1').toInt(),
    query('limit')
        .optional()
        .isInt({ min: 1, max: MAX_LIMIT })
        .withMessage(`limit must be between 1 and ${MAX_LIMIT}`)
        .toInt()
];

// Express 5: req.query chỉ đọc, sanitizer .toInt() không ghi lại được -> tự ép kiểu
const getPagination = (req) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || DEFAULT_LIMIT;

    return { page, limit, skip: (page - 1) * limit };
};

// { items, page, limit, total }
const paginate = async (model, filter, { page, limit, skip }, { sort, populate } = {}) => {
    let itemsQuery = model.find(filter).sort(sort).skip(skip).limit(limit);

    if (populate) {
        itemsQuery = itemsQuery.populate(populate);
    }

    const [items, total] = await Promise.all([itemsQuery, model.countDocuments(filter)]);

    return { items, page, limit, total };
};

// Dùng chuỗi người dùng nhập trong RegExp an toàn
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = {
    paginationRules,
    getPagination,
    paginate,
    escapeRegex
};
