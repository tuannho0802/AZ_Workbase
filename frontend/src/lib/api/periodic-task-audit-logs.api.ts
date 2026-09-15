import axiosInstance from './axios-instance';
import { PaginatedPeriodicTaskAuditLogs } from '../types/periodic-task-audit.types';

/**
 * periodicTaskAuditLogsApi - Phase 7 (PLAN_PERIODIC_TASKS_MODULE.md mục 2.6 +
 * mục 6 Phase 7): audit log RIÊNG cho module "Công việc định kỳ", tách khỏi
 * `auditApi` chung (`/audit-logs` - `lib/api/audit.api.ts`). Khớp đúng 1
 * endpoint duy nhất:
 *   GET /periodic-tasks/:id/audit-logs?page=&limit=
 *
 * Khác `usePeriodicTask(id).checklistItems`/`.secondaryAssignees` (đính kèm
 * sẵn trong response `GET /:id`) - đây là endpoint phân trang RIÊNG, không
 * nằm trong `PeriodicTask` - phải gọi query riêng (xem `usePeriodicTaskAuditLogs`).
 * Chỉ cần `periodic_tasks.view` của chính Task cha (đã gate ở BE Controller
 * qua "1 cổng gác" `findOne()` trước khi query bảng audit).
 */
export const periodicTaskAuditLogsApi = {
  getForTask: async (
    taskId: number,
    params: { page?: number; limit?: number },
  ): Promise<PaginatedPeriodicTaskAuditLogs> => {
    const response = await axiosInstance.get<PaginatedPeriodicTaskAuditLogs>(
      `/periodic-tasks/${taskId}/audit-logs`,
      { params },
    );
    return response.data;
  },
};
