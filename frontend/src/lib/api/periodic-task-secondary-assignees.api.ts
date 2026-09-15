import axiosInstance from './axios-instance';

interface RefUser {
  id: number;
  name: string;
  email?: string;
}

/**
 * periodicTaskSecondaryAssigneesApi - Phase 4 (PLAN_PERIODIC_TASKS_MODULE.md
 * mục 2.5, 5): "1 chính + N phụ" cho Công việc định kỳ. Khớp đúng 2 endpoint
 * của `PeriodicTasksController` phần "Phase 4":
 *   POST   /periodic-tasks/:id/secondary-assignees   (body: { userId: number })
 *   DELETE /periodic-tasks/:id/secondary-assignees/:userId
 *
 * Khác `periodic-task-customers.api.ts` (Phase 3) ở chỗ CHỈ có 1 lớp quyền
 * `periodic_tasks.edit` (đã gate ở Controller) - không có permission nhị
 * phân riêng như `link_customer`, và danh sách trả về KHÔNG bị ẩn theo
 * quyền nào khác (thông tin phân công nội bộ).
 */
export const periodicTaskSecondaryAssigneesApi = {
  /** Thêm 1 Phụ trách phụ - trả lại toàn bộ danh sách Phụ trách phụ hiện tại
   * của Task (mới nhất), không phải chỉ người vừa thêm. */
  addSecondaryAssignee: async (taskId: number, userId: number): Promise<RefUser[]> => {
    const response = await axiosInstance.post<RefUser[]>(`/periodic-tasks/${taskId}/secondary-assignees`, {
      userId,
    });
    return response.data;
  },

  /** Gỡ 1 Phụ trách phụ khỏi Task. */
  removeSecondaryAssignee: async (taskId: number, userId: number): Promise<{ deleted: true }> => {
    const response = await axiosInstance.delete<{ deleted: true }>(
      `/periodic-tasks/${taskId}/secondary-assignees/${userId}`,
    );
    return response.data;
  },
};
