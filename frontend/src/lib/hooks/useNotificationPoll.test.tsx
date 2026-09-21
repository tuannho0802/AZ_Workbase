import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useNotificationPoll } from './useNotificationPoll';
import { notificationKeys } from './useNotifications';
import { notificationsApi } from '../api/notifications.api';
import { useAuthStore } from '../stores/auth.store';
import type { NotificationItem } from '../types/notification.types';

const notification = { open: vi.fn(), destroy: vi.fn() };
const message = { info: vi.fn() };
const push = vi.fn();

vi.mock('antd', () => ({ App: { useApp: () => ({ notification, message }) } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('../api/notifications.api', () => ({
  notificationsApi: { poll: vi.fn(), list: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn(), remove: vi.fn() },
}));

const poll = notificationsApi.poll as unknown as ReturnType<typeof vi.fn>;
const list = notificationsApi.list as unknown as ReturnType<typeof vi.fn>;

const item = (id: number, sortAtMs: number): NotificationItem =>
  ({
    id,
    title: `TB ${id}`,
    category: 'customer',
    eventType: 'customer.updated',
    entityType: 'customer',
    entityId: id,
    params: null,
    isRead: false,
    sortAt: new Date(sortAtMs).toISOString(),
    createdAt: new Date(sortAtMs).toISOString(),
  }) as NotificationItem;

let queryClient: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** Ép poll() chạy lại với dữ liệu mới - mô phỏng tick 60s. */
async function tick(next: { unread: number; version: number }) {
  poll.mockResolvedValue(next);
  await act(async () => {
    await queryClient.invalidateQueries({ queryKey: notificationKeys.poll });
  });
}

describe('useNotificationPoll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    useAuthStore.setState({ isAuthenticated: true, user: { id: 7, role: 'employee' } as never });
  });

  it('trả số chưa đọc từ poll()', async () => {
    poll.mockResolvedValue({ unread: 4, version: 1000 });
    const { result } = renderHook(() => useNotificationPoll(), { wrapper });
    await waitFor(() => expect(result.current.unread).toBe(4));
  });

  it('LẦN ĐẦU của phiên: KHÔNG toast và KHÔNG tải danh sách, chỉ ghi nhớ mốc', async () => {
    poll.mockResolvedValue({ unread: 3, version: 1000 });
    const { result } = renderHook(() => useNotificationPoll(), { wrapper });
    await waitFor(() => expect(result.current.unread).toBe(3));

    expect(list).not.toHaveBeenCalled();
    expect(notification.open).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem('notif:lastSeenVersion:7')).toBe('1000');
  });

  it('version tăng → tải chưa đọc + toast từng cái; bấm toast mở thông báo (điều hướng + đánh dấu đã đọc)', async () => {
    poll.mockResolvedValue({ unread: 1, version: 1000 });
    const { result } = renderHook(() => useNotificationPoll(), { wrapper });
    await waitFor(() => expect(result.current.unread).toBe(1));

    list.mockResolvedValue({ data: [item(1, 900), item(2, 1500)], nextCursor: null });
    (notificationsApi.markRead as never as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 2, isRead: true });
    await tick({ unread: 2, version: 1500 });

    await waitFor(() => expect(notification.open).toHaveBeenCalledTimes(1));
    expect(list).toHaveBeenCalledWith({ limit: 10, unreadOnly: true });
    const args = notification.open.mock.calls[0][0];
    expect(args.description).toBe('TB 2'); // item 1 (900) cũ hơn mốc 1000 → không toast
    expect(args.title).toBe('Khách hàng');

    act(() => args.onClick());
    expect(notification.destroy).toHaveBeenCalledWith(args.key);
    expect(push).toHaveBeenCalledWith('/customers?id=2');
    // useMutation.mutate gọi mutationFn ở tick sau → phải chờ, không assert ngay.
    await waitFor(() => expect(notificationsApi.markRead).toHaveBeenCalledWith(2));
  });

  it('quá nhiều thông báo mới → 2 toast riêng + 1 toast gộp trỏ /thong-bao', async () => {
    poll.mockResolvedValue({ unread: 0, version: 1000 });
    const { result } = renderHook(() => useNotificationPoll(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    list.mockResolvedValue({
      data: [1, 2, 3, 4, 5].map((i) => item(i, 1000 + i * 10)),
      nextCursor: null,
    });
    await tick({ unread: 5, version: 1050 });

    await waitFor(() => expect(notification.open).toHaveBeenCalledTimes(3));
    const summary = notification.open.mock.calls[2][0];
    expect(summary.description).toBe('và 3 thông báo mới khác');
    act(() => summary.onClick());
    expect(push).toHaveBeenCalledWith('/thong-bao');
  });

  it('version KHÔNG tăng (hoặc giảm do xoá thông báo) → không toast, không tải danh sách', async () => {
    poll.mockResolvedValue({ unread: 1, version: 2000 });
    const { result } = renderHook(() => useNotificationPoll(), { wrapper });
    await waitFor(() => expect(result.current.unread).toBe(1));

    await tick({ unread: 0, version: 1500 });
    await waitFor(() => expect(result.current.unread).toBe(0));

    expect(list).not.toHaveBeenCalled();
    expect(notification.open).not.toHaveBeenCalled();
  });

  it('chưa đăng nhập → không gọi poll', async () => {
    useAuthStore.setState({ isAuthenticated: false, user: null });
    renderHook(() => useNotificationPoll(), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(poll).not.toHaveBeenCalled();
  });
});
