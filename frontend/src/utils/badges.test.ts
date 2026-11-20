import { describe, expect, it } from 'vitest';
import { groupForPath, groupOf } from './badges';

describe('groupOf', () => {
  it('tìm mục theo vai và key', () => {
    expect(groupOf('RESTAURANT_OWNER', 'orders')?.path).toBe('/owner/orders');
    expect(groupOf('CUSTOMER', 'khong-co')).toBeUndefined();
    expect(groupOf(undefined, 'orders')).toBeUndefined();
  });
});

describe('groupForPath', () => {
  it('trang gốc (end) chỉ khớp đúng đường dẫn', () => {
    expect(groupForPath('ADMIN', '/admin')?.key).toBe('restaurants');
    expect(groupForPath('ADMIN', '/admin/restaurants/123')).toBeUndefined();
  });

  it('khớp cả trang con của một mục', () => {
    expect(groupForPath('RESTAURANT_OWNER', '/owner/orders/abc')?.key).toBe('orders');
  });

  it('không khớp đường dẫn chỉ trùng tiền tố chữ', () => {
    expect(groupForPath('RESTAURANT_OWNER', '/owner/ordersXYZ')).toBeUndefined();
  });

  it('không có vai thì không có mục nào', () => {
    expect(groupForPath(undefined, '/orders')).toBeUndefined();
  });
});
