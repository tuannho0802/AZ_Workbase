import axiosInstance from './axios-instance';

export interface LeaveType {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  color: string;
  isPaid: boolean;
  deductsAnnualBalance: boolean;
  sortOrder: number;
  /** Số đơn nghỉ phép đang dùng loại này - tính động ở BE (GROUP BY
   * leave_requests.leave_type), KHÔNG lưu sẵn trong bảng leave_types. Dùng
   * để quyết định trước khi xoá có cần bắt buộc chọn fallback hay không. */
  inUseCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLeaveTypePayload {
  code: string;
  name: string;
  description?: string;
  color?: string;
  isPaid?: boolean;
  deductsAnnualBalance?: boolean;
  sortOrder?: number;
}

export type UpdateLeaveTypePayload = Partial<Omit<CreateLeaveTypePayload, 'code'>>;

export const leaveTypesApi = {
  getAll: async (): Promise<LeaveType[]> => {
    const response = await axiosInstance.get<LeaveType[]>('/leave-types');
    return response.data;
  },

  create: async (data: CreateLeaveTypePayload): Promise<LeaveType> => {
    const response = await axiosInstance.post<LeaveType>('/leave-types', data);
    return response.data;
  },

  update: async (id: number, data: UpdateLeaveTypePayload): Promise<LeaveType> => {
    const response = await axiosInstance.patch<LeaveType>(`/leave-types/${id}`, data);
    return response.data;
  },

  /**
   * `fallbackCode` bắt buộc nếu loại phép đang xoá còn `inUseCount > 0` (BE
   * sẽ ném BadRequestException nếu thiếu) - FE luôn nên tự kiểm tra
   * `inUseCount` trước để hiện modal chọn fallback, KHÔNG để user bấm xoá
   * rồi mới biết cần chọn (xem `page.tsx`).
   */
  remove: async (id: number, fallbackCode?: string): Promise<{ deleted: true; reassignedCount: number }> => {
    const response = await axiosInstance.delete<{ deleted: true; reassignedCount: number }>(
      `/leave-types/${id}`,
      { params: fallbackCode ? { fallbackCode } : undefined },
    );
    return response.data;
  },
};
