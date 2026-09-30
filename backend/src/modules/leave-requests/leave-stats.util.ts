import { LeaveStatus } from '../../database/entities/leave-request.entity';

/**
 * Tổng hợp THUẦN (không đụng DB) cho tab "Thống kê" của trang Duyệt phép.
 * Tách riêng khỏi service để test được đầy đủ số liệu/tỷ lệ mà không mock QueryBuilder.
 *
 * QUY ƯỚC SỐ LIỆU (FE hiển thị lại đúng các định nghĩa này):
 * - Chỉ tính đơn KHÔNG nằm trong Thùng rác (status pending/approved/rejected);
 *   đơn `cancelled` (đã huỷ/xoá mềm) bị loại ở tầng query.
 * - Đơn thuộc kỳ khi khoảng nghỉ [startDate, endDate] GIAO với kỳ (cùng rule bộ lọc
 *   ngày ở các tab danh sách). `totalDays` của đơn được tính TRỌN cho kỳ có đơn đó,
 *   không chia theo ngày (đơn vắt qua 2 kỳ sẽ nằm ở cả 2 kỳ).
 * - `approvedDays` = tổng ngày của đơn ĐÃ DUYỆT; `requestedDays` = mọi trạng thái.
 * - Tỷ lệ duyệt = approved / (approved + rejected) - đơn đang chờ chưa có kết quả nên
 *   không tính vào mẫu số. Tỷ lệ từ chối = phần bù tương ứng.
 * - Tỷ lệ tham gia = số nhân sự CÓ xin nghỉ / tổng nhân sự đang hoạt động trong phạm vi.
 *   Quân số là số HIỆN TẠI (hệ thống không lưu lịch sử quân số) nên kỳ trước dùng cùng mẫu số.
 * - Xu hướng/ngày trong tuần gom theo `startDate` (kẹp về đầu kỳ nếu đơn bắt đầu trước kỳ).
 */

export const MONTH_GRANULARITY_THRESHOLD_DAYS = 92;

export type StatsGranularity = 'day' | 'month';

export interface LeaveStatRow {
  id: number;
  requesterId: number;
  requesterName: string;
  departmentId: number | null;
  departmentName: string | null;
  leaveType: string;
  status: LeaveStatus;
  /** 'YYYY-MM-DD' hoặc Date (TypeORM cột `date`). */
  startDate: string | Date;
  endDate: string | Date;
  totalDays: number;
  isSupplementary: boolean;
}

export interface HeadcountRow {
  userId: number;
  departmentId: number | null;
  departmentName: string | null;
}

export interface LeaveStatsSummary {
  requests: number;
  requestedDays: number;
  approvedDays: number;
  pending: number;
  approved: number;
  rejected: number;
  /** Số nhân sự khác nhau có xin nghỉ trong kỳ. */
  employees: number;
  /** % (0-100, 1 chữ số thập phân). null khi chưa có quân số. */
  participationRate: number | null;
  /** Ngày nghỉ đã duyệt trung bình / nhân sự. null khi chưa có quân số. */
  avgApprovedDaysPerHead: number | null;
  /** % duyệt trên các đơn đã có kết quả. null khi chưa có đơn nào được xử lý. */
  approvalRate: number | null;
  rejectionRate: number | null;
  supplementary: number;
  /** % đơn bổ sung (tạo bù) trên tổng đơn. null khi không có đơn. */
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
  /** Số nhân sự rơi vào nhóm (nhóm '0' = có trong quân số nhưng không xin nghỉ). */
  employees: number;
}

export interface LeaveStatsResult {
  summary: LeaveStatsSummary;
  byType: LeaveTypeStat[];
  byDepartment: LeaveDepartmentStat[];
  byEmployee: LeaveEmployeeStat[];
  trend: LeaveTrendPoint[];
  byWeekday: LeaveWeekdayPoint[];
  frequency: LeaveFrequencyBucket[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (num: number, den: number): number | null => (den > 0 ? round1((num / den) * 100) : null);

/** 'YYYY-MM-DD' từ string/Date (Date dùng getter LOCAL - khớp cách TypeORM parse cột `date`). */
export function toYmd(v: string | Date): string {
  if (typeof v === 'string') return v.slice(0, 10);
  return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
}

/** 1 = Thứ Hai ... 7 = Chủ Nhật của 1 ngày 'YYYY-MM-DD'. */
export function weekdayOf(ymd: string): number {
  const d = new Date(`${ymd}T00:00:00Z`).getUTCDay(); // 0 = CN
  return d === 0 ? 7 : d;
}

/** Bucket xu hướng của 1 đơn (theo startDate, kẹp về đầu/cuối kỳ) - DÙNG CHUNG cho biểu đồ và drill-down để 2 bên luôn khớp số. */
export function trendBucketOf(startYmd: string, rangeFrom: string, rangeTo: string, granularity: StatsGranularity): string {
  const clamped = startYmd < rangeFrom ? rangeFrom : startYmd > rangeTo ? rangeTo : startYmd;
  return granularity === 'month' ? clamped.slice(0, 7) : clamped;
}

export type LeaveDrillQuick = 'supplementary';

export interface LeaveDrillFilter {
  status?: LeaveStatus.PENDING | LeaveStatus.APPROVED | LeaveStatus.REJECTED;
  quick?: LeaveDrillQuick;
  /** Chỉ các nhân viên này (1 hoặc N người). */
  requesterIds?: number[];
  /** 1 = Thứ Hai ... 7 = Chủ Nhật (theo startDate, cùng biểu đồ "ngày trong tuần"). */
  weekday?: number;
  /** Bucket của biểu đồ xu hướng: 'YYYY-MM-DD' (day) hoặc 'YYYY-MM' (month). */
  bucket?: string;
  /** Khoảng nghỉ GIAO với [fromDate, toDate] (YYYY-MM-DD) - thu hẹp thêm trong kỳ. */
  fromDate?: string;
  toDate?: string;
  /** Tên nhân viên / phòng ban (không phân biệt hoa thường + dấu). */
  search?: string;
}

const fold = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').trim();

/** Lọc các đơn của kỳ theo điều kiện drill-down (THUẦN, không đụng DB) - cùng định nghĩa với buildLeaveStats(). */
export function filterLeaveRowsForDrill(
  rows: LeaveStatRow[],
  f: LeaveDrillFilter,
  range: { from: string; to: string },
  granularity: StatsGranularity,
): LeaveStatRow[] {
  const rangeFrom = range.from.slice(0, 10);
  const rangeTo = range.to.slice(0, 10);
  const ids = f.requesterIds?.length ? new Set(f.requesterIds) : null;
  const needle = f.search ? fold(f.search) : '';
  return rows.filter((r) => {
    if (f.status && r.status !== f.status) return false;
    if (f.quick === 'supplementary' && !r.isSupplementary) return false;
    if (ids && !ids.has(r.requesterId)) return false;
    const start = toYmd(r.startDate);
    const end = toYmd(r.endDate);
    if (f.weekday && weekdayOf(start) !== f.weekday) return false;
    if (f.bucket && trendBucketOf(start, rangeFrom, rangeTo, granularity) !== f.bucket) return false;
    if (f.fromDate && end < f.fromDate) return false;
    if (f.toDate && start > f.toDate) return false;
    if (needle && !fold(`${r.requesterName} ${r.departmentName ?? ''}`).includes(needle)) return false;
    return true;
  });
}

export function granularityFor(spanDays: number): StatsGranularity {
  return spanDays > MONTH_GRANULARITY_THRESHOLD_DAYS ? 'month' : 'day';
}

/** Nhãn ngày ('YYYY-MM-DD') hoặc tháng ('YYYY-MM') phủ kín kỳ [from, to] (chỉ lấy 10 ký tự đầu). */
export function buildBuckets(from: string, to: string, granularity: StatsGranularity): string[] {
  const out: string[] = [];
  const start = new Date(`${from.slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${to.slice(0, 10)}T00:00:00Z`);
  if (granularity === 'day') {
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  } else {
    for (
      let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
      d <= end;
      d.setUTCMonth(d.getUTCMonth() + 1)
    ) {
      out.push(d.toISOString().slice(0, 7));
    }
  }
  return out;
}

export function summarize(rows: LeaveStatRow[], headcount: number, memberIds?: Set<number>): LeaveStatsSummary {
  let requestedDays = 0;
  let approvedDays = 0;
  let pending = 0;
  let approved = 0;
  let rejected = 0;
  let supplementary = 0;
  const people = new Set<number>();
  for (const r of rows) {
    requestedDays += r.totalDays;
    people.add(r.requesterId);
    if (r.isSupplementary) supplementary++;
    if (r.status === LeaveStatus.APPROVED) {
      approved++;
      approvedDays += r.totalDays;
    } else if (r.status === LeaveStatus.REJECTED) rejected++;
    else if (r.status === LeaveStatus.PENDING) pending++;
  }
  const decided = approved + rejected;
  return {
    requests: rows.length,
    requestedDays: round1(requestedDays),
    approvedDays: round1(approvedDays),
    pending,
    approved,
    rejected,
    employees: people.size,
    // Chỉ tính người CÒN trong quân số ở tử số - người đã nghỉ việc/khoá tài khoản mà từng có đơn
    // trong kỳ sẽ không làm tỷ lệ vượt 100%.
    participationRate: pct(memberIds ? [...people].filter((id) => memberIds.has(id)).length : people.size, headcount),
    avgApprovedDaysPerHead: headcount > 0 ? round2(approvedDays / headcount) : null,
    approvalRate: pct(approved, decided),
    rejectionRate: pct(rejected, decided),
    supplementary,
    supplementaryRate: pct(supplementary, rows.length),
  };
}

const FREQUENCY_BUCKETS: { key: string; label: string; test: (n: number) => boolean }[] = [
  { key: '0', label: 'Không xin nghỉ', test: (n) => n === 0 },
  { key: '1', label: '1 đơn', test: (n) => n === 1 },
  { key: '2', label: '2 đơn', test: (n) => n === 2 },
  { key: '3-4', label: '3-4 đơn', test: (n) => n >= 3 && n <= 4 },
  { key: '5+', label: '5 đơn trở lên', test: (n) => n >= 5 },
];

export function buildLeaveStats(
  rows: LeaveStatRow[],
  headcountRows: HeadcountRow[],
  range: { from: string; to: string },
  granularity: StatsGranularity,
): LeaveStatsResult {
  const headcount = headcountRows.length;
  const memberIds = new Set(headcountRows.map((h) => h.userId));
  const summary = summarize(rows, headcount, memberIds);
  const rangeFrom = range.from.slice(0, 10);
  const rangeTo = range.to.slice(0, 10);

  // ── theo loại phép ──
  const typeMap = new Map<string, LeaveTypeStat & { _p: Set<number> }>();
  for (const r of rows) {
    let t = typeMap.get(r.leaveType);
    if (!t) {
      t = { code: r.leaveType, requests: 0, requestedDays: 0, approvedDays: 0, employees: 0, _p: new Set() };
      typeMap.set(r.leaveType, t);
    }
    t.requests++;
    t.requestedDays += r.totalDays;
    if (r.status === LeaveStatus.APPROVED) t.approvedDays += r.totalDays;
    t._p.add(r.requesterId);
  }
  const byType: LeaveTypeStat[] = [...typeMap.values()]
    .map(({ _p, ...t }) => ({
      ...t,
      requestedDays: round1(t.requestedDays),
      approvedDays: round1(t.approvedDays),
      employees: _p.size,
    }))
    .sort((a, b) => b.requests - a.requests || a.code.localeCompare(b.code));

  // ── theo phòng ban (kể cả phòng ban có quân số nhưng 0 đơn) ──
  const NO_DEPT = 'none';
  const deptKey = (id: number | null) => (id == null ? NO_DEPT : String(id));
  const deptMap = new Map<
    string,
    { id: number | null; name: string; headcount: number; requests: number; req: number; app: number; people: Set<number> }
  >();
  const ensureDept = (id: number | null, name: string | null) => {
    const k = deptKey(id);
    let d = deptMap.get(k);
    if (!d) {
      d = { id, name: name ?? 'Chưa có phòng ban', headcount: 0, requests: 0, req: 0, app: 0, people: new Set() };
      deptMap.set(k, d);
    }
    return d;
  };
  for (const h of headcountRows) ensureDept(h.departmentId, h.departmentName).headcount++;
  for (const r of rows) {
    const d = ensureDept(r.departmentId, r.departmentName);
    d.requests++;
    d.req += r.totalDays;
    if (r.status === LeaveStatus.APPROVED) d.app += r.totalDays;
    d.people.add(r.requesterId);
  }
  const byDepartment: LeaveDepartmentStat[] = [...deptMap.values()]
    .map((d) => ({
      departmentId: d.id,
      departmentName: d.name,
      headcount: d.headcount,
      requests: d.requests,
      requestedDays: round1(d.req),
      approvedDays: round1(d.app),
      employees: d.people.size,
      participationRate: pct([...d.people].filter((id) => memberIds.has(id)).length, d.headcount),
      avgApprovedDaysPerHead: d.headcount > 0 ? round2(d.app / d.headcount) : null,
    }))
    .sort((a, b) => b.approvedDays - a.approvedDays || b.requests - a.requests || a.departmentName.localeCompare(b.departmentName));

  // ── theo nhân viên ──
  const empMap = new Map<number, LeaveEmployeeStat>();
  for (const r of rows) {
    let e = empMap.get(r.requesterId);
    if (!e) {
      e = {
        userId: r.requesterId,
        userName: r.requesterName,
        departmentName: r.departmentName,
        requests: 0,
        requestedDays: 0,
        approvedDays: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        supplementary: 0,
        approvalRate: null,
      };
      empMap.set(r.requesterId, e);
    }
    e.requests++;
    e.requestedDays += r.totalDays;
    if (r.isSupplementary) e.supplementary++;
    if (r.status === LeaveStatus.APPROVED) {
      e.approved++;
      e.approvedDays += r.totalDays;
    } else if (r.status === LeaveStatus.REJECTED) e.rejected++;
    else if (r.status === LeaveStatus.PENDING) e.pending++;
  }
  const byEmployee = [...empMap.values()]
    .map((e) => ({
      ...e,
      requestedDays: round1(e.requestedDays),
      approvedDays: round1(e.approvedDays),
      approvalRate: pct(e.approved, e.approved + e.rejected),
    }))
    .sort((a, b) => b.approvedDays - a.approvedDays || b.requests - a.requests || a.userName.localeCompare(b.userName));

  // ── xu hướng ──
  const trendMap = new Map<string, LeaveTrendPoint>();
  for (const b of buildBuckets(rangeFrom, rangeTo, granularity)) {
    trendMap.set(b, { bucket: b, requests: 0, approvedDays: 0, pending: 0, approved: 0, rejected: 0 });
  }
  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
  for (const r of rows) {
    const start = toYmd(r.startDate);
    const p = trendMap.get(trendBucketOf(start, rangeFrom, rangeTo, granularity));
    if (p) {
      p.requests++;
      if (r.status === LeaveStatus.APPROVED) {
        p.approved++;
        p.approvedDays += r.totalDays;
      } else if (r.status === LeaveStatus.REJECTED) p.rejected++;
      else if (r.status === LeaveStatus.PENDING) p.pending++;
    }
    weekdayCounts[weekdayOf(start) - 1]++;
  }
  const trend = [...trendMap.values()].map((p) => ({ ...p, approvedDays: round1(p.approvedDays) }));
  const byWeekday: LeaveWeekdayPoint[] = weekdayCounts.map((requests, i) => ({ weekday: i + 1, requests }));

  // ── phân bổ tần suất xin nghỉ trên toàn quân số ──
  const perPerson = new Map<number, number>();
  for (const e of empMap.values()) perPerson.set(e.userId, e.requests);
  // Người có đơn nhưng không còn trong quân số hiện tại (vd đã nghỉ việc) vẫn được đếm để tổng nhóm khớp.
  const allIds = new Set<number>([...memberIds, ...perPerson.keys()]);
  const frequency: LeaveFrequencyBucket[] = FREQUENCY_BUCKETS.map((b) => ({ key: b.key, label: b.label, employees: 0 }));
  for (const id of allIds) {
    const n = perPerson.get(id) ?? 0;
    const idx = FREQUENCY_BUCKETS.findIndex((b) => b.test(n));
    frequency[idx].employees++;
  }

  return { summary, byType, byDepartment, byEmployee, trend, byWeekday, frequency };
}
