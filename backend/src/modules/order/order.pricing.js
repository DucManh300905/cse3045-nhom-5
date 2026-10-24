const MenuCategory = require('../menu/menuCategory.model');
const MenuItem = require('../menu/menuItem.model');
const { remainingToday } = require('../menu/menu.serializer');
const AppError = require('../../utils/AppError');

// Tính tiền đơn từ DB, bỏ qua mọi giá client gửi lên (BR-31).
// Dùng chung cho POST /orders/preview và POST /orders (trong transaction thì truyền session).

const outOfStock = (index, item, msg) =>
    new AppError(409, 'ITEM_OUT_OF_STOCK', msg, [
        { field: `items[${index}]`, msg, menuItemId: String(item?._id ?? '') }
    ]);

const invalidOptions = (index, msg) =>
    new AppError(422, 'INVALID_OPTIONS', msg, [{ field: `items[${index}]`, msg }]);

// Một dòng: kiểm tra biến thể + topping, trả snapshot (BR-22, BR-33)
const priceLine = (item, input, index) => {
    let variant;

    if (item.variants.length > 0) {
        variant = input.variantId
            ? item.variants.id(input.variantId)
            : item.variants.find((v) => v.isDefault) || item.variants[0];

        if (!variant) {
            throw invalidOptions(index, `Variant not found for ${item.name}`);
        }
    } else if (input.variantId) {
        throw invalidOptions(index, `${item.name} has no variants`);
    }

    const optionIds = input.optionIds || [];
    if (new Set(optionIds.map(String)).size !== optionIds.length) {
        throw invalidOptions(index, 'Duplicate options');
    }

    const chosen = [];
    for (const optionId of optionIds) {
        const group = item.optionGroups.find((g) => g.options.id(optionId));

        if (!group) {
            throw invalidOptions(index, `Option not found for ${item.name}`);
        }

        const option = group.options.id(optionId);
        if (!option.isAvailable) {
            throw invalidOptions(index, `${option.name} is not available`);
        }

        chosen.push({ group, option });
    }

    // Mỗi nhóm phải chọn trong khoảng [minSelect, maxSelect]
    for (const group of item.optionGroups) {
        const count = chosen.filter((c) => c.group === group).length;

        if (count < group.minSelect || count > group.maxSelect) {
            throw invalidOptions(
                index,
                `${item.name}: "${group.name}" needs ${group.minSelect}-${group.maxSelect} choice(s)`
            );
        }
    }

    const options = chosen.map(({ group, option }) => ({
        _id: option._id,
        groupName: group.name,
        name: option.name,
        price: option.price
    }));
    const unitPrice = (variant ? variant.price : item.basePrice) + options.reduce((s, o) => s + o.price, 0);

    return {
        menuItem: item._id,
        name: item.name,
        imageUrl: item.imageUrl,
        variant: variant ? { _id: variant._id, name: variant.name, price: variant.price } : undefined,
        options,
        unitPrice,
        qty: input.qty,
        lineTotal: unitPrice * input.qty,
        note: input.note || undefined
    };
};

/**
 * @param restaurant  document quán (đã kiểm tra nhận đơn)
 * @param inputs      [{ menuItemId, variantId?, optionIds?, qty, note? }]
 * @param fulfillmentType DELIVERY | PICKUP
 * @returns { items, qtyByItem: Map<id, qty>, subtotal, deliveryFee, discount, total }
 */
const buildOrderDraft = async (restaurant, inputs, fulfillmentType, session = null) => {
    const ids = [...new Set(inputs.map((i) => String(i.menuItemId)))];
    const [menuItems, hiddenCategoryIds] = await Promise.all([
        MenuItem.find({ _id: { $in: ids } }).session(session),
        MenuCategory.find({ restaurant: restaurant._id, isActive: false }).distinct('_id').session(session)
    ]);
    const byId = new Map(menuItems.map((m) => [String(m._id), m]));
    const hidden = new Set(hiddenCategoryIds.map(String));

    const items = inputs.map((input, index) => {
        const item = byId.get(String(input.menuItemId));

        if (item && String(item.restaurant) !== String(restaurant._id)) {
            throw new AppError(422, 'MULTIPLE_RESTAURANTS', 'All items must come from the same restaurant', [
                { field: `items[${index}].menuItemId`, msg: 'Item belongs to another restaurant' }
            ]);
        }

        if (!item || item.isDeleted || !item.isAvailable || hidden.has(String(item.category))) {
            throw outOfStock(index, item, `${item?.name ?? 'Item'} is no longer available`);
        }

        return priceLine(item, input, index);
    });

    // Suất còn lại tính trên tổng số phần của cùng món (BR-23); khi đặt thật sẽ trừ nguyên tử lại lần nữa
    const qtyByItem = new Map();
    items.forEach((l) => qtyByItem.set(String(l.menuItem), (qtyByItem.get(String(l.menuItem)) || 0) + l.qty));

    for (const [id, qty] of qtyByItem) {
        const item = byId.get(id);
        const left = remainingToday(item);

        if (left !== null && qty > left) {
            const index = inputs.findIndex((i) => String(i.menuItemId) === id);
            throw outOfStock(index, item, left === 0 ? `${item.name} is sold out` : `Only ${left} left for ${item.name}`);
        }
    }

    const subtotal = items.reduce((s, l) => s + l.lineTotal, 0);

    // BR-32: áp dụng cho cả giao hàng và tự lấy
    if (subtotal < restaurant.minOrderAmount) {
        throw new AppError(422, 'BELOW_MIN_ORDER', `Minimum order is ${restaurant.minOrderAmount}`, [
            { field: 'items', msg: `Minimum order is ${restaurant.minOrderAmount}`, minOrderAmount: restaurant.minOrderAmount }
        ]);
    }

    // Miễn phí giao hàng cho mọi đơn (quán tự giao — quyết định 06/10/2026); giữ field để báo cáo không đổi cấu trúc
    const deliveryFee = 0;
    // TODO (API-5b): voucher (BR-40..42)
    const discount = 0;

    return {
        items,
        qtyByItem,
        subtotal,
        deliveryFee,
        discount,
        total: subtotal + deliveryFee - discount
    };
};

module.exports = {
    buildOrderDraft
};
