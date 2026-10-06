const MenuCategory = require('./menuCategory.model');
const MenuItem = require('./menuItem.model');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');

// So sánh tên không phân biệt hoa thường / dấu hoa (khớp collation của unique index)
const NAME_COLLATION = { locale: 'vi', strength: 2 };

const findMyCategory = async (req) => {
    const category = await MenuCategory.findOne({
        _id: req.params.id,
        restaurant: req.restaurant._id
    });

    // Danh mục của quán khác cũng trả 404, không lộ sự tồn tại
    if (!category) {
        throw new AppError(404, 'NOT_FOUND', 'Category not found');
    }

    return category;
};

const assertNameAvailable = async (req, name, exceptId) => {
    const duplicate = await MenuCategory.exists({
        restaurant: req.restaurant._id,
        name,
        ...(exceptId && { _id: { $ne: exceptId } })
    }).collation(NAME_COLLATION);

    if (duplicate) {
        throw new AppError(409, 'DUPLICATE', 'Category name already exists');
    }
};

const saveCategory = async (category) => {
    try {
        await category.save();
    } catch (error) {
        // Hai request tạo cùng tên gần như đồng thời
        if (error.code === 11000) {
            throw new AppError(409, 'DUPLICATE', 'Category name already exists');
        }
        throw error;
    }
};

// GET /merchant/categories — kèm số món trong từng danh mục
const listCategories = asyncHandler(async (req, res) => {
    const [categories, counts] = await Promise.all([
        MenuCategory.find({ restaurant: req.restaurant._id }).sort({ sortOrder: 1, createdAt: 1 }),
        MenuItem.aggregate([
            { $match: { restaurant: req.restaurant._id, isDeleted: false } },
            { $group: { _id: '$category', count: { $sum: 1 } } }
        ])
    ]);

    const countById = new Map(counts.map((c) => [String(c._id), c.count]));

    return res.status(200).json({
        success: true,
        data: categories.map((c) => ({ ...c.toJSON(), itemCount: countById.get(String(c._id)) || 0 }))
    });
});

// POST /merchant/categories — thêm vào cuối danh sách
const createCategory = asyncHandler(async (req, res) => {
    const { name, isActive } = req.body;

    await assertNameAvailable(req, name);

    const last = await MenuCategory.findOne({ restaurant: req.restaurant._id }).sort({ sortOrder: -1 });
    const category = new MenuCategory({
        restaurant: req.restaurant._id,
        name,
        isActive,
        sortOrder: last ? last.sortOrder + 1 : 0
    });

    await saveCategory(category);

    return res.status(201).json({
        success: true,
        message: 'Category created successfully',
        data: category
    });
});

// PUT /merchant/categories/:id
const updateCategory = asyncHandler(async (req, res) => {
    const category = await findMyCategory(req);
    const { name, isActive } = req.body;

    if (name !== undefined) {
        await assertNameAvailable(req, name, category._id);
        category.name = name;
    }

    if (isActive !== undefined) {
        category.isActive = isActive;
    }

    await saveCategory(category);

    return res.status(200).json({
        success: true,
        message: 'Category updated successfully',
        data: category
    });
});

// DELETE /merchant/categories/:id — chặn nếu còn món (chưa xóa)
const deleteCategory = asyncHandler(async (req, res) => {
    const category = await findMyCategory(req);

    if (await MenuItem.exists({ category: category._id, isDeleted: false })) {
        throw new AppError(409, 'CATEGORY_NOT_EMPTY', 'Move or delete the items in this category first');
    }

    await category.deleteOne();

    return res.status(200).json({
        success: true,
        message: 'Category deleted successfully'
    });
});

// PATCH /merchant/categories/reorder { ids: [...] } — phải gửi đủ mọi danh mục của quán
const reorderCategories = asyncHandler(async (req, res) => {
    const { ids } = req.body;
    const categories = await MenuCategory.find({ restaurant: req.restaurant._id }).select('_id');
    const mine = new Set(categories.map((c) => String(c._id)));

    if (ids.length !== mine.size || new Set(ids).size !== ids.length || !ids.every((id) => mine.has(id))) {
        throw new AppError(400, 'VALIDATION_ERROR', 'ids must contain every category of your restaurant exactly once');
    }

    await MenuCategory.bulkWrite(
        ids.map((id, index) => ({
            updateOne: {
                filter: { _id: id, restaurant: req.restaurant._id },
                update: { $set: { sortOrder: index } }
            }
        }))
    );

    const sorted = await MenuCategory.find({ restaurant: req.restaurant._id }).sort({ sortOrder: 1 });

    return res.status(200).json({
        success: true,
        message: 'Categories reordered successfully',
        data: sorted
    });
});

module.exports = {
    listCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories
};
