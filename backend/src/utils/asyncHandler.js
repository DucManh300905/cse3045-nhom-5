// Bọc controller async: lỗi được throw sẽ chuyển sang errorHandler,
// không cần try/catch lặp lại trong từng controller.
const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
