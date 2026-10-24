const mongoose = require('mongoose');

const Wallet = require('./wallet.model');
const WalletEntry = require('./walletEntry.model');
const Topup = require('./topup.model');
const Payout = require('./payout.model');
const Payment = require('../payment/payment.model');
const Refund = require('../payment/refund.model');
const Restaurant = require('../restaurant/restaurant.model');
const Counter = require('../order/counter.model');
const notifications = require('../notification/notification.service');
const AppError = require('../../utils/AppError');
const { toLocalDateKey } = require('../../utils/openingHours');

/**
 * Ví đối soát (sổ cái kép) — docs/API.md mục 2.10.
 * Quy tắc: mọi thay đổi số dư đi qua postJournal, tổng các dòng = 0, chạy trong transaction
 * cùng thao tác gốc (đơn hoàn thành, xác nhận nạp tiền...).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// Đọc env lúc gọi (test đổi được)
const settings = () => ({
    // Ví quán được âm tối đa bấy nhiêu; vượt -> khóa nhận đơn ngay
    creditLimit: Number(process.env.WALLET_CREDIT_LIMIT) || 100000,
    // Âm liên tục quá số ngày này -> khóa nhận đơn
    graceDays: Number(process.env.WALLET_GRACE_DAYS) || 3,
    payoutMin: Number(process.env.PAYOUT_MIN_AMOUNT) || 50000,
    topupMin: Number(process.env.TOPUP_MIN_AMOUNT) || 10000
});

const vnd = new Intl.NumberFormat('vi-VN');
const money = (n) => `${vnd.format(n)} đ`;

const SYSTEM = {
    PLATFORM: { key: 'PLATFORM', type: 'PLATFORM' },
    PAYOUT_HOLD: { key: 'PAYOUT_HOLD', type: 'PAYOUT_HOLD' },
    EXTERNAL: { key: 'EXTERNAL', type: 'EXTERNAL' },
    ESCROW: { key: 'ESCROW', type: 'ESCROW' },
    REFUND_HOLD: { key: 'REFUND_HOLD', type: 'REFUND_HOLD' }
};

const restaurantKey = (restaurantId) => `restaurant:${restaurantId}`;
const restaurantLine = (restaurantId, amount) => ({
    key: restaurantKey(restaurantId),
    type: 'RESTAURANT',
    restaurant: restaurantId,
    amount
});
const systemLine = (name, amount) => ({ ...SYSTEM[name], amount });
const shipperKey = (shipperId) => `shipper:${shipperId}`;
const shipperLine = (shipperId, amount) => ({
    key: shipperKey(shipperId),
    type: 'SHIPPER',
    shipper: shipperId,
    amount
});

// ======================= Tài khoản nhận tiền của MAK (VietQR) =======================

// PAYMENT_BANK_ID: mã ngân hàng theo VietQR (vd MB, VCB, 970422). Chưa cấu hình -> null
const platformBank = () => {
    const { PAYMENT_BANK_ID: bankId, PAYMENT_ACCOUNT_NO: accountNo, PAYMENT_ACCOUNT_NAME: accountName } = process.env;
    return bankId && accountNo ? { bankId, accountNo, accountName: accountName || '' } : null;
};

const vietQrUrl = ({ amount, content }) => {
    const bank = platformBank();
    if (!bank) {
        return null;
    }

    const params = new URLSearchParams({ amount: String(amount), addInfo: content });
    if (bank.accountName) {
        params.set('accountName', bank.accountName);
    }
    return `https://img.vietqr.io/image/${encodeURIComponent(bank.bankId)}-${encodeURIComponent(bank.accountNo)}-compact2.png?${params}`;
};

// ======================= Sổ cái =======================

/**
 * Ghi một bút toán. lines: [{ key, type, restaurant?, amount }] — tổng phải = 0, dòng 0đ bị bỏ.
 * Cùng `ref` đã ghi rồi -> bỏ qua (chống cộng / trừ hai lần).
 * @returns null nếu không ghi gì, ngược lại { journal, restaurants: [{ restaurant, balance, becameNegative }] }
 */
const postJournal = async ({ ref, kind, lines, order, topup, payout, payment, refund, note, actor }, session) => {
    const nonZero = lines.filter((l) => l.amount !== 0);

    if (nonZero.some((l) => !Number.isInteger(l.amount))) {
        throw new Error(`Journal ${ref}: amounts must be integers (VND)`);
    }
    if (nonZero.reduce((s, l) => s + l.amount, 0) !== 0) {
        throw new Error(`Journal ${ref} is not balanced`);
    }
    if (nonZero.length === 0 || (await WalletEntry.exists({ ref }).session(session))) {
        return null;
    }

    const now = new Date();
    const journal = new mongoose.Types.ObjectId();
    const entries = [];
    const restaurants = [];

    for (const line of nonZero) {
        const wallet = await Wallet.findOneAndUpdate(
            { key: line.key },
            { $inc: { balance: line.amount }, $setOnInsert: { type: line.type, restaurant: line.restaurant, shipper: line.shipper } },
            { upsert: true, returnDocument: 'after', session }
        );

        if (wallet.type === 'RESTAURANT') {
            const becameNegative = wallet.balance < 0 && !wallet.negativeSince;
            if (becameNegative) {
                await Wallet.updateOne({ _id: wallet._id }, { $set: { negativeSince: now } }, { session });
            } else if (wallet.balance >= 0 && wallet.negativeSince) {
                await Wallet.updateOne({ _id: wallet._id }, { $set: { negativeSince: null } }, { session });
            }
            restaurants.push({ restaurant: wallet.restaurant, balance: wallet.balance, becameNegative });
        }

        entries.push({
            journal,
            ref,
            wallet: wallet._id,
            walletType: wallet.type,
            restaurant: wallet.restaurant,
            shipper: wallet.shipper,
            kind,
            amount: line.amount,
            balanceAfter: wallet.balance,
            order,
            topup,
            payout,
            payment,
            refund,
            note,
            actor
        });
    }

    await WalletEntry.insertMany(entries, { session });
    return { journal, restaurants };
};

const inTransaction = async (fn) => {
    let result;
    await mongoose.connection.transaction(async (session) => {
        result = await fn(session);
    });
    return result;
};

// ======================= Khóa / mở nhận đơn theo số dư =======================

const lockDeadline = (wallet) =>
    wallet?.negativeSince ? new Date(wallet.negativeSince.getTime() + settings().graceDays * DAY_MS) : null;

/**
 * Quán bị khóa nhận đơn khi ví âm quá hạn mức, hoặc âm liên tục quá N ngày.
 * Mở lại tự động khi số dư >= 0. Không đụng tới status (BLOCKED là việc của admin)
 * và isAcceptingOrders (mở khóa xong quán bán lại ngay như trước).
 * @returns 'LOCKED' | 'UNLOCKED' | null
 */
const syncWalletLock = async (restaurantId, now = new Date()) => {
    const [wallet, restaurant] = await Promise.all([
        Wallet.findOne({ key: restaurantKey(restaurantId) }),
        Restaurant.findById(restaurantId).select('owner name walletLockedAt')
    ]);

    if (!restaurant) {
        return null;
    }

    const balance = wallet?.balance ?? 0;
    const deadline = lockDeadline(wallet);
    const overLimit = balance < -settings().creditLimit;
    const overdue = balance < 0 && deadline && now >= deadline;

    if ((overLimit || overdue) && !restaurant.walletLockedAt) {
        const reason = overLimit ? 'OVER_LIMIT' : 'OVERDUE';
        const { modifiedCount } = await Restaurant.updateOne(
            { _id: restaurantId, walletLockedAt: null },
            { $set: { walletLockedAt: now, walletLockReason: reason } }
        );
        if (modifiedCount) {
            await notifications.walletLocked(restaurant, { reason, balance });
            return 'LOCKED';
        }
    }

    if (balance >= 0 && restaurant.walletLockedAt) {
        const { modifiedCount } = await Restaurant.updateOne(
            { _id: restaurantId, walletLockedAt: { $ne: null } },
            { $set: { walletLockedAt: null, walletLockReason: null } }
        );
        if (modifiedCount) {
            await notifications.walletUnlocked(restaurant, { balance });
            return 'UNLOCKED';
        }
    }

    return null;
};

// Sau khi commit: báo ví vừa âm + khóa / mở quán. Lỗi chỉ ghi log — job mỗi giờ sẽ đồng bộ lại.
const afterPosting = async (posted, now = new Date()) => {
    for (const r of posted?.restaurants ?? []) {
        try {
            if (r.becameNegative) {
                const restaurant = await Restaurant.findById(r.restaurant).select('owner name');
                const wallet = await Wallet.findOne({ key: restaurantKey(r.restaurant) });
                await notifications.walletNegative(restaurant, { balance: wallet.balance, deadline: lockDeadline(wallet) });
            }
            await syncWalletLock(r.restaurant, now);
        } catch (error) {
            console.error('[wallet] afterPosting failed:', error.message);
        }
    }
};

/**
 * Job: khóa quán âm quá hạn / quá hạn mức, mở quán đã hết nợ. Trả về số quán đổi trạng thái.
 */
const syncAllWalletLocks = async (now = new Date()) => {
    const { creditLimit, graceDays } = settings();
    const [wallets, locked] = await Promise.all([
        Wallet.find({
            type: 'RESTAURANT',
            $or: [
                { balance: { $lt: -creditLimit } },
                { balance: { $lt: 0 }, negativeSince: { $lte: new Date(now.getTime() - graceDays * DAY_MS) } }
            ]
        }).distinct('restaurant'),
        Restaurant.find({ walletLockedAt: { $ne: null } }).distinct('_id')
    ]);

    const ids = [...new Set([...wallets, ...locked].map(String))];
    let changed = 0;
    for (const id of ids) {
        if (await syncWalletLock(id, now)) {
            changed += 1;
        }
    }
    return changed;
};

// ======================= Đơn hàng =======================

/**
 * Đơn hoàn thành -> chia tiền (gọi trong transaction đổi trạng thái).
 * Hoa hồng tính trên tạm tính (trước voucher), voucher do nền tảng chịu (quyết định 11/10/2026).
 * - COD: quán đã thu tiền mặt của khách -> ví quán trừ hoa hồng, cộng phần voucher MAK chịu.
 * - Trả trước: tiền khách nằm ở ESCROW -> ví quán nhận (tổng + voucher − hoa hồng), nền tảng nhận hoa hồng − voucher.
 */
const settleOrder = async (order, session) => {
    const commission = order.commissionAmount || 0;
    // Chỉ voucher MAK do nền tảng bù; voucher quán do quán tự chịu (đã trừ vào tiền khách trả)
    const voucher = order.platformDiscount || 0;
    const parts = [`hoa hồng ${money(commission)}`];
    if (voucher) {
        parts.push(`MAK bù voucher ${money(voucher)}`);
    }

    if (order.paymentMethod === 'BANK_TRANSFER') {
        const restaurantShare = order.total + voucher - commission;
        return postJournal(
            {
                ref: `ORDER_SETTLE:${order._id}`,
                kind: 'ORDER_SETTLE',
                order: order._id,
                note: `Đơn ${order.code} (khách trả trước ${money(order.total)}): ${parts.join(', ')}`,
                lines: [
                    systemLine('ESCROW', -order.total),
                    restaurantLine(order.restaurant, restaurantShare),
                    systemLine('PLATFORM', commission - voucher)
                ]
            },
            session
        );
    }

    const delta = voucher - commission;
    return postJournal(
        {
            ref: `ORDER_SETTLE:${order._id}`,
            kind: 'ORDER_SETTLE',
            order: order._id,
            note: `Đơn ${order.code}: ${parts.join(', ')}`,
            lines: [restaurantLine(order.restaurant, delta), systemLine('PLATFORM', -delta)]
        },
        session
    );
};

// ======================= Tài xế MAK =======================

/**
 * Tiền công tài xế (Q4, chốt 21/10/2026): 10.000 đ cho 2 km đầu + 3.000 đ cho mỗi km tiếp theo
 * (km lẻ tính tròn lên), theo quãng đường thật quán -> khách. Đọc env lúc gọi (test đổi được).
 */
const shipperSettings = () => ({
    baseFee: Number(process.env.SHIPPER_BASE_FEE) || 10000,
    baseKm: Number(process.env.SHIPPER_BASE_KM) || 2,
    perKm: Number(process.env.SHIPPER_PER_KM) || 3000,
    cancelCompensation: Number(process.env.SHIPPER_CANCEL_COMPENSATION) || 5000
});

const shipperFeeFor = (distanceKm) => {
    const { baseFee, baseKm, perKm } = shipperSettings();
    // Làm tròn 1 chữ số trước khi tính để 3.0000001 km không thành 2 km tiếp theo
    const extraKm = Math.max(0, Math.ceil(Math.round(((distanceKm || 0) - baseKm) * 10) / 10));
    return baseFee + extraKm * perKm;
};

/** Đơn tài xế MAK giao xong: MAK trả tiền công (khách miễn phí ship — Q3). Gọi trong transaction hoàn thành đơn. */
const payShipperFee = (order, session) =>
    postJournal(
        {
            ref: `SHIPPER_FEE:${order._id}`,
            kind: 'SHIPPER_FEE',
            order: order._id,
            note: `Tiền công giao đơn ${order.code}${order.route?.distanceKm ? ` (${order.route.distanceKm} km)` : ''}`,
            lines: [systemLine('PLATFORM', -order.shipperFee), shipperLine(order.delivery.shipper, order.shipperFee)]
        },
        session
    );

/** Đơn bị hủy khi tài xế đã nhận (chưa lấy hàng) -> MAK bù cho tài xế */
const compensateShipper = (order, shipperId, session) => {
    const amount = shipperSettings().cancelCompensation;
    return postJournal(
        {
            ref: `SHIPPER_COMPENSATION:${order._id}:${shipperId}`,
            kind: 'SHIPPER_COMPENSATION',
            order: order._id,
            note: `Bù chuyến đơn ${order.code} bị hủy khi tài xế đang tới quán`,
            lines: [systemLine('PLATFORM', -amount), shipperLine(shipperId, amount)]
        },
        session
    );
};

// ======================= Ví của quán =======================

const toBankAccount = (r) => (r.bankAccount?.accountNumber ? r.bankAccount : null);

// ======================= Ví của tài xế =======================

const getShipperWallet = async (shipper) => {
    const [wallet, pendingPayout] = await Promise.all([
        Wallet.findOne({ key: shipperKey(shipper._id) }),
        Payout.findOne({ shipper: shipper._id, status: 'REQUESTED' })
    ]);
    const balance = wallet?.balance ?? 0;
    return {
        balance,
        available: Math.max(0, balance),
        payoutMin: settings().payoutMin,
        ...shipperSettings(),
        bankAccount: toBankAccount(shipper),
        pendingPayout
    };
};

const withQr = (topup) =>
    topup && {
        ...topup.toJSON(),
        transferContent: topup.code,
        qrUrl: vietQrUrl({ amount: topup.amount, content: topup.code })
    };

const getRestaurantWallet = async (restaurant) => {
    const [wallet, pendingPayout, pendingTopup] = await Promise.all([
        Wallet.findOne({ key: restaurantKey(restaurant._id) }),
        Payout.findOne({ restaurant: restaurant._id, status: 'REQUESTED' }),
        Topup.findOne({ restaurant: restaurant._id, status: 'PENDING' }).sort({ createdAt: -1 })
    ]);
    const balance = wallet?.balance ?? 0;

    return {
        balance,
        available: Math.max(0, balance),
        negativeSince: wallet?.negativeSince ?? null,
        lockDeadline: lockDeadline(wallet),
        locked: Boolean(restaurant.walletLockedAt),
        lockedAt: restaurant.walletLockedAt ?? null,
        lockReason: restaurant.walletLockReason ?? null,
        ...settings(),
        bankAccount: toBankAccount(restaurant),
        pendingPayout,
        pendingTopup: withQr(pendingTopup),
        platformBank: platformBank()
    };
};

const notFound = (what) => new AppError(404, 'NOT_FOUND', `${what} not found`);

// ---- Nạp tiền ----

const nextTopupCode = async (session) => {
    const day = toLocalDateKey();
    const counter = await Counter.findOneAndUpdate(
        { _id: `topup:${day}` },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after', session }
    );
    return `NAP${day}${String(counter.seq).padStart(4, '0')}`;
};

// Tạo lệnh nạp mới (lệnh đang chờ cũ bị hủy, mỗi lúc chỉ một mã chuyển khoản)
const createTopup = async ({ restaurant, userId, amount }) => {
    const { topupMin } = settings();
    if (amount < topupMin) {
        throw new AppError(400, 'VALIDATION_ERROR', `Minimum top-up is ${topupMin}`, [
            { field: 'amount', msg: `Minimum top-up is ${topupMin}` }
        ]);
    }

    const topup = await inTransaction(async (session) => {
        await Topup.updateMany(
            { restaurant: restaurant._id, status: 'PENDING' },
            { $set: { status: 'CANCELLED' } },
            { session }
        );
        const [created] = await Topup.create(
            [{ code: await nextTopupCode(session), restaurant: restaurant._id, requestedBy: userId, amount }],
            { session }
        );
        return created;
    });

    await notifications.topupRequested(topup, restaurant);
    return withQr(topup);
};

const cancelTopup = async ({ restaurant, topupId }) => {
    const topup = await Topup.findOneAndUpdate(
        { _id: topupId, restaurant: restaurant._id, status: 'PENDING' },
        { $set: { status: 'CANCELLED' } },
        { returnDocument: 'after' }
    );
    if (!topup) {
        if (!(await Topup.exists({ _id: topupId, restaurant: restaurant._id }))) {
            throw notFound('Top-up');
        }
        throw new AppError(409, 'INVALID_STATUS_TRANSITION', 'Top-up is no longer pending');
    }
    return topup;
};

/**
 * Xác nhận đã nhận tiền nạp -> cộng ví quán (có thể mở khóa quán).
 * Admin gọi tay; W2: webhook SePay gọi với actor = undefined.
 * Lệnh đã hủy vẫn xác nhận được (quán hủy nhưng vẫn lỡ chuyển tiền).
 */
const confirmTopup = async ({ topupId, receivedAmount, bankRef, actor, paymentId }) => {
    let posted;
    const topup = await inTransaction(async (session) => {
        const current = await Topup.findById(topupId).session(session);
        if (!current) {
            throw notFound('Top-up');
        }

        const amount = receivedAmount ?? current.amount;
        const updated = await Topup.findOneAndUpdate(
            { _id: topupId, status: { $in: ['PENDING', 'CANCELLED'] } },
            {
                $set: { status: 'CONFIRMED', receivedAmount: amount, bankRef, processedBy: actor, processedAt: new Date() }
            },
            { returnDocument: 'after', session }
        );
        if (!updated) {
            throw new AppError(409, 'INVALID_STATUS_TRANSITION', `Top-up is already ${current.status}`);
        }

        posted = await postJournal(
            {
                ref: `TOPUP:${updated._id}`,
                kind: 'TOPUP',
                topup: updated._id,
                actor,
                payment: paymentId,
                note: `Nạp tiền ${updated.code}${bankRef ? ` (GD ${bankRef})` : ''}${paymentId ? ' — SePay tự xác nhận' : ''}`,
                lines: [restaurantLine(updated.restaurant, amount), systemLine('EXTERNAL', -amount)]
            },
            session
        );
        // Webhook SePay: đánh dấu giao dịch đã khớp trong cùng transaction (không xử lý hai lần)
        if (paymentId) {
            await Payment.updateOne({ _id: paymentId }, { $set: { status: 'MATCHED_TOPUP', topup: updated._id } }, { session });
        }
        return updated;
    });

    await notifications.topupProcessed(topup);
    await afterPosting(posted);
    return topup;
};

const rejectTopup = async ({ topupId, reason, actor }) => {
    const topup = await Topup.findOneAndUpdate(
        { _id: topupId, status: 'PENDING' },
        { $set: { status: 'REJECTED', rejectReason: reason, processedBy: actor, processedAt: new Date() } },
        { returnDocument: 'after' }
    );
    if (!topup) {
        if (!(await Topup.exists({ _id: topupId }))) {
            throw notFound('Top-up');
        }
        throw new AppError(409, 'INVALID_STATUS_TRANSITION', 'Top-up is no longer pending');
    }

    await notifications.topupProcessed(topup);
    return topup;
};

// ---- Rút tiền ----

/**
 * Yêu cầu rút tiền: owner = quán hoặc tài xế — cùng luồng, khác ví.
 * Tiền chuyển ngay sang PAYOUT_HOLD, admin chuyển khoản rồi xác nhận.
 */
const requestPayoutFor = async ({ isShipper, owner, userId, amount }) => {
    const { payoutMin } = settings();
    const bankAccount = toBankAccount(owner);
    const ownerFilter = isShipper ? { shipper: owner._id } : { restaurant: owner._id };
    const key = isShipper ? shipperKey(owner._id) : restaurantKey(owner._id);
    const line = isShipper ? shipperLine : restaurantLine;

    if (!bankAccount) {
        throw new AppError(422, 'BANK_ACCOUNT_REQUIRED', 'Add a bank account before requesting a payout');
    }
    if (amount < payoutMin) {
        throw new AppError(400, 'VALIDATION_ERROR', `Minimum payout is ${payoutMin}`, [
            { field: 'amount', msg: `Minimum payout is ${payoutMin}` }
        ]);
    }

    try {
        const payout = await inTransaction(async (session) => {
            if (await Payout.exists({ ...ownerFilter, status: 'REQUESTED' }).session(session)) {
                throw new AppError(409, 'PAYOUT_PENDING', 'A payout request is already pending');
            }

            // Đọc số dư trong transaction: hai yêu cầu song song cùng $inc một ví -> một bên bị retry, đọc lại số mới
            const wallet = await Wallet.findOne({ key }).session(session);
            if ((wallet?.balance ?? 0) < amount) {
                throw new AppError(422, 'INSUFFICIENT_BALANCE', 'Wallet balance is not enough');
            }

            const [created] = await Payout.create([{ ...ownerFilter, requestedBy: userId, amount, bankAccount }], { session });
            await postJournal(
                {
                    ref: `PAYOUT_REQUEST:${created._id}`,
                    kind: 'PAYOUT_REQUEST',
                    payout: created._id,
                    actor: userId,
                    note: `Yêu cầu rút tiền về ${bankAccount.bankName} ${bankAccount.accountNumber}`,
                    lines: [line(owner._id, -amount), systemLine('PAYOUT_HOLD', amount)]
                },
                session
            );
            return created;
        });

        await notifications.payoutRequested(payout, isShipper ? { name: `Tài xế ${owner.fullName}` } : owner);
        return payout;
    } catch (error) {
        if (error?.code === 11000) {
            throw new AppError(409, 'PAYOUT_PENDING', 'A payout request is already pending');
        }
        throw error;
    }
};

const requestPayout = ({ restaurant, userId, amount }) => requestPayoutFor({ isShipper: false, owner: restaurant, userId, amount });
const requestShipperPayout = ({ shipper, userId, amount }) => requestPayoutFor({ isShipper: true, owner: shipper, userId, amount });

// Admin xử lý yêu cầu rút: PAID (đã chuyển khoản) hoặc REJECTED (trả tiền lại ví quán)
const processPayout = async ({ payoutId, status, bankRef, reason, actor }) => {
    let posted;
    const payout = await inTransaction(async (session) => {
        const updated = await Payout.findOneAndUpdate(
            { _id: payoutId, status: 'REQUESTED' },
            {
                $set: {
                    status,
                    ...(status === 'PAID' ? { bankRef } : { rejectReason: reason }),
                    processedBy: actor,
                    processedAt: new Date()
                }
            },
            { returnDocument: 'after', session }
        );
        if (!updated) {
            if (!(await Payout.exists({ _id: payoutId }).session(session))) {
                throw notFound('Payout');
            }
            throw new AppError(409, 'INVALID_STATUS_TRANSITION', 'Payout is no longer pending');
        }

        const paid = status === 'PAID';
        posted = await postJournal(
            {
                ref: `PAYOUT_${paid ? 'PAID' : 'REJECT'}:${updated._id}`,
                kind: paid ? 'PAYOUT_PAID' : 'PAYOUT_REJECT',
                payout: updated._id,
                actor,
                note: paid ? `Đã chuyển khoản${bankRef ? ` (GD ${bankRef})` : ''}` : `Từ chối rút tiền: ${reason}`,
                lines: paid
                    ? [systemLine('PAYOUT_HOLD', -updated.amount), systemLine('EXTERNAL', updated.amount)]
                    : [
                          systemLine('PAYOUT_HOLD', -updated.amount),
                          updated.shipper ? shipperLine(updated.shipper, updated.amount) : restaurantLine(updated.restaurant, updated.amount)
                      ]
            },
            session
        );
        return updated;
    });

    await notifications.payoutProcessed(payout);
    await afterPosting(posted);
    return payout;
};

// ---- Điều chỉnh tay (admin) ----

const adjustWallet = async ({ restaurantId, amount, reason, actor }) => {
    const posted = await inTransaction((session) =>
        postJournal(
            {
                ref: `ADJUSTMENT:${new mongoose.Types.ObjectId()}`,
                kind: 'ADJUSTMENT',
                actor,
                note: reason,
                lines: [restaurantLine(restaurantId, amount), systemLine('PLATFORM', -amount)]
            },
            session
        )
    );

    await afterPosting(posted);
    return posted;
};

// ======================= Admin: tổng quan + đối soát =======================

const overview = async () => {
    const [byType, entryTotal, lockedRestaurants, pendingTopups, pendingPayouts, pendingRefunds, unmatchedPayments] = await Promise.all([
        Wallet.aggregate([
            {
                $group: {
                    _id: '$type',
                    balance: { $sum: '$balance' },
                    positive: { $sum: { $cond: [{ $gt: ['$balance', 0] }, '$balance', 0] } },
                    negative: { $sum: { $cond: [{ $lt: ['$balance', 0] }, '$balance', 0] } },
                    negativeCount: { $sum: { $cond: [{ $lt: ['$balance', 0] }, 1, 0] } }
                }
            }
        ]),
        WalletEntry.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
        Restaurant.countDocuments({ walletLockedAt: { $ne: null } }),
        Topup.countDocuments({ status: 'PENDING' }),
        Payout.aggregate([{ $match: { status: 'REQUESTED' } }, { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
        Refund.aggregate([{ $match: { status: 'PENDING' } }, { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
        Payment.countDocuments({ status: 'UNMATCHED' })
    ]);

    const of = (type) => byType.find((t) => t._id === type) ?? { balance: 0, positive: 0, negative: 0, negativeCount: 0 };
    const totalBalance = byType.reduce((s, t) => s + t.balance, 0);

    return {
        platformRevenue: of('PLATFORM').balance,
        cashHeld: -of('EXTERNAL').balance,
        payoutHold: of('PAYOUT_HOLD').balance,
        owedToRestaurants: of('RESTAURANT').positive,
        owedByRestaurants: -of('RESTAURANT').negative,
        negativeRestaurants: of('RESTAURANT').negativeCount,
        // Thu nhập tài xế chưa rút
        owedToShippers: of('SHIPPER').positive,
        lockedRestaurants,
        pendingTopups,
        pendingPayouts: { count: pendingPayouts[0]?.count ?? 0, amount: pendingPayouts[0]?.amount ?? 0 },
        // Trả trước (W2): tiền khách đang giữ chờ đơn hoàn thành, tiền phải hoàn
        escrow: of('ESCROW').balance,
        refundHold: of('REFUND_HOLD').balance,
        pendingRefunds: { count: pendingRefunds[0]?.count ?? 0, amount: pendingRefunds[0]?.amount ?? 0 },
        unmatchedPayments,
        // Đối soát: sổ cái kép thì tổng số dư và tổng các dòng sổ đều phải = 0
        balanced: totalBalance === 0 && (entryTotal[0]?.total ?? 0) === 0
    };
};

module.exports = {
    SYSTEM,
    systemLine,
    restaurantLine,
    inTransaction,
    settings,
    platformBank,
    vietQrUrl,
    restaurantKey,
    shipperKey,
    shipperLine,
    postJournal,
    settleOrder,
    shipperSettings,
    shipperFeeFor,
    payShipperFee,
    compensateShipper,
    getShipperWallet,
    requestShipperPayout,
    afterPosting,
    syncWalletLock,
    syncAllWalletLocks,
    getRestaurantWallet,
    withQr,
    createTopup,
    cancelTopup,
    confirmTopup,
    rejectTopup,
    requestPayout,
    processPayout,
    adjustWallet,
    overview
};
