import { describe, it, expect } from 'vitest';
import { shouldRetryQuery } from './query-retry';

const http = (status: number) => ({ response: { status } });

describe('shouldRetryQuery (PLAN CPU 10B)', () => {
    it.each([400, 401, 403, 404, 409, 422])('lỗi %i: KHÔNG thử lại', (s) => {
        expect(shouldRetryQuery(0, http(s))).toBe(false);
    });
    it.each([500, 502, 503])('lỗi %i: thử lại đúng 1 lần', (s) => {
        expect(shouldRetryQuery(0, http(s))).toBe(true);
        expect(shouldRetryQuery(1, http(s))).toBe(false);
    });
    it('lỗi mạng (không có response): thử lại đúng 1 lần', () => {
        expect(shouldRetryQuery(0, new Error('Network Error'))).toBe(true);
        expect(shouldRetryQuery(1, new Error('Network Error'))).toBe(false);
        expect(shouldRetryQuery(0, null)).toBe(true);
    });
});
