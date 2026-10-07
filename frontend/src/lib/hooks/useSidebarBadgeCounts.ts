import { useQuery } from '@tanstack/react-query';
import { notificationsApi } from '../api/notifications.api';
import { useAuthStore } from '../stores/auth.store';
import { notificationKeys } from './useNotifications';
import { useActivityPolling } from './useUserActivity';

// [AGENT] OLD CODE (giữ lại để rollback): 7 useQuery riêng (invalid-data, trash, users,
// duyet-phep, nghi-phep, 2 badge Công việc định kỳ + query tra id status) gọi 7 endpoint
// khác nhau mỗi chu kỳ - mỗi request chạy riêng JwtStrategy + PermissionGuard và nhiều
// endpoint là danh sách đầy đủ (join + hydrate) chỉ để lấy `total`.
// NEW: 1 request `GET /sidebar/badges` - BE tự kiểm permission từng badge + chỉ COUNT.
// [AGENT] OLD CODE (rollback): 180_000. Cùng key poll với useNotificationPoll -> đồng bộ 300s.
const REFRESH_INTERVAL_MS = 300_000;

/** queryKey DUY NHẤT của badge sidebar - invalidate key này sau mutation để làm mới ngay. */
// [AGENT] OLD CODE (giữ để rollback): ['badge-count', 'sidebar'] + query riêng /sidebar/badges.
// NEW (10C): badges nằm trong poll chung -> cùng key `notificationKeys.poll` (permission đổi -> invalidate poll là làm mới luôn badge).
export const SIDEBAR_BADGES_QUERY_KEY = notificationKeys.poll;

/**
 * Key phụ trong map counts cho badge VÀNG "Đang làm" (in_progress) của mục
 * Công việc định kỳ. Badge ĐỎ To-Do vẫn dùng đúng `counts['cong-viec-dinh-ky']`
 * như cũ (không đổi hợp đồng của các nơi tiêu thụ hiện có).
 */
export const TASK_IN_PROGRESS_COUNT_KEY = 'cong-viec-dinh-ky:in_progress';

/**
 * Trả về map { [navItemKey]: count } - KHỚP TRỰC TIẾP với `key` trong
 * NAV_ITEMS (lib/nav-config.tsx). Việc quyết định badge nào hiện (theo
 * permission) nay do BE làm: field không có trong response = không hiện.
 *
 * Badge `thong-bao` vẫn lấy từ `/notifications/poll` (dùng CHUNG queryKey với
 * `useNotificationPoll()` ở NotificationBell nên không tạo thêm request).
 */
export function useSidebarBadgeCounts(): Record<string, number> {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // [AGENT] NEW CODE (10C): 1 query poll chung (unread + badges); dừng poll khi người dùng bỏ treo tab >5 phút.
  const pollInterval = useActivityPolling(notificationKeys.poll, REFRESH_INTERVAL_MS, isAuthenticated);

  const notificationsPoll = useQuery({
    queryKey: notificationKeys.poll,
    queryFn: () => notificationsApi.poll(),
    enabled: isAuthenticated,
    refetchInterval: pollInterval,
    staleTime: REFRESH_INTERVAL_MS,
  });

  const counts: Record<string, number> = {};
  const d = notificationsPoll.data?.badges;
  if (d) {
    if (d.invalidData !== undefined) counts['invalid-data-report'] = d.invalidData;
    if (d.trash !== undefined) counts['trash-can'] = d.trash;
    if (d.pendingUsers !== undefined) counts['users'] = d.pendingUsers;
    if (d.leaveApprovals !== undefined) counts['duyet-phep'] = d.leaveApprovals;
    if (d.myPendingLeave !== undefined) counts['nghi-phep'] = d.myPendingLeave;
    if (d.taskTodo !== undefined) counts['cong-viec-dinh-ky'] = d.taskTodo;
    if (d.taskInProgress !== undefined) counts[TASK_IN_PROGRESS_COUNT_KEY] = d.taskInProgress;
  }
  if (isAuthenticated && notificationsPoll.data !== undefined) {
    counts['thong-bao'] = notificationsPoll.data.unread;
  }

  return counts;
}
