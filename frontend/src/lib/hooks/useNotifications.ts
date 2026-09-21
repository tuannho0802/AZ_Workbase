import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../api/notifications.api';
import type { ListNotificationsParams, NotificationCategory } from '../types/notification.types';

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

export function useNotificationMutations() {
  const queryClient = useQueryClient();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: notificationKeys.list });
    queryClient.invalidateQueries({ queryKey: notificationKeys.poll });
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

  return { markRead, markAllRead, remove };
}
