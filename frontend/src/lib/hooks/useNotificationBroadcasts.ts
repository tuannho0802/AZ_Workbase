import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  notificationBroadcastsApi,
  BroadcastAudiencePayload,
  BroadcastRecipientStatus,
  ListSentFilters,
} from '../api/notification-broadcasts.api';

export const broadcastKeys = {
  root: ['notification-broadcasts'] as const,
  list: ['notification-broadcasts', 'list'] as const,
  senders: ['notification-broadcasts', 'senders'] as const,
  detail: (id: number) => ['notification-broadcasts', 'detail', id] as const,
  recipients: (id: number, status?: BroadcastRecipientStatus, search?: string) =>
    ['notification-broadcasts', 'recipients', id, status, search] as const,
};

/** Xem trước số người sẽ nhận - không ghi DB (nút "Xem trước người nhận"). */
export function usePreviewBroadcast() {
  return useMutation({
    mutationFn: (audience: BroadcastAudiencePayload) => notificationBroadcastsApi.preview(audience),
  });
}

/** Soạn & gửi - sau khi thành công, làm mới danh sách "Đã gửi". */
export function useSendBroadcast() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { title: string; body: string; audience: BroadcastAudiencePayload }) =>
      notificationBroadcastsApi.send(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: broadcastKeys.list });
    },
  });
}

/**
 * Lịch sử đã gửi - cursor pagination ("Tải thêm"), mirror useNotificationList.
 * `filters` (MỚI, PLAN 7.7 mở rộng 2026-09-22) - search/audienceType/senderId/
 * dateFrom/dateTo, mirror pattern filter Khách hàng. Đưa vào queryKey để đổi
 * filter tự động refetch từ đầu (cursor reset - không truyền cursor cũ).
 */
export function useSentBroadcasts(limit = 20, filters: Omit<ListSentFilters, 'cursor' | 'limit'> = {}) {
  return useInfiniteQuery({
    queryKey: [...broadcastKeys.list, limit, filters],
    queryFn: ({ pageParam }) =>
      notificationBroadcastsApi.listSent({ ...filters, cursor: pageParam, limit }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 15_000,
  });
}

/** Danh sách "Người gửi" cho dropdown filter - chỉ người đã từng gửi >=1 thông báo. */
export function useBroadcastSenders() {
  return useQuery({
    queryKey: broadcastKeys.senders,
    queryFn: () => notificationBroadcastsApi.getSenders(),
    staleTime: 60_000,
  });
}

export function useBroadcastDetail(id: number | null) {
  return useQuery({
    queryKey: broadcastKeys.detail(id ?? 0),
    queryFn: () => notificationBroadcastsApi.getOne(id as number),
    enabled: id !== null,
  });
}

/** Bảng người nhận trong Drawer chi tiết - cursor pagination riêng theo id. */
export function useBroadcastRecipients(
  id: number | null,
  status: BroadcastRecipientStatus = 'all',
  search = '',
  limit = 20,
) {
  return useInfiniteQuery({
    queryKey: broadcastKeys.recipients(id ?? 0, status, search),
    queryFn: ({ pageParam }) =>
      notificationBroadcastsApi.listRecipients(id as number, {
        status,
        search: search || undefined,
        cursor: pageParam,
        limit,
      }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: id !== null,
    staleTime: 10_000,
  });
}

export function useUpdateBroadcast() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: number; title?: string; body?: string }) =>
      notificationBroadcastsApi.update(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: broadcastKeys.list });
      queryClient.invalidateQueries({ queryKey: broadcastKeys.detail(variables.id) });
    },
  });
}

export function useRemoveBroadcast() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => notificationBroadcastsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: broadcastKeys.list });
    },
  });
}