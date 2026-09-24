import { SelectQueryBuilder, ObjectLiteral } from 'typeorm';

/**
 * PHÂN TRANG THEO TUẦN ("week-mode") - dùng chung cho các endpoint log mà FE
 * gom kết quả thành Collapse theo tuần (`WeeklyCollapseSection`).
 *
 * ⚠️ VÌ SAO CẦN: trước đây `page`/`limit` đếm theo SỐ BẢN GHI (vd 20/trang),
 * trong khi FE chỉ gom nhóm theo tuần TRONG trang đó -> 1 tuần nhiều log chiếm
 * hết nhiều trang liền (mỗi trang chỉ có 1 Collapse của cùng tuần), phải bấm
 * qua 3-5 trang mới thấy tuần cũ hơn. Week-mode đổi đơn vị phân trang: 1 trang
 * = `weeksPerPage` TUẦN (mặc định FE dùng 4), trả về ĐỦ mọi bản ghi của các
 * tuần đó. Chỉ bật khi client truyền `weeksPerPage` - không truyền thì các
 * endpoint giữ nguyên hành vi cũ (page/limit theo bản ghi) để không vỡ các
 * nơi gọi khác (vd `AttendanceMonthlyTab`).
 *
 * Tuần = Thứ 2 -> Chủ nhật, khớp `getWeekStart()` ở FE (`lib/utils/week.ts`).
 * Chỉ tính các tuần CÓ dữ liệu (tuần trống bị bỏ qua, không chiếm chỗ trong
 * "4 tuần/trang").
 */

/**
 * Giới hạn cứng số bản ghi trả về cho 1 trang week-mode. BE deploy dạng
 * serverless (Vercel, giới hạn ~4.5MB/response) mà log audit mang theo
 * `oldData`/`newData` (JSON) - 4 tuần có thể vượt xa nếu hệ thống bận. Vượt
 * ngưỡng thì cắt phần CŨ NHẤT của trang và trả `truncated: true` để FE cảnh báo.
 */
export const WEEK_MODE_MAX_ROWS = 1000;

/** Quy đổi TIMESTAMP (lưu UTC) sang giờ VN để chia tuần - cùng quy ước với `customers.service.ts`. */
const TO_VN = (col: string) => `CONVERT_TZ(${col}, '+00:00', '+07:00')`;

/**
 * Biểu thức SQL trả về chuỗi 'YYYY-MM-DD' của THỨ 2 đầu tuần (giờ VN) cho cột
 * TIMESTAMP thật sự (vd `log.createdAt`). MySQL `WEEKDAY()`: Thứ 2 = 0.
 */
export function weekStartSqlFromUtcColumn(col: string): string {
  const vn = TO_VN(col);
  return `DATE_FORMAT(DATE_SUB(DATE(${vn}), INTERVAL WEEKDAY(${vn}) DAY), '%Y-%m-%d')`;
}

/**
 * Như trên nhưng cho cột DATETIME đã là giờ VN "naive" (vd
 * `attendance_logs.recordTime`, xem decode-device-time.util.ts) - KHÔNG được
 * CONVERT_TZ thêm lần nữa (sẽ lệch +7h).
 */
export function weekStartSqlFromNaiveColumn(col: string): string {
  return `DATE_FORMAT(DATE_SUB(DATE(${col}), INTERVAL WEEKDAY(${col}) DAY), '%Y-%m-%d')`;
}

/** Thứ 2 đầu tuần của 1 chuỗi 'YYYY-MM-DD' (tính thuần UTC, không phụ thuộc múi giờ tiến trình). */
export function getWeekStartOfDateString(dateStr: string): string {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`);
  const day = d.getUTCDay(); // 0 = CN ... 6 = T7
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export interface WeekBucket {
  /** 'YYYY-MM-DD' của Thứ 2. */
  weekStart: string;
  count: number;
}

export interface WeekPageWindow {
  /** Tổng số tuần có dữ liệu (theo bộ lọc hiện tại). */
  totalWeeks: number;
  /** Tổng số bản ghi của TẤT CẢ các tuần (dùng cho Badge tổng ở FE). */
  totalRecords: number;
  /** Số trang = ceil(totalWeeks / weeksPerPage). */
  totalPages: number;
  /** Các tuần thuộc trang này, mới nhất trước. */
  weekStarts: string[];
  /** Số bản ghi thuộc các tuần của trang này (trước khi cắt bởi WEEK_MODE_MAX_ROWS). */
  pageRecords: number;
}

/** Nhóm nhanh danh sách ngày 'YYYY-MM-DD' (bất kỳ thứ tự) thành bucket theo tuần, mới nhất trước. */
export function bucketDatesByWeek(dates: string[]): WeekBucket[] {
  const map = new Map<string, number>();
  for (const d of dates) {
    const ws = getWeekStartOfDateString(d);
    map.set(ws, (map.get(ws) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([weekStart, count]) => ({ weekStart, count }))
    .sort((a, b) => (a.weekStart < b.weekStart ? 1 : a.weekStart > b.weekStart ? -1 : 0));
}

/** Cắt trang `page` (1-based) gồm `weeksPerPage` tuần từ danh sách bucket đã sort mới nhất trước. */
export function computeWeekPageWindow(
  bucketsDesc: WeekBucket[],
  page: number,
  weeksPerPage: number,
): WeekPageWindow {
  const totalWeeks = bucketsDesc.length;
  const totalRecords = bucketsDesc.reduce((s, b) => s + b.count, 0);
  const totalPages = Math.ceil(totalWeeks / weeksPerPage);
  const slice = bucketsDesc.slice((page - 1) * weeksPerPage, page * weeksPerPage);
  return {
    totalWeeks,
    totalRecords,
    totalPages,
    weekStarts: slice.map((b) => b.weekStart),
    pageRecords: slice.reduce((s, b) => s + b.count, 0),
  };
}

export interface WeekModeMeta {
  totalWeeks: number;
  weeksPerPage: number;
  truncated: boolean;
}

/**
 * Chạy week-mode trên 1 QueryBuilder ĐÃ áp đủ filter/scope/quyền xem (không
 * áp skip/take/orderBy riêng - hàm này tự lo):
 *   1) đếm số bản ghi theo tuần (GROUP BY) trên bản sao của qb;
 *   2) cắt ra `weeksPerPage` tuần của trang `page`;
 *   3) lấy ĐỦ bản ghi của các tuần đó (giữ nguyên orderBy của qb), tối đa
 *      WEEK_MODE_MAX_ROWS.
 *
 * @param weekExpr biểu thức SQL trả 'YYYY-MM-DD' Thứ 2 (xem `weekStartSql*`).
 */
export async function paginateByWeek<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  opts: { weekExpr: string; page: number; weeksPerPage: number },
): Promise<{ data: T[]; total: number; totalPages: number; meta: WeekModeMeta }> {
  const { weekExpr, page, weeksPerPage } = opts;

  const rows = await qb
    .clone()
    .select(weekExpr, 'weekStart')
    .addSelect('COUNT(*)', 'cnt')
    .orderBy()
    .groupBy('weekStart')
    .orderBy('weekStart', 'DESC')
    .getRawMany<{ weekStart: string; cnt: string }>();

  const buckets: WeekBucket[] = rows.map((r) => ({ weekStart: String(r.weekStart), count: Number(r.cnt) }));
  const win = computeWeekPageWindow(buckets, page, weeksPerPage);

  if (win.weekStarts.length === 0) {
    return {
      data: [],
      total: win.totalRecords,
      totalPages: win.totalPages,
      meta: { totalWeeks: win.totalWeeks, weeksPerPage, truncated: false },
    };
  }

  const data = await qb
    .andWhere(`${weekExpr} IN (:...weekWindowStarts)`, { weekWindowStarts: win.weekStarts })
    .take(WEEK_MODE_MAX_ROWS)
    .getMany();

  return {
    data,
    total: win.totalRecords,
    totalPages: win.totalPages,
    meta: {
      totalWeeks: win.totalWeeks,
      weeksPerPage,
      truncated: win.pageRecords > data.length,
    },
  };
}
