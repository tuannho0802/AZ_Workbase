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
    /** Phòng ban CỦA NHÂN VIÊN (tên + màu cấu hình ở /phong-ban) - để vẽ Tag. */
    departmentName?: string | null;
    departmentColor?: string | null;
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
    /** Phòng ban CỦA NHÂN VIÊN (tên + màu cấu hình ở /phong-ban) - để vẽ Tag. */
    departmentName?: string | null;
    departmentColor?: string | null;
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
    /** Phòng ban CỦA NHÂN VIÊN (tên + màu cấu hình ở /phong-ban) - để vẽ Tag. */
    departmentName?: string | null;
    departmentColor?: string | null;
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

// ── Báo cáo Marketing (đa chiều: Marketing phụ trách + Người tạo data) ─────
// Khớp `ReportsMarketingService.getMarketingReport()` ở BE.

/** Bộ lọc riêng của tab Marketing. `0` ở marketingUserId/createdById = "chưa gán" (IS NULL). */
export interface MarketingReportFilters {
    marketingUserId?: number;
    createdById?: number;
    source?: string;
}

export interface MarketingMetrics {
    /** Data MỚI đổ về trong kỳ (theo ngày tạo). */
    totalCustomers: number;
    /** status='closed' và ngày chốt trong kỳ. */
    closedCustomers: number;
    /** Khách có ≥1 lượt join nhóm trong kỳ. */
    joinedGroupCustomers: number;
    /** Số khách có ≥1 khoản nạp trong kỳ (theo ngày nạp) - bất kể khách tạo lúc nào. */
    depositedCustomers: number;
    /** Tổng tiền nạp trong kỳ (USD). */
    revenue: number;
    /** Trong số data MỚI của kỳ, số khách đã từng nạp. Luôn ≤ totalCustomers. */
    cohortDepositedCustomers: number;
}

export interface MarketingUserRow extends MarketingMetrics {
    /** 0 = chưa gán. */
    userId: number;
    userName: string;
    /** Phòng ban CỦA NHÂN VIÊN. */
    departmentId: number | null;
    departmentName: string | null;
    departmentColor?: string | null;
    /** Data mới theo status hiện tại - đủ mặt mọi `statuses[].code` (kể cả 0). */
    byStatus: Record<string, number>;
}

export interface MarketingSourceRow extends MarketingMetrics {
    source: string;
}

export interface MarketingTrendPoint {
    /** 'YYYY-MM-DD' (granularity=day) hoặc 'YYYY-MM' (granularity=month). */
    date: string;
    newCustomers: number;
    closedCustomers: number;
    revenue: number;
    depositedCustomers: number;
}

export interface MarketingUserOption {
    id: number;
    name: string;
    departmentName: string | null;
    departmentColor?: string | null;
}

export interface MarketingReport {
    period: ReportPeriodInfo & { granularity: 'day' | 'month'; spanDays: number };
    previousPeriod: { from: string; to: string };
    appliedFilters: MarketingReportFilters;
    /** true = người xem chỉ thấy số của chính mình (scope='own'). */
    ownOnly: boolean;
    options: {
        marketers: MarketingUserOption[];
        creators: MarketingUserOption[];
        sources: string[];
    };
    statuses: QualityStatusMeta[];
    summary: {
        current: MarketingMetrics;
        previous: MarketingMetrics;
        unassignedMarketingCustomers: number;
        totalByStatus: Record<string, number>;
    };
    attribution: {
        noMarketing: number;
        sameCreatorAndMarketing: number;
        differentCreatorAndMarketing: number;
    };
    marketing: MarketingUserRow[];
    creators: MarketingUserRow[];
    bySource: MarketingSourceRow[];
    trend: MarketingTrendPoint[];
}

// ── Danh sách khách drill-down (Mini Table mở từ thẻ/số của báo cáo) ──────
// Khớp `ReportsCustomerListService.getList()` ở BE.

export type ReportCustomerListMetric =
    | 'total'
    | 'closed'
    | 'joined'
    | 'deposited'
    | 'cohort_deposited'
    | 'unassigned_marketing';

export type ReportCustomerListQuick = 'no_marketing' | 'no_sales' | 'no_phone';

/** Bộ lọc gắn cứng theo ngữ cảnh bấm (vd bấm số của 1 nhân viên) + bộ lọc người dùng chọn trong modal. */
export interface ReportCustomerListFilters {
    /** 0 = chưa gán. */
    marketingUserId?: number;
    createdById?: number;
    salesUserId?: number;
    source?: string;
    status?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    quick?: ReportCustomerListQuick;
}

export interface ReportCustomerListQuery extends ReportQuery, ReportCustomerListFilters {
    metric: ReportCustomerListMetric;
    context?: 'customers' | 'marketing';
    page?: number;
    limit?: number;
}

export interface ReportListUser {
    id: number;
    name: string;
    departmentName: string | null;
    departmentColor?: string | null;
}

export interface ReportCustomerListRow {
    id: number;
    name: string;
    phone: string | null;
    email: string | null;
    source: string | null;
    status: string | null;
    inputDate: string | null;
    createdAt: string;
    closedDate: string | null;
    salesUser: ReportListUser | null;
    marketingUser: ReportListUser | null;
    createdBy: ReportListUser | null;
    /** Chỉ có khi metric='deposited' - tổng tiền nạp TRONG KỲ. */
    depositAmount?: number;
    /** Chỉ có khi metric='joined' - nhóm đã join TRONG KỲ. */
    joinedGroups?: string[];
}

export interface ReportCustomerList {
    metric: ReportCustomerListMetric;
    period: ReportPeriodInfo;
    data: ReportCustomerListRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
