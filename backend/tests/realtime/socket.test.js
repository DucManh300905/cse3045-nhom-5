const http = require('http');
const { io: connect } = require('socket.io-client');
const app = require('../../src/app');
const { initSocket, closeSocket } = require('../../src/realtime/socket');
const { setupDatabase } = require('../helpers/db');
const { createUserAndLogin } = require('../helpers/auth');
const { as, createShop, placeOrder } = require('../helpers/orders');

setupDatabase();

let server;
let url;
const clients = [];

beforeAll(async () => {
    server = http.createServer(app);
    initSocket(server);
    await new Promise((resolve) => server.listen(0, resolve));
    url = `http://localhost:${server.address().port}`;
});

afterEach(() => {
    clients.splice(0).forEach((c) => c.close());
});

afterAll(async () => {
    await closeSocket();
    await new Promise((resolve) => server.close(resolve));
});

// Kết nối và chờ server báo đã vào phòng
const connectAs = (token) =>
    new Promise((resolve, reject) => {
        const socket = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false });
        clients.push(socket);
        socket.once('ready', (info) => resolve({ socket, rooms: info.rooms }));
        socket.once('connect_error', reject);
    });

const nextEvent = (socket, event, ms = 3000) =>
    new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`No ${event} within ${ms}ms`)), ms);
        socket.once(event, (payload) => {
            clearTimeout(timer);
            resolve(payload);
        });
    });

test('từ chối kết nối khi thiếu / sai token', async () => {
    await expect(connectAs(undefined)).rejects.toMatchObject({ data: { code: 'TOKEN_EXPIRED' } });
    await expect(connectAs('abc')).rejects.toMatchObject({ data: { code: 'TOKEN_EXPIRED' } });
});

test('quán nhận order:new; khách và quán nhận order:status_changed; quán khác không nhận gì', async () => {
    const { token: customerToken, user: customerUser } = await createUserAndLogin();
    const customer = as(customerToken);
    const shop = await createShop();
    const other = await createShop({ name: 'Quán Khác' });

    const ownerConn = await connectAs(shop.ownerToken);
    const otherConn = await connectAs(other.ownerToken);
    const customerConn = await connectAs(customerToken);
    expect(ownerConn.rooms).toEqual(expect.arrayContaining([`restaurant:${shop.restaurant.id}`]));
    expect(customerConn.rooms).toEqual([`user:${customerUser.id}`]);

    let otherGotSomething = false;
    otherConn.socket.onAny(() => { otherGotSomething = true; });

    const newOrder = nextEvent(ownerConn.socket, 'order:new');
    const order = await placeOrder(customer, shop, { qty: 2 });
    expect(await newOrder).toMatchObject({ orderId: order.id, code: order.code, total: 70000, itemsCount: 2 });

    const toCustomer = nextEvent(customerConn.socket, 'order:status_changed');
    const toOwner = nextEvent(ownerConn.socket, 'order:status_changed');
    await as(shop.ownerToken).post(`/api/merchant/orders/${order.id}/accept`).expect(200);

    const expected = { orderId: order.id, from: 'PLACED', to: 'ACCEPTED', actorType: 'OWNER' };
    expect(await toCustomer).toMatchObject(expected);
    expect(await toOwner).toMatchObject(expected);
    expect(otherGotSomething).toBe(false);
});
