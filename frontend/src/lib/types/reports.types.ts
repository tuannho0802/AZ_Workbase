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