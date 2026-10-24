const path = require('path');

// Lưu file trên ổ đĩa (MVP). Khi deploy có thể đổi sang Cloudinary/S3 trong upload.middleware.js.
const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');

// Ảnh quán/món: public qua /uploads
const PUBLIC_DIR = path.join(UPLOAD_ROOT, 'public');
// Giấy tờ pháp lý: KHÔNG public, chỉ admin xem qua /api/admin/restaurants/:id/documents/:type
const PRIVATE_DIR = path.join(UPLOAD_ROOT, 'private');
const PUBLIC_URL_PREFIX = '/uploads';

// File multer vừa lưu trong PUBLIC_DIR/<subDir> -> URL public
const publicFileUrl = (subDir, filename) => `${PUBLIC_URL_PREFIX}/${subDir}/${filename}`;

// URL public -> đường dẫn file trên ổ đĩa (để xóa ảnh cũ); URL ngoài thì trả null
const publicUrlToPath = (url) =>
    url && url.startsWith(`${PUBLIC_URL_PREFIX}/`)
        ? path.join(PUBLIC_DIR, url.slice(PUBLIC_URL_PREFIX.length + 1))
        : null;

module.exports = {
    UPLOAD_ROOT,
    PUBLIC_DIR,
    PRIVATE_DIR,
    PUBLIC_URL_PREFIX,
    publicFileUrl,
    publicUrlToPath
};
