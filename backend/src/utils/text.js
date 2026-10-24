// Bỏ dấu tiếng Việt (giống normalizeText ở frontend/src/utils/format.ts)
const removeAccents = (s) =>
    String(s)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');

// "Cơm Gà Hòa Lạc!" -> "com-ga-hoa-lac"
const slugify = (s) =>
    removeAccents(s)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'quan';

module.exports = {
    removeAccents,
    slugify
};
