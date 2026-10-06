// Lỗi nghiệp vụ có chủ đích: controller chỉ cần `throw new AppError(...)`,
// errorHandler sẽ trả về { success: false, message, code } với đúng status.
// Danh sách code: docs/API.md mục 4.
class AppError extends Error {
    constructor(status, code, message, errors) {
        super(message);
        this.name = 'AppError';
        this.status = status;
        this.code = code;
        this.errors = errors;
    }
}

module.exports = AppError;
