import { useInfiniteQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../api/notifications.api';
import type { ListNotificationsParams, NotificationCategory, NotificationPollResponse } from '../types/notification.types';

/** Query key dùng chung - invalidate `list`/`poll` sau mỗi thao tác ghi. */
export const notificationKeys = {
  root: ['notifications'] as const,
  list: ['notifications', 'list'] as const,
  poll: ['notifications', 'poll'] as const,
};

/** Danh sách cursor-based (`nextCursor` opaque từ BE) - "Tải thêm" = fetchNextPage. */
export function useNotificationList(params: Omit<ListNotificationsParams, 'cursor'> = {}, enabled = true) {
  return useInfiniteQuery({
    queryKey: [...notificationKeys.list, params],
    queryFn: ({ pageParam }) => notificationsApi.list({ ...params, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
    staleTime: 15_000,
  });
}

/**
 * Làm mới số chưa đọc sau thao tác ghi mà KHÔNG chạy lại cả poll gộp. Cache poll chưa có (chưa poll lần nào) hoặc request
 * lỗi -> bỏ qua, nhịp poll kế tiếp tự lành. Gộp `{...cũ, ...nhẹ}` nên `badges` cũ còn nguyên.
 */
export async function mergeLitePoll(queryClient: QueryClient): Promise<void> {
  try {
    const lite = await notificationsApi.pollLite();
    queryClient.setQueryData<NotificationPollResponse>(notificationKeys.poll, (old) => (old ? { ...old, ...lite } : old));
  } catch {
    // Lỗi mạng tạm thời: để nhịp poll kế tiếp cập nhật.
  }
}

export function useNotificationMutations() {
  const queryClient = useQueryClient();
  // [AGENT] OLD CODE (giữ lại để rollback):
  //   queryClient.invalidateQueries({ queryKey: notificationKeys.list });
  //   queryClient.invalidateQueries({ queryKey: notificationKeys.poll });
  // `poll` giờ gộp cả 7 badge sidebar (~8 query BE) nên mỗi lần đánh dấu đã đọc/xoá kéo theo cả đống đếm không liên quan.
  // NEW: chỉ tải poll NHẸ (/notifications/poll) rồi gộp `unread`/`version` vào cache poll chung, GIỮ NGUYÊN `badges`
  // (badge khác không đổi vì thao tác thông báo; vẫn tự làm mới ở nhịp poll kế tiếp).
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: notificationKeys.list });
    void mergeLitePoll(queryClient);
  };

  const markRead = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onSuccess: refresh,
  });

  const markAllRead = useMutation({
    mutationFn: (category?: NotificationCategory) => notificationsApi.markAllRead(category),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: number) => notificationsApi.remove(id),
    onSuccess: refresh,
  });

  const restore = useMutation({
    mutationFn: (id: number) => notificationsApi.restore(id),
    onSuccess: refresh,
  });

  /** Xoá vĩnh viễn (chỉ hợp lệ với thông báo đang ở tab "Đã ẩn"). */
  const purge = useMutation({
    mutationFn: (id: number) => notificationsApi.purge(id),
    onSuccess: refresh,
  });

  return { markRead, markAllRead, remove, restore, purge };
}