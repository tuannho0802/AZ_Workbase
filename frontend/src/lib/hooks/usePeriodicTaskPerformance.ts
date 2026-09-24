import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  periodicTaskPerformanceApi,
  PerformanceFilterParams,
} from '../api/periodic-task-performance.api';

const KEY = 'periodic-task-performance';

/** Bảng tổng hợp Hiệu suất theo User. BE tự áp scope (không có quyền
 * `periodic_tasks.performance_view` => chỉ trả dòng của chính mình). */
export const usePeriodicTaskPerformanceSummary = (params: PerformanceFilterParams) =>
  useQuery({
    queryKey: [KEY, 'summary', params],
    queryFn: () => periodicTaskPerformanceApi.getSummary(params),
    placeholderData: keepPreviousData,
  });

/** Drill-down Task muộn/quá hạn của 1 User - chỉ fetch khi mở Drawer (`userId != null`). */
export const useUserFlaggedTasks = (userId: number | null, params: PerformanceFilterParams) =>
  useQuery({
    queryKey: [KEY, 'flagged', userId, params],
    queryFn: () => periodicTaskPerformanceApi.getUserFlaggedTasks(userId as number, params),
    enabled: userId != null,
  });
