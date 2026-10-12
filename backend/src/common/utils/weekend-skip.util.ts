/**
 * [Giảm Fluid Active CPU] Bỏ qua các request "nền" (keep-alive + endpoint cron) vào Thứ 7 / Chủ nhật theo GIỜ VIỆT NAM.
 *
 * Chạy ở `handler` trong main.ts TRƯỚC khi khởi tạo Nest/DB: trả 200 ngay, không `SELECT 1`, không chạm DB.
 * Đây chỉ là lớp dự phòng cho các Uptime monitor không tự tạm dừng được (UptimeRobot free không có Maintenance).
 * Vercel Cron ở vercel.json đã tự né T7/CN nên không phụ thuộc lớp này.
 *
 * Tắt bằng env `WEEKEND_SKIP=false` (vd. cần gọi tay cron/keep-alive để test vào cuối tuần).
 */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Các đường dẫn (không gồm query) chỉ có Uptime/cron gọi, không có người dùng thật. */
export const WEEKEND_SKIP_PATHS: ReadonlySet<string> = new Set([
  '/api/keep-alive',
  '/api/zk-device-cron/sync-today',
  '/api/periodic-tasks-cron/deadline-reminders',
  '/api/periodic-tasks-cron/auto-overdue',
]);

/** true nếu thời điểm `nowMs` rơi vào Thứ 7 hoặc Chủ nhật theo giờ VN (UTC+7). */
export function isVnWeekend(nowMs: number = Date.now()): boolean {
  const day = new Date(nowMs + VN_OFFSET_MS).getUTCDay(); // 0 = CN, 6 = T7 (đọc bằng getUTC* trên mốc đã cộng +7h)
  return day === 0 || day === 6;
}

export function shouldSkipOnWeekend(
  req: { url?: string; method?: string },
  nowMs: number = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.WEEKEND_SKIP === 'false') return false;
  if (!isVnWeekend(nowMs)) return false;
  const path = (req.url ?? '').split('?')[0];
  return WEEKEND_SKIP_PATHS.has(path);
}

/** Trả lời nhanh bằng Node `res` thuần (không qua Express/Nest). HEAD không có body. */
export function respondWeekendSkipped(
  req: { method?: string },
  res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b?: string) => void },
): void {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  res.end(JSON.stringify({ status: 'skipped', reason: 'weekend-vn' }));
}
