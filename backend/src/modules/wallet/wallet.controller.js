const Wallet = require('./wallet.model');
const WalletEntry = require('./walletEntry.model');
const Topup = require('./topup.model');
const Payout = require('./payout.model');
const Restaurant = require('../restaurant/restaurant.model');
const walletService = require('./wallet.service');
const { recordAudit } = require('../audit/audit.service');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { removeAccents } = require('../../utils/text');
const { getPagination, paginate, escapeRegex } = require('../../utils/pagination');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

const restaurantEntries = (restaurantId, req) =>
    paginate(WalletEntry, { restaurant: restaurantId, walletType: 'RESTAURANT' }, getPagination(req), {
        sort: { createdAt: -1, _id: -1 }
    });

// ======================= Chủ quán: /merchant/wallet =======================

// GET /merchant/wallet — số dư, hạn nạp, trạng thái khóa, lệnh nạp / rút đang chờ
const getMyWallet = asyncHandler(async (req, res) => ok(res, await walletService.getRestaurantWallet(req.restaurant)));

// GET /merchant/wallet/entries
const listMyEntries = asyncHandler(async (req, res) => ok(res, await restaurantEntries(req.restaurant._id, req)));

// PUT /merchant/wallet/bank-account
const updateBankAccount = asyncHandler(async (req, res) => {
    const { bankName, accountNumber, accountName } = req.body;
    req.restaurant.bankAccount = { bankName, accountNumber, accountName: accountName.toUpperCase() };
    await req.restaurant.save();

    return ok(res, req.restaurant.bankAccount);
});

// POST /merchant/wallet/topups { amount }
const createTopup = asyncHandler(async (req, res) => {
    const topup = await walletService.createTopup({
        restaurant: req.restaurant,
        userId: req.user.userId,
        amount: req.body.amount
    });
    return ok(res, topup, 201);
});

// GET /merchant/wallet/topups
const listMyTopups = asyncHandler(async (req, res) => {
    const result = await paginate(Topup, { restaurant: req.restaurant._id }, getPagination(req), {
        sort: { createdAt: -1, _id: -1 }
    });
    return ok(res, { ...result, items: result.items.map(walletService.withQr) });
});

// POST /merchant/wallet/topups/:id/cancel
const cancelMyTopup = asyncHandler(async (req, res) =>
    ok(res, await walletService.cancelTopup({ restaurant: req.restaurant, topupId: req.params.id }))
);

// POST /merchant/wallet/payouts { amount }
const requestPayout = asyncHandler(async (req, res) => {
    const payout = await walletService.requestPayout({
        restaurant: req.restaurant,
        userId: req.user.userId,
        amount: req.body.amount
    });
    return ok(res, payout, 201);
});

// GET /merchant/wallet/payouts
const listMyPayouts = asyncHandler(async (req, res) =>
    ok(
        res,
        await paginate(Payout, { restaurant: req.restaurant._id }, getPagination(req), { sort: { createdAt: -1, _id: -1 } })
    )
);

// ======================= Admin: /admin/wallets, /admin/topups, /admin/payouts =======================

const RESTAURANT_SELECT = 'name slug status walletLockedAt walletLockReason bankAccount';

const findRestaurantIds = async (q) => {
    const keyword = escapeRegex(removeAccents(q).toLowerCase().trim());
    return Restaurant.find({ nameNoAccent: new RegExp(keyword) }).distinct('_id');
};

// GET /admin/wallets/overview
const getOverview = asyncHandler(async (req, res) => ok(res, await walletService.overview()));

// GET /admin/wallets?status=negative|positive|locked&q= — ví các quán, âm nhiều nhất lên đầu
const listWallets = asyncHandler(async (req, res) => {
    const filter = { type: 'RESTAURANT' };
    const { status, q } = req.query;

    if (status === 'negative') filter.balance = { $lt: 0 };
    if (status === 'positive') filter.balance = { $gt: 0 };

    const restaurantConditions = [];
    if (status === 'locked') {
        restaurantConditions.push(await Restaurant.find({ walletLockedAt: { $ne: null } }).distinct('_id'));
    }
    if (q) {
        restaurantConditions.push(await findRestaurantIds(q));
    }
    if (restaurantConditions.length) {
        filter.$and = restaurantConditions.map((ids) => ({ restaurant: { $in: ids } }));
    }

    const result = await paginate(Wallet, filter, getPagination(req), {
        sort: { balance: 1, _id: 1 },
        populate: { path: 'restaurant', select: RESTAURANT_SELECT }
    });
    const { graceDays } = walletService.settings();

    return ok(res, {
        ...result,
        items: result.items.map((w) => ({
            ...w.toJSON(),
            lockDeadline: w.negativeSince ? new Date(w.negativeSince.getTime() + graceDays * 24 * 60 * 60 * 1000) : null
        }))
    });
});

// GET /admin/wallets/:restaurantId/entries
const listRestaurantEntries = asyncHandler(async (req, res) =>
    ok(res, await restaurantEntries(req.params.restaurantId, req))
);

// POST /admin/wallets/:restaurantId/adjustments { amount (+/-), reason }
const adjustWallet = asyncHandler(async (req, res) => {
    const restaurant = await Restaurant.findById(req.params.restaurantId).select('name');
    if (!restaurant) {
        throw new AppError(404, 'NOT_FOUND', 'Restaurant not found');
    }

    const { amount, reason } = req.body;
    await walletService.adjustWallet({ restaurantId: restaurant._id, amount, reason, actor: req.user.userId });
    await recordAudit(req, {
        action: 'WALLET_ADJUST',
        targetType: 'Restaurant',
        targetId: restaurant._id,
        after: { amount },
        note: reason
    });

    const wallet = await Wallet.findOne({ key: walletService.restaurantKey(restaurant._id) });
    return ok(res, { balance: wallet?.balance ?? 0 });
});

const listByStatus = (Model, { populate, paths = [{ path: 'restaurant', select: 'name slug' }] } = {}) =>
    asyncHandler(async (req, res) => {
        const filter = {};
        if (req.query.status) filter.status = req.query.status;
        if (req.query.q) filter.restaurant = { $in: await findRestaurantIds(req.query.q) };

        const result = await paginate(Model, filter, getPagination(req), {
            sort: { createdAt: -1, _id: -1 },
            populate: paths
        });
        return ok(res, populate ? { ...result, items: result.items.map(populate) } : result);
    });

// GET /admin/topups?status=&q=
const listTopups = listByStatus(Topup, { populate: walletService.withQr });

// GET /admin/payouts?status=&q= — gồm cả lệnh rút của tài xế MAK (shipper)
const listPayouts = listByStatus(Payout, {
    paths: [
        { path: 'restaurant', select: 'name slug' },
        { path: 'shipper', select: 'fullName phone' }
    ]
});

// POST /admin/topups/:id/confirm { receivedAmount?, bankRef? }
const confirmTopup = asyncHandler(async (req, res) => {
    const topup = await walletService.confirmTopup({
        topupId: req.params.id,
        // Express 5: không gửi body -> req.body undefined
        receivedAmount: req.body?.receivedAmount,
        bankRef: req.body?.bankRef,
        actor: req.user.userId
    });
    await recordAudit(req, {
        action: 'TOPUP_CONFIRM',
        targetType: 'Topup',
        targetId: topup._id,
        after: { status: 'CONFIRMED', receivedAmount: topup.receivedAmount, bankRef: topup.bankRef }
    });
    return ok(res, topup);
});

// POST /admin/topups/:id/reject { reason }
const rejectTopup = asyncHandler(async (req, res) => {
    const topup = await walletService.rejectTopup({ topupId: req.params.id, reason: req.body.reason, actor: req.user.userId });
    await recordAudit(req, {
        action: 'TOPUP_REJECT',
        targetType: 'Topup',
        targetId: topup._id,
        after: { status: 'REJECTED' },
        note: req.body.reason
    });
    return ok(res, topup);
});

// POST /admin/payouts/:id/paid { bankRef? } · /reject { reason }
const processPayout = (status) =>
    asyncHandler(async (req, res) => {
        const payout = await walletService.processPayout({
            payoutId: req.params.id,
            status,
            bankRef: req.body?.bankRef,
            reason: req.body?.reason,
            actor: req.user.userId
        });
        await recordAudit(req, {
            action: status === 'PAID' ? 'PAYOUT_PAID' : 'PAYOUT_REJECT',
            targetType: 'Payout',
            targetId: payout._id,
            after: { status, amount: payout.amount, bankRef: payout.bankRef },
            note: req.body?.reason
        });
        return ok(res, payout);
    });

module.exports = {
    getMyWallet,
    listMyEntries,
    updateBankAccount,
    createTopup,
    listMyTopups,
    cancelMyTopup,
    requestPayout,
    listMyPayouts,
    getOverview,
    listWallets,
    listRestaurantEntries,
    adjustWallet,
    listTopups,
    listPayouts,
    confirmTopup,
    rejectTopup,
    markPayoutPaid: processPayout('PAID'),
    rejectPayout: processPayout('REJECTED')
};
