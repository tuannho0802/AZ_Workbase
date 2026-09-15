export type ReportPeriodType = 'week' | 'month' | 'quarter' | 'year' | 'custom';

export interface ReportQuery {
    period: ReportPeriodType;
    /** YYYY-MM-DD - bỏ qua khi period=custom */
    anchor?: string;
    /** Bắt buộc khi period=custom */
    customFrom?: string;
    /** Bắt buộc khi period=custom */
    customTo?: string;
}

export interface ReportPeriodInfo {
    type: ReportPeriodType;
    /** 'YYYY-MM-DD HH:mm:ss' - giờ VN, khoảng lịch TRỌN VẸN đã tính ở BE */
    from: string;
    to: string;
}

// ── Doanh thu (Tiền) ──────────────────────────────────────────────────────

export interface RevenuePersonalRow {
    userId: number;
    userName: string;
    amount: number;
}

export interface RevenueDepartmentRow {
    departmentId: number;
    departmentName: string;
    amount: number;
}

export interface RevenueReport {
    period: ReportPeriodInfo;
    personal: RevenuePersonalRow[];
    /** null nếu role không có quyền xem mục Phòng ban (Employee) */
    department: RevenueDepartmentRow[] | null;
    /** null nếu role không có quyền xem Tổng tất cả (chỉ Admin/Assistant mới có) */
    total: number | null;
}

// ── Doanh số khách ────────────────────────────────────────────────────────

export interface CustomerBreakdownCounts {
    totalCustomers: number;
    closedCustomers: number;
    joinedGroupCustomers: number;
}

export interface CustomerPersonalRow extends CustomerBreakdownCounts {
    userId: number;
    userName: string;
}

export interface CustomerDepartmentRow extends CustomerBreakdownCounts {
    departmentId: number;
    departmentName: string;
}

export interface CustomerReport {
    period: ReportPeriodInfo;
    personal: CustomerPersonalRow[];
    department: CustomerDepartmentRow[] | null;
    total: CustomerBreakdownCounts | null;
}

// ── Chất lượng data (theo Status) ────────────────────────────────────────

/** Metadata 1 trạng thái khách hàng (lấy động từ `customer_statuses`, xem
 * `customer-statuses.api.ts` - đây là bản RÚT GỌN chỉ đủ để vẽ chart/bảng,
 * không cần isSystem/inUseCount như trang "Quản lý status"). */
export interface QualityStatusMeta {
    code: string;
    name: string;
    color: string;
}

export interface QualityPersonalRow {
    userId: number;
    userName: string;
    total: number;
    /** Luôn đủ mặt mọi `statuses[].code` (kể cả = 0) - xem BE `zeroByStatus()`. */
    byStatus: Record<string, number>;
}

export interface QualityDepartmentRow {
    departmentId: number;
    departmentName: string;
    total: number;
    byStatus: Record<string, number>;
}

export interface QualityReport {
    period: ReportPeriodInfo;
    /** Danh sách status hiện có, đã sắp theo `sortOrder` - dùng để build cột
     * bảng/series chart động, KHÔNG hardcode tên status ở FE. */
    statuses: QualityStatusMeta[];
    personal: QualityPersonalRow[];
    department: QualityDepartmentRow[] | null;
    total: { total: number; byStatus: Record<string, number> } | null;
}