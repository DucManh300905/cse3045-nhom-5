const mongoose = require('mongoose');

// Nhật ký thao tác quan trọng — chỉ ghi thêm, không sửa/xóa (docs/database.md mục 3.10)
const auditLogSchema = new mongoose.Schema(
    {
        actor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },

        actorRole: {
            type: String,
            enum: ['CUSTOMER', 'RESTAURANT_OWNER', 'ADMIN', 'SYSTEM'],
            required: true
        },

        // vd: RESTAURANT_APPROVE, RESTAURANT_REJECT, USER_BLOCK, MENU_PRICE_CHANGE, ORDER_CANCEL
        action: {
            type: String,
            required: true
        },

        targetType: {
            type: String,
            required: true
        },

        targetId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        },

        before: mongoose.Schema.Types.Mixed,
        after: mongoose.Schema.Types.Mixed,
        note: String,
        ip: String
    },
    {
        timestamps: { createdAt: true, updatedAt: false }
    }
);

auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

// Chặn sửa/xóa qua Mongoose
const forbid = function () {
    throw new Error('Audit logs are append-only');
};
['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'].forEach(
    (op) => auditLogSchema.pre(op, forbid)
);

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
