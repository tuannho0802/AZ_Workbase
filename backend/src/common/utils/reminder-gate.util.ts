import { timingSafeEqual } from 'node:crypto';

/**
 * [Giảm Fluid Active CPU] Cổng sớm cho `GET /api/periodic-tasks-cron/deadline-reminders` TRƯỚC 18:00 giờ VN.
 *
 * Dịch vụ Uptime ping endpoint này mỗi 15-30 phút. Trước 18:00 `runDueReminders()` chỉ trả kết quả rỗng (`pastCutoff:false`,
 * không query gì) nhưng vẫn phải bootstrap Nest + kết nối DB nếu instance nguội. Cổng này trả ĐÚNG kết quả rỗng đó ngay ở `handler`
 * (main.ts), không khởi tạo Nest/DB. Sau 18:00 đi đường cũ hoàn toàn.
 *
 * An toàn: CHỈ trả "skipped" khi secret ĐÚNG (header x-cron-secret / Bearer / query `secret`) - sai/thiếu secret hoặc chưa cấu hình
 * CRON_SECRET thì đi đường cũ để Nest tự trả 401/503 như trước (monitor vẫn phát hiện cấu hình sai). Hình dạng response giữ
 * nguyên các field của `RunDueRemindersResult` + thêm `skipped`. T7/CN đã được `weekend-skip.util` xử lý trước đó.
 * Tắt bằng env `REMINDER_EARLY_SKIP=false`.
 */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
export const REMINDER_PATH = '/api/periodic-tasks-cron/deadline-reminders';
/** Khớp `nowVnHour < 18` trong PeriodicTaskRemindersService.runDueReminders. */
export const REMINDER_START_HOUR_VN = 18;

type Req = { url?: string; method?: string; headers?: Record<string, string | string[] | undefined> };

function header(req: Req, name: string): string | undefined {
  const v = req.headers?.[name];
  return Array.isArray(v) ? v[0] : v;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function providedSecret(req: Req): string | undefined {
  const auth = header(req, 'authorization');
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
  let query: string | undefined;
  try {
    query = new URL(req.url ?? '', 'http://local').searchParams.get('secret') ?? undefined;
  } catch {
    query = undefined;
  }
  return header(req, 'x-cron-secret') || bearer || query;
}

export type ReminderSkipInfo = { nowVnHour: number; todayVn: string };

/** Trả thông tin để trả lời nhanh, hoặc `null` = đi đường cũ (vào Nest). */
export function reminderEarlySkip(
  req: Req,
  nowMs: number = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
): ReminderSkipInfo | null {
  if (env.REMINDER_EARLY_SKIP === 'false') return null;
  if ((req.url ?? '').split('?')[0] !== REMINDER_PATH) return null;
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;
  const expected = env.CRON_SECRET;
  const provided = providedSecret(req);
  if (!expected || !provided || !safeEqual(provided, expected)) return null;
  const vn = new Date(nowMs + VN_OFFSET_MS);
  const nowVnHour = vn.getUTCHours();
  if (nowVnHour >= REMINDER_START_HOUR_VN) return null;
  return { nowVnHour, todayVn: vn.toISOString().slice(0, 10) };
}

export function respondReminderSkipped(
  req: { method?: string },
  res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b?: string) => void },
  info: ReminderSkipInfo,
): void {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  res.end(
    JSON.stringify({
      nowVnHour: info.nowVnHour,
      todayVn: info.todayVn,
      pastCutoff: false,
      candidatesChecked: 0,
      remindersSent: 0,
      remindedTaskIds: [],
      skipped: 'before-18h-vn',
    }),
  );
}
