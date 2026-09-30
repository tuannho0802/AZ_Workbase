import type { ReportPeriodType } from './reports.types';

/** Khớp `LeaveRequestsStatsService.getStats()` ở BE (`GET /leave-requests/stats`). Định nghĩa số liệu: `leave-stats.util.ts` (BE). */

export interface LeaveStatsFilters {
    departmentId?: number;
    leaveType?: string;
    /** Chỉ xem 1 nhân viên. */
    requesterId?: number;
}

export interface LeaveStatsSummary {
    requests: number;
    requestedDays: number;
    approvedDays: number;
    pending: number;
    approved: number;
    rejected: number;
    /** Số nhân sự khác nhau có xin nghỉ. */
    employees: number;
    /** % (0-100). null = chưa có quân số. */
    participationRate: number | null;
    avgApprovedDaysPerHead: number | null;
    /** % duyệt trên đơn đã có kết quả. null = chưa có đơn nào được xử lý. */
    approvalRate: number | null;
    rejectionRate: number | null;
    supplementary: number;
    supplementaryRate: number | null;
}

export interface LeaveTypeStat {
    code: string;
    requests: number;
    requestedDays: number;
    approvedDays: number;
    employees: number;
}

export interface LeaveDepartmentStat {
    departmentId: number | null;
    departmentName: string;
    headcount: number;
    requests: number;
    requestedDays: number;
    approvedDays: number;
    employees: number;
    participationRate: number | null;
    avgApprovedDaysPerHead: number | null;
}

export interface LeaveEmployeeStat {
    userId: number;
    userName: string;
    departmentName: string | null;
    requests: number;
    requestedDays: number;
    approvedDays: number;
    pending: number;
    approved: number;
    rejected: number;
    supplementary: number;
    approvalRate: number | null;
}

export interface LeaveTrendPoint {
    /** 'YYYY-MM-DD' (day) hoặc 'YYYY-MM' (month). */
    bucket: string;
    requests: number;
    approvedDays: number;
    pending: number;
    approved: number;
    rejected: number;
}

export interface LeaveWeekdayPoint {
    /** 1 = Thứ Hai ... 7 = Chủ Nhật. */
    weekday: number;
    requests: number;
}

export interface LeaveFrequencyBucket {
    key: string;
    label: string;
    employees: number;
}

export interface LeaveStatsResponse {
    period: { type: ReportPeriodType; from: string; to: string; granularity: 'day' | 'month'; spanDays: number };
    previousPeriod: { from: string; to: string };
    headcount: number;
    summary: LeaveStatsSummary;
    previousSummary: LeaveStatsSummary;
    byType: LeaveTypeStat[];
    byDepartment: LeaveDepartmentStat[];
    byEmployee: LeaveEmployeeStat[];
    trend: LeaveTrendPoint[];
    byWeekday: LeaveWeekdayPoint[];
    frequency: LeaveFrequencyBucket[];
}

// ── Mini Table đơn nghỉ (drill-down từ Card/Chart) - khớp `GET /leave-requests/stats/requests` ──

export type LeaveDrillStatus = 'pending' | 'approved' | 'rejected';
export type LeaveDrillQuick = 'supplementary';

/** Bộ lọc gắn cứng theo chỗ được bấm (người dùng KHÔNG đổi được trong modal). */
export interface LeaveDrillPreset {
    status?: LeaveDrillStatus;
    quick?: LeaveDrillQuick;
    /** 1 hoặc N nhân viên. */
    requesterIds?: number[];
    /** 1 = Thứ Hai ... 7 = Chủ Nhật (ngày bắt đầu nghỉ). */
    weekday?: number;
    /** Bucket biểu đồ xu hướng: 'YYYY-MM-DD' | 'YYYY-MM'. */
    bucket?: string;
    leaveType?: string;
    departmentId?: number;
}

/** Yêu cầu mở modal - do tab Thống kê tạo khi bấm Card/cột Chart. */
export interface LeaveDrill {
    title: string;
    /** Nhãn phụ sau tiêu đề (vd tên nhân viên, tên phòng ban). */
    label?: string;
    preset?: LeaveDrillPreset;
}

export interface LeaveStatsRequestsQuery extends LeaveStatsFilters {
    page?: number;
    limit?: number;
    status?: LeaveDrillStatus;
    quick?: LeaveDrillQuick;
    /** "1,2,3" */
    requesterIds?: string;
    weekday?: number;
    bucket?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
}

export interface LeaveStatsRequestRow {
    id: number;
    leaveType: string;
    startDate: string;
    endDate: string;
    duration: 'full_day' | 'half_day_am' | 'half_day_pm';
    totalDays: number | string;
    periodStartTime: string | null;
    periodEndTime: string | null;
    reason: string;
    isSupplementary: boolean;
    status: 'pending' | 'approved' | 'rejected' | 'cancelled';
    rejectionReason: string | null;
    requester: { id: number; name: string; department?: { id: number; name: string; color?: string } | null };
    approver: { id: number; name: string } | null;
    attachmentCount?: number;
}

export interface LeaveStatsRequestsResponse {
    data: LeaveStatsRequestRow[];
    total: number;
    /** Tổng số ngày của toàn bộ đơn khớp (không riêng trang này). */
    totalDays: number;
    page: number;
    limit: number;
    totalPages: number;
    period: { type: ReportPeriodType; from: string; to: string; granularity: 'day' | 'month' };
}
