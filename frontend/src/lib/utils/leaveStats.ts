import type { LeaveDepartmentStat, LeaveEmployeeStat, LeaveTypeStat } from '../types/leave-stats.types';

export const WEEKDAY_LABEL: Record<number, string> = {
    1: 'Thứ 2',
    2: 'Thứ 3',
    3: 'Thứ 4',
    4: 'Thứ 5',
    5: 'Thứ 6',
    6: 'Thứ 7',
    7: 'CN',
};

/** Màu trạng thái đơn - khớp Tag ở các tab danh sách (approved=success, rejected=error, pending=processing). */
export const LEAVE_STATUS_COLORS = { approved: '#52c41a', pending: '#1677ff', rejected: '#f5222d' } as const;

export const LEAVE_STATUS_LABEL = { approved: 'Đã duyệt', pending: 'Chờ duyệt', rejected: 'Từ chối' } as const;

/** Số ngày: bỏ số 0 thừa (2 -> "2", 0.5 -> "0,5"), tối đa 2 chữ số thập phân. */
export const fmtDays = (n: number | null | undefined): string =>
    n == null || !Number.isFinite(n) ? '—' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(n);

/** Nhãn trục X: 'YYYY-MM-DD' -> 'DD/MM'; 'YYYY-MM' -> 'MM/YYYY'. Thuần chuỗi (tránh lệch múi giờ). */
export function bucketLabel(bucket: string, granularity: 'day' | 'month'): string {
    if (granularity === 'month') {
        const [y, m] = bucket.split('-');
        return `${m}/${y}`;
    }
    const [, m, d] = bucket.split('-');
    return `${d}/${m}`;
}

export type EmployeeRankMetric = 'approvedDays' | 'requests';
export const EMPLOYEE_RANK_LABEL: Record<EmployeeRankMetric, string> = {
    approvedDays: 'Ngày nghỉ đã duyệt',
    requests: 'Số đơn',
};

/** Top N nhân viên theo chỉ số (bỏ dòng = 0). Không đổi mảng gốc; hoà điểm giữ thứ tự BE trả về. */
export function topEmployees(rows: LeaveEmployeeStat[], metric: EmployeeRankMetric, limit: number) {
    return rows
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => r[metric] > 0)
        .sort((a, b) => b.r[metric] - a.r[metric] || a.i - b.i)
        .slice(0, limit)
        .map(({ r }) => ({ name: r.userName, value: r[metric], row: r }));
}

export type DepartmentMetric = 'participationRate' | 'avgApprovedDaysPerHead' | 'requests';
export const DEPARTMENT_METRIC_LABEL: Record<DepartmentMetric, string> = {
    participationRate: 'Tỷ lệ xin nghỉ',
    avgApprovedDaysPerHead: 'Ngày nghỉ TB / người',
    requests: 'Số đơn',
};

/** Dữ liệu chart phòng ban theo chỉ số (giá trị null coi như 0), giảm dần, giới hạn N. */
export function departmentSeries(rows: LeaveDepartmentStat[], metric: DepartmentMetric, limit = 10) {
    return rows
        .map((r) => ({ name: r.departmentName, value: r[metric] ?? 0, row: r }))
        .sort((a, b) => b.value - a.value)
        .slice(0, limit);
}

/** Lọc bảng nhân viên theo tên/phòng ban (không phân biệt hoa thường/dấu - `normalize` truyền vào). */
export function filterEmployees(rows: LeaveEmployeeStat[], search: string, normalize: (s: string) => string) {
    const q = normalize(search.trim());
    if (!q) return rows;
    return rows.filter((r) => normalize(`${r.userName} ${r.departmentName ?? ''}`).includes(q));
}

/** Tổng % các loại phép để vẽ donut: mỗi loại 1 phần theo số đơn, bỏ loại 0 đơn. */
export function typeSlices(types: LeaveTypeStat[], nameOf: (code: string) => string, colorOf: (code: string, i: number) => string) {
    return types
        .filter((t) => t.requests > 0)
        .map((t, i) => ({ code: t.code, name: nameOf(t.code), value: t.requests, color: colorOf(t.code, i) }));
}
