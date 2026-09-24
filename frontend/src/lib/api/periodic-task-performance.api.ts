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
};
