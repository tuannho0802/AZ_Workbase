import axiosInstance from './axios-instance';
import {
  PaginatedPeriodicTaskAuditLogs,
  PaginatedPeriodicTaskAuditLogsGlobal,
  PeriodicTaskAuditLogFilters,
  PeriodicTaskAuditLogGlobal,
} from '../types/periodic-task-audit.types';

/**
 * periodicTaskAuditLogsApi - Phase 7 (PLAN_PERIODIC_TASKS_MODULE.md mục 2.6 +
 * mục 6 Phase 7): audit log RIÊNG cho module "Công việc định kỳ", tách khỏi
 * `auditApi` chung (`/audit-logs` - `lib/api/audit.api.ts`). Gồm 2 nhóm
 * endpoint:
 *   - `getForTask()`: GET /periodic-tasks/:id/audit-logs?page=&limit= (theo
 *     1 Task, dùng cho `TaskAuditLogsModal`).
 *   - `getGlobal()`/`getActions()`/`bulkDelete()`/`cleanupByRange()`: trang
 *     riêng "Lịch sử Công việc định kỳ" (`/lich-su-cong-viec`) - gộp log của
 *     MỌI Task trong phạm vi scope, có filter + bulk xoá/dọn dẹp, mirror
 *     đúng `auditApi` chung (`lib/api/audit.api.ts`).
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

  getGlobal: async (
    filters: PeriodicTaskAuditLogFilters,
  ): Promise<PaginatedPeriodicTaskAuditLogsGlobal> => {
    const response = await axiosInstance.get<PaginatedPeriodicTaskAuditLogsGlobal>(
      '/periodic-tasks/audit-logs',
      { params: filters },
    );
    return response.data;
  },

  /** Chi tiết 1 dòng GỘP (kèm oldData/newData - list KHÔNG còn trả 2 trường này). */
  getGlobalDetail: async (id: number) => {
    const response = await axiosInstance.get<PeriodicTaskAuditLogGlobal>(`/periodic-tasks/audit-logs/${id}`);
    return response.data;
  },

  getActions: async (): Promise<string[]> => {
    const response = await axiosInstance.get<string[]>('/periodic-tasks/audit-logs/actions');
    return response.data;
  },

  bulkDelete: async (ids: number[]): Promise<{ success: boolean }> => {
    const response = await axiosInstance.delete<{ success: boolean }>('/periodic-tasks/audit-logs/bulk', {
      data: { ids },
    });
    return response.data;
  },

  cleanupByRange: async (from: string, to: string): Promise<{ success: boolean; count: number }> => {
    const response = await axiosInstance.delete<{ success: boolean; count: number }>(
      '/periodic-tasks/audit-logs/cleanup',
      { params: { from, to } },
    );
    return response.data;
  },
};