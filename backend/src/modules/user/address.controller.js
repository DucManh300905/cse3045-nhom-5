const User = require('./user.model');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');

const { MAX_ADDRESSES } = User;

// lat/lng trong body -> GeoJSON Point
const toLocation = ({ lat, lng }) =>
    lat !== undefined && lng !== undefined
        ? { type: 'Point', coordinates: [Number(lng), Number(lat)] }
        : undefined;

// Luôn có đúng 1 địa chỉ mặc định khi danh sách không rỗng
const ensureOneDefault = (addresses, preferredId) => {
    if (addresses.length === 0) {
        return;
    }

    const target =
        (preferredId && addresses.id(preferredId)) ||
        addresses.find((a) => a.isDefault) ||
        addresses[0];

    addresses.forEach((a) => {
        a.isDefault = a._id.equals(target._id);
    });
};

const findMe = async (userId) => {
    const user = await User.findById(userId);

    if (!user) {
        throw new AppError(404, 'NOT_FOUND', 'User not found');
    }

    return user;
};

const findAddress = (user, addressId) => {
    const address = user.addresses.id(addressId);

    if (!address) {
        throw new AppError(404, 'NOT_FOUND', 'Address not found');
    }

    return address;
};

const listAddresses = asyncHandler(async (req, res) => {
    const user = await findMe(req.user.userId);

    return res.status(200).json({
        success: true,
        data: user.addresses
    });
});

const createAddress = asyncHandler(async (req, res) => {
    const user = await findMe(req.user.userId);

    if (user.addresses.length >= MAX_ADDRESSES) {
        throw new AppError(422, 'ADDRESS_LIMIT', `At most ${MAX_ADDRESSES} addresses`);
    }

    const { label, receiverName, phone, addressLine, isDefault } = req.body;

    user.addresses.push({
        label,
        receiverName,
        phone,
        addressLine,
        location: toLocation(req.body)
    });

    const created = user.addresses[user.addresses.length - 1];
    ensureOneDefault(user.addresses, isDefault ? created._id : undefined);

    await user.save();

    return res.status(201).json({
        success: true,
        message: 'Address created successfully',
        data: created
    });
});

const updateAddress = asyncHandler(async (req, res) => {
    const user = await findMe(req.user.userId);
    const address = findAddress(user, req.params.addressId);

    ['label', 'receiverName', 'phone', 'addressLine'].forEach((field) => {
        if (req.body[field] !== undefined) {
            address[field] = req.body[field];
        }
    });

    const location = toLocation(req.body);
    if (location) {
        address.location = location;
    }

    // Chỉ cho đặt làm mặc định; bỏ mặc định = đặt địa chỉ khác làm mặc định
    if (req.body.isDefault === true) {
        ensureOneDefault(user.addresses, address._id);
    }

    await user.save();

    return res.status(200).json({
        success: true,
        message: 'Address updated successfully',
        data: address
    });
});

const deleteAddress = asyncHandler(async (req, res) => {
    const user = await findMe(req.user.userId);
    const address = findAddress(user, req.params.addressId);

    address.deleteOne();
    // Xóa địa chỉ mặc định -> địa chỉ đầu tiên còn lại thành mặc định
    ensureOneDefault(user.addresses);

    await user.save();

    return res.status(200).json({
        success: true,
        message: 'Address deleted successfully',
        data: user.addresses
    });
});

module.exports = {
    listAddresses,
    createAddress,
    updateAddress,
    deleteAddress
};
