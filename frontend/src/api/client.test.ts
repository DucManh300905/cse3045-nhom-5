import { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';
import { API_ORIGIN, assetUrl, getErrorCode, getErrorDetail, getErrorMessage } from './client';

/** Lỗi axios giả; `data` undefined = không có response (mất mạng) */
function apiError(data?: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
  const response =
    data === undefined
      ? undefined
      : ({ data, status: 400, statusText: 'Bad Request', headers: {}, config } as AxiosResponse);
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, undefined, response);
}

describe('getErrorMessage', () => {
  it('mất kết nối máy chủ', () => {
    expect(getErrorMessage(apiError())).toBe('Không kết nối được máy chủ. Vui lòng thử lại.');
  });

  it('ưu tiên bản dịch theo message của backend', () => {
    expect(getErrorMessage(apiError({ message: 'Address not found', code: 'NOT_FOUND' }))).toBe(
      'Không tìm thấy địa chỉ trong sổ, vui lòng chọn lại.'
    );
  });

  it('không có bản dịch message thì dùng bản dịch theo code', () => {
    expect(getErrorMessage(apiError({ message: 'Some new error', code: 'UNAUTHORIZED' }))).toBe(
      'Vui lòng đăng nhập để tiếp tục.'
    );
  });

  it('không dịch được thì giữ nguyên message, không có gì thì báo chung', () => {
    expect(getErrorMessage(apiError({ message: 'Raw message' }))).toBe('Raw message');
    expect(getErrorMessage(apiError({}))).toBe('Đã có lỗi xảy ra.');
  });

  it('lỗi thường (không phải axios)', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
    expect(getErrorMessage('lạ')).toBe('Đã có lỗi xảy ra.');
  });
});

describe('getErrorCode / getErrorDetail', () => {
  it('đọc code và chi tiết lỗi đầu tiên', () => {
    const err = apiError({ code: 'VOUCHER_INVALID', errors: [{ field: 'voucherCodes', msg: 'expired' }] });
    expect(getErrorCode(err)).toBe('VOUCHER_INVALID');
    expect(getErrorDetail(err)).toEqual({ field: 'voucherCodes', msg: 'expired' });
    expect(getErrorCode(new Error('x'))).toBeUndefined();
  });
});

describe('assetUrl', () => {
  it('ghép gốc server cho đường dẫn upload, giữ nguyên URL ngoài', () => {
    expect(assetUrl('/uploads/a.png')).toBe(`${API_ORIGIN}/uploads/a.png`);
    expect(assetUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    expect(assetUrl(undefined)).toBeUndefined();
  });
});
