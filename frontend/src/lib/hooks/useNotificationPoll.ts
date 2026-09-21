import { useEffect, useRef } from 'react';
import { App } from 'antd';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../api/notifications.api';
import { useAuthStore } from '../stores/auth.store';
import { notificationKeys } from './useNotifications';
import { useNotificationActions } from './useNotificationActions';
import { planToasts, readLastSeenVersion, writeLastSeenVersion } from '../notifications/toast-plan';
import type { NotificationCategory } from '../types/notification.types';

// 60s (PLAN 2.3): Vercel serverless không có WebSocket/SSE fan-out → polling nhẹ.
const POLL_INTERVAL_MS = 60_000;

const CATEGORY_TITLE: Record<NotificationCategory, string> = {
  customer: 'Khách hàng',
  task: 'Công việc',
  manual: 'Thông báo',
};

/**
 * Polling `/notifications/poll` mỗi 60s (React Query tự DỪNG khi tab ẩn, và
 * refetch khi quay lại tab - bật `refetchOnWindowFocus` RIÊNG cho query này vì
 * QueryClient mặc định của app đang tắt). Khi `version` tăng thì tải thông báo
 * chưa đọc mới và hiện toast (PLAN 7.2):
 *  - KHÔNG toast ở lần poll đầu của phiên (chỉ ghi nhớ mốc `lastSeenVersion`);
 *  - tối đa 3 toast/lần, phần dư gộp thành "và N thông báo mới khác".
 *
 * Gọi hook này ĐÚNG 1 LẦN (trong `NotificationBell` ở Header).
 */
export function useNotificationPoll() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id);
  const queryClient = useQueryClient();
  const router = useRouter();
  const { notification } = App.useApp();
  const { open } = useNotificationActions();

  const query = useQuery({
    queryKey: notificationKeys.poll,
    queryFn: () => notificationsApi.poll(),
    enabled: isAuthenticated,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    staleTime: POLL_INTERVAL_MS / 2,
    retry: 1,
  });

  const version = query.data?.version;
  const lastProcessed = useRef<number | null>(null);
  // Giữ handler mới nhất mà không bắt effect chạy lại mỗi lần render.
  const openRef = useRef(open);
  openRef.current = open;
  // Chỉ huỷ khi component THỰC SỰ unmount - không huỷ khi deps đổi (nếu huỷ,
  // effect chạy lại sẽ bỏ qua vì `lastProcessed` đã khớp → mất toast).
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (version === undefined || lastProcessed.current === version) return;
    lastProcessed.current = version;

    const lastSeen = readLastSeenVersion(userId);
    // Ghi mốc NGAY (trước khi await) để effect chạy lặp không toast trùng.
    writeLastSeenVersion(userId, version);
    if (lastSeen === null || version <= lastSeen) return; // lần đầu của phiên / không có gì mới

    queryClient.invalidateQueries({ queryKey: notificationKeys.list });

    (async () => {
      try {
        const res = await notificationsApi.list({ limit: 10, unreadOnly: true });
        if (!mounted.current) return;
        const plan = planToasts(res.data, lastSeen);

        for (const item of plan.individual) {
          const key = `notif-${item.id}`;
          notification.open({
            key,
            title: CATEGORY_TITLE[item.category] ?? 'Thông báo',
            description: item.title,
            placement: 'bottomRight',
            duration: 6,
            onClick: () => {
              notification.destroy(key);
              openRef.current(item);
            },
          });
        }
        if (plan.extraCount > 0) {
          const key = 'notif-more';
          notification.open({
            key,
            title: 'Thông báo mới',
            description: `và ${plan.extraCount} thông báo mới khác`,
            placement: 'bottomRight',
            duration: 6,
            onClick: () => {
              notification.destroy(key);
              router.push('/thong-bao');
            },
          });
        }
      } catch {
        // Toast chỉ là tiện ích - lỗi mạng/BE để lần poll sau, không báo lỗi.
      }
    })();
  }, [version, userId, queryClient, notification, router]);

  return { unread: query.data?.unread ?? 0, isLoading: query.isLoading };
}
