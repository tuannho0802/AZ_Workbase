import axiosInstance from './axios-instance';

export interface CustomerStatus {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  color: string;
  sortOrder: number;
  /** Số khách hàng đang dùng trạng thái này - tính động ở BE (GROUP BY
   * customers.status), KHÔNG lưu sẵn trong bảng customer_statuses. Dùng để
   * quyết định trước khi xoá có cần bắt buộc chọn fallback hay không (xem
   * `remove()`). */
  inUseCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerStatusPayload {
  code: string;
  name: string;
  description?: string;
  color?: string;
  sortOrder?: number;
}

export type UpdateCustomerStatusPayload = Partial<
  Omit<CreateCustomerStatusPayload, 'code'>
>;

export const customerStatusesApi = {
  getAll: async (): Promise<CustomerStatus[]> => {
    const response = await axiosInstance.get<CustomerStatus[]>('/customer-statuses');
    return response.data;
  },

  create: async (data: CreateCustomerStatusPayload): Promise<CustomerStatus> => {
    const response = await axiosInstance.post<CustomerStatus>('/customer-statuses', data);
    return response.data;
  },

  update: async (id: number, data: UpdateCustomerStatusPayload): Promise<CustomerStatus> => {
    const response = await axiosInstance.patch<CustomerStatus>(`/customer-statuses/${id}`, data);
    return response.data;
  },

  /**
   * `fallbackCode` bắt buộc nếu status đang xoá còn `inUseCount > 0` (BE sẽ
   * ném BadRequestException nếu thiếu) - FE luôn nên tự kiểm tra
   * `inUseCount` trước để hiện modal chọn fallback, KHÔNG để user bấm xoá
   * rồi mới biết cần chọn (xem `page.tsx`).
   */
  remove: async (id: number, fallbackCode?: string): Promise<{ deleted: true; reassignedCount: number }> => {
    const response = await axiosInstance.delete<{ deleted: true; reassignedCount: number }>(
      `/customer-statuses/${id}`,
      { params: fallbackCode ? { fallbackCode } : undefined },
    );
    return response.data;
  },
};
