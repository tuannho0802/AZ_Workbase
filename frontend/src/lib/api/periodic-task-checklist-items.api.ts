import axiosInstance from './axios-instance';
import { PeriodicTaskChecklistItem } from './periodic-tasks.api';

/**
 * periodicTaskChecklistItemsApi - Phase 6 (PLAN_PERIODIC_TASKS_MODULE.md
 * mục 6): checklist con kiểu Trello cho Công việc định kỳ. Khớp đúng 5
 * endpoint của `PeriodicTasksController` phần "Phase 6"
 * (`periodic-tasks.controller.ts`):
 *   GET    /periodic-tasks/:id/checklist-items
 *   POST   /periodic-tasks/:id/checklist-items
 *   PATCH  /periodic-tasks/:id/checklist-items/reorder
 *   PATCH  /periodic-tasks/:id/checklist-items/:itemId
 *   DELETE /periodic-tasks/:id/checklist-items/:itemId
 *
 * Mọi hàm sửa dữ liệu (add/update/reorder/remove) đều trả về TOÀN BỘ danh
 * sách checklist item mới nhất của Task (không phải chỉ item vừa đổi) - mirror
 * `periodicTaskSecondaryAssigneesApi.addSecondaryAssignee()`, đơn giản hoá
 * việc đồng bộ state phía FE (chỉ cần set lại data, không cần tự merge).
 * Không có permission/scope riêng - CHỈ cần `periodic_tasks.view` (đọc) và
 * `periodic_tasks.edit` (sửa) của chính Task cha (đã gate ở BE Controller).
 */
export const periodicTaskChecklistItemsApi = {
  getAll: async (taskId: number): Promise<PeriodicTaskChecklistItem[]> => {
    const response = await axiosInstance.get<PeriodicTaskChecklistItem[]>(
      `/periodic-tasks/${taskId}/checklist-items`,
    );
    return response.data;
  },

  create: async (taskId: number, content: string): Promise<PeriodicTaskChecklistItem[]> => {
    const response = await axiosInstance.post<PeriodicTaskChecklistItem[]>(
      `/periodic-tasks/${taskId}/checklist-items`,
      { content },
    );
    return response.data;
  },

  update: async (
    taskId: number,
    itemId: number,
    data: { content?: string; isDone?: boolean },
  ): Promise<PeriodicTaskChecklistItem[]> => {
    const response = await axiosInstance.patch<PeriodicTaskChecklistItem[]>(
      `/periodic-tasks/${taskId}/checklist-items/${itemId}`,
      data,
    );
    return response.data;
  },

  remove: async (taskId: number, itemId: number): Promise<PeriodicTaskChecklistItem[]> => {
    const response = await axiosInstance.delete<PeriodicTaskChecklistItem[]>(
      `/periodic-tasks/${taskId}/checklist-items/${itemId}`,
    );
    return response.data;
  },

  /** `itemIds` PHẢI là hoán vị ĐẦY ĐỦ của toàn bộ item hiện có trong Task
   * (khớp 1-1, không thiếu/thừa) - xem `ReorderPeriodicTaskChecklistItemsDto`
   * ở BE, thiếu/thừa sẽ ăn 400. */
  reorder: async (taskId: number, itemIds: number[]): Promise<PeriodicTaskChecklistItem[]> => {
    const response = await axiosInstance.patch<PeriodicTaskChecklistItem[]>(
      `/periodic-tasks/${taskId}/checklist-items/reorder`,
      { itemIds },
    );
    return response.data;
  },
};
