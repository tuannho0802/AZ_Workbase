import { useQuery } from '@tanstack/react-query';
import { customersApi } from '../api/customers.api';
import { usersApi } from '../api/users.api';
import { leaveRequestsApi } from '../api/leave-requests.api';
import { notificationsApi } from '../api/notifications.api';
import { periodicTasksApi } from '../api/periodic-tasks.api';
import { periodicTaskStatusesApi } from '../api/periodic-task-statuses.api';

import { useMyPermissions } from './useMyPermissions';
import { useAuthStore } from '../stores/auth.store';
import { notificationKeys } from './useNotifications';

// 60s: đủ để badge không bị lỗi thời quá lâu (vd Admin duyệt xong 1 đơn ở
// tab khác, quay lại sidebar sẽ tự cập nhật trong tối đa 1 phút), nhưng
// không dí server liên tục như polling vài giây 1 lần.
const REFRESH_INTERVAL_MS = 60_000;

/**
 * Trả về map { [navItemKey]: count } - KHỚP TRỰC TIẾP với `key` trong
 * NAV_ITEMS (lib/nav-config.tsx), để nơi tiêu thụ chỉ cần
 * `counts[item.key]` mà không cần thêm 1 tầng mapping riêng.
 *
 * Muốn thêm 1 nguồn badge MỚI sau này: thêm đúng 1 khối useQuery bên dưới
 * (key = đúng key trong nav-config), không cần sửa gì ở nơi tiêu thụ
 * (layout.tsx / trang chủ) - chúng chỉ đọc từ map này.
 */
export function useSidebarBadgeCounts(): Record<string, number> {
  const { can, isLoading } = useMyPermissions();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Disable fetches until permissions are loaded
  const canSeeInvalidData = !isLoading && can('customers.invalid_report'); 
  const canSeeTrash = !isLoading && can('customers.trash_manage');
  const canSeePendingUsers = !isLoading && can('users.manage');
  const canApproveLeave = !isLoading && can('leave_requests.approve');
  const canRequestLeave = !isLoading && can('leave_requests.request');
  // Hộp thư "Thông báo" (mục `thong-bao` trong nav-config) KHÔNG có
  // permission riêng - mọi user đã đăng nhập đều thấy (`roles: null`, xem
  // giải thích ở nav-config.tsx) nên chỉ cần gate theo đăng nhập.
  const canSeeTaskTodo = !isLoading && can('periodic_tasks.view');

  // 1. Báo cáo data lỗi (chỉ admin)
  const invalidData = useQuery({
    queryKey: ['badge-count', 'invalid-data-report'],
    queryFn: async () => (await customersApi.getInvalidDataReport({ page: 1, limit: 1 })).total,
    enabled: canSeeInvalidData,
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: REFRESH_INTERVAL_MS,
  });

  // 2. Thùng rác (chỉ admin)
  const trash = useQuery({
    queryKey: ['badge-count', 'trash-can'],
    queryFn: async () => (await customersApi.getTrash({ page: 1, limit: 1 })).total,
    enabled: canSeeTrash,
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: REFRESH_INTERVAL_MS,
  });

  // 3. Nhân viên đăng ký mới đang chờ duyệt
  const pendingUsers = useQuery({
    queryKey: ['badge-count', 'users'],
    queryFn: async () => (await usersApi.getPendingApprovals()).length,
    enabled: canSeePendingUsers,
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: REFRESH_INTERVAL_MS,
  });

  // 4. Đơn nghỉ phép đang chờ MÌNH duyệt (BE đã tự lọc đúng phạm vi role -
  // Manager chỉ thấy đơn phòng ban mình quản lý, xem findPending() ở BE)
  const pendingLeaveApprovals = useQuery({
    queryKey: ['badge-count', 'duyet-phep'],
    queryFn: async () => (await leaveRequestsApi.getPending()).length,
    enabled: canApproveLeave,
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: REFRESH_INTERVAL_MS,
  });

  // 5. Đơn nghỉ phép CỦA CHÍNH MÌNH đang pending - getAll() ở BE đã tự lọc
  // theo requesterId = mình (xem LeaveRequestsService.findAll()), không
  // phải lọc lại theo user id ở đây - chỉ cần lọc status.
  const myPendingLeave = useQuery({
    queryKey: ['badge-count', 'nghi-phep'],
    queryFn: async () => {
      const all = await leaveRequestsApi.getAll();
      return (all as Array<{ status: string }>).filter((r) => r.status === 'pending').length;
    },
    enabled: canRequestLeave,
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: REFRESH_INTERVAL_MS,
  });

  // 6. Thông báo CHƯA ĐỌC của chính mình - dùng CHUNG queryKey
  // (`notificationKeys.poll`) với `useNotificationPoll()` (gọi trong
  // `NotificationBell` ở Header) để React Query GỘP CHUNG 1 request polling
  // `/notifications/poll`, không tạo thêm 1 luồng polling riêng chỉ để phục
  // vụ badge sidebar (2 nơi cùng đọc chung 1 cache, không double-fetch).
  const notificationsPoll = useQuery({
    queryKey: notificationKeys.poll,
    queryFn: () => notificationsApi.poll(),
    enabled: isAuthenticated,
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: REFRESH_INTERVAL_MS,
  });

  // 7a. Tra ID của status hệ thống "not_started" ("Chưa bắt đầu" = To-Do) -
  // code này luôn tồn tại (seed cứng + isSystem ở migration
  // CreatePeriodicTaskStatuses, dùng làm default status khi tạo Task mới -
  // xem PeriodicTasksService.create()) nhưng ID THẬT phụ thuộc DB
  // (auto-increment), không được đoán cứng. queryKey khớp Y HỆT
  // `usePeriodicTaskStatuses.ts` (`['periodic-task-statuses']`) để gộp cache
  // nếu trang "Quản lý Trạng thái công việc" đang mở cùng lúc. Danh sách
  // BOUNDED, ít đổi -> cache lâu hơn (5') thay vì theo REFRESH_INTERVAL_MS.
  const taskStatuses = useQuery({
    queryKey: ['periodic-task-statuses'],
    queryFn: () => periodicTaskStatusesApi.getAll(),
    enabled: canSeeTaskTodo,
    staleTime: 5 * 60_000,
  });
  const notStartedStatusId = taskStatuses.data?.find((s) => s.code === 'not_started')?.id;

  // 7b. Số Công việc định kỳ đang ở trạng thái To-Do (not_started) TRONG
  // PHẠM VI QUYỀN của viewer - BE tự lọc theo scope (own/department/all) ở
  // `PeriodicTasksService.findAll()`, mirror đúng cách nguồn (4) ở trên dựa
  // vào `findPending()` tự lọc scope cho đơn nghỉ phép - không lọc lại theo
  // user/department ở FE.
  const taskTodo = useQuery({
    queryKey: ['badge-count', 'cong-viec-dinh-ky', notStartedStatusId],
    queryFn: async () =>
      (await periodicTasksApi.getAll({ statusId: notStartedStatusId, page: 1, limit: 1 })).total,
    enabled: canSeeTaskTodo && notStartedStatusId !== undefined,
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: REFRESH_INTERVAL_MS,
  });

  const counts: Record<string, number> = {};
  if (canSeeInvalidData && invalidData.data !== undefined) {
    counts['invalid-data-report'] = invalidData.data;
  }
  if (canSeeTrash && trash.data !== undefined) {
    counts['trash-can'] = trash.data;
  }
  if (canSeePendingUsers && pendingUsers.data !== undefined) {
    counts['users'] = pendingUsers.data;
  }
  if (canApproveLeave && pendingLeaveApprovals.data !== undefined) {
    counts['duyet-phep'] = pendingLeaveApprovals.data;
  }
  if (canRequestLeave && myPendingLeave.data !== undefined) {
    counts['nghi-phep'] = myPendingLeave.data;
  }
  if (isAuthenticated && notificationsPoll.data !== undefined) {
    counts['thong-bao'] = notificationsPoll.data.unread;
  }
  if (canSeeTaskTodo && taskTodo.data !== undefined) {
    counts['cong-viec-dinh-ky'] = taskTodo.data;
  }

  return counts;
}