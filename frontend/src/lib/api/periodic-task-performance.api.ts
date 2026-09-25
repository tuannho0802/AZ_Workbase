import axiosInstance from './axios-instance';
import type { PermissionScope } from '../types/roles.types';
import type { PeriodType, PeriodicTask } from './periodic-tasks.api';

/**
 * Mirror ĐÚNG `LATE_GRACE_DAYS` ở BE (`periodic-task-performance.service.ts`):
 * Task chỉ bị coi là "trễ" khi mốc chuyển sang In review/Hoàn thành nằm SAU
 * `periodEndDate + 7 ngày`. Chỉ dùng để hiển thị chú thích - phần tính toán
 * thật luôn nằm ở BE.
 */
export const LATE_GRACE_DAYS = 7;

/** Khớp `PerformanceUserRow` ở BE - 1 dòng / 1 Phụ trách chính. */
export interface PerformanceUserRow {
  userId: number;
  userName: string;
  /** Tổng Task trong kỳ, đã trừ status `isExcludedFromRollup`. */
  total: number;
  completedOnTime: number;
  completedLate: number;
  /** Chưa xong VÀ đã qua cả ân hạn. */
  overdueNotCompleted: number;
  /** Chưa xong nhưng còn trong ân hạn - không trừ điểm. */
  pendingFuture: number;
  /** `null` nếu total = 0. */
  completionRatePercent: number | null;
  /** `null` nếu chưa có Task nào xong. */
  lateRatePercent: number | null;
  /** Số Task đang có `status.code = 'in_progress'` NGAY TẠI THỜI ĐIỂM XEM
   * (snapshot trạng thái hiện tại, ĐỘC LẬP với completedOnTime/Late/overdue -
   * mirror JSDoc field cùng tên ở BE `PerformanceUserRow`). */
  inProgressCount: number;
  /** Số Task đang có `status.code = 'in_review'` hiện tại (mirror `inProgressCount`). */
  inReviewCount: number;
  /** % inProgressCount / total. `null` nếu total = 0. */
  inProgressRatePercent: number | null;
  /** % inReviewCount / total. `null` nếu total = 0. */
  inReviewRatePercent: number | null;
  checklistDone: number;
  checklistTotal: number;
}

export interface PerformanceSummaryResult {
  /** Scope BE thực sự áp dụng - 'own' nếu role KHÔNG có `periodic_tasks.performance_view`. */
  scope: PermissionScope;
  dateFrom: string;
  dateTo: string;
  rows: PerformanceUserRow[];
}

export interface PerformanceFilterParams {
  /** YYYY-MM-DD, tối đa 93 ngày (BE trả 400 nếu vượt). */
  dateFrom?: string;
  dateTo?: string;
  periodType?: PeriodType;
  /** BE chỉ áp dụng khi scope là department/all. */
  departmentId?: number;
  userId?: number;
  /** CHỈ dùng cho `getUserTasks` - trang hiện tại nhóm "Phụ trách chính"
   * (mirror `primaryPage` ở BE DTO, mặc định 1). Các endpoint khác bỏ qua. */
  primaryPage?: number;
  /** CHỈ dùng cho `getUserTasks` - trang hiện tại nhóm "Phụ trách phụ". */
  secondaryPage?: number;
}

/** Khớp `PaginatedUserTasks` ở BE (MỚI 2026-09-25, phân trang SERVER-SIDE
 * cho `GET /users/:userId/tasks` - mỗi nhóm tối đa `pageSize` Task/trang,
 * `total` là TOÀN BỘ số Task khớp bộ lọc để FE vẽ `<Pagination>`). */
export interface PaginatedUserTasksResult {
  items: PeriodicTask[];
  total: number;
  page: number;
  pageSize: number;
}

/** Khớp response `GET /users/:userId/tasks` (MỚI 2026-09-25) - xem JSDoc
 * `PeriodicTaskPerformanceService.getUserTasks()`. */
export interface UserTasksResult {
  scope: PermissionScope | 'own';
  /** Task có `primaryAssigneeId` = User được xem (đã phân trang). */
  primary: PaginatedUserTasksResult;
  /** Task User được xem CHỈ là Phụ trách phụ (đã phân trang). */
  secondary: PaginatedUserTasksResult;
}

export const periodicTaskPerformanceApi = {
  getSummary: async (params: PerformanceFilterParams): Promise<PerformanceSummaryResult> => {
    const response = await axiosInstance.get<PerformanceSummaryResult>(
      '/periodic-tasks-performance/summary',
      { params },
    );
    return response.data;
  },

  /** Task hoàn thành muộn / quá hạn chưa xong của 1 User (drill-down). */
  getUserFlaggedTasks: async (
    userId: number,
    params: PerformanceFilterParams,
  ): Promise<PeriodicTask[]> => {
    const response = await axiosInstance.get<PeriodicTask[]>(
      `/periodic-tasks-performance/users/${userId}/flagged-tasks`,
      { params },
    );
    return response.data;
  },

  /** Danh sách ĐẦY ĐỦ Task (chính + phụ, tách riêng) của 1 User - KHÔNG giới
   * hạn "hoàn thành muộn/quá hạn" như `getUserFlaggedTasks`. Dùng cho trang
   * chi tiết scope='own' và Drawer xem User khác (luôn xem được, không cần
   * điều kiện "có Task cần lưu ý"). */
  getUserTasks: async (
    userId: number,
    params: PerformanceFilterParams,
  ): Promise<UserTasksResult> => {
    const response = await axiosInstance.get<UserTasksResult>(
      `/periodic-tasks-performance/users/${userId}/tasks`,
      { params },
    );
    return response.data;
  },
};