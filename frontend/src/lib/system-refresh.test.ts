import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

const refreshMe = vi.fn();
vi.mock('./hooks/useMe', () => ({ refreshMe: (...a: unknown[]) => refreshMe(...a) }));

import { refreshAllClientCaches } from './system-refresh';
import { useAuthStore } from './stores/auth.store';
import type { User } from './types/auth.types';

const baseUser: User = {
    id: 7, email: 'a@b.c', name: 'A', role: 'employee', isActive: true, isRootAdmin: false,
    department: { id: 1, name: 'Cũ' }, avatarUrl: 'old', avatarKey: 'old-key',
};

describe('refreshAllClientCaches (Reset hệ thống)', () => {
    let qc: QueryClient;
    let invalidate: ReturnType<typeof vi.fn>;
    beforeEach(() => {
        qc = new QueryClient();
        invalidate = vi.fn().mockResolvedValue(undefined);
        qc.invalidateQueries = invalidate as unknown as QueryClient['invalidateQueries'];
        refreshMe.mockReset();
        useAuthStore.setState({ user: { ...baseUser }, isAuthenticated: true });
    });

    it('invalidate MỌI query (không truyền filter) và cập nhật role/phòng ban/root/avatar trong auth store', async () => {
        refreshMe.mockResolvedValue({
            id: 7, role: 'manager', isActive: true, isRootAdmin: true,
            department: { id: 2, name: 'Mới' }, avatarUrl: 'new', avatarKey: 'new-key',
        });
        await refreshAllClientCaches(qc);
        expect(invalidate).toHaveBeenCalledTimes(1);
        expect(invalidate.mock.calls[0]).toEqual([]);
        expect(refreshMe).toHaveBeenCalledWith(qc);
        expect(useAuthStore.getState().user).toMatchObject({
            id: 7, name: 'A', role: 'manager', isRootAdmin: true,
            department: { id: 2, name: 'Mới' }, avatarUrl: 'new', avatarKey: 'new-key',
        });
    });

    it('/users/me trả user KHÁC id (đổi tài khoản giữa chừng) -> KHÔNG ghi đè auth store', async () => {
        refreshMe.mockResolvedValue({ id: 99, role: 'admin', isActive: true, isRootAdmin: true });
        await refreshAllClientCaches(qc);
        expect(useAuthStore.getState().user).toMatchObject({ id: 7, role: 'employee', isRootAdmin: false });
    });

    it('lỗi mạng khi tải /users/me -> KHÔNG throw, auth store giữ nguyên, vẫn đã invalidate', async () => {
        refreshMe.mockRejectedValue(new Error('network'));
        await expect(refreshAllClientCaches(qc)).resolves.toBeUndefined();
        expect(invalidate).toHaveBeenCalledTimes(1);
        expect(useAuthStore.getState().user).toMatchObject({ role: 'employee' });
    });
});
