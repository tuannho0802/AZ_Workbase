import axiosInstance from './axios-instance';

/**
 * Khớp `SidebarBadges` ở BE (`modules/sidebar-badges`). Field vắng mặt = người
 * dùng không có permission tương ứng (hoặc lần đếm đó lỗi) -> không hiện badge.
 */
export interface SidebarBadgesResponse {
  invalidData?: number;
  trash?: number;
  pendingUsers?: number;
  leaveApprovals?: number;
  myPendingLeave?: number;
  taskTodo?: number;
  taskInProgress?: number;
  /** Số Page cần đăng bài hôm nay (tab "Hôm nay" của Quản lý Fanpage) - chỉ có khi có `fanpages.view`. */
  fanpageToDo?: number;
}

export const sidebarApi = {
  /** GỘP 7 request đếm badge thành 1 (BE tự kiểm permission từng badge). */
  getBadges: async (): Promise<SidebarBadgesResponse> => {
    const response = await axiosInstance.get<SidebarBadgesResponse>('/sidebar/badges');
    return response.data;
  },
};
