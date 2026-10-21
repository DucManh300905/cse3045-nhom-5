// Giả lập tài xế ảo để demo / thử luồng giao hàng khi chưa có tài xế thật (kế hoạch mục 14).
// Chạy khi backend đang chạy:  npm run shipper:simulate            (3 tài xế)
//                              npm run shipper:simulate -- --count=5
// Mỗi lần chạy: tạo / làm mới tài khoản sim.shipper<N>@mak.local với MẬT KHẨU NGẪU NHIÊN (không ai khác đăng nhập được),
// hồ sơ đã duyệt, rồi điều khiển qua API thật như app tài xế: trực tuyến, gửi vị trí, nhận lời mời, tới quán,
// chờ quán báo "Món đã xong", lấy hàng, chạy tới khách, chụp ảnh (ảnh mẫu) xác nhận giao. Ctrl+C: tắt trực tuyến rồi thoát.
// Biến môi trường: SIM_API_URL (mặc định http://localhost:<PORT>/api), SIM_ACCEPT_RATE (0..1, mặc định 0.85),
// SIM_SPEED_KMH (tốc độ xe ảo, mặc định 25, tối đa 75)
require('dotenv').config({ quiet: true });
require('../config/mongoose');

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../modules/user/user.model');
const Shipper = require('../modules/shipper/shipper.model');
const { haversineKm, toPoint } = require('./geo');

const API = process.env.SIM_API_URL || `http://localhost:${process.env.PORT || 8080}/api`;
const COUNT = Math.max(1, Math.min(20, Number((process.argv.find((a) => a.startsWith('--count=')) || '').split('=')[1]) || 3));
const ACCEPT_RATE = Number(process.env.SIM_ACCEPT_RATE ?? 0.85);
const TICK_MS = 5000;
// Tốc độ xe ảo; server bỏ qua điểm nhanh hơn 80 km/h nên đặt dưới mức đó
const SPEED_KMH = Math.min(75, Number(process.env.SIM_SPEED_KMH) || 25);
const HOA_LAC = { lat: 21.0136, lng: 105.5254 };
// Ảnh PNG 1×1 làm "ảnh xác nhận giao"
const PHOTO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (p, km) => ({ lat: p.lat + (Math.random() - 0.5) * (km / 55), lng: p.lng + (Math.random() - 0.5) * (km / 52) });
const log = (who, msg) => console.log(`[${new Date().toLocaleTimeString('vi-VN')}] ${who}: ${msg}`);

const api = async (token, method, path, body) => {
    const res = await fetch(`${API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body && !(body instanceof FormData) && { 'Content-Type': 'application/json' }) },
        body: body instanceof FormData ? body : body && JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const error = new Error(data.message || `HTTP ${res.status}`);
        error.code = data.code;
        throw error;
    }
    return data.data;
};

/** Đi một bước về phía đích (quãng đường của 1 nhịp theo tốc độ xe máy) */
const stepToward = (from, to) => {
    const km = haversineKm(from, to);
    const stepKm = (SPEED_KMH * TICK_MS) / 3600000;
    if (km <= stepKm) return { ...to, arrived: true };
    const f = stepKm / km;
    return { lat: from.lat + (to.lat - from.lat) * f, lng: from.lng + (to.lng - from.lng) * f, arrived: false };
};

// Tạo / làm mới tài khoản + hồ sơ tài xế ảo (mật khẩu ngẫu nhiên mỗi lần chạy)
const prepareAccounts = async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const accounts = [];
    for (let i = 1; i <= COUNT; i += 1) {
        const email = `sim.shipper${i}@mak.local`;
        const password = `Sim-${crypto.randomBytes(12).toString('hex')}`;
        const user = await User.findOneAndUpdate(
            { email },
            {
                $set: { password: await bcrypt.hash(password, 10), role: 'SHIPPER', status: 'ACTIVE', emailVerified: true },
                $setOnInsert: { fullName: `Tài xế ảo ${i}` }
            },
            { upsert: true, returnDocument: 'after' }
        );
        const start = jitter(HOA_LAC, 2);
        await Shipper.findOneAndUpdate(
            { user: user._id },
            {
                $set: { status: 'APPROVED', isOnline: false, activeOrder: null, dispatchBlockedUntil: null, location: toPoint(start), locationAt: new Date() },
                $setOnInsert: {
                    fullName: `Tài xế ảo ${i}`,
                    phone: `0900000${String(i).padStart(3, '0')}`,
                    vehicleType: 'MOTORBIKE',
                    licensePlate: `99S-${String(100 + i).padStart(5, '0')}`,
                    approvedAt: new Date()
                }
            },
            { upsert: true }
        );
        accounts.push({ name: `Tài xế ảo ${i}`, email, password, at: start });
    }
    await mongoose.disconnect();
    return accounts;
};

const login = async (account) => {
    const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: account.email, password: account.password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Đăng nhập ${account.email} thất bại: ${data.message}`);
    return data.data.token;
};

let running = true;

const runDriver = async (account) => {
    const token = await login(account);
    const who = account.name;
    let at = account.at;
    let lastIdlePing = 0;
    let readyWaitStart = null;
    await api(token, 'POST', '/shipper/online', at);
    log(who, `trực tuyến tại ${at.lat.toFixed(5)}, ${at.lng.toFixed(5)}`);

    while (running) {
        try {
            const state = await api(token, 'GET', '/shipper/state');
            const order = state.activeOrder;

            if (state.offer && !order) {
                const { offer } = state;
                await sleep(1500 + Math.random() * 3000);
                if (Math.random() < ACCEPT_RATE) {
                    await api(token, 'POST', `/shipper/offers/${offer.offerId}/accept`);
                    log(who, `NHẬN đơn ${offer.code} (cách quán ${offer.toStoreKm} km, tiền công ${offer.fee} đ)`);
                } else {
                    await api(token, 'POST', `/shipper/offers/${offer.offerId}/decline`);
                    log(who, `từ chối đơn ${offer.code}`);
                }
                continue;
            }

            if (order) {
                const s = order.delivery.status;
                const target = s === 'PICKED_UP' ? order.dropoff.location : order.store.location;
                if (target && ['ASSIGNED', 'PICKED_UP'].includes(s)) {
                    const next = stepToward(at, target);
                    at = { lat: next.lat, lng: next.lng };
                    await api(token, 'POST', '/shipper/location', at).catch(() => {});
                    if (next.arrived && s === 'ASSIGNED') {
                        await api(token, 'POST', `/shipper/orders/${order.id}/arrived`);
                        log(who, `tới quán ${order.store.name} (đơn ${order.code})`);
                        readyWaitStart = Date.now();
                    } else if (next.arrived && s === 'PICKED_UP') {
                        const form = new FormData();
                        form.append('photo', new Blob([PHOTO], { type: 'image/png' }), 'proof.png');
                        await api(token, 'POST', `/shipper/orders/${order.id}/delivered`, form);
                        log(who, `ĐÃ GIAO đơn ${order.code} (+${order.shipperFee} đ)`);
                    }
                } else if (s === 'ARRIVED_AT_STORE') {
                    readyWaitStart ??= Date.now();
                    // Chờ quán bấm "Món đã xong"; quá 2 phút thì lấy luôn (quán quên bấm)
                    if (order.status === 'READY' || Date.now() - readyWaitStart > 2 * 60 * 1000) {
                        await api(token, 'POST', `/shipper/orders/${order.id}/picked-up`);
                        log(who, `đã lấy đơn ${order.code}, đang giao tới ${order.dropoff.addressLine}`);
                        readyWaitStart = null;
                    }
                    await api(token, 'POST', '/shipper/location', at).catch(() => {});
                }
            } else if (Date.now() - lastIdlePing > 30000) {
                // Rảnh: đi loanh quanh, báo vị trí mỗi 30 giây
                at = jitter(at, 0.15);
                await api(token, 'POST', '/shipper/location', at).catch(() => {});
                lastIdlePing = Date.now();
            }
        } catch (error) {
            log(who, `lỗi: ${error.code || ''} ${error.message}`);
        }
        await sleep(TICK_MS);
    }

    await api(token, 'POST', '/shipper/offline').catch((e) => log(who, `không tắt trực tuyến được: ${e.message}`));
    log(who, 'đã nghỉ');
};

(async () => {
    console.log(`Giả lập ${COUNT} tài xế ảo quanh Hòa Lạc · API ${API} · Ctrl+C để dừng`);
    const accounts = await prepareAccounts();
    const drivers = accounts.map((a) => runDriver(a).catch((e) => log(a.name, `dừng: ${e.message}`)));
    process.once('SIGINT', () => {
        console.log('\nĐang cho các tài xế nghỉ...');
        running = false;
    });
    await Promise.all(drivers);
})()
    .then(() => {
        process.exitCode = 0;
    })
    .catch(async (error) => {
        console.error(error.message);
        await mongoose.disconnect().catch(() => {});
        process.exitCode = 1;
    });
