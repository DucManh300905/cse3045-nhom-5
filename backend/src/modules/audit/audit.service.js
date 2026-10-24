const AuditLog = require('./auditLog.model');

// Ghi audit log từ request: actor và ip lấy từ req
const recordAudit = (req, { action, targetType, targetId, before, after, note }) =>
    AuditLog.create({
        actor: req.user?.userId,
        actorRole: req.user?.role || 'SYSTEM',
        action,
        targetType,
        targetId,
        before,
        after,
        note,
        ip: req.ip
    });

module.exports = {
    recordAudit
};
