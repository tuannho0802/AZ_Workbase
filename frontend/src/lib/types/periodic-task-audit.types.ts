/**
 * PeriodicTaskAuditLog - Phase 7 FE (PLAN_PERIODIC_TASKS_MODULE.md mục 2.6 +
 * mục 6 Phase 7). Khớp đúng response thật của `PeriodicTaskAuditService.
 * getLogsForTask()` (BE): `leftJoinAndSelect('log.user', 'user')` - `user`
 * LUÔN có mặt (không phải optional như `createdBy` ở `PeriodicTaskChecklistItem`,
 * vì Service BE join tường minh, không phải `find()` trần). `password` không
 * bao giờ lộ ra (cột `User.password` có `select: false` ở BE - xem
 * `user.entity.ts`), nên không khai báo field đó ở đây.
 */
export interface PeriodicTaskAuditLogUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface PeriodicTaskAuditLog {
  id: number;
  taskId: number;
  userId: number;
  user: PeriodicTaskAuditLogUser;
  action: string;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface PaginatedPeriodicTaskAuditLogs {
  data: PeriodicTaskAuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * PeriodicTaskAuditLogGlobal - trang riêng "Lịch sử Công việc định kỳ"
 * (`GET /periodic-tasks/audit-logs`, khác `GET /:id/audit-logs` ở trên) -
 * thêm field `task` (join sang `periodic_tasks`, chỉ chọn `id`/`title`/
 * `deletedAt` ở BE - xem `getGlobalLogs()`) vì trang này gộp log của NHIỀU
 * Task, cần biết log thuộc Task nào để hiển thị cột "Công việc".
 */
export interface PeriodicTaskAuditLogTaskRef {
  id: number;
  title: string;
  deletedAt: string | null;
}

export interface PeriodicTaskAuditLogGlobal extends PeriodicTaskAuditLog {
  task: PeriodicTaskAuditLogTaskRef;
}

export interface PaginatedPeriodicTaskAuditLogsGlobal {
  data: PeriodicTaskAuditLogGlobal[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  /** Chỉ có khi request kèm `weeksPerPage` (week-mode - xem `week-window.util.ts` BE). */
  totalWeeks?: number;
  weeksPerPage?: number;
  /** PHA 1 (week-mode): tóm tắt các tuần của trang (không kèm bản ghi). */
  weeks?: { weekStart: string; count: number }[];
  /** PHA 2: tổng bản ghi của tuần đang fetch (`weekStart`). */
  weekTotal?: number;
  /** true nếu BE đã cắt bớt bản ghi của trang vì vượt `WEEK_MODE_MAX_ROWS`. */
  truncated?: boolean;
}

/** Filter cho `GET /periodic-tasks/audit-logs` - khớp `GetPeriodicTaskAuditLogsGlobalDto` (BE). */
export interface PeriodicTaskAuditLogFilters {
  page?: number;
  limit?: number;
  taskId?: number;
  userId?: number;
  action?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
  /** Bật PHÂN TRANG THEO TUẦN - `page` trở thành trang TUẦN, `limit` bị BE bỏ qua. */
  weeksPerPage?: number;
  /** PHA 2 (week-mode): chỉ lấy bản ghi của đúng 1 tuần ('YYYY-MM-DD' của Thứ 2). */
  weekStart?: string;
  weekPage?: number;
  weekLimit?: number;
}

/**
 * Mirror ĐÚNG `PeriodicTaskAuditAction` (const object, không phải TypeScript
 * `enum`) ở BE `periodic-task-audit.service.ts` - liệt kê lại giá trị string
 * thay vì import chéo BE→FE (2 project tách biệt, không dùng chung package).
 * Đổi giá trị ở BE thì PHẢI sửa cả map này (không có gì tự đồng bộ).
 */
export const PERIODIC_TASK_AUDIT_ACTION_META: Record<string, { label: string; color: string }> = {
  created: { label: 'Tạo mới', color: 'green' },
  updated: { label: 'Cập nhật', color: 'blue' },
  status_changed: { label: 'Đổi trạng thái', color: 'blue' },
  primary_assignee_changed: { label: 'Đổi Phụ trách chính', color: 'blue' },
  secondary_assignee_added: { label: 'Thêm Phụ trách phụ', color: 'cyan' },
  secondary_assignee_removed: { label: 'Gỡ Phụ trách phụ', color: 'orange' },
  parent_linked: { label: 'Liên kết Task cha', color: 'purple' },
  parent_unlinked: { label: 'Huỷ liên kết Task cha', color: 'orange' },
  customer_linked: { label: 'Gắn Khách hàng', color: 'purple' },
  customer_unlinked: { label: 'Gỡ Khách hàng', color: 'orange' },
  locked: { label: 'Khoá', color: 'volcano' },
  unlocked: { label: 'Mở khoá', color: 'gold' },
  deleted: { label: 'Xoá', color: 'red' },
  restored: { label: 'Khôi phục', color: 'green' },
  checklist_item_added: { label: 'Thêm Checklist item', color: 'cyan' },
  checklist_item_updated: { label: 'Sửa Checklist item', color: 'blue' },
  checklist_item_removed: { label: 'Xoá Checklist item', color: 'orange' },
  checklist_items_reordered: { label: 'Sắp xếp lại Checklist', color: 'default' },
};