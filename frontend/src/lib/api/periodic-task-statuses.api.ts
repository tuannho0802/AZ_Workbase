import axiosInstance from './axios-instance';

/**
 * PeriodicTaskStatus - mirror `CustomerStatus` (`customer-statuses.api.ts`)
 * nhưng KHÁC ở chỗ `periodic_tasks.status_id` là FK thật (không phải
 * free-text `code` như `customers.status`) - xem
 * `periodic-task-statuses.service.ts` (BE) mục xoá kèm fallback bằng ID.
 */
export interface PeriodicTaskStatus {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  color: string;
  sortOrder: number;
  /** Có tính vào TỬ SỐ % rollup không (dùng ở Phase 2, hiển thị sẵn ở đây
   * để Admin cấu hình trước). */
  isDoneState: boolean;
  /** Có bị loại khỏi CẢ tử số lẫn mẫu số % rollup không. */
  isExcludedFromRollup: boolean;
  /** Số Công việc định kỳ đang dùng trạng thái này - tính động ở BE (GROUP
   * BY periodic_tasks.status_id), dùng để quyết định có bắt buộc chọn
   * fallback trước khi xoá hay không. */
  inUseCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePeriodicTaskStatusPayload {
  code: string;
  name: string;
  description?: string;
  color?: string;
  sortOrder?: number;
  isDoneState?: boolean;
  isExcludedFromRollup?: boolean;
}

export type UpdatePeriodicTaskStatusPayload = Partial<
  Omit<CreatePeriodicTaskStatusPayload, 'code'>
>;

export const periodicTaskStatusesApi = {
  getAll: async (): Promise<PeriodicTaskStatus[]> => {
    const response = await axiosInstance.get<PeriodicTaskStatus[]>('/periodic-task-statuses');
    return response.data;
  },

  create: async (data: CreatePeriodicTaskStatusPayload): Promise<PeriodicTaskStatus> => {
    const response = await axiosInstance.post<PeriodicTaskStatus>('/periodic-task-statuses', data);
    return response.data;
  },

  update: async (id: number, data: UpdatePeriodicTaskStatusPayload): Promise<PeriodicTaskStatus> => {
    const response = await axiosInstance.patch<PeriodicTaskStatus>(`/periodic-task-statuses/${id}`, data);
    return response.data;
  },

  /**
   * `fallbackStatusId` (ID, KHÔNG PHẢI code - khác `customerStatusesApi.remove`)
   * bắt buộc nếu status đang xoá còn `inUseCount > 0` (BE ném
   * BadRequestException nếu thiếu) - FE luôn tự kiểm tra `inUseCount` trước
   * để hiện modal chọn fallback.
   */
  remove: async (id: number, fallbackStatusId?: number): Promise<{ deleted: true; reassignedCount: number }> => {
    const response = await axiosInstance.delete<{ deleted: true; reassignedCount: number }>(
      `/periodic-task-statuses/${id}`,
      { params: fallbackStatusId ? { fallbackStatusId } : undefined },
    );
    return response.data;
  },
};
