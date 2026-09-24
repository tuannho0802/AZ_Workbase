export interface AuditUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface AuditLog {
  id: number;
  userId: number;
  action: string;
  entityType: string;
  entityId: number;
  oldData: any | null;
  newData: any | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: AuditUser;
  targetCustomer?: {
    id: number;
    name: string;
    deletedAt?: string | null;
  };
}

export interface AuditSettings {
  enabled: boolean;
  retentionDays: number;
}

export interface AuditFilters {
  page?: number;
  limit?: number;
  /** Lọc CHÍNH XÁC theo người thực hiện (chọn từ dropdown User, không phải gõ tên). */
  userId?: number;
  action?: string;
  entityType?: string;
  excludeEntityType?: string;
  fromDate?: string;
  toDate?: string;
  /** Tìm theo TÊN KHÁCH HÀNG (đối tượng bị tác động) - tách riêng khỏi `userId`. */
  customerSearch?: string;
  /** Bật PHÂN TRANG THEO TUẦN (xem `week-window.util.ts` BE) - `page` trở
   * thành trang TUẦN, `limit` bị BE bỏ qua. Dùng cho `WeeklyCollapseSection`. */
  weeksPerPage?: number;
  /** PHA 2 (week-mode): chỉ lấy bản ghi của đúng 1 tuần ('YYYY-MM-DD' của Thứ 2). */
  weekStart?: string;
  weekPage?: number;
  weekLimit?: number;
}

export interface PaginatedAuditResponse {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  /** Chỉ có khi request kèm `weeksPerPage` (week-mode). */
  totalWeeks?: number;
  weeksPerPage?: number;
  /** PHA 1 (week-mode): tóm tắt các tuần của trang (không kèm bản ghi). */
  weeks?: { weekStart: string; count: number }[];
  /** PHA 2: tổng bản ghi của tuần đang fetch (`weekStart`). */
  weekTotal?: number;
  /** true nếu BE đã cắt bớt bản ghi của trang vì vượt `WEEK_MODE_MAX_ROWS`. */
  truncated?: boolean;
}