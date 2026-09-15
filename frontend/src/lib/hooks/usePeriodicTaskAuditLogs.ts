import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { periodicTaskAuditLogsApi } from '../api/periodic-task-audit-logs.api';

/**
 * usePeriodicTaskAuditLogs - Phase 7 FE. Danh sách phân trang SERVER-SIDE
 * (mirror `usePeriodicTasks()`) - RIÊNG khỏi `usePeriodicTask(id)` vì đây là
 * endpoint/namespace query khác (`GET /:id/audit-logs`, không nằm trong
 * response `GET /:id`). Namespace query khoá theo CẢ `taskId` lẫn
 * `page`/`limit` để đổi trang không lẫn cache giữa các Task khác nhau.
 *
 * Không cần hook `invalidate` riêng - audit log CHỈ được BE tự ghi (qua
 * `logActionAsync()` ở các Service khác), FE không bao giờ tự tạo/sửa/xoá 1
 * dòng audit log, nên không có mutation nào ở module này cần invalidate lại
 * danh sách.
 */
export const usePeriodicTaskAuditLogs = (
  taskId: number | null,
  params: { page: number; limit: number },
) => {
  return useQuery({
    queryKey: ['periodic-task-audit-logs', taskId, params],
    queryFn: () => periodicTaskAuditLogsApi.getForTask(taskId as number, params),
    enabled: taskId != null,
    placeholderData: keepPreviousData,
  });
};
