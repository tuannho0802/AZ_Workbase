import axiosInstance from './axios-instance';
import type {
  PeriodicTaskChecklistItem,
  PeriodicTaskChecklistPage,
  LinkedChildChecklistEntry,
} from './periodic-tasks.api';

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
 * Danh sách được PHÂN TRANG server-side (tối đa 10 dòng/trang - `CHECKLIST_PAGE_SIZE`).
 * `create` trả item vừa tạo + tổng mới, `update` trả item vừa sửa, `remove`/`move`
 * trả cờ - KHÔNG còn trả lại cả danh sách (FE refetch đúng trang đang xem).
 * Không có permission/scope riêng - CHỈ cần `periodic_tasks.view` (đọc) và
 * `periodic_tasks.edit` (sửa) của chính Task cha (đã gate ở BE Controller).
 */
export const CHECKLIST_PAGE_SIZE = 10;

export const periodicTaskChecklistItemsApi = {
  getPage: async (taskId: number, page: number): Promise<PeriodicTaskChecklistPage<PeriodicTaskChecklistItem>> => {
    const response = await axiosInstance.get<PeriodicTaskChecklistPage<PeriodicTaskChecklistItem>>(
      `/periodic-tasks/${taskId}/checklist-items`,
      { params: { page, limit: CHECKLIST_PAGE_SIZE } },
    );
    return response.data;
  },

  getLinkedChildrenPage: async (
    taskId: number,
    page: number,
  ): Promise<PeriodicTaskChecklistPage<LinkedChildChecklistEntry>> => {
    const response = await axiosInstance.get<PeriodicTaskChecklistPage<LinkedChildChecklistEntry>>(
      `/periodic-tasks/${taskId}/linked-children-checklist`,
      { params: { page, limit: CHECKLIST_PAGE_SIZE } },
    );
    return response.data;
  },

  create: async (
    taskId: number,
    content: string,
  ): Promise<{ item: PeriodicTaskChecklistItem; total: number; done: number }> => {
    const response = await axiosInstance.post(`/periodic-tasks/${taskId}/checklist-items`, { content });
    return response.data;
  },

  update: async (
    taskId: number,
    itemId: number,
    data: { content?: string; isDone?: boolean },
  ): Promise<PeriodicTaskChecklistItem> => {
    const response = await axiosInstance.patch<PeriodicTaskChecklistItem>(
      `/periodic-tasks/${taskId}/checklist-items/${itemId}`,
      data,
    );
    return response.data;
  },

  remove: async (taskId: number, itemId: number): Promise<{ deleted: true }> => {
    const response = await axiosInstance.delete<{ deleted: true }>(`/periodic-tasks/${taskId}/checklist-items/${itemId}`);
    return response.data;
  },

  /** Đổi chỗ với item liền kề (xuyên trang). `moved=false` khi đã ở đầu/cuối. */
  move: async (taskId: number, itemId: number, direction: 'up' | 'down'): Promise<{ moved: boolean }> => {
    const response = await axiosInstance.patch<{ moved: boolean }>(
      `/periodic-tasks/${taskId}/checklist-items/${itemId}/move`,
      { direction },
    );
    return response.data;
  },
};
