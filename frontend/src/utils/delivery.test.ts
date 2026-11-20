import { describe, expect, it } from 'vitest';
import { decodePolyline, etaText, requiredShipperDocuments } from './delivery';

describe('requiredShipperDocuments', () => {
  it('xe máy cần đủ 3 giấy tờ', () => {
    expect(requiredShipperDocuments('MOTORBIKE').map(d => d.type)).toEqual([
      'ID_CARD',
      'DRIVER_LICENSE',
      'VEHICLE_REGISTRATION',
    ]);
  });

  it('xe đạp chỉ cần CCCD', () => {
    expect(requiredShipperDocuments('BICYCLE').map(d => d.type)).toEqual(['ID_CARD']);
  });
});

describe('decodePolyline', () => {
  it('giải mã ví dụ chuẩn của thuật toán encoded polyline', () => {
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(points).toHaveLength(3);
    const expected = [
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ];
    points.forEach(([lat, lng], i) => {
      expect(lat).toBeCloseTo(expected[i][0], 5);
      expect(lng).toBeCloseTo(expected[i][1], 5);
    });
  });

  it('chuỗi rỗng trả mảng rỗng', () => {
    expect(decodePolyline('')).toEqual([]);
  });
});

describe('etaText', () => {
  it('ghi đúng đích đến', () => {
    expect(etaText({ minutes: 7, target: 'STORE' })).toBe('còn ~7 phút tới quán');
    expect(etaText({ minutes: 12, target: 'CUSTOMER' })).toBe('~12 phút nữa tới nơi');
    expect(etaText(null)).toBe('');
  });
});
