import axiosInstance from './axios-instance';
import { PeriodicTask } from './periodic-tasks.api';

/**
 * periodicTaskLinksApi - Phase 2 (PLAN_PERIODIC_TASKS_MODULE.md mục 6):
 * liên kết phân cấp DAG (multi-parent, skip-level) + % hoàn thành (rollup).
 * Khớp đúng 5 endpoint của `PeriodicTasksController` phần "Phase 2":
 *   POST   /periodic-tasks/:id/links               (:id = con, body.parentTaskId = cha)
 *   DELETE /periodic-tasks/:id/links/:parentTaskId  (:id = con)
 *   GET    /periodic-tasks/:id/children
 *   GET    /periodic-tasks/:id/parents
 *   GET    /periodic-tasks/:id/rollup
 *
 * Rank (`parent` phải "lớn kỳ hạn hơn" `child`) + chống chu trình (cycle)
 * ĐỀU được BE validate lại 100% (`PeriodicTaskLinksService`) - hàm FE này
 * chỉ gọi thẳng API, KHÔNG tự validate lại.
 */
export interface TaskRollup {
  totalChildren: number;
  doneChildren: number;
  /** null khi `totalChildren = 0` (chưa có Công việc con - FE tự hiển thị
   * "chưa có việc con" thay vì "0%" gây hiểu nhầm, xem JSDoc BE). */
  percent: number | null;
}

export const periodicTaskLinksApi = {
  getChildren: async (taskId: number): Promise<PeriodicTask[]> => {
    const response = await axiosInstance.get<PeriodicTask[]>(`/periodic-tasks/${taskId}/children`);
    return response.data;
  },

  getParents: async (taskId: number): Promise<PeriodicTask[]> => {
    const response = await axiosInstance.get<PeriodicTask[]>(`/periodic-tasks/${taskId}/parents`);
    return response.data;
  },

  getRollup: async (taskId: number): Promise<TaskRollup> => {
    const response = await axiosInstance.get<TaskRollup>(`/periodic-tasks/${taskId}/rollup`);
    return response.data;
  },

  /** Gán `parentTaskId` làm cha của `childId`. */
  addLink: async (
    childId: number,
    parentTaskId: number,
  ): Promise<{ id: number; childTaskId: number; parentTaskId: number }> => {
    const response = await axiosInstance.post(`/periodic-tasks/${childId}/links`, { parentTaskId });
    return response.data;
  },

  /** Gỡ liên kết cha `parentTaskId` khỏi `childId`. */
  removeLink: async (childId: number, parentTaskId: number): Promise<{ deleted: true }> => {
    const response = await axiosInstance.delete<{ deleted: true }>(
      `/periodic-tasks/${childId}/links/${parentTaskId}`,
    );
    return response.data;
  },
};
