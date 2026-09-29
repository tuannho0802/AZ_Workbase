import { describe, it, expect, vi } from 'vitest';
import { getApiErrorMessage, hasGlobalErrorToast, toastApiError } from './error-message.util';

const httpError = (status: number, message?: string) => ({ response: { status, data: message ? { message } : {} } });

describe('hasGlobalErrorToast', () => {
  it('lỗi HTTP có response (non-401) -> interceptor đã toast', () => {
    expect(hasGlobalErrorToast(httpError(400, 'x'))).toBe(true);
    expect(hasGlobalErrorToast(httpError(500))).toBe(true);
  });
  it('401 (xử lý ngầm) và lỗi không có response (mạng/timeout) -> chưa toast', () => {
    expect(hasGlobalErrorToast(httpError(401))).toBe(false);
    expect(hasGlobalErrorToast({ code: 'ERR_NETWORK' })).toBe(false);
    expect(hasGlobalErrorToast({ response: undefined })).toBe(false);
    expect(hasGlobalErrorToast(null)).toBe(false);
    expect(hasGlobalErrorToast('boom')).toBe(false);
  });
});

describe('toastApiError', () => {
  it('lỗi HTTP -> KHÔNG toast thêm (tránh toast trùng)', () => {
    const message = { error: vi.fn() };
    toastApiError(message, httpError(400, 'UTM còn 1 khách hàng'), 'Xoá UTM thất bại');
    expect(message.error).not.toHaveBeenCalled();
  });
  it('lỗi mạng -> toast fallback đúng 1 lần', () => {
    const message = { error: vi.fn() };
    toastApiError(message, { code: 'ERR_NETWORK' }, 'Xoá UTM thất bại');
    expect(message.error).toHaveBeenCalledTimes(1);
    expect(message.error).toHaveBeenCalledWith('Xoá UTM thất bại');
  });
});

describe('getApiErrorMessage', () => {
  it('ưu tiên message của BE, không có thì dùng fallback', () => {
    expect(getApiErrorMessage(httpError(400, 'Lỗi BE'), 'fb')).toBe('Lỗi BE');
    expect(getApiErrorMessage(httpError(400), 'fb')).toBe('fb');
  });
});
