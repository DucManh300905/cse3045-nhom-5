const mongoose = require('mongoose');

// Bộ nhớ đệm kết quả định tuyến (đường đi thật) — giảm số lần gọi Goong (hạn mức gói Free 1.000 / ngày)
const TTL_SECONDS = 7 * 24 * 60 * 60;

const routeCacheSchema = new mongoose.Schema(
    {
        // 'goong|bike|21.0136,105.5254|21.0050,105.5150' (tọa độ làm tròn 4 chữ số ~ 11 m)
        key: {
            type: String,
            required: true,
            unique: true
        },
        distanceKm: Number,
        durationMinutes: Number,
        polyline: String,
        provider: String
    },
    {
        timestamps: { createdAt: true, updatedAt: false }
    }
);

routeCacheSchema.index({ createdAt: 1 }, { expireAfterSeconds: TTL_SECONDS });

module.exports = mongoose.model('RouteCache', routeCacheSchema);
