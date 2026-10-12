const crypto = require('crypto');

const Payment = require('./payment.model');
const Refund = require('./refund.model');
const Order = require('../order/order.model');
const Topup = require('../wallet/topup.model');
const wallet = require('../wallet/wallet.service');
const notifications = require('../notification/notification.service');
const { emitOrderNew, emitOrderStatusChanged } = require('../../realtime/socket');
const AppError = require('../../utils/AppError');

/**
 * Thanh toán trả trước bằng chuyển khoản VietQR + webhook SePay tự xác nhận (W2) — docs/API.md mục 2.11.
 *
 * Dòng tiền (sổ cái ví đối soát):
 *   khách chuyển đủ        EXTERNAL −X, ESCROW +tổng đơn, REFUND_HOLD +phần thừa
 *   chuyển muộn/thiếu/trùng EXTERNAL −X, REFUND_HOLD +X  (lệnh hoàn tiền)
 *   đơn đã trả bị hủy      ESCROW −tổng, REFUND_HOLD +tổng (lệnh hoàn tiền)
 *   đơn hoàn thành         ESCROW −tổng -> ví quán + nền tảng (wallet.settleOrder)
 *   admin đã hoàn          REFUND_HOLD −X, EXTERNAL +X
 */

const vnd = new Intl.NumberFormat('vi-VN');
const money = (n) => `${vnd.format(n)} đ`;

const paymentTimeoutMinutes = () => Number(process.env.PAYMENT_TIMEOUT_MINUTES) || 15;
const sepayKey = () => process.env.SEPAY_WEBHOOK_API_KEY || '';

// Chỉ mở chuyển khoản khi có tài khoản nhận + khóa webhook (không có webhook thì đơn không bao giờ được xác nhận)
const isBankTransferEnabled = () => Boolean(wallet.platformBank() && sepayKey());

const availableMethods = () => ({
    COD: true,
    BANK_TRANSFER: isBankTransferEnabled(),
    paymentTimeoutMinutes: paymentTimeoutMinutes()
});

// MAK261011-0001 -> MAK2610110001
const toPaymentCode = (orderCode) => orderCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

// Nhận mã trong nội dung chuyển khoản: ngân hàng có thể chèn thêm chữ / bỏ dấu cách
const CODE_RE = /(MAK\d{10}|NAP\d{10})/;
const extractCode = (...sources) => {
    for (const s of sources) {
        const match = s && String(s).toUpperCase().replace(/[^A-Z0-9]/g, '').match(CODE_RE);
        if (match) {
            return match[1];
        }
    }
    return null;
};

// Header SePay: "Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>" — so sánh thời gian hằng
const verifyWebhookAuth = (header) => {
    const key = sepayKey();
    if (!key) {
        return false;
    }
    const given = Buffer.from(String(header || ''));
    const expected = Buffer.from(`Apikey ${key}`);
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
};

/** Thông tin để khách quét mã (trang thanh toán) */
const orderPaymentInfo = (order) => ({
    orderId: order._id,
    code: order.code,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    amount: order.total,
    paymentCode: order.paymentCode,
    paymentDeadline: order.paymentDeadline,
    paidAt: order.paidAt,
    paidAmount: order.paidAmount,
    qrUrl: order.status === 'PENDING_PAYMENT' ? wallet.vietQrUrl({ amount: order.total, content: order.paymentCode }) : null,
    bank: wallet.platformBank()
});

// ======================= Hoàn tiền =======================

/**
 * Đơn đã thanh toán bị hủy / từ chối (gọi trong transaction đổi trạng thái) -> lệnh hoàn tiền.
 * @returns đơn sau khi đổi paymentStatus = REFUND_PENDING
 */
const refundPaidOrder = async (order, session) => {
    const [refund] = await Refund.create(
        [
            {
                order: order._id,
                customer: order.customer,
                amount: order.total,
                reason: 'ORDER_CANCELLED',
                note: `Đơn ${order.code} bị hủy sau khi khách đã thanh toán`
            }
        ],
        { session }
    );

    await wallet.postJournal(
        {
            ref: `ORDER_REFUND:${order._id}`,
            kind: 'REFUND_PENDING',
            order: order._id,
            refund: refund._id,
            note: `Hoàn tiền đơn ${order.code}`,
            lines: [wallet.systemLine('ESCROW', -order.total), wallet.systemLine('REFUND_HOLD', order.total)]
        },
        session
    );

    const updated = await Order.findByIdAndUpdate(
        order._id,
        { $set: { paymentStatus: 'REFUND_PENDING' } },
        { returnDocument: 'after', session }
    );
    return { order: updated, refund };
};

/** Admin đã chuyển khoản trả khách -> DONE, đơn REFUNDED */
const completeRefund = async ({ refundId, bankRef, actor }) => {
    const refund = await wallet.inTransaction(async (session) => {
        const updated = await Refund.findOneAndUpdate(
            { _id: refundId, status: 'PENDING' },
            { $set: { status: 'DONE', bankRef, processedBy: actor, processedAt: new Date() } },
            { returnDocument: 'after', session }
        );
        if (!updated) {
            if (!(await Refund.exists({ _id: refundId }).session(session))) {
                throw new AppError(404, 'NOT_FOUND', 'Refund not found');
            }
            throw new AppError(409, 'INVALID_STATUS_TRANSITION', 'Refund is already done');
        }

        await wallet.postJournal(
            {
                ref: `REFUND_PAID:${updated._id}`,
                kind: 'REFUND_PAID',
                order: updated.order,
                refund: updated._id,
                actor,
                note: `Đã hoàn ${money(updated.amount)}${bankRef ? ` (GD ${bankRef})` : ''}`,
                lines: [wallet.systemLine('REFUND_HOLD', -updated.amount), wallet.systemLine('EXTERNAL', updated.amount)]
            },
            session
        );

        if (updated.order && updated.reason === 'ORDER_CANCELLED') {
            await Order.updateOne(
                { _id: updated.order, paymentStatus: 'REFUND_PENDING' },
                { $set: { paymentStatus: 'REFUNDED' } },
                { session }
            );
        }
        return updated;
    });

    await notifications.refundDone(refund);
    return refund;
};

// ======================= Webhook SePay =======================

const finish = async (payment, status, note) => {
    await Payment.updateOne({ _id: payment._id }, { $set: { status, note } });
    return status;
};

const unmatched = async (payment, note) => {
    await finish(payment, 'UNMATCHED', note);
    await notifications.paymentUnmatched(payment, note);
    return 'UNMATCHED';
};

const PROBLEM_STATUS = { UNDERPAID: 'UNDERPAID', DUPLICATE: 'DUPLICATE', LATE_PAYMENT: 'LATE' };

/** Tiền về cho đơn: đủ -> xác nhận, gửi đơn tới quán; muộn / thiếu / trùng -> lệnh hoàn tiền */
const confirmOrderPayment = async (orderId, payment) => {
    const amount = payment.amount;

    const result = await wallet.inTransaction(async (session) => {
        // Đọc trong transaction: job hết hạn đổi đơn cùng lúc -> một bên bị retry, đọc lại trạng thái mới
        const order = await Order.findById(orderId).session(session);
        const now = new Date();

        if (order.status === 'PENDING_PAYMENT' && amount >= order.total) {
            const updated = await Order.findOneAndUpdate(
                { _id: order._id, status: 'PENDING_PAYMENT' },
                {
                    $set: { status: 'PLACED', paymentStatus: 'PAID', paidAt: now, paidAmount: amount, placedAt: now },
                    $push: {
                        statusHistory: { from: 'PENDING_PAYMENT', to: 'PLACED', actorType: 'SYSTEM', reason: 'PAYMENT_RECEIVED', at: now }
                    }
                },
                { returnDocument: 'after', session }
            );

            const excess = amount - order.total;
            let refund = null;
            if (excess > 0) {
                [refund] = await Refund.create(
                    [{ order: order._id, payment: payment._id, customer: order.customer, amount: excess, reason: 'OVERPAID', note: `Chuyển thừa cho đơn ${order.code}` }],
                    { session }
                );
            }

            await wallet.postJournal(
                {
                    ref: `PAYMENT:${payment._id}`,
                    kind: 'ORDER_PAYMENT',
                    order: order._id,
                    payment: payment._id,
                    refund: refund?._id,
                    note: `Khách chuyển ${money(amount)} cho đơn ${order.code}`,
                    lines: [
                        wallet.systemLine('EXTERNAL', -amount),
                        wallet.systemLine('ESCROW', order.total),
                        wallet.systemLine('REFUND_HOLD', excess)
                    ]
                },
                session
            );
            await Payment.updateOne(
                { _id: payment._id },
                { $set: { status: 'MATCHED_ORDER', order: order._id, note: excess > 0 ? `Thừa ${money(excess)} — đã tạo lệnh hoàn` : undefined } },
                { session }
            );
            return { paid: true, order: updated, refund };
        }

        // Không xác nhận được: hoàn lại toàn bộ khoản này
        const reason =
            order.status === 'PENDING_PAYMENT'
                ? 'UNDERPAID'
                : ['PAID', 'REFUND_PENDING', 'REFUNDED'].includes(order.paymentStatus)
                  ? 'DUPLICATE'
                  : 'LATE_PAYMENT';
        const [refund] = await Refund.create(
            [{ order: order._id, payment: payment._id, customer: order.customer, amount, reason, note: `Giao dịch ${payment.referenceCode || payment.providerTxId}` }],
            { session }
        );
        await wallet.postJournal(
            {
                ref: `PAYMENT:${payment._id}`,
                kind: 'ORDER_PAYMENT',
                order: order._id,
                payment: payment._id,
                refund: refund._id,
                note: `Khách chuyển ${money(amount)} cho đơn ${order.code} — cần hoàn`,
                lines: [wallet.systemLine('EXTERNAL', -amount), wallet.systemLine('REFUND_HOLD', amount)]
            },
            session
        );
        await Payment.updateOne(
            { _id: payment._id },
            { $set: { status: PROBLEM_STATUS[reason], order: order._id } },
            { session }
        );
        return { paid: false, order, refund, status: PROBLEM_STATUS[reason] };
    });

    if (result.paid) {
        // Đơn chính thức tới quán: chuông + thông báo như đơn COD; khách thấy "đã nhận thanh toán"
        emitOrderNew(result.order);
        emitOrderStatusChanged(result.order);
        await notifications.orderPlaced(result.order);
        await notifications.orderStatusChanged(result.order);
        if (result.refund) {
            await notifications.refundCreated(result.refund, result.order);
        }
        return 'MATCHED_ORDER';
    }

    await notifications.paymentProblem(result.order, result.refund);
    await notifications.refundCreated(result.refund, result.order);
    return result.status;
};

const processPayment = async (payment) => {
    if (payment.transferType !== 'in' || !(payment.amount > 0)) {
        return finish(payment, 'IGNORED', 'Không phải tiền vào');
    }

    const account = process.env.PAYMENT_ACCOUNT_NO;
    if (account && payment.accountNumber && String(payment.accountNumber) !== account) {
        return finish(payment, 'IGNORED', `Tài khoản ${payment.accountNumber} không phải tài khoản nhận của MAK`);
    }

    const { code } = payment;

    if (code?.startsWith('NAP')) {
        const topup = await Topup.findOne({ code });
        if (topup && ['PENDING', 'CANCELLED'].includes(topup.status)) {
            await wallet.confirmTopup({
                topupId: topup._id,
                receivedAmount: payment.amount,
                bankRef: payment.referenceCode || payment.providerTxId,
                paymentId: payment._id
            });
            return 'MATCHED_TOPUP';
        }
        return unmatched(payment, topup ? `Lệnh nạp ${code} đã ${topup.status}` : `Không có lệnh nạp ${code}`);
    }

    if (code?.startsWith('MAK')) {
        const order = await Order.findOne({ paymentCode: code }).select('_id');
        if (order) {
            return confirmOrderPayment(order._id, payment);
        }
    }

    return unmatched(payment, code ? `Không có đơn ${code}` : 'Nội dung chuyển khoản không có mã đơn / mã nạp');
};

/**
 * Xử lý một webhook SePay. Trả về trạng thái giao dịch (để log / test).
 * Cùng giao dịch gửi lại -> 'DUPLICATE_WEBHOOK', không xử lý lần hai.
 * Lỗi bất ngờ -> xóa bản ghi PROCESSING rồi ném lỗi (500) để SePay gửi lại.
 */
const handleSepayWebhook = async (body) => {
    let payment;
    try {
        payment = await Payment.create({
            providerTxId: `SEPAY:${body.id}`,
            gateway: body.gateway,
            accountNumber: body.accountNumber,
            transferType: body.transferType,
            amount: Number(body.transferAmount),
            content: body.content,
            code: extractCode(body.code, body.content, body.description),
            referenceCode: body.referenceCode,
            transactionDate: body.transactionDate
        });
    } catch (error) {
        if (error?.code === 11000) {
            return 'DUPLICATE_WEBHOOK';
        }
        throw error;
    }

    try {
        return await processPayment(payment);
    } catch (error) {
        await Payment.deleteOne({ _id: payment._id, status: 'PROCESSING' });
        throw error;
    }
};

// ======================= Admin xử lý giao dịch không khớp =======================

const resolveUnmatched = async ({ paymentId, action, note, actor }) => {
    let refund = null;
    const payment = await wallet.inTransaction(async (session) => {
        const updated = await Payment.findOneAndUpdate(
            { _id: paymentId, status: 'UNMATCHED' },
            { $set: { status: action === 'refund' ? 'REFUNDING' : 'IGNORED', note, resolvedBy: actor, resolvedAt: new Date() } },
            { returnDocument: 'after', session }
        );
        if (!updated) {
            if (!(await Payment.exists({ _id: paymentId }).session(session))) {
                throw new AppError(404, 'NOT_FOUND', 'Payment not found');
            }
            throw new AppError(409, 'INVALID_STATUS_TRANSITION', 'Payment is already resolved');
        }

        if (action === 'refund') {
            [refund] = await Refund.create(
                [{ payment: updated._id, amount: updated.amount, reason: 'UNMATCHED', note }],
                { session }
            );
            await wallet.postJournal(
                {
                    ref: `PAYMENT:${updated._id}`,
                    kind: 'ORDER_PAYMENT',
                    payment: updated._id,
                    refund: refund._id,
                    actor,
                    note: `Giao dịch không khớp ${updated.referenceCode || updated.providerTxId} — cần hoàn`,
                    lines: [wallet.systemLine('EXTERNAL', -updated.amount), wallet.systemLine('REFUND_HOLD', updated.amount)]
                },
                session
            );
        }
        return updated;
    });

    return { payment, refund };
};

module.exports = {
    paymentTimeoutMinutes,
    isBankTransferEnabled,
    availableMethods,
    toPaymentCode,
    extractCode,
    verifyWebhookAuth,
    orderPaymentInfo,
    refundPaidOrder,
    completeRefund,
    handleSepayWebhook,
    resolveUnmatched
};
