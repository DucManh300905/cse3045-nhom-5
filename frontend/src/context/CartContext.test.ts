import { describe, expect, it } from 'vitest';
import type { MenuItem } from '../types';
import { buildLine, defaultVariant, needsChoice } from './CartContext';

const menuItem = (overrides: Partial<MenuItem> = {}): MenuItem => ({
  id: 'pho',
  name: 'Phở bò',
  type: 'FOOD',
  basePrice: 45000,
  tags: [],
  variants: [],
  optionGroups: [],
  isAvailable: true,
  soldCount: 0,
  remainingToday: null,
  isOrderable: true,
  ...overrides,
});

const withSizes = menuItem({
  variants: [
    { id: 'S', name: 'Nhỏ', price: 40000, isDefault: false },
    { id: 'L', name: 'Lớn', price: 55000, isDefault: true },
  ],
  optionGroups: [
    {
      id: 'topping',
      name: 'Thêm',
      minSelect: 0,
      maxSelect: 2,
      options: [
        { id: 'trung', name: 'Trứng', price: 5000, isAvailable: true },
        { id: 'quay', name: 'Quẩy', price: 3000, isAvailable: true },
        { id: 'bo', name: 'Thêm bò', price: 20000, isAvailable: false },
      ],
    },
  ],
});

describe('defaultVariant / needsChoice', () => {
  it('lấy biến thể mặc định, không có thì lấy biến thể đầu', () => {
    expect(defaultVariant(withSizes)?.id).toBe('L');
    const noDefault = menuItem({ variants: [{ id: 'A', name: 'A', price: 1, isDefault: false }] });
    expect(defaultVariant(noDefault)?.id).toBe('A');
    expect(defaultVariant(menuItem())).toBeUndefined();
  });

  it('chỉ mở hộp chọn khi có nhiều size hoặc có topping', () => {
    expect(needsChoice(menuItem())).toBe(false);
    expect(needsChoice(withSizes)).toBe(true);
  });
});

describe('buildLine', () => {
  it('món không biến thể dùng basePrice', () => {
    const line = buildLine(menuItem(), { optionIds: [] }, 2);
    expect(line).toMatchObject({ key: 'pho||', unitPrice: 45000, qty: 2, variantName: undefined });
  });

  it('giá = giá biến thể + tổng topping', () => {
    const line = buildLine(withSizes, { variantId: 'S', optionIds: ['trung', 'quay'] }, 1);
    expect(line?.unitPrice).toBe(40000 + 5000 + 3000);
    expect(line?.variantName).toBe('Nhỏ');
    expect(line?.optionNames).toEqual(['Trứng', 'Quẩy']);
  });

  it('không chọn size thì dùng size mặc định', () => {
    expect(buildLine(withSizes, { optionIds: [] }, 1)?.unitPrice).toBe(55000);
  });

  it('cùng lựa chọn theo thứ tự khác nhau cho cùng một key (để gộp dòng)', () => {
    const a = buildLine(withSizes, { variantId: 'L', optionIds: ['trung', 'quay'] }, 1);
    const b = buildLine(withSizes, { variantId: 'L', optionIds: ['quay', 'trung'] }, 1);
    expect(a?.key).toBe(b?.key);
    expect(a?.key).toBe('pho|L|quay,trung');
  });

  it('trả null khi biến thể không tồn tại hoặc topping hết / không tồn tại', () => {
    expect(buildLine(withSizes, { variantId: 'XL', optionIds: [] }, 1)).toBeNull();
    expect(buildLine(withSizes, { variantId: 'L', optionIds: ['bo'] }, 1)).toBeNull();
    expect(buildLine(withSizes, { variantId: 'L', optionIds: ['khong-co'] }, 1)).toBeNull();
  });

  it('giới hạn số lượng theo số suất còn lại hôm nay', () => {
    const limited = menuItem({ remainingToday: 3 });
    expect(buildLine(limited, { optionIds: [] }, 1)?.maxQty).toBe(3);
  });
});
