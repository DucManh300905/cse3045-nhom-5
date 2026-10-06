const mongoose = require('mongoose');

// Bộ đếm tăng nguyên tử, dùng sinh mã đơn theo ngày: _id = 'order:261006' -> seq 1, 2, 3...
const counterSchema = new mongoose.Schema({
    _id: String,
    seq: {
        type: Number,
        default: 0
    }
});

const Counter = mongoose.model('Counter', counterSchema);

module.exports = Counter;
