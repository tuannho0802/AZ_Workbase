import { describe, it, expect } from 'vitest';
import { canSeeSystemReset } from './SystemResetButton';

describe('canSeeSystemReset - chỉ role admin VÀ isRootAdmin === true', () => {
    it('hiện cho admin + root admin', () => {
        expect(canSeeSystemReset({ role: 'admin', isRootAdmin: true })).toBe(true);
    });
    it.each([
        ['admin thường', { role: 'admin', isRootAdmin: false }],
        ['admin chưa có cờ root', { role: 'admin' }],
        ['manager dù có cờ root', { role: 'manager', isRootAdmin: true }],
        ['employee', { role: 'employee', isRootAdmin: false }],
        ['role tuỳ chỉnh tên giống Admin', { role: 'Admin', isRootAdmin: true }],
        ['chưa đăng nhập (null)', null],
        ['undefined', undefined],
    ])('ẩn: %s', (_n, u) => {
        expect(canSeeSystemReset(u as never)).toBe(false);
    });
});
