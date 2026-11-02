import type { ReportQuery } from '../types/reports.types';
import type { LeaveStatsFilters } from '../types/leave-stats.types';
import type {
    LeaveExportCell,
    LeaveExportChart,
    LeaveExportColumn,
    LeaveExportForm,
    LeaveExportRequest,
} from '../types/leave-export.types';

export const LEAVE_EXPORT_FORM_OPTIONS: { value: LeaveExportForm; title: string; description: string }[] = [
    { value: 'A', title: 'A. Tổng hợp theo nhân viên', description: 'Mỗi nhân viên 1 dòng: số đơn, đã duyệt, từ chối, chờ duyệt, bổ sung, số ngày và tỷ lệ duyệt - khớp bảng ở tab Thống kê.' },
    { value: 'B', title: 'B. Chi tiết từng đơn', description: 'Mỗi đơn nghỉ 1 dòng: loại phép, từ-đến, trạng thái, người duyệt, lý do từ chối, ngày tạo (tối đa 5.000 đơn).' },
    { value: 'C', title: 'C. Theo phòng ban & loại phép', description: '2 sheet: thống kê theo phòng ban và theo loại phép.' },
    { value: 'D', title: 'D. Ma trận nhân viên × thời gian', description: 'Hàng = nhân viên, cột = ngày/tháng của kỳ, ô = số đơn; có tổng hàng và tổng cột (khớp biểu đồ xu hướng).' },
    { value: 'E', title: 'E. Báo cáo kèm biểu đồ', description: 'Chỉ số tổng quan + bảng nhân viên và 3 biểu đồ gốc của Excel (cột chồng theo nhân viên top 10, donut cơ cấu loại phép, đường xu hướng) - sửa số trong ô thì biểu đồ đổi theo.' },
    { value: 'F', title: 'F. Gói đầy đủ (A–E)', description: 'Gộp các form A, B, C, D, E thành nhiều sheet trong 1 file (biểu đồ nằm ở sheet "Báo cáo").' },
];

/** "YYYY-MM-DD" -> "DD/MM/YYYY" bằng cắt chuỗi thuần (không dựng Date để khỏi lệch múi giờ). */
export function ymdToDmy(v: string): string {
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : v;
}

/** Ô trong bảng Demo: null -> '—' (vd tỷ lệ duyệt chưa có kết quả, KHÔNG ép về 0), ngày -> DD/MM/YYYY. */
export function formatExportCell(cell: LeaveExportCell | undefined, col: LeaveExportColumn): string {
    if (cell === null || cell === undefined || cell === '') return col.type === 'number' ? '—' : '';
    if (col.type === 'date' && typeof cell === 'string') return ymdToDmy(cell);
    return String(cell);
}

/** "1677FF" -> "#1677FF" (recharts cần `#`); đã có `#` thì giữ nguyên. */
export function hexColor(c: string): string {
    return c.startsWith('#') ? c : `#${c}`;
}

/** Gộp categories + series thành hàng cho recharts: `{ name, [series.key]: value }`. `null` giữ nguyên (không ép 0). */
export function chartRows(chart: LeaveExportChart): Array<Record<string, string | number | null>> {
    return chart.categories.map((name, i) => ({
        name,
        ...Object.fromEntries(chart.series.map((s) => [s.key, s.values[i] ?? null])),
    }));
}

/** Bỏ field rỗng để không gửi param thừa (BE bật forbidNonWhitelisted nhưng vẫn cần tránh '' cho @IsInt). */
export function buildLeaveExportRequest(
    form: LeaveExportForm,
    query: ReportQuery,
    filters: LeaveStatsFilters,
): LeaveExportRequest {
    const merged = { ...query, ...filters, form };
    return Object.fromEntries(
        Object.entries(merged).filter(([, v]) => v !== undefined && v !== null && v !== ''),
    ) as unknown as LeaveExportRequest;
}

/** Lấy tên file từ header Content-Disposition (`filename*=UTF-8''...`, BE đã expose qua CORS); không có thì dùng fallback. */
export function filenameFromContentDisposition(header: string | undefined | null, fallback: string): string {
    if (!header) return fallback;
    const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
    if (star) {
        try {
            return decodeURIComponent(star[1].trim());
        } catch {
            /* rơi xuống nhánh dưới */
        }
    }
    const plain = /filename="?([^";]+)"?/i.exec(header);
    return plain ? plain[1].trim() : fallback;
}
