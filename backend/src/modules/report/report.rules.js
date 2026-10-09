const { query } = require('express-validator');

// ?from=YYYY-MM-DD&to=YYYY-MM-DD (giờ VN); bỏ trống = 30 ngày gần nhất
const rangeRules = [
    query('from').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('from must be YYYY-MM-DD'),
    query('to').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('to must be YYYY-MM-DD')
];

module.exports = { rangeRules };
