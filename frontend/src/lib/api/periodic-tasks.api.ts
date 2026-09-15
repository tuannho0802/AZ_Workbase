import axiosInstance from './axios-instance';
import { PaginatedResponse, Customer } from '../types/customer.types';

/** Khớp đúng `PeriodType` enum ở BE (`common/enums/period-type.enum.ts`). */
export type PeriodType = 'daily' | 'weekly' | 'monthly' | 'yearly';

export const PERIOD_TYPE_LABELS: Record<PeriodType, string> = {
  daily: 'Ngày',
  weekly: 'Tuần',
  monthly: 'Tháng',
  yearly: 'Năm',
};

/** Mirror ĐÚNG `PERIOD_RANK` ở BE (`common/enums/period-type.enum.ts`) - dùng
 * để FE lọc TRƯỚC danh sách gợi ý cha/con hợp lệ ở `TaskLinksModal` (Phase 2).
 * KHÔNG phải lớp bảo vệ duy nhất - BE luôn validate lại 100% ở
 * `PeriodicTaskLinksService.addLink()`. */
export const PERIOD_RANK: Record<PeriodType, number> = { daily: 1, weekly: 2, monthly: 3, yearly: 4 };

interface RefUser {
  id: number;
  name: string;
  email?: string;
}

interface RefDepartment {
  id: number;
  name: string;
  color?: string;
}

/**
 * PeriodicTask - "Công việc định kỳ", khớp response thật của
 * `PeriodicTasksController` (BE trả nguyên object entity kèm relations
 * `status`/`primaryAssignee`/`department`/`createdBy`/`updatedBy` qua
 * `leftJoinAndSelect`, KHÔNG có DTO response riêng ở Phase 1).
 */
export interface PeriodicTask {
  id: number;
  title: string;
  description: string | null;
  periodType: PeriodType;
  periodStartDate: string;
  periodEndDate: string;
  statusId: number;
  status: {
    id: number;
    code: string;
    name: string;
    color: string;
    isDoneState: boolean;
  };
  primaryAssigneeId: number;
  primaryAssignee: RefUser;
  departmentId: number | null;
  department: RefDepartment | null;
  createdById: number;
  createdBy: RefUser;
  updatedById: number | null;
  updatedBy: RefUser | null;
  completedAt: string | null;
  note: string | null;
  /** Màu Task (hex, vd '#FF5733') - CHỈ dùng hiển thị UI (Card/Kanban/
   * Calendar...), không mang ý nghĩa nghiệp vụ. `null` nếu chưa set lúc tạo. */
  color: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * Phase 3 (PLAN mục 2.4): CHỈ có mặt trên response của `GET /:id`
   * (`getOne()`) - `GET /` (`getAll()`) KHÔNG đính field này (BE chỉ gọi
   * `attachLinkedCustomers()` ở `findOne()`, xem controller).
   * - `undefined` (key không tồn tại trong object gốc) → người xem KHÔNG có
   *   quyền `customers.view`, KHÔNG phải "chưa gắn Customer nào" - FE phải
   *   phân biệt `undefined` (ẩn hẳn UI phần Customer) với mảng rỗng `[]`
   *   (có quyền, chỉ là chưa gắn/không còn cái nào trong phạm vi xem).
   */
  linkedCustomers?: Customer[];
}

export interface CreatePeriodicTaskPayload {
  title: string;
  description?: string;
  periodType: PeriodType;
  /** YYYY-MM-DD - BẮT BUỘC truyền tường minh, BE KHÔNG tự suy ra biên tuần/
   * tháng/năm (xem JSDoc entity ở BE). */
  periodStartDate: string;
  periodEndDate: string;
  statusId?: number;
  primaryAssigneeId: number;
  /** Bỏ trống sẽ auto-fill theo phòng ban của primaryAssigneeId lúc tạo. */
  departmentId?: number;
  note?: string;
  /** Hex 6 ký tự, vd '#FF5733' - không bắt buộc. */
  color?: string;
}

export type UpdatePeriodicTaskPayload = Partial<CreatePeriodicTaskPayload>;

export interface PeriodicTaskFilterParams {
  page?: number;
  limit?: number;
  periodType?: PeriodType;
  /** Khớp CHÍNH XÁC 1 kỳ (vd đúng "2026-09-14"). */
  periodStartDate?: string;
  /** Khớp theo KHOẢNG (overlap) - kết hợp AND được với periodStartDate. */
  dateFrom?: string;
  dateTo?: string;
  statusId?: number;
  primaryAssigneeId?: number;
  departmentId?: number;
  search?: string;
}

export const periodicTasksApi = {
  getAll: async (params: PeriodicTaskFilterParams): Promise<PaginatedResponse<PeriodicTask>> => {
    const response = await axiosInstance.get<PaginatedResponse<PeriodicTask>>('/periodic-tasks', { params });
    return response.data;
  },

  getOne: async (id: number): Promise<PeriodicTask> => {
    const response = await axiosInstance.get<PeriodicTask>(`/periodic-tasks/${id}`);
    return response.data;
  },

  create: async (data: CreatePeriodicTaskPayload): Promise<PeriodicTask> => {
    const response = await axiosInstance.post<PeriodicTask>('/periodic-tasks', data);
    return response.data;
  },

  update: async (id: number, data: UpdatePeriodicTaskPayload): Promise<PeriodicTask> => {
    const response = await axiosInstance.patch<PeriodicTask>(`/periodic-tasks/${id}`, data);
    return response.data;
  },

  /** Xoá mềm - CHỈ Admin thấy nút này ở FE (permission `periodic_tasks.delete`
   * không có scope, khác view/create/edit - xem PLAN mục 2.7). */
  remove: async (id: number): Promise<{ deleted: true }> => {
    const response = await axiosInstance.delete<{ deleted: true }>(`/periodic-tasks/${id}`);
    return response.data;
  },
};