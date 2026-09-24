import axiosInstance from './axios-instance';
import { PeriodType } from './periodic-tasks.api';

/** 1 dòng của thùng rác - khớp `PeriodicTaskTrashService.getTrash()` ở BE. */
export interface TrashedPeriodicTask {
  id: number;
  title: string;
  periodType: PeriodType;
  periodStartDate: string;
  periodEndDate: string;
  color: string | null;
  status: { id: number; name: string; color: string } | null;
  primaryAssignee: { id: number; name: string } | null;
  department: { id: number; name: string; color?: string } | null;
  createdBy: { id: number; name: string } | null;
  deletedAt: string;
  /** null = không truy được (log `deleted` không còn). */
  deletedBy: { id: number; name: string } | null;
}

export interface TrashListResponse {
  data: TrashedPeriodicTask[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Permission BE yêu cầu cho cả 3 API dưới: `periodic_tasks.trash_manage`. */
export const periodicTaskTrashApi = {
  getTrash: async (params: { page?: number; limit?: number; search?: string }): Promise<TrashListResponse> => {
    const res = await axiosInstance.get<TrashListResponse>('/periodic-tasks/trash', { params });
    return res.data;
  },

  /** Khôi phục các Task đã chọn (Task sống lại y nguyên, kể cả checklist/liên kết). */
  restore: async (ids: number[]): Promise<{ restored: number; skipped: number }> => {
    const res = await axiosInstance.patch<{ restored: number; skipped: number }>('/periodic-tasks/trash/restore', { ids });
    return res.data;
  },

  /** Xoá VĨNH VIỄN các Task đã chọn (chỉ Task đã xoá mềm mới bị xoá). */
  hardDelete: async (ids: number[]): Promise<{ deleted: number; skipped: number }> => {
    const res = await axiosInstance.delete<{ deleted: number; skipped: number }>('/periodic-tasks/trash/bulk', {
      data: { ids },
    });
    return res.data;
  },

  /** Dọn sạch: xoá VĨNH VIỄN toàn bộ Task đã xoá mềm. */
  emptyTrash: async (): Promise<{ deleted: number }> => {
    const res = await axiosInstance.delete<{ deleted: number }>('/periodic-tasks/trash/empty');
    return res.data;
  },
};
