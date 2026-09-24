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
   * Phase 5 (PLAN mục 2.9) - cột thật trên entity (KHÔNG phải field đính
   * thêm như `linkedCustomers`/`secondaryAssignees`) nên LUÔN có mặt trên cả
   * `GET /` và `GET /:id`. `lockedById` KHÔNG kèm object quan hệ
   * (`PeriodicTasksService.findAll()/findOne()` không `leftJoinAndSelect`
   * `lockedBy` - BE cố tình để nhẹ query, xem JSDoc `periodic-tasks.service.ts`
   * gốc) - FE tự tra tên qua `useUsersList()` (đã có sẵn ở mọi nơi cần hiển
   * thị, mirror cách `primaryAssigneeId` KHÔNG cần tra riêng vì có sẵn object
   * `primaryAssignee`, nhưng `lockedBy` thì phải tự tra).
   */
  isLocked: boolean;
  lockedById: number | null;
  lockedAt: string | null;
  lockNote: string | null;
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
  /**
   * Phase 4 (PLAN mục 2.5): danh sách "Phụ trách phụ" - CHỈ có mặt trên
   * response của `GET /:id` (mirror `linkedCustomers`, BE chỉ gọi
   * `attachSecondaryAssignees()` ở `findOne()`), KHÔNG có trên `GET /`
   * (danh sách). KHÁC `linkedCustomers` ở chỗ KHÔNG ẩn theo quyền - luôn là
   * mảng (kể cả rỗng `[]`) khi Task đã tải xong, không có case `undefined`
   * do thiếu quyền (đây là thông tin phân công nội bộ, không phải Customer).
   */
  /** Có mặt trên CẢ `GET /:id` (đủ User) lẫn `GET /` (danh sách - chỉ `{id,name}`, do BE đính bằng 1 query gom nhóm). */
  secondaryAssignees?: RefUser[];
  /**
   * Phase 6 (PLAN mục 6): checklist con kiểu Trello - CHỈ có mặt trên response
   * của `GET /:id` (mirror `secondaryAssignees`, BE chỉ gọi
   * `attachChecklistItems()` ở `findOne()`), KHÔNG có trên `GET /` (danh
   * sách). KHÔNG ẩn theo quyền (giống `secondaryAssignees`) - luôn là mảng
   * (kể cả rỗng `[]`) khi Task đã tải xong.
   */
  /** @deprecated `GET /:id` KHÔNG còn đính field này - dùng `useTaskChecklistPage()` (phân trang 10 dòng/trang). */
  checklistItems?: PeriodicTaskChecklistItem[];
  /**
   * Phase 9 (tích hợp Task con vào chung Checklist) - CHỈ có mặt trên
   * response của `GET /:id` (mirror `checklistItems`, BE chỉ gọi
   * `attachLinkedChildrenChecklist()` ở `findOne()`), KHÔNG có trên `GET /`.
   *
   * ⚠️ HOÀN TOÀN TÁCH BIỆT khỏi `checklistItems` - đây KHÔNG phải checklist
   * item thật (không có `id`/`position` của bảng `periodic_task_checklist_items`),
   * mà là danh sách Task con TRỰC TIẾP (từ `periodic_task_links`) hiển thị
   * dưới dạng "dòng checklist ảo", tính LIVE mỗi lần tải Task cha. `isDone`
   * = `status.isDoneState` của CHÍNH Task con TẠI THỜI ĐIỂM tải - tự động
   * đổi theo khi Task con đổi trạng thái, KHÔNG có route sửa/xoá riêng nào
   * (FE KHÔNG được tự chế nút xoá/tick tay cho mục này - chỉ hiển thị).
   * Luôn là mảng (kể cả rỗng `[]`) khi Task đã tải xong - không có case
   * `undefined` do thiếu quyền, nhưng ĐÃ được lọc lại theo scope người xem
   * ngay ở BE (Task con ngoài phạm vi scope sẽ không xuất hiện ở đây dù đã
   * liên kết, xem JSDoc `PeriodicTaskLinksService.getChildrenChecklist()`).
   */
  /** @deprecated `GET /:id` KHÔNG còn đính field này - dùng `useLinkedChildrenChecklistPage()` (phân trang). */
  linkedChildrenChecklist?: LinkedChildChecklistEntry[];
  /**
   * Tiến độ Checklist (đã xong/tổng) - CHỈ có mặt trên response của `GET /`
   * (danh sách), do BE đính bằng 2 query gom nhóm để nhãn "X/Z" trên nút
   * Checklist hiện được ở MỌI view mà không cần `GET /:id` từng Task. CÙNG
   * cách đếm với `TaskChecklistModal`: checklist item thật + Task con liên
   * kết trực tiếp (Phase 9). `total = 0` nghĩa là chưa có mục nào. Dùng qua
   * `getChecklistProgress()` (`lib/utils/checklistProgress.ts`) thay vì đọc trực tiếp.
   */
  checklistProgress?: { done: number; total: number };
}

/**
 * LinkedChildChecklistEntry - khớp đúng response thật của
 * `PeriodicTaskLinksService.getChildrenChecklist()` (Phase 9). Xem JSDoc
 * đầy đủ ở field `linkedChildrenChecklist` trên `PeriodicTask` phía trên.
 */
export interface LinkedChildChecklistEntry {
  childTaskId: number;
  title: string;
  isDone: boolean;
  status: {
    id: number;
    code: string;
    name: string;
    color: string;
  };
  periodType: PeriodType;
  periodStartDate: string;
  periodEndDate: string;
}

/**
 * PeriodicTaskChecklistItem - khớp đúng response thật của
 * `PeriodicTaskChecklistItemsService` (`queryItems()` - `find()` KHÔNG kèm
 * relation `createdBy`, nên chỉ có `createdById` chứ không có object
 * `createdBy` đính kèm, khác `primaryAssignee`/`secondaryAssignees`).
 */
export interface PeriodicTaskChecklistItem {
  id: number;
  taskId: number;
  content: string;
  isDone: boolean;
  position: number;
  createdById: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Response phân trang của modal Checklist (`GET /:id/checklist-items` và
 * `GET /:id/linked-children-checklist`) - tối đa 10 dòng/trang. `total`/`done`
 * là của TOÀN BỘ danh sách (không chỉ trang này) để FE tính % + số trang.
 */
export interface PeriodicTaskChecklistPage<T> {
  data: T[];
  total: number;
  done: number;
  page: number;
  limit: number;
  totalPages: number;
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
  /** Khớp theo KHOẢNG (overlap). ⚠️ BE KHÔNG bao giờ tải toàn bộ: bỏ trống cả 2 => mặc định TUẦN NÀY, tối đa 93 ngày. */
  dateFrom?: string;
  dateTo?: string;
  statusId?: number;
  primaryAssigneeId?: number;
  /** Phụ trách = CHÍNH hoặc PHỤ (BE `assigneeId`) - dùng cho bộ lọc "Phụ trách" của trang. */
  assigneeId?: number;
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

  /** Xoá mềm - theo scope của `periodic_tasks.delete` (own = Task mình tạo/phụ trách chính). */
  remove: async (id: number): Promise<{ deleted: true }> => {
    const response = await axiosInstance.delete<{ deleted: true }>(`/periodic-tasks/${id}`);
    return response.data;
  },

  /** Phase 5 (PLAN mục 2.9) - Khoá, idempotent (gọi lại nhiều lần không lỗi).
   * `lockNote` optional - KHÔNG bắt buộc lý do khi khoá. */
  lock: async (id: number, lockNote?: string): Promise<PeriodicTask> => {
    const response = await axiosInstance.patch<PeriodicTask>(`/periodic-tasks/${id}/lock`, {
      lockNote: lockNote || undefined,
    });
    return response.data;
  },

  /** Mở khoá - tự do gọi lại bất kỳ lúc nào, không giới hạn số lần lock↔unlock. */
  unlock: async (id: number): Promise<PeriodicTask> => {
    const response = await axiosInstance.patch<PeriodicTask>(`/periodic-tasks/${id}/unlock`);
    return response.data;
  },
};