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
