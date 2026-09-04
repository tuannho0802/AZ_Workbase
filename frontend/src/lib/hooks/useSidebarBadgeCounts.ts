import { useQuery } from '@tanstack/react-query';
import { customersApi } from '../api/customers.api';
import { usersApi } from '../api/users.api';
import { leaveRequestsApi } from '../api/leave-requests.api';

import { useMyPermissions } from './useMyPermissions';

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
  
  // Disable fetches until permissions are loaded
  const canSeeInvalidData = !isLoading && can('customers.manage'); 
  const canSeeTrash = !isLoading && can('customers.delete');
  const canSeePendingUsers = !isLoading && can('users.manage');
  const canApproveLeave = !isLoading && can('leave_requests.approve');
  const canRequestLeave = !isLoading && can('leave_requests.request');

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

  return counts;
}
