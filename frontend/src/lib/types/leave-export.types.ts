import type { ReportQuery } from './reports.types';
import type { LeaveStatsFilters } from './leave-stats.types';

/** Mirror `leave-export.model.ts` ở BE (PLAN_WITHDRAWAL_LEAVE_EXPORT) - Demo và file Excel cùng đọc 1 model. */
export type LeaveExportForm = 'A' | 'B' | 'C' | 'D' | 'F';

export type LeaveExportCell = string | number | null;

export interface LeaveExportColumn {
    key: string;
    header: string;
    type: 'text' | 'number' | 'date';
    width?: number;
}

export interface LeaveExportTable {
    id: string;
    title: string;
    columns: LeaveExportColumn[];
    rows: LeaveExportCell[][];
    /** Tổng số dòng THẬT (preview chỉ trả ≤20 dòng). */
    totalRows: number;
    truncated: boolean;
    totalsRow?: LeaveExportCell[];
    note?: string;
}

export interface LeaveExportSheet {
    name: string;
    tables: LeaveExportTable[];
    /** Chart thuộc phase L5 - hiện luôn rỗng. */
    charts: Record<string, unknown>[];
}

export interface LeaveExportModel {
    form: LeaveExportForm;
    title: string;
    period: { type: string; from: string; to: string };
    isEmpty: boolean;
    notice?: string;
    sheets: LeaveExportSheet[];
}

/** Body gửi BE: kỳ + bộ lọc của tab Thống kê + form muốn xuất. */
export type LeaveExportRequest = ReportQuery & LeaveStatsFilters & { form: LeaveExportForm };
