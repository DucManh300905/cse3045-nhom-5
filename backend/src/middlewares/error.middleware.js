const AppError = require('../utils/AppError');

// Field bị trùng (lỗi 11000) -> message giữ đúng chữ FE đang map trong api/client.ts
const DUPLICATE_MESSAGES = {
    email: 'Email already exists',
    phone: 'Phone already exists'
};

const notFound = (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found',
        code: 'NOT_FOUND'
    });
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
    if (err instanceof AppError) {
        return res.status(err.status).json({
            success: false,
            message: err.message,
            code: err.code,
            ...(err.errors && { errors: err.errors })
        });
    }

    // Lỗi validate của Mongoose
    if (err.name === 'ValidationError') {
        const errors = Object.values(err.errors).map((e) => ({ field: e.path, msg: e.message }));
        return res.status(400).json({
            success: false,
            message: errors[0]?.msg || 'Validation error',
            code: 'VALIDATION_ERROR',
            errors
        });
    }

    // ObjectId sai định dạng (vd: /orders/abc)
    if (err.name === 'CastError') {
        return res.status(404).json({
            success: false,
            message: 'Resource not found',
            code: 'NOT_FOUND'
        });
    }

    // Trùng unique index
    if (err.code === 11000) {
        const field = Object.keys(err.keyPattern || {})[0];
        return res.status(409).json({
            success: false,
            message: DUPLICATE_MESSAGES[field] || `${field || 'Value'} already exists`,
            code: 'DUPLICATE'
        });
    }

    // Body JSON hỏng (express.json)
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({
            success: false,
            message: 'Invalid JSON body',
            code: 'VALIDATION_ERROR'
        });
    }

    console.error(err);

    return res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
    });
};

module.exports = {
    notFound,
    errorHandler
};
