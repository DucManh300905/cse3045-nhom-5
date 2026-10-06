const AuditLog = require('../audit/auditLog.model');
const asyncHandler = require('../../utils/asyncHandler');
const { getPagination, paginate } = require('../../utils/pagination');

// GET /admin/audit-logs?action=&targetId=&page=&limit=
const listAuditLogs = asyncHandler(async (req, res) => {
    const filter = {};

    if (req.query.action) {
        filter.action = req.query.action;
    }

    if (req.query.targetId) {
        filter.targetId = req.query.targetId;
    }

    const result = await paginate(AuditLog, filter, getPagination(req), {
        sort: { createdAt: -1 },
        populate: { path: 'actor', select: 'fullName email role' }
    });

    return res.status(200).json({
        success: true,
        data: result
    });
});

module.exports = {
    listAuditLogs
};
