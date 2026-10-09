const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const AppError = require('../utils/AppError');
const { PUBLIC_DIR, PRIVATE_DIR } = require('../config/storage');

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

const EXTENSIONS = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'application/pdf': '.pdf'
};

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DOCUMENT_TYPES = [...IMAGE_TYPES, 'application/pdf'];

// Chữ ký đầu file (magic bytes) theo loại: không tin `mimetype` do trình duyệt tự khai
const SIGNATURES = {
    'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'image/webp': (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
    'application/pdf': (b) => b.toString('ascii', 0, 5) === '%PDF-'
};

// Đọc 12 byte đầu của file đã lưu, đối chiếu với loại file khai báo
const hasValidSignature = async (file) => {
    const handle = await fs.promises.open(file.path, 'r');
    try {
        const { buffer, bytesRead } = await handle.read(Buffer.alloc(12), 0, 12, 0);
        return bytesRead >= 4 && SIGNATURES[file.mimetype](buffer);
    } finally {
        await handle.close();
    }
};

// Tên file ngẫu nhiên, không dùng tên gốc của người dùng
const createUploader = ({ dir, subDir, allowedTypes }) => {
    const target = path.join(dir, subDir);

    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            fs.mkdir(target, { recursive: true }, (err) => cb(err, target));
        },
        filename: (req, file, cb) => {
            cb(null, `${crypto.randomUUID()}${EXTENSIONS[file.mimetype]}`);
        }
    });

    return multer({
        storage,
        limits: { fileSize: MAX_FILE_SIZE, files: 1 },
        fileFilter: (req, file, cb) => {
            if (!allowedTypes.includes(file.mimetype)) {
                return cb(new AppError(400, 'INVALID_FILE_TYPE', 'File type is not allowed'));
            }

            cb(null, true);
        }
    });
};

// Bọc multer: đổi lỗi multer (quá dung lượng...) thành AppError, bắt buộc phải có file
const single = (uploader, field) => (req, res, next) => {
    uploader.single(field)(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 2MB)' : err.message;
            return next(new AppError(400, 'INVALID_FILE', message));
        }

        if (err) {
            return next(err);
        }

        if (!req.file) {
            return next(new AppError(400, 'VALIDATION_ERROR', `File "${field}" is required`));
        }

        // Vd file HTML đổi đuôi thành .png: nội dung không khớp -> xóa file, từ chối
        hasValidSignature(req.file)
            .then((ok) => {
                if (ok) {
                    return next();
                }
                fs.unlink(req.file.path, () => {});
                return next(new AppError(400, 'INVALID_FILE_TYPE', 'File content does not match its type'));
            })
            .catch(next);
    });
};

const restaurantImageUpload = single(
    createUploader({ dir: PUBLIC_DIR, subDir: 'restaurants', allowedTypes: IMAGE_TYPES }),
    'image'
);

const menuItemImageUpload = single(
    createUploader({ dir: PUBLIC_DIR, subDir: 'menu-items', allowedTypes: IMAGE_TYPES }),
    'image'
);

const restaurantDocumentUpload = single(
    createUploader({ dir: PRIVATE_DIR, subDir: 'documents', allowedTypes: DOCUMENT_TYPES }),
    'file'
);

// Xóa file cũ khi thay ảnh/giấy tờ; lỗi xóa không làm hỏng request
const removeFile = (absolutePath) => {
    if (absolutePath) {
        fs.unlink(absolutePath, () => {});
    }
};

module.exports = {
    restaurantImageUpload,
    menuItemImageUpload,
    restaurantDocumentUpload,
    removeFile
};
