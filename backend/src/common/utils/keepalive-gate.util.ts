/**
 * [Giảm Fluid Active CPU] Cổng chặn cho /api/keep-alive — chạy ở `handler` trong main.ts TRƯỚC khi khởi tạo Nest/DB.
 *
 * 1) Khung giờ làm việc (giờ VN, T2–T6, 08:45 → 18:45): ngoài khung này trả 200 ngay (không bootstrap, không SELECT 1).
 *    Là lớp dự phòng khi GitHub Action Pause/Resume UptimeRobot bị trễ. CHỈ áp cho keep-alive — KHÔNG áp cho các endpoint cron
 *    (Vercel cron nay cũng nằm TRONG khung giờ: sync-today 10:00 UTC = 17:00 VN, auto-overdue 02:00 UTC = 09:00 VN, T2–T6;
 *    Hobby có thể trễ tới ~1 giờ nên cố ý chọn mốc cách xa 18:45). Cron còn gọi tay được ngoài giờ để test.
 * 2) Chặn trùng: HEAD thứ 2 tới trong vòng KEEPALIVE_MIN_GAP_MS kể từ HEAD đã được nhận trên CÙNG instance → trả 200 ngay.
 *    GET thủ công luôn đi đường cũ (kiểm tra DB thật), không bị chặn và không làm mới mốc.
 *
 * Tắt từng lớp bằng env: KEEPALIVE_HOURS_SKIP=false, KEEPALIVE_DEDUPE=false.
 * Giới hạn: mốc chặn trùng nằm trong RAM của instance — nếu 2 ping rơi vào 2 instance khác nhau thì không chặn được.
 */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export const KEEPALIVE_PATH = '/api/keep-alive';
export const KEEPALIVE_MIN_GAP_MS = 30_000;
/** 08:45 và 18:45 tính theo phút trong ngày (giờ VN). */
export const WORK_START_MIN = 8 * 60 + 45;
export const WORK_END_MIN = 18 * 60 + 45;

let lastAdmittedAt = 0;

/** Chỉ dùng cho test. */
export function resetKeepAliveGate(): void {
  lastAdmittedAt = 0;
}

export function isKeepAliveRequest(req: { url?: string }): boolean {
  return (req.url ?? '').split('?')[0] === KEEPALIVE_PATH;
}

/** true nếu `nowMs` nằm trong T2–T6, [08:45, 18:45) giờ VN. */
export function isVnWorkingHours(nowMs: number = Date.now()): boolean {
  const d = new Date(nowMs + VN_OFFSET_MS);
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  const min = d.getUTCHours() * 60 + d.getUTCMinutes();
  return min >= WORK_START_MIN && min < WORK_END_MIN;
}

export type KeepAliveSkipReason = 'off-hours' | 'duplicate' | null;

/**
 * Quyết định có bỏ qua request keep-alive này không. Có tác dụng phụ: khi nhận 1 HEAD hợp lệ thì ghi mốc `lastAdmittedAt`
 * (ghi lúc NHẬN, không chờ xong — để ping thứ 2 đến song song cũng bị chặn).
 */
export function keepAliveSkipReason(
  req: { url?: string; method?: string },
  nowMs: number = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
): KeepAliveSkipReason {
  if (!isKeepAliveRequest(req)) return null;
  if (env.KEEPALIVE_HOURS_SKIP !== 'false' && !isVnWorkingHours(nowMs)) return 'off-hours';
  if (req.method === 'HEAD' && env.KEEPALIVE_DEDUPE !== 'false') {
    if (nowMs - lastAdmittedAt < KEEPALIVE_MIN_GAP_MS) return 'duplicate';
    lastAdmittedAt = nowMs;
  }
  return null;
}

/** Trả 200 bằng Node `res` thuần (không qua Express/Nest). 200 (không phải 429) để UptimeRobot không báo "down". */
export function respondKeepAliveSkipped(
  req: { method?: string },
  res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b?: string) => void },
  reason: Exclude<KeepAliveSkipReason, null>,
): void {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  res.end(JSON.stringify({ status: 'skipped', reason }));
}
