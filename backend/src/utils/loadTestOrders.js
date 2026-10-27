// Test tải: chạy TRỌN VÒNG ĐỜI đơn hàng qua API thật với nhịp cố định (mặc định 100 request / phút),
// in số liệu và độ trễ từng bước + thời gian trọn vòng một đơn.
//
// Backend phải đang chạy. Chạy trong backend/:
//   npm run loadtest:orders                                  # 100 request/phút trong 1 phút, đơn giao tận nơi tiền mặt
//   npm run loadtest:orders -- --rpm=100 --minutes=3         # 3 phút
//   npm run loadtest:orders -- --flow=pickup                 # đơn tự đến lấy
//   npm run loadtest:orders -- --flow=prepaid                # đơn chuyển khoản (giả lập webhook SePay — cần SEPAY_WEBHOOK_API_KEY)
//   npm run loadtest:orders -- --out=loadtest-report.json    # lưu thêm báo cáo JSON
//   npm run loadtest:orders -- --cleanup                     # xóa dữ liệu test (đơn, thông báo, tài khoản, quán test)
//
// Vòng đời 1 đơn (giao tận nơi): xem trước -> đặt đơn -> quán nhận -> đi giao -> đã giao -> khách xem lại (6 request).
// Nhịp: cứ 60000/rpm ms gửi đúng 1 request; ưu tiên bước kế tiếp của đơn đang chạy, rảnh mới mở đơn mới.
// Hết thời gian thì không mở đơn mới, chỉ chạy nốt các đơn dở.
//
// Dữ liệu test: quán "Quán Load Test" (slug loadtest-shop, hoa hồng 0% để ví không âm / không bị khóa),
// tài khoản loadtest.owner@mak.local + loadtest.customer<N>@mak.local với MẬT KHẨU NGẪU NHIÊN mỗi lần chạy.
// An toàn: chỉ chạy với API trên máy (localhost); muốn chạy vào máy khác phải thêm --yes.
// Biến môi trường: LOADTEST_API_URL (mặc định http://localhost:<PORT>/api), MONGODB_URI (để tạo dữ liệu test).
require('dotenv').config({ quiet: true });
require('../config/mongoose');

const crypto = require('crypto');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../modules/user/user.model');
const Restaurant = require('../modules/restaurant/restaurant.model');
const MenuCategory = require('../modules/menu/menuCategory.model');
const MenuItem = require('../modules/menu/menuItem.model');
const Order = require('../modules/order/order.model');
const Notification = require('../modules/notification/notification.model');
const IdempotencyKey = require('../modules/order/idempotencyKey.model');

// ---------- Tham số ----------
const arg = (name, fallback) => {
    const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
    if (!hit) return fallback;
    return hit.includes('=') ? hit.split('=').slice(1).join('=') : true;
};
const API = process.env.LOADTEST_API_URL || `http://localhost:${process.env.PORT || 8080}/api`;
const RPM = Math.max(1, Number(arg('rpm', 100)));
const MINUTES = Math.max(0.1, Number(arg('minutes', 1)));
const FLOW = String(arg('flow', 'delivery'));
const CUSTOMERS = Math.max(1, Math.min(50, Number(arg('customers', 5))));
const OUT = arg('out', null);
const SLUG = 'loadtest-shop';
const OWNER_EMAIL = 'loadtest.owner@mak.local';
const customerEmail = (i) => `loadtest.customer${i}@mak.local`;
const HOA_LAC = { lat: 21.0136, lng: 105.5254 };
// Nơi nhận cố định (~1 km) -> quãng đường được lưu đệm sau lần đầu, không tốn lượt Goong
const DROPOFF = { receiverName: 'Khách test', phone: '0900000000', addressLine: 'Điểm test tải', lat: 21.006, lng: 105.52 };

if (!['delivery', 'pickup', 'prepaid'].includes(FLOW)) {
    console.error('--flow phải là delivery | pickup | prepaid');
    process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(API);

// ---------- Gọi API + đo độ trễ ----------
const call = async (method, path, { token, body, headers = {} } = {}) => {
    const started = performance.now();
    let status = 0;
    let data = {};
    try {
        const res = await fetch(`${API}${path}`, {
            method,
            headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...headers },
            body: body && JSON.stringify(body)
        });
        status = res.status;
        data = await res.json().catch(() => ({}));
    } catch (error) {
        data = { code: 'NETWORK', message: error.message };
    }
    return { ok: status >= 200 && status < 300, status, data, ms: performance.now() - started };
};

// ---------- Dữ liệu test ----------
const prepare = async () => {
    const password = `Lt-${crypto.randomBytes(12).toString('hex')}`;
    const hash = await bcrypt.hash(password, 10);
    const upsertUser = (email, fullName, role) =>
        User.findOneAndUpdate(
            { email },
            { $set: { password: hash, role, status: 'ACTIVE', emailVerified: true }, $setOnInsert: { fullName } },
            { upsert: true, returnDocument: 'after' }
        );

    const owner = await upsertUser(OWNER_EMAIL, 'Chủ quán test tải', 'RESTAURANT_OWNER');
    const restaurant = await Restaurant.findOneAndUpdate(
        { owner: owner._id },
        {
            $set: {
                status: 'APPROVED',
                isAcceptingOrders: true,
                deliveryMode: 'SELF',
                // Hoa hồng 0%: đơn tiền mặt không làm ví âm -> quán không bị khóa giữa chừng
                commissionRate: 0,
                minOrderAmount: 0,
                deliveryRadiusKm: 10,
                walletLockedAt: null,
                walletLockReason: null,
                location: { type: 'Point', coordinates: [HOA_LAC.lng, HOA_LAC.lat] },
                openingHours: Array.from({ length: 7 }, (_, d) => ({ dayOfWeek: d, open: '00:00', close: '23:59' }))
            },
            $setOnInsert: { name: 'Quán Load Test', slug: SLUG, address: 'Hòa Lạc (test tải)', phone: '0900000001' }
        },
        { upsert: true, returnDocument: 'after' }
    );
    const category =
        (await MenuCategory.findOne({ restaurant: restaurant._id })) ?? (await MenuCategory.create({ restaurant: restaurant._id, name: 'Món test' }));
    const item = await MenuItem.findOneAndUpdate(
        { restaurant: restaurant._id, name: 'Cơm test tải' },
        {
            $set: { isAvailable: true, isDeleted: false, dailyLimit: null, basePrice: 30000 },
            $setOnInsert: { category: category._id }
        },
        { upsert: true, returnDocument: 'after' }
    );

    const customers = [];
    for (let i = 1; i <= CUSTOMERS; i += 1) {
        customers.push(await upsertUser(customerEmail(i), `Khách test tải ${i}`, 'CUSTOMER'));
    }
    return { password, owner, restaurant, item, customers };
};

const login = async (email, password) => {
    const res = await call('POST', '/auth/login', { body: { identifier: email, password } });
    if (!res.ok) throw new Error(`Đăng nhập ${email} thất bại: HTTP ${res.status} ${res.data.message ?? ''}`);
    return res.data.data.token;
};

const cleanup = async () => {
    const owner = await User.findOne({ email: OWNER_EMAIL }).select('_id');
    const restaurant = owner && (await Restaurant.findOne({ owner: owner._id }).select('_id'));
    const users = await User.find({ email: { $regex: /^loadtest\..*@mak\.local$/ } }).distinct('_id');
    const orders = restaurant ? await Order.deleteMany({ restaurant: restaurant._id }) : { deletedCount: 0 };
    const notes = await Notification.deleteMany({ user: { $in: users } });
    await IdempotencyKey.deleteMany({ user: { $in: users } });
    if (restaurant) {
        await MenuItem.deleteMany({ restaurant: restaurant._id });
        await MenuCategory.deleteMany({ restaurant: restaurant._id });
        await Restaurant.deleteOne({ _id: restaurant._id });
    }
    const removedUsers = await User.deleteMany({ _id: { $in: users } });
    console.log(`Đã xóa: ${orders.deletedCount} đơn, ${notes.deletedCount} thông báo, ${removedUsers.deletedCount} tài khoản, quán test.`);
    console.log('Giữ lại sổ cái ví (chỉ ghi thêm, không xóa) — các bút toán 0đ của quán test vốn không được ghi.');
};

// ---------- Thống kê ----------
const steps = new Map(); // tên bước -> { latencies: [], ok, fail, errors: Map }
const record = (name, res) => {
    const s = steps.get(name) ?? { latencies: [], ok: 0, fail: 0, errors: new Map() };
    s.latencies.push(res.ms);
    if (res.ok) {
        s.ok += 1;
    } else {
        s.fail += 1;
        const key = `HTTP ${res.status} ${res.data.code ?? ''} ${res.data.message ?? ''}`.trim();
        s.errors.set(key, (s.errors.get(key) ?? 0) + 1);
    }
    steps.set(name, s);
};
const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : 0);
const summarize = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const avg = sorted.reduce((s, v) => s + v, 0) / (sorted.length || 1);
    return { n: sorted.length, min: sorted[0] ?? 0, avg, p50: pct(sorted, 50), p90: pct(sorted, 90), p95: pct(sorted, 95), p99: pct(sorted, 99), max: sorted[sorted.length - 1] ?? 0 };
};
const fmt = (ms) => `${Math.round(ms)}`.padStart(6);

// ---------- Vòng đời đơn ----------
const buildFlow = (ctx, index) => {
    const customer = ctx.customerTokens[index % ctx.customerTokens.length];
    const fulfillmentType = FLOW === 'pickup' ? 'PICKUP' : 'DELIVERY';
    const paymentMethod = FLOW === 'prepaid' ? 'BANK_TRANSFER' : 'COD';
    const items = [{ menuItemId: String(ctx.item._id), qty: 1 }];
    const delivery = fulfillmentType === 'DELIVERY' ? DROPOFF : undefined;
    const state = {};

    const list = [
        ['1. Xem trước', () => call('POST', '/orders/preview', { token: customer, body: { restaurantId: String(ctx.restaurant._id), items, fulfillmentType, paymentMethod, delivery } })],
        ['2. Đặt đơn', async () => {
            const res = await call('POST', '/orders', {
                token: customer,
                headers: { 'Idempotency-Key': `lt-${crypto.randomUUID()}` },
                body: { restaurantId: String(ctx.restaurant._id), items, fulfillmentType, paymentMethod, delivery }
            });
            state.order = res.data?.data;
            return res;
        }]
    ];
    if (FLOW === 'prepaid') {
        list.push(['3. Webhook SePay (đã chuyển khoản)', () =>
            call('POST', '/payments/sepay/webhook', {
                headers: { Authorization: `Apikey ${process.env.SEPAY_WEBHOOK_API_KEY}` },
                body: {
                    id: Date.now() * 1000 + Math.floor(Math.random() * 1000),
                    gateway: 'LoadTest',
                    transactionDate: new Date().toISOString().slice(0, 19).replace('T', ' '),
                    accountNumber: process.env.PAYMENT_ACCOUNT_NO,
                    content: `CK ${state.order.paymentCode}`,
                    transferType: 'in',
                    transferAmount: state.order.total,
                    referenceCode: `LT${Date.now()}`
                }
            })]);
    }
    const n = list.length;
    list.push(
        [`${n + 1}. Quán nhận đơn`, () => call('POST', `/merchant/orders/${state.order.id}/accept`, { token: ctx.ownerToken })],
        fulfillmentType === 'PICKUP'
            ? [`${n + 2}. Món đã xong`, () => call('POST', `/merchant/orders/${state.order.id}/status`, { token: ctx.ownerToken, body: { to: 'READY' } })]
            : [`${n + 2}. Đi giao`, () => call('POST', `/merchant/orders/${state.order.id}/status`, { token: ctx.ownerToken, body: { to: 'DELIVERING' } })],
        [`${n + 3}. ${fulfillmentType === 'PICKUP' ? 'Khách đã lấy' : 'Đã giao'}`, () => call('POST', `/merchant/orders/${state.order.id}/status`, { token: ctx.ownerToken, body: { to: 'COMPLETED' } })],
        [`${n + 4}. Khách xem lại đơn`, async () => {
            const res = await call('GET', `/orders/${state.order.id}`, { token: customer });
            // Cuối vòng đời đơn phải là COMPLETED
            if (res.ok && res.data?.data?.status !== 'COMPLETED') {
                return { ...res, ok: false, data: { code: 'WRONG_STATUS', message: `status=${res.data?.data?.status}` } };
            }
            return res;
        }]
    );
    return list;
};

// ---------- Chạy ----------
const run = async () => {
    console.log(`Test tải vòng đời đơn · ${API} · ${RPM} request/phút · ${MINUTES} phút · luồng: ${FLOW} · ${CUSTOMERS} khách`);
    if (!isLocal && !arg('yes', false)) {
        console.error('API không phải localhost. Test tải sẽ tạo nhiều đơn thật — chạy lại kèm --yes nếu chắc chắn (KHÔNG khuyến nghị trên VPS đang demo).');
        process.exitCode = 1;
        return;
    }
    if (FLOW === 'prepaid' && !process.env.SEPAY_WEBHOOK_API_KEY) {
        console.error('--flow=prepaid cần SEPAY_WEBHOOK_API_KEY trong backend/.env (giống backend đang chạy).');
        process.exitCode = 1;
        return;
    }

    const health = await call('GET', '/health');
    if (!health.ok) {
        console.error(`Không gọi được ${API}/health — backend đã chạy chưa? (${health.data.message ?? `HTTP ${health.status}`})`);
        process.exitCode = 1;
        return;
    }

    await mongoose.connect(process.env.MONGODB_URI);
    const data = await prepare();
    const ctx = {
        ...data,
        ownerToken: await login(OWNER_EMAIL, data.password),
        customerTokens: await Promise.all(data.customers.map((c) => login(c.email, data.password)))
    };
    console.log('Đã chuẩn bị quán test + tài khoản. Bắt đầu...\n');

    const interval = 60000 / RPM;
    const startedAt = performance.now();
    const endAt = startedAt + MINUTES * 60000;
    const ready = []; // bước kế tiếp của các đơn đang chạy
    const lifecycles = [];
    let inflight = 0;
    let started = 0;
    let completed = 0;
    let failed = 0;
    let sent = 0;

    const runStep = (flow, i, t0) => {
        const [name, fn] = flow[i];
        inflight += 1;
        sent += 1;
        fn()
            .catch((error) => ({ ok: false, status: 0, ms: 0, data: { code: 'SCRIPT', message: error.message } }))
            .then((res) => {
                inflight -= 1;
                record(name, res);
                if (!res.ok) {
                    failed += 1; // đơn dừng ở bước lỗi
                } else if (i + 1 < flow.length) {
                    ready.push(() => runStep(flow, i + 1, t0));
                } else {
                    completed += 1;
                    lifecycles.push(performance.now() - t0);
                }
            });
    };

    let next = startedAt;
    let lastPrint = startedAt;
    while (true) {
        const now = performance.now();
        const accepting = now < endAt;
        if (!accepting && ready.length === 0 && inflight === 0) break;
        if (now >= next) {
            next += interval;
            const job = ready.shift();
            if (job) job();
            else if (accepting) {
                const flow = buildFlow(ctx, started);
                started += 1;
                runStep(flow, 0, performance.now());
            }
        }
        if (now - lastPrint >= 10000) {
            lastPrint = now;
            console.log(`  ${Math.round((now - startedAt) / 1000)}s · đã gửi ${sent} request · đơn: ${started} mở, ${completed} xong, ${failed} lỗi, ${inflight} đang chờ phản hồi`);
        }
        await sleep(Math.max(1, Math.min(20, next - performance.now())));
    }

    const elapsedMin = (performance.now() - startedAt) / 60000;
    const totalReq = [...steps.values()].reduce((s, v) => s + v.ok + v.fail, 0);
    const totalFail = [...steps.values()].reduce((s, v) => s + v.fail, 0);
    const all = summarize([...steps.values()].flatMap((v) => v.latencies));

    console.log('\n================ KẾT QUẢ ================');
    console.log(`Thời gian chạy:      ${(elapsedMin * 60).toFixed(1)} s`);
    console.log(`Request:             ${totalReq} (≈ ${(totalReq / elapsedMin).toFixed(1)} request/phút, mục tiêu ${RPM})`);
    console.log(`Lỗi:                 ${totalFail} (${((totalFail / (totalReq || 1)) * 100).toFixed(2)}%)`);
    console.log(`Đơn:                 ${started} mở · ${completed} trọn vòng đời · ${failed} dừng giữa chừng`);
    console.log('\nĐộ trễ từng bước (ms):');
    console.log('Bước                                   Số   Lỗi    min    avg    p50    p90    p95    p99    max');
    const rows = [];
    for (const [name, s] of steps) {
        const z = summarize(s.latencies);
        rows.push({ step: name, ...z, fail: s.fail });
        console.log(`${name.padEnd(36)} ${String(z.n).padStart(5)} ${String(s.fail).padStart(5)} ${fmt(z.min)} ${fmt(z.avg)} ${fmt(z.p50)} ${fmt(z.p90)} ${fmt(z.p95)} ${fmt(z.p99)} ${fmt(z.max)}`);
    }
    console.log(`${'TẤT CẢ REQUEST'.padEnd(36)} ${String(all.n).padStart(5)} ${String(totalFail).padStart(5)} ${fmt(all.min)} ${fmt(all.avg)} ${fmt(all.p50)} ${fmt(all.p90)} ${fmt(all.p95)} ${fmt(all.p99)} ${fmt(all.max)}`);

    const life = summarize(lifecycles);
    console.log('\nTrọn vòng đời 1 đơn (từ lúc xem trước tới khi khách thấy "Hoàn thành", gồm cả thời gian chờ tới lượt theo nhịp):');
    console.log(`  ${life.n} đơn · p50 ${(life.p50 / 1000).toFixed(1)} s · p95 ${(life.p95 / 1000).toFixed(1)} s · max ${(life.max / 1000).toFixed(1)} s`);

    const errors = [...steps].flatMap(([name, s]) => [...s.errors].map(([k, c]) => ({ step: name, error: k, count: c })));
    if (errors.length) {
        console.log('\nLỗi gặp phải:');
        errors.sort((a, b) => b.count - a.count).slice(0, 10).forEach((e) => console.log(`  ${String(e.count).padStart(4)} × [${e.step}] ${e.error}`));
    }

    if (OUT) {
        const file = typeof OUT === 'string' ? OUT : `loadtest-report-${Date.now()}.json`;
        fs.writeFileSync(
            file,
            JSON.stringify(
                { api: API, rpm: RPM, minutes: MINUTES, flow: FLOW, customers: CUSTOMERS, startedAt: new Date().toISOString(), totalRequests: totalReq, failedRequests: totalFail, achievedRpm: totalReq / elapsedMin, orders: { started, completed, failed }, steps: rows, overall: all, lifecycleMs: life, errors },
                null,
                2
            )
        );
        console.log(`\nĐã lưu báo cáo: ${file}`);
    }
};

(async () => {
    if (arg('cleanup', false)) {
        await mongoose.connect(process.env.MONGODB_URI);
        await cleanup();
    } else {
        await run();
    }
    await mongoose.disconnect();
})().catch(async (error) => {
    console.error('Lỗi:', error.message);
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
});
