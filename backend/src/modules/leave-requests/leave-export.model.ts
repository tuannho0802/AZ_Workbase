import { LeaveStatus } from '../../database/entities/leave-request.entity';
import { toVnDateStr } from '../../common/utils/date-vn.util';
import type { LeaveStatsResponse } from './leave-requests-stats.service';
import { toYmd, trendBucketOf } from './leave-stats.util';

/**
 * [PLAN_WITHDRAWAL_LEAVE_EXPORT - L2] Model dùng chung cho Demo (preview) và file Excel xuất phép.
 * HÀM THUẦN: không đụng DB/exceljs - Preview và Excel cùng đọc `ExportModel` => xem gì xuất nấy.
 * Mọi con số lấy từ `LeaveStatsResponse` (cùng `getStats()` của tab Thống kê) nên khớp 100% UI;
 * form B (chi tiết từng đơn) nhận danh sách đơn đã được service lọc cùng kỳ/scope/bộ lọc.
 * Chart (form E/F) thuộc L5: `charts` luôn là [] ở đây.
 */

export type LeaveExportForm = 'A' | 'B' | 'C' | 'D' | 'F';

export const DETAIL_ROW_CAP = 5000;
export const PREVIEW_ROW_LIMIT = 20;
export const EMPTY_NOTICE = 'Không có dữ liệu trong kỳ đã chọn';

export type ExportCell = string | number | null;

export interface ExportColumn {
  key: string;
  header: string;
  type: 'text' | 'number' | 'date';
  /** Chiều rộng gợi ý (ký tự) cho Excel. */
  width?: number;
}

export interface ExportTable {
  id: string;
  title: string;
  columns: ExportColumn[];
  rows: ExportCell[][];
  /** Tổng số dòng THẬT (trước khi cắt preview/cap). */
  totalRows: number;
  truncated: boolean;
  /** Dòng tổng (cùng thứ tự cột); chỉ có khi bảng có dữ liệu. */
  totalsRow?: ExportCell[];
  /** Ghi chú hiển thị dưới bảng (vd: bị cắt do cap). */
  note?: string;
}

/** Chỗ giữ cho L5; cấu trúc chốt khi làm form E/F. */
export type ExportChartModel = Record<string, unknown>;

export interface ExportSheet {
  name: string;
  tables: ExportTable[];
  charts: ExportChartModel[];
}

export interface ExportModel {
  form: LeaveExportForm;
  title: string;
  period: { type: string; from: string; to: string };
  /** true khi kỳ không có đơn nào - file vẫn mở được và hiển thị `notice`. */
  isEmpty: boolean;
  notice?: string;
  sheets: ExportSheet[];
}

/** Một đơn nghỉ cho form B (service L3 nạp đủ approver/lý do từ chối/createdAt). */
export interface LeaveExportRequestRow {
  id: number;
  requesterId: number;
  requesterName: string;
  departmentName: string | null;
  leaveType: string;
  status: LeaveStatus | string;
  startDate: string | Date;
  endDate: string | Date;
  totalDays: number;
  isSupplementary: boolean;
  approverName: string | null;
  rejectionReason: string | null;
  createdAt: string | Date;
}

export interface BuildLeaveExportInput {
  form: LeaveExportForm;
  stats: LeaveStatsResponse;
  /** Chỉ cần cho form B. */
  requests?: LeaveExportRequestRow[];
  /** code -> tên hiển thị (bảng `leave_types`); thiếu thì dùng chính code. */
  leaveTypeNames?: Record<string, string>;
  /** Giới hạn dòng form B (mặc định `DETAIL_ROW_CAP`). */
  detailRowCap?: number;
}

const STATUS_LABEL: Record<string, string> = {
  [LeaveStatus.PENDING]: 'Chờ duyệt',
  [LeaveStatus.APPROVED]: 'Đã duyệt',
  [LeaveStatus.REJECTED]: 'Từ chối',
  [LeaveStatus.CANCELLED]: 'Đã huỷ',
};

const FORM_TITLE: Record<LeaveExportForm, string> = {
  A: 'Tổng hợp theo nhân viên',
  B: 'Chi tiết từng đơn',
  C: 'Theo phòng ban & loại phép',
  D: 'Ma trận Nhân viên × Thời gian',
  F: 'Gói đầy đủ (A-D)',
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const sum = (xs: number[]) => round1(xs.reduce((a, b) => a + b, 0));

/**
 * Chống formula injection: ô TEXT bắt đầu bằng = + - @ (hoặc tab/CR) bị Excel hiểu là công thức
 * => thêm dấu nháy đơn đứng đầu để biến thành chuỗi thường. Chỉ áp cho text người dùng nhập/tên.
 */
export function guardFormula(v: string | null | undefined): string {
  if (v == null) return '';
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

/** Tên sheet Excel: ≤31 ký tự, bỏ ký tự cấm `\ / ? * [ ] :`, không để trống. */
export function safeSheetName(name: string, used: Set<string> = new Set()): string {
  const base = (name.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim() || 'Sheet').slice(0, 31);
  let out = base;
  let i = 2;
  while (used.has(out.toLowerCase())) {
    const suffix = ` (${i++})`;
    out = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(out.toLowerCase());
  return out;
}

function table(
  id: string,
  title: string,
  columns: ExportColumn[],
  rows: ExportCell[][],
  extra: Partial<Pick<ExportTable, 'totalsRow' | 'note' | 'truncated' | 'totalRows'>> = {},
): ExportTable {
  return {
    id,
    title,
    columns,
    rows,
    totalRows: extra.totalRows ?? rows.length,
    truncated: extra.truncated ?? false,
    ...(rows.length > 0 && extra.totalsRow ? { totalsRow: extra.totalsRow } : {}),
    ...(extra.note ? { note: extra.note } : {}),
  };
}

// ───────── Form A: tổng hợp theo nhân viên ─────────
function buildFormA(stats: LeaveStatsResponse): ExportTable {
  const cols: ExportColumn[] = [
    { key: 'name', header: 'Nhân viên', type: 'text', width: 26 },
    { key: 'dept', header: 'Phòng ban', type: 'text', width: 22 },
    { key: 'requests', header: 'Số đơn', type: 'number', width: 10 },
    { key: 'approved', header: 'Đã duyệt', type: 'number', width: 11 },
    { key: 'rejected', header: 'Từ chối', type: 'number', width: 10 },
    { key: 'pending', header: 'Chờ duyệt', type: 'number', width: 11 },
    { key: 'supp', header: 'Bổ sung', type: 'number', width: 10 },
    { key: 'reqDays', header: 'Tổng ngày xin', type: 'number', width: 14 },
    { key: 'appDays', header: 'Ngày đã duyệt', type: 'number', width: 15 },
    { key: 'rate', header: 'Tỷ lệ duyệt (%)', type: 'number', width: 16 },
  ];
  const emps = stats.byEmployee;
  const rows: ExportCell[][] = emps.map((e) => [
    guardFormula(e.userName),
    guardFormula(e.departmentName ?? 'Chưa có phòng ban'),
    e.requests,
    e.approved,
    e.rejected,
    e.pending,
    e.supplementary,
    e.requestedDays,
    e.approvedDays,
    e.approvalRate, // null = chưa có đơn nào được xử lý (KHÔNG ép về 0)
  ]);
  const s = stats.summary;
  const totalsRow: ExportCell[] = [
    'Tổng',
    '',
    sum(emps.map((e) => e.requests)),
    sum(emps.map((e) => e.approved)),
    sum(emps.map((e) => e.rejected)),
    sum(emps.map((e) => e.pending)),
    sum(emps.map((e) => e.supplementary)),
    sum(emps.map((e) => e.requestedDays)),
    sum(emps.map((e) => e.approvedDays)),
    s.approvalRate,
  ];
  return table('byEmployee', FORM_TITLE.A, cols, rows, { totalsRow });
}

// ───────── Form B: chi tiết từng đơn ─────────
function buildFormB(
  requests: LeaveExportRequestRow[],
  leaveTypeNames: Record<string, string>,
  cap: number,
): ExportTable {
  const cols: ExportColumn[] = [
    { key: 'id', header: 'Mã đơn', type: 'number', width: 9 },
    { key: 'name', header: 'Nhân viên', type: 'text', width: 26 },
    { key: 'dept', header: 'Phòng ban', type: 'text', width: 22 },
    { key: 'type', header: 'Loại phép', type: 'text', width: 18 },
    { key: 'from', header: 'Từ ngày', type: 'date', width: 12 },
    { key: 'to', header: 'Đến ngày', type: 'date', width: 12 },
    { key: 'days', header: 'Số ngày', type: 'number', width: 10 },
    { key: 'status', header: 'Trạng thái', type: 'text', width: 12 },
    { key: 'approver', header: 'Người duyệt', type: 'text', width: 24 },
    { key: 'reject', header: 'Lý do từ chối', type: 'text', width: 34 },
    { key: 'supp', header: 'Bổ sung?', type: 'text', width: 10 },
    { key: 'created', header: 'Ngày tạo', type: 'date', width: 12 },
  ];
  // Cùng thứ tự với `getRequests()`: ngày bắt đầu mới nhất trước, rồi id giảm dần.
  const sorted = [...requests].sort(
    (a, b) => toYmd(b.startDate).localeCompare(toYmd(a.startDate)) || b.id - a.id,
  );
  const total = sorted.length;
  const truncated = total > cap;
  const kept = truncated ? sorted.slice(0, cap) : sorted;
  const rows: ExportCell[][] = kept.map((r) => [
    r.id,
    guardFormula(r.requesterName),
    guardFormula(r.departmentName ?? 'Chưa có phòng ban'),
    guardFormula(leaveTypeNames[r.leaveType] ?? r.leaveType),
    toYmd(r.startDate),
    toYmd(r.endDate),
    Number(r.totalDays) || 0,
    STATUS_LABEL[r.status] ?? String(r.status),
    guardFormula(r.approverName),
    guardFormula(r.rejectionReason),
    r.isSupplementary ? 'Có' : 'Không',
    toVnDateStr(r.createdAt),
  ]);
  const totalsRow: ExportCell[] = [
    'Tổng',
    '',
    '',
    '',
    '',
    '',
    sum(kept.map((r) => Number(r.totalDays) || 0)),
    '',
    '',
    '',
    '',
    '',
  ];
  return table('requests', FORM_TITLE.B, cols, rows, {
    totalsRow,
    totalRows: total,
    truncated,
    note: truncated
      ? `Chỉ hiển thị ${cap} đơn mới nhất trên tổng ${total} đơn. Hãy thu hẹp kỳ hoặc bộ lọc để xem đủ.`
      : undefined,
  });
}

// ───────── Form C: phòng ban + loại phép (2 sheet) ─────────
function buildFormCSheets(
  stats: LeaveStatsResponse,
  leaveTypeNames: Record<string, string>,
  used: Set<string>,
): ExportSheet[] {
  const deptCols: ExportColumn[] = [
    { key: 'dept', header: 'Phòng ban', type: 'text', width: 26 },
    { key: 'headcount', header: 'Quân số', type: 'number', width: 10 },
    { key: 'requests', header: 'Số đơn', type: 'number', width: 10 },
    { key: 'employees', header: 'Số người xin nghỉ', type: 'number', width: 18 },
    { key: 'reqDays', header: 'Tổng ngày xin', type: 'number', width: 14 },
    { key: 'appDays', header: 'Ngày đã duyệt', type: 'number', width: 15 },
    { key: 'part', header: 'Tỷ lệ tham gia (%)', type: 'number', width: 18 },
    { key: 'avg', header: 'Ngày duyệt TB/người', type: 'number', width: 20 },
  ];
  const depts = stats.byDepartment;
  const deptRows: ExportCell[][] = depts.map((d) => [
    guardFormula(d.departmentName),
    d.headcount,
    d.requests,
    d.employees,
    d.requestedDays,
    d.approvedDays,
    d.participationRate,
    d.avgApprovedDaysPerHead,
  ]);
  const deptTotals: ExportCell[] = [
    'Tổng',
    sum(depts.map((d) => d.headcount)),
    sum(depts.map((d) => d.requests)),
    stats.summary.employees, // số NGƯỜI khác nhau, không cộng dồn theo phòng
    sum(depts.map((d) => d.requestedDays)),
    sum(depts.map((d) => d.approvedDays)),
    stats.summary.participationRate,
    stats.summary.avgApprovedDaysPerHead,
  ];

  const typeCols: ExportColumn[] = [
    { key: 'type', header: 'Loại phép', type: 'text', width: 24 },
    { key: 'requests', header: 'Số đơn', type: 'number', width: 10 },
    { key: 'employees', header: 'Số người', type: 'number', width: 11 },
    { key: 'reqDays', header: 'Tổng ngày xin', type: 'number', width: 14 },
    { key: 'appDays', header: 'Ngày đã duyệt', type: 'number', width: 15 },
  ];
  const types = stats.byType;
  const typeRows: ExportCell[][] = types.map((t) => [
    guardFormula(leaveTypeNames[t.code] ?? t.code),
    t.requests,
    t.employees,
    t.requestedDays,
    t.approvedDays,
  ]);
  const typeTotals: ExportCell[] = [
    'Tổng',
    sum(types.map((t) => t.requests)),
    stats.summary.employees,
    sum(types.map((t) => t.requestedDays)),
    sum(types.map((t) => t.approvedDays)),
  ];

  return [
    {
      name: safeSheetName('Phòng ban', used),
      tables: [table('byDepartment', 'Theo phòng ban', deptCols, deptRows, { totalsRow: deptTotals })],
      charts: [],
    },
    {
      name: safeSheetName('Loại phép', used),
      tables: [table('byType', 'Theo loại phép', typeCols, typeRows, { totalsRow: typeTotals })],
      charts: [],
    },
  ];
}

// ───────── Form D: ma trận Nhân viên × Tháng/Ngày ─────────
/** Nhãn cột: 'YYYY-MM' -> 'MM/YYYY'; 'YYYY-MM-DD' -> 'DD/MM'. */
export function bucketLabel(bucket: string): string {
  if (bucket.length === 7) return `${bucket.slice(5, 7)}/${bucket.slice(0, 4)}`;
  return `${bucket.slice(8, 10)}/${bucket.slice(5, 7)}`;
}

function buildFormD(stats: LeaveStatsResponse, requests: LeaveExportRequestRow[]): ExportTable {
  const buckets = stats.trend.map((t) => t.bucket);
  const { from, to, granularity } = stats.period;
  const rangeFrom = from.slice(0, 10);
  const rangeTo = to.slice(0, 10);
  const idx = new Map(buckets.map((b, i) => [b, i]));

  // Gom theo (nhân viên, bucket) bằng ĐÚNG `trendBucketOf` của biểu đồ xu hướng => tổng cột khớp `trend`.
  const perEmp = new Map<number, { name: string; dept: string; counts: number[] }>();
  for (const r of requests) {
    let e = perEmp.get(r.requesterId);
    if (!e) {
      e = {
        name: r.requesterName,
        dept: r.departmentName ?? 'Chưa có phòng ban',
        counts: new Array(buckets.length).fill(0),
      };
      perEmp.set(r.requesterId, e);
    }
    const i = idx.get(trendBucketOf(toYmd(r.startDate), rangeFrom, rangeTo, granularity));
    if (i !== undefined) e.counts[i]++;
  }

  const cols: ExportColumn[] = [
    { key: 'name', header: 'Nhân viên', type: 'text', width: 26 },
    { key: 'dept', header: 'Phòng ban', type: 'text', width: 22 },
    ...buckets.map((b) => ({ key: `b:${b}`, header: bucketLabel(b), type: 'number' as const, width: 9 })),
    { key: 'total', header: 'Tổng', type: 'number', width: 9 },
  ];
  const emps = [...perEmp.values()].sort(
    (a, b) => sum(b.counts) - sum(a.counts) || a.name.localeCompare(b.name),
  );
  const rows: ExportCell[][] = emps.map((e) => [
    guardFormula(e.name),
    guardFormula(e.dept),
    ...e.counts,
    sum(e.counts),
  ]);
  const colTotals = buckets.map((_, i) => sum(emps.map((e) => e.counts[i])));
  const totalsRow: ExportCell[] = ['Tổng', '', ...colTotals, sum(colTotals)];
  return table('matrix', FORM_TITLE.D, cols, rows, { totalsRow });
}

// ───────── Entry point ─────────
export function buildLeaveExportModel(input: BuildLeaveExportInput): ExportModel {
  const { form, stats } = input;
  const names = input.leaveTypeNames ?? {};
  const cap = input.detailRowCap ?? DETAIL_ROW_CAP;
  const requests = input.requests ?? [];
  const used = new Set<string>();
  const isEmpty = stats.summary.requests === 0;

  const sheetsOf = (f: Exclude<LeaveExportForm, 'F'>): ExportSheet[] => {
    switch (f) {
      case 'A':
        return [{ name: safeSheetName('Theo nhân viên', used), tables: [buildFormA(stats)], charts: [] }];
      case 'B':
        return [{ name: safeSheetName('Chi tiết đơn', used), tables: [buildFormB(requests, names, cap)], charts: [] }];
      case 'C':
        return buildFormCSheets(stats, names, used);
      case 'D':
        return [{ name: safeSheetName('Ma trận', used), tables: [buildFormD(stats, requests)], charts: [] }];
    }
  };
  let sheets: ExportSheet[];
  if (form === 'F') {
    // Gói đầy đủ: A + B + C + D (chart của E thêm ở L5). Dùng chung `used` để tên sheet không trùng.
    sheets = (['A', 'B', 'C', 'D'] as const).flatMap(sheetsOf);
  } else if (['A', 'B', 'C', 'D'].includes(form)) {
    sheets = sheetsOf(form);
  } else {
    throw new Error(`Unsupported leave export form: ${String(form)}`);
  }

  return {
    form,
    title: FORM_TITLE[form],
    period: { type: stats.period.type, from: stats.period.from.slice(0, 10), to: stats.period.to.slice(0, 10) },
    isEmpty,
    ...(isEmpty ? { notice: EMPTY_NOTICE } : {}),
    sheets,
  };
}

/**
 * Cắt gọn cho Demo: mỗi bảng ≤ `limit` dòng, giữ `totalRows` thật + cờ `truncated`.
 * Không đổi model gốc (Excel luôn dùng model đầy đủ).
 */
export function toPreviewModel(model: ExportModel, limit = PREVIEW_ROW_LIMIT): ExportModel {
  return {
    ...model,
    sheets: model.sheets.map((s) => ({
      ...s,
      tables: s.tables.map((t) =>
        t.rows.length > limit ? { ...t, rows: t.rows.slice(0, limit), truncated: true } : t,
      ),
    })),
  };
}
