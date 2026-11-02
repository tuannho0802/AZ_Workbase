import type { ReportQuery } from './reports.types';
import type { LeaveStatsFilters } from './leave-stats.types';

/** Mirror `leave-export.model.ts` ở BE (PLAN_WITHDRAWAL_LEAVE_EXPORT) - Demo và file Excel cùng đọc 1 model. */
export type LeaveExportForm = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

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

export type LeaveExportChartType = 'barStacked' | 'doughnut' | 'line';

export interface LeaveExportChartSeries {
    /** Key cột (trong bảng `tableId`) chứa giá trị. */
    key: string;
    name: string;
    /** Hex 6 ký tự, không có `#`. */
    color: string;
    /** `null` = ô trống (không ép về 0). */
    values: Array<number | null>;
}

/** Mirror `ExportChartModel` ở BE: Demo vẽ đúng series/loại chart sẽ có trong file Excel. */
export interface LeaveExportChart {
    id: string;
    type: LeaveExportChartType;
    title: string;
    tableId: string;
    categoryKey: string;
    categories: string[];
    series: LeaveExportChartSeries[];
    /** Donut: màu từng lát (hex 6 ký tự). */
    pointColors?: string[];
}

export interface LeaveExportSheet {
    name: string;
    tables: LeaveExportTable[];
    charts: LeaveExportChart[];
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
