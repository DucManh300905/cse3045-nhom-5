const { isWithinOpeningHours, canAcceptOrders, toLocalParts } = require('../../src/utils/openingHours');

// 2026-10-06 là thứ Ba (dayOfWeek = 2). 03:00 UTC = 10:00 giờ Việt Nam.
const at = (iso) => new Date(iso);

const hours = [
    { dayOfWeek: 2, open: '07:00', close: '10:30' },
    { dayOfWeek: 2, open: '17:00', close: '21:00' }
];

describe('openingHours (giờ Việt Nam, BR-13)', () => {
    test('đổi UTC sang giờ VN', () => {
        expect(toLocalParts(at('2026-10-06T03:00:00Z'))).toEqual({ dayOfWeek: 2, time: '10:00' });
        // 18:00 UTC thứ Ba = 01:00 thứ Tư ở VN
        expect(toLocalParts(at('2026-10-06T18:00:00Z'))).toEqual({ dayOfWeek: 3, time: '01:00' });
    });

    test.each([
        ['2026-10-06T03:00:00Z', true], // 10:00 trong ca sáng
        ['2026-10-06T03:30:00Z', false], // 10:30 = giờ đóng, không tính
        ['2026-10-06T06:00:00Z', false], // 13:00 giữa hai ca
        ['2026-10-06T12:00:00Z', true], // 19:00 ca tối
        ['2026-10-07T03:00:00Z', false] // thứ Tư, không có giờ mở
    ])('%s -> %s', (iso, expected) => {
        expect(isWithinOpeningHours(hours, at(iso))).toBe(expected);
    });

    test('canAcceptOrders cần APPROVED + bật nhận đơn + trong giờ mở', () => {
        const now = at('2026-10-06T03:00:00Z');
        const base = { status: 'APPROVED', isAcceptingOrders: true, openingHours: hours };

        expect(canAcceptOrders(base, now)).toBe(true);
        expect(canAcceptOrders({ ...base, status: 'SUBMITTED' }, now)).toBe(false);
        expect(canAcceptOrders({ ...base, isAcceptingOrders: false }, now)).toBe(false);
        expect(canAcceptOrders(base, at('2026-10-06T06:00:00Z'))).toBe(false);
    });
});
