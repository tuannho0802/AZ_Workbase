import { useEffect, useRef } from 'react';
import { App } from 'antd';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../api/notifications.api';
import { useAuthStore } from '../stores/auth.store';
import { notificationKeys } from './useNotifications';
import { useActivityPolling } from './useUserActivity';
import { usePermissionChangeSignal } from './usePermissionChangeSignal';
import { useRefDataChangeSignal } from './useRefDataChangeSignal';
import { useSystemEpochSignal } from './useSystemEpochSignal';
import { useNotificationActions } from './useNotificationActions';
import { planToasts, readLastSeenVersion, writeLastSeenVersion } from '../notifications/toast-plan';
import type { NotificationCategory } from '../types/notification.types';

// [AGENT] OLD CODE (giữ lại để rollback): const POLL_INTERVAL_MS = 60_000;
// 2 phút (PLAN 2.3): Vercel serverless không có WebSocket/SSE fan-out → polling nhẹ. Nâng từ 60s
// để giảm Fluid Active CPU (Hobby). Thông báo vẫn cập nhật ngay khi focus lại tab.
// [AGENT] OLD CODE (rollback): 120_000. Nâng 300s theo yêu cầu để giảm Fluid Active CPU.
const POLL_INTERVAL_MS = 300_000;

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

  // [AGENT] NEW CODE: dừng poll khi người dùng bỏ treo tab >5 phút, làm mới ngay khi quay lại.
  const refetchInterval = useActivityPolling(notificationKeys.poll, POLL_INTERVAL_MS, isAuthenticated);

  const query = useQuery({
    queryKey: notificationKeys.poll,
    queryFn: () => notificationsApi.poll(),
    enabled: isAuthenticated,
    // [AGENT] OLD CODE (giữ lại để rollback): refetchInterval: POLL_INTERVAL_MS,
    refetchInterval,
    refetchOnWindowFocus: true,
    // [AGENT] OLD CODE: staleTime: POLL_INTERVAL_MS / 2 (150s -> focus lại tab sau >2,5 phút là poll thêm 1 lần, ngoài chu kỳ 5 phút)
    // NEW: = POLL_INTERVAL_MS (cùng useSidebarBadgeCounts, nếu 2 observer lệch staleTime thì cái NGẮN hơn thắng).
    staleTime: POLL_INTERVAL_MS,
    retry: 1,
  });

  // [AGENT] NEW CODE: poll báo "quyền của tôi vừa đổi" -> làm mới quyền/ẩn-hiện UI ngay (không chờ staleTime 60s).
  usePermissionChangeSignal(query.data?.permSig, userId);
  // [AGENT] NEW CODE (9D): poll báo "danh mục ít đổi vừa đổi" -> chỉ làm mới đúng danh mục đó.
  useRefDataChangeSignal(query.data?.refSig, userId);
  // Reset hệ thống: Root Admin bấm Reset -> `epoch` đổi -> làm mới TOÀN BỘ cache.
  useSystemEpochSignal(query.data?.epoch, userId);

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
