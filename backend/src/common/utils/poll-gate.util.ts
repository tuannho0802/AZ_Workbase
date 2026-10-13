/**
 * [Giảm Fluid Active CPU] Cổng chặn cho các endpoint POLL thông báo/badge — chạy ở `handler` trong main.ts
 * TRƯỚC khi khởi tạo Nest/DB/JWT: ngoài giờ làm việc trả 200 ngay (không bootstrap, không đếm badge).
 *
 * Công ty không có ai làm ngoài giờ -> MẶC ĐỊNH BẬT. Chặn các nguồn FE không tự dừng được: tab mở sẵn từ trước khi
 * deploy bản FE có khung giờ, client cũ (poll 60s/120s), gọi tay.
 *
 * Khung giờ KHỚP FE (`frontend/src/lib/poll-schedule.ts`): T2–T6 trước 18:45 giờ VN thì chạy bình thường;
 * từ 18:45 và cả T7/CN thì chặn. Cố ý KHÔNG có mốc bắt đầu (giống FE) để người mở app sớm vẫn có thông báo.
 *
 * Chỉ áp cho GET đúng 3 đường dẫn poll. KHÔNG chặn danh sách thông báo (/api/notifications), đánh dấu đã đọc, v.v.
 * Phản hồi bị chặn: `{ skipped: true, reason: 'off-hours' }` — FE nhận ra và GIỮ NGUYÊN dữ liệu cũ (không ghi đè).
 *
 * Tắt bằng env `POLL_HOURS_SKIP=false` (vd. sau này có ca muộn/làm T7). Cần redeploy BE để env có hiệu lực.
 */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** 18:45 VN tính bằng phút kể từ 00:00 — PHẢI khớp `POLL_STOP_MINUTE_OF_DAY_VN` ở FE. */
export const POLL_STOP_MINUTE_OF_DAY_VN = 18 * 60 + 45;

export const POLL_GATE_PATHS: ReadonlySet<string> = new Set([
  '/api/sidebar/poll', // poll gộp (FE hiện tại)
  '/api/notifications/poll', // poll nhẹ (sau khi đánh dấu đã đọc) + FE cũ
  '/api/sidebar/badges', // FE cũ
]);

/** true nếu `nowMs` nằm trong khung giờ được phép poll (T2–T6, trước 18:45 giờ VN). */
export function isPollWindowOpenVn(nowMs: number = Date.now()): boolean {
  const d = new Date(nowMs + VN_OFFSET_MS);
  const day = d.getUTCDay(); // 0 = CN, 6 = T7 (đọc bằng getUTC* trên mốc đã cộng +7h)
  if (day === 0 || day === 6) return false;
  return d.getUTCHours() * 60 + d.getUTCMinutes() < POLL_STOP_MINUTE_OF_DAY_VN;
}

export type PollSkipReason = 'off-hours' | null;

export function pollGateSkipReason(
  req: { url?: string; method?: string },
  nowMs: number = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
): PollSkipReason {
  if (env.POLL_HOURS_SKIP === 'false') return null;
  if (req.method !== 'GET') return null;
  const path = (req.url ?? '').split('?')[0];
  if (!POLL_GATE_PATHS.has(path)) return null;
  return isPollWindowOpenVn(nowMs) ? null : 'off-hours';
}

interface MinimalReq {
  headers?: Record<string, string | string[] | undefined>;
}
interface MinimalRes {
  statusCode: number;
  setHeader: (k: string, v: string) => void;
  end: (b?: string) => void;
}

/**
 * Trả 200 bằng Node `res` thuần. PHẢI tự gắn header CORS: phản hồi này đi trước middleware `cors` của Nest, nếu thiếu thì
 * trình duyệt (FE/BE khác domain) chặn đọc response và FE báo "lỗi mạng". Origin được so với danh sách cho phép giống `enableCors`.
 */
export function respondPollSkipped(
  req: MinimalReq,
  res: MinimalRes,
  reason: Exclude<PollSkipReason, null>,
  allowedOrigins: string[],
): void {
  const raw = req.headers?.['origin'];
  const origin = Array.isArray(raw) ? raw[0] : raw;
  res.setHeader('Vary', 'Origin');
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ skipped: true, reason }));
}
