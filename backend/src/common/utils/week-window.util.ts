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

/**
 * `alias.week_start` - tham chiếu tới cột GENERATED `week_start` đã đánh
 * index (migration `AddWeekStartGeneratedColumns`), dùng cho `weekExpr` của
 * `paginateByWeek()` THAY VÌ `weekStartSqlFromUtcColumn`/
 * `weekStartSqlFromNaiveColumn` - 2 hàm đó tính lại biểu thức mỗi lần query
 * (bọc hàm lên cột `created_at`/`record_time`, MySQL không dùng được index
 * cho GROUP BY/WHERE trên biểu thức đó, xem JSDoc migration). Tham chiếu cột
 * generated thay vì tính lại giúp MySQL index-seek trực tiếp trên `week_start`.
 *
 * `weekStartSqlFromUtcColumn`/`weekStartSqlFromNaiveColumn` VẪN giữ lại làm
 * nguồn công thức DUY NHẤT cho chính cột generated đó (dùng trong migration)
 * và cho các chỗ tính tuần THUẦN JS/trong RAM (không có cột DB để tựa vào,
 * vd `getAttendanceSummary()` gộp dữ liệu ĐÃ fetch chứ không query lại).
 */
export function weekStartColumnRef(alias: string): string {
  return `${alias}.week_start`;
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
}

export interface WeekPageOptions {
  /** Biểu thức/cột SQL trả 'YYYY-MM-DD' Thứ 2 - dùng `weekStartColumnRef()`
   * (khuyến nghị, có index) chứ KHÔNG dùng `weekStartSqlFromUtcColumn`/
   * `weekStartSqlFromNaiveColumn` ở đây nữa (2 hàm đó bọc hàm lên cột, mất
   * index - xem JSDoc từng hàm). */
  weekExpr: string;
  /** Trang CỬA SỔ TUẦN (1-based) - xác định `weeksPerPage` tuần nào đang ở
   * trang này, dùng để trả `weeks` (badge/khung Collapse của MỌI tuần trong
   * trang, kể cả tuần chưa mở). */
  page: number;
  weeksPerPage: number;
  /** Chỉ truyền khi FE thực sự đang MỞ 1 panel tuần cụ thể (lazy-load) - lúc
   * đó hàm mới fetch bản ghi thật, CHỈ của đúng tuần này. Không truyền =
   * "phase tóm tắt": trả `weeks` (đếm theo tuần) nhưng KHÔNG fetch bản ghi
   * nào (`data: []`) - rất nhẹ vì chỉ là 1 query GROUP BY, không kéo JSON/
   * cột nặng nào về. */
  weekStart?: string;
  /** Trang BÊN TRONG `weekStart` (1-based, mặc định 1) - chỉ có ý nghĩa khi
   * có `weekStart`. */
  weekPage?: number;
  /** Số bản ghi/trang BÊN TRONG `weekStart` (mặc định 20). */
  weekLimit?: number;
}

export interface WeekPageResult<T> {
  /** Bản ghi CỦA ĐÚNG `weekStart` đã yêu cầu (rỗng nếu không truyền
   * `weekStart`, hoặc `weekStart` không thuộc trang `page`/`weeksPerPage`
   * hiện tại - vd người dùng đổi filter làm lệch trang giữa 2 lần gọi). */
  data: T[];
  /** Tổng số bản ghi của TẤT CẢ tuần khớp filter (không riêng trang này) -
   * dùng cho dòng "Tổng cộng X bản ghi" ở FE. */
  total: number;
  /** Số trang week-window = ceil(totalWeeks / weeksPerPage). */
  totalPages: number;
  /** Các tuần thuộc trang week-window này (weekStart + count TỪNG tuần) - FE
   * dùng để vẽ Badge/khung mọi panel Collapse, kể cả panel chưa mở. */
  weeks: WeekBucket[];
  /** Tổng số bản ghi CỦA RIÊNG `weekStart` - dùng cho `<Pagination>` con bên
   * trong panel đó. Chỉ có khi `weekStart` hợp lệ (thuộc trang hiện tại). */
  weekTotal?: number;
  meta: WeekModeMeta;
}

/**
 * Chạy week-mode 2 PHA trên 1 QueryBuilder ĐÃ áp đủ filter/scope/quyền xem
 * (không áp skip/take/orderBy riêng - hàm này tự lo):
 *
 * PHA 1 - LUÔN chạy (nhẹ, chỉ 1 query `GROUP BY week_start` nhờ index, xem
 * `weekStartColumnRef()`): đếm số bản ghi theo tuần, cắt ra `weeksPerPage`
 * tuần của trang `page`, trả về `weeks` (không kèm bản ghi nào).
 *
 * PHA 2 - CHỈ chạy khi có `weekStart` (FE thực sự mở 1 panel): fetch ĐÚNG
 * bản ghi của tuần đó, phân trang THẬT bằng `skip`/`take` ở DB (`weekPage`/
 * `weekLimit`) - không còn giới hạn cứng kiểu "tối đa N dòng rồi cắt" như
 * bản cũ, vì giờ luôn phân trang thật nên số dòng trả về luôn nhỏ (mặc định
 * 20), không phụ thuộc 1 tuần có bao nhiêu nghìn bản ghi.
 */
export async function paginateByWeek<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  opts: WeekPageOptions,
): Promise<WeekPageResult<T>> {
  const { weekExpr, page, weeksPerPage, weekStart, weekPage = 1, weekLimit = 20 } = opts;

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
  const weekStartsInPage = new Set(win.weekStarts);
  const weeks = buckets.filter((b) => weekStartsInPage.has(b.weekStart));
  const meta: WeekModeMeta = { totalWeeks: win.totalWeeks, weeksPerPage };

  if (!weekStart || !weekStartsInPage.has(weekStart)) {
    return { data: [], total: win.totalRecords, totalPages: win.totalPages, weeks, meta };
  }

  const data = await qb
    .andWhere(`${weekExpr} = :weekStartExact`, { weekStartExact: weekStart })
    .skip((weekPage - 1) * weekLimit)
    .take(weekLimit)
    .getMany();

  return {
    data,
    total: win.totalRecords,
    totalPages: win.totalPages,
    weeks,
    weekTotal: weeks.find((b) => b.weekStart === weekStart)?.count ?? data.length,
    meta,
  };
}