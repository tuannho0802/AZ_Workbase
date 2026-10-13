/**
 * [Giảm Fluid Active CPU] Lịch POLL nền của FE (thông báo + badge sidebar + tín hiệu permSig/refSig/epoch).
 *
 * - Nhịp: 450 giây (7,5 phút) - dùng chung cho `useNotificationPoll` và `useSidebarBadgeCounts`
 *   (hai hook cùng queryKey `notificationKeys.poll`, lệch staleTime thì cái NGẮN hơn thắng nên phải dùng 1 hằng số).
 * - Khung giờ (theo GIỜ VIỆT NAM, UTC+7 - cùng cách tính với BE `weekend-skip.util.ts`):
 *     T2-T6: poll cho tới 18:45, từ 18:45 KHÔNG poll nữa;  T7 + CN: KHÔNG poll.
 *   Không có mốc bắt đầu: người dùng mở tab sớm trước 08:45 vẫn poll bình thường.
 *
 * Ngoài khung giờ chỉ TẮT poll theo chu kỳ (`refetchInterval`). Các lần làm mới do người dùng chủ động vẫn chạy:
 * mở trang / F5 / mutation -> invalidate, và query poll thông báo còn `refetchOnWindowFocus: true` (chỉ chạy khi đã quá staleTime).
 */
export const POLL_INTERVAL_MS = 450_000;

/** 18:45 VN, tính bằng phút kể từ 00:00. */
export const POLL_STOP_MINUTE_OF_DAY_VN = 18 * 60 + 45;

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60_000;

function isWeekendVn(vnMs: number): boolean {
  const day = new Date(vnMs).getUTCDay(); // đọc bằng getUTC* trên mốc đã cộng +7h => thứ trong tuần theo giờ VN
  return day === 0 || day === 6;
}

/** true = đang trong khung giờ được phép poll (T2-T6, trước 18:45 giờ VN). */
export function isPollWindowOpen(nowMs: number = Date.now()): boolean {
  const vnMs = nowMs + VN_OFFSET_MS;
  if (isWeekendVn(vnMs)) return false;
  const d = new Date(vnMs);
  return d.getUTCHours() * 60 + d.getUTCMinutes() < POLL_STOP_MINUTE_OF_DAY_VN;
}

/**
 * Số ms tới lần khung giờ ĐỔI TRẠNG THÁI kế tiếp:
 *  - đang mở  -> tới 18:45 hôm nay (đóng);
 *  - đang đóng -> tới 00:00 của ngày làm việc kế tiếp (mở lại).
 */
export function msUntilPollWindowChange(nowMs: number = Date.now()): number {
  const vnMs = nowMs + VN_OFFSET_MS;
  const dayStart = Math.floor(vnMs / DAY_MS) * DAY_MS;
  if (isPollWindowOpen(nowMs)) {
    return dayStart + POLL_STOP_MINUTE_OF_DAY_VN * MINUTE_MS - vnMs;
  }
  let next = dayStart + DAY_MS;
  while (isWeekendVn(next)) next += DAY_MS;
  return next - vnMs;
}
