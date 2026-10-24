const MenuCategory = require('./menuCategory.model');
const MenuItem = require('./menuItem.model');
const { toMenuItemResponse } = require('./menu.serializer');
const { recordAudit } = require('../audit/audit.service');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { removeAccents } = require('../../utils/text');
const { escapeRegex } = require('../../utils/pagination');
const { removeFile } = require('../../middlewares/upload.middleware');
const { publicFileUrl, publicUrlToPath } = require('../../config/storage');

const SIMPLE_FIELDS = ['name', 'description', 'type', 'tags', 'basePrice', 'prepMinutes', 'isAvailable', 'dailyLimit'];

const findMyItem = async (req) => {
    const item = await MenuItem.findOne({
        _id: req.params.id,
        restaurant: req.restaurant._id,
        isDeleted: false
    });

    // Món của quán khác cũng trả 404, không lộ sự tồn tại
    if (!item) {
        throw new AppError(404, 'NOT_FOUND', 'Menu item not found');
    }

    return item;
};

// Món phải thuộc danh mục của chính quán đó (BR-20)
const assertMyCategory = async (req, categoryId) => {
    if (!(await MenuCategory.exists({ _id: categoryId, restaurant: req.restaurant._id }))) {
        throw new AppError(422, 'INVALID_CATEGORY', 'Category does not belong to your restaurant');
    }
};

const nextSortOrder = async (categoryId) => {
    const last = await MenuItem.findOne({ category: categoryId, isDeleted: false }).sort({ sortOrder: -1 });
    return last ? last.sortOrder + 1 : 0;
};

// Client gửi kèm id cũ của biến thể/topping thì giữ nguyên _id,
// để giỏ hàng đang tham chiếu variantId/optionId không bị hỏng
const keepIds = (list = [], existing = []) => {
    const known = new Set(existing.map((x) => String(x._id)));

    return list.map(({ id, ...rest }) => (id && known.has(String(id)) ? { _id: id, ...rest } : rest));
};

const toOptionGroups = (groups = [], existing = []) => {
    const existingOptions = existing.flatMap((g) => g.options);

    return keepIds(groups, existing).map((g) => ({
        ...g,
        options: keepIds(g.options, existingOptions)
    }));
};

// Phục vụ audit log khi đổi giá
const priceSnapshot = (item) => ({
    basePrice: item.basePrice,
    variants: item.variants.map((v) => ({ name: v.name, price: v.price }))
});

// GET /merchant/menu-items?category=&q= — gồm cả món hết hàng, sắp theo thứ tự danh mục rồi món
const listMenuItems = asyncHandler(async (req, res) => {
    const filter = { restaurant: req.restaurant._id, isDeleted: false };

    if (req.query.category) {
        filter.category = req.query.category;
    }

    if (req.query.q) {
        filter.nameNoAccent = new RegExp(escapeRegex(removeAccents(req.query.q).toLowerCase().trim()));
    }

    const [items, categories] = await Promise.all([
        MenuItem.find(filter),
        MenuCategory.find({ restaurant: req.restaurant._id }).select('sortOrder')
    ]);

    const categoryOrder = new Map(categories.map((c) => [String(c._id), c.sortOrder]));
    items.sort(
        (a, b) =>
            (categoryOrder.get(String(a.category)) ?? 0) - (categoryOrder.get(String(b.category)) ?? 0) ||
            a.sortOrder - b.sortOrder
    );

    return res.status(200).json({
        success: true,
        data: items.map(toMenuItemResponse)
    });
});

// GET /merchant/menu-items/:id
const getMenuItem = asyncHandler(async (req, res) => {
    const item = await findMyItem(req);

    return res.status(200).json({
        success: true,
        data: toMenuItemResponse(item)
    });
});

// POST /merchant/menu-items
const createMenuItem = asyncHandler(async (req, res) => {
    const { category } = req.body;

    await assertMyCategory(req, category);

    const item = new MenuItem({
        restaurant: req.restaurant._id,
        category,
        variants: keepIds(req.body.variants),
        optionGroups: toOptionGroups(req.body.optionGroups),
        sortOrder: await nextSortOrder(category)
    });

    SIMPLE_FIELDS.forEach((field) => {
        if (req.body[field] !== undefined) {
            item[field] = req.body[field];
        }
    });

    await item.save();

    return res.status(201).json({
        success: true,
        message: 'Menu item created successfully',
        data: toMenuItemResponse(item)
    });
});

// PUT /merchant/menu-items/:id — variants / optionGroups gửi lên thì ghi đè toàn bộ
const updateMenuItem = asyncHandler(async (req, res) => {
    const item = await findMyItem(req);
    const pricesBefore = priceSnapshot(item);

    if (req.body.category !== undefined && String(req.body.category) !== String(item.category)) {
        await assertMyCategory(req, req.body.category);
        item.category = req.body.category;
        item.sortOrder = await nextSortOrder(req.body.category);
    }

    SIMPLE_FIELDS.forEach((field) => {
        if (req.body[field] !== undefined) {
            item[field] = req.body[field];
        }
    });

    if (req.body.variants !== undefined) {
        item.variants = keepIds(req.body.variants, item.variants);
    }

    if (req.body.optionGroups !== undefined) {
        item.optionGroups = toOptionGroups(req.body.optionGroups, item.optionGroups);
    }

    await item.save();

    const pricesAfter = priceSnapshot(item);
    if (JSON.stringify(pricesBefore) !== JSON.stringify(pricesAfter)) {
        await recordAudit(req, {
            action: 'MENU_PRICE_CHANGE',
            targetType: 'MenuItem',
            targetId: item._id,
            before: pricesBefore,
            after: pricesAfter
        });
    }

    return res.status(200).json({
        success: true,
        message: 'Menu item updated successfully',
        data: toMenuItemResponse(item)
    });
});

// PATCH /merchant/menu-items/:id/availability { isAvailable?, dailyLimit? (null = không giới hạn) }
const updateAvailability = asyncHandler(async (req, res) => {
    const item = await findMyItem(req);

    if (req.body.isAvailable !== undefined) {
        item.isAvailable = req.body.isAvailable;
    }

    if (req.body.dailyLimit !== undefined) {
        item.dailyLimit = req.body.dailyLimit;
    }

    await item.save();

    return res.status(200).json({
        success: true,
        message: 'Menu item availability updated',
        data: toMenuItemResponse(item)
    });
});

// POST /merchant/menu-items/:id/image — multipart field "image"
const uploadMenuItemImage = asyncHandler(async (req, res) => {
    let item;

    try {
        item = await findMyItem(req);
    } catch (error) {
        removeFile(req.file.path);
        throw error;
    }

    const oldPath = publicUrlToPath(item.imageUrl);

    item.imageUrl = publicFileUrl('menu-items', req.file.filename);
    await item.save();
    removeFile(oldPath);

    return res.status(200).json({
        success: true,
        message: 'Image uploaded successfully',
        data: toMenuItemResponse(item)
    });
});

// DELETE /merchant/menu-items/:id — xóa mềm (BR-24)
const deleteMenuItem = asyncHandler(async (req, res) => {
    const item = await findMyItem(req);

    item.isDeleted = true;
    item.isAvailable = false;
    await item.save();

    return res.status(200).json({
        success: true,
        message: 'Menu item deleted successfully'
    });
});

module.exports = {
    listMenuItems,
    getMenuItem,
    createMenuItem,
    updateMenuItem,
    updateAvailability,
    uploadMenuItemImage,
    deleteMenuItem
};
