import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useSidebarBadgeCounts, SIDEBAR_BADGES_QUERY_KEY, TASK_IN_PROGRESS_COUNT_KEY } from './useSidebarBadgeCounts';
import { notificationKeys } from './useNotifications';
import { notificationsApi } from '../api/notifications.api';
import { useAuthStore } from '../stores/auth.store';

vi.mock('../api/notifications.api', () => ({ notificationsApi: { poll: vi.fn() } }));
vi.mock('../api/sidebar.api', () => ({ sidebarApi: { getBadges: vi.fn() } }));

const poll = notificationsApi.poll as unknown as ReturnType<typeof vi.fn>;

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

describe('useSidebarBadgeCounts (10C - badges nằm trong poll chung)', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        useAuthStore.setState({ isAuthenticated: true, user: { id: 1, role: 'employee' } as never });
        const { sidebarApi } = await import('../api/sidebar.api');
        (sidebarApi.getBadges as unknown as ReturnType<typeof vi.fn>).mockClear();
    });

    it('1 request poll cho cả badge thông báo lẫn badge sidebar; KHÔNG gọi /sidebar/badges riêng', async () => {
        poll.mockResolvedValue({ unread: 2, version: 1, badges: { taskTodo: 4, taskInProgress: 1, trash: 0 } });
        const { result } = renderHook(() => useSidebarBadgeCounts(), { wrapper });
        await waitFor(() => expect(result.current['thong-bao']).toBe(2));
        expect(result.current['cong-viec-dinh-ky']).toBe(4);
        expect(result.current[TASK_IN_PROGRESS_COUNT_KEY]).toBe(1);
        expect(result.current['trash-can']).toBe(0);
        expect(result.current['users']).toBeUndefined();
        expect(poll).toHaveBeenCalledTimes(1);
        const { sidebarApi } = await import('../api/sidebar.api');
        expect(sidebarApi.getBadges).not.toHaveBeenCalled();
    });

    it('BE cũ / đếm badge lỗi (không có `badges`): vẫn hiện badge thông báo, không có badge sidebar', async () => {
        poll.mockResolvedValue({ unread: 5, version: 1 });
        const { result } = renderHook(() => useSidebarBadgeCounts(), { wrapper });
        await waitFor(() => expect(result.current['thong-bao']).toBe(5));
        expect(result.current['cong-viec-dinh-ky']).toBeUndefined();
    });

    it('SIDEBAR_BADGES_QUERY_KEY = key poll chung (permission đổi -> invalidate là làm mới badge)', () => {
        expect([...SIDEBAR_BADGES_QUERY_KEY]).toEqual([...notificationKeys.poll]);
    });
});
