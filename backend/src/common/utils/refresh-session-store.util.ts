import { createHash, timingSafeEqual } from 'crypto';
import * as bcrypt from 'bcrypt';

/**
 * Lưu NHIỀU phiên refresh token của 1 user trong đúng cột `users.hashed_refresh_token` (TEXT) - KHÔNG cần migration.
 *
 * Vì sao có file này (xem PLAN_CPU_OPTIMIZATION_ROUND2.md, Mục 2):
 *  - Trước đây mỗi lần đăng nhập GHI ĐÈ 1 hash bcrypt duy nhất. bcrypt chỉ đọc 72 byte đầu, mà 72 byte đầu của JWT
 *    (header + vài ký tự payload) GIỐNG NHAU giữa mọi token của cùng user -> mọi token đều "khớp": đăng nhập nhiều
 *    thiết bị chạy được chỉ nhờ lỗi này, còn phát hiện tái sử dụng token gần như vô hiệu. bcrypt cost 10 còn tốn
 *    ~150ms CPU mỗi lần /auth/refresh.
 *  - Bây giờ: mỗi thiết bị/phiên 1 "slot" băm SHA-256 TOÀN BỘ token (token là JWT ngẫu nhiên entropy cao, không cần
 *    hàm băm chậm). Refresh = thay đúng slot của phiên đó bằng token mới. Token không khớp slot nào = tái sử dụng.
 *
 * Định dạng lưu:
 *  - null                       : không có phiên (đã đăng xuất / thu hồi).
 *  - chuỗi bắt đầu '$2'         : DỮ LIỆU CŨ (1 hash bcrypt) - vẫn xác thực được trong cửa sổ chuyển tiếp (xem LEGACY_GRACE).
 *  - JSON `{"v":2,"s":[{"h":hex,"t":epochSec}],"l":{"b":bcryptHash,"u":epochSecHếtHạn}|null}`
 */
export const MAX_REFRESH_SESSIONS = 10;
// Refresh token sống 7 ngày (JWT_REFRESH_EXPIRES_IN) - giữ slot dư 1 ngày rồi dọn.
const SLOT_MAX_AGE_S = 8 * 24 * 3600;
// Token phát hành TRƯỚC khi triển khai chỉ sống tối đa 7 ngày -> hash bcrypt cũ chỉ cần tin cậy trong khoảng đó.
const LEGACY_GRACE_S = 7 * 24 * 3600;

interface Slot {
  h: string;
  t: number;
}
interface LegacyEntry {
  b: string;
  u: number;
}
export interface RefreshStore {
  v: 2;
  s: Slot[];
  l: LegacyEntry | null;
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function parseRefreshStore(raw: string | null | undefined, nowS: number): RefreshStore {
  const empty: RefreshStore = { v: 2, s: [], l: null };
  if (!raw) return empty;
  if (raw.startsWith('$2')) return { v: 2, s: [], l: { b: raw, u: nowS + LEGACY_GRACE_S } };
  try {
    const parsed = JSON.parse(raw) as Partial<RefreshStore>;
    if (parsed?.v !== 2 || !Array.isArray(parsed.s)) return empty;
    const slots = parsed.s.filter((x): x is Slot => !!x && typeof x.h === 'string' && typeof x.t === 'number');
    const legacy =
      parsed.l && typeof parsed.l.b === 'string' && typeof parsed.l.u === 'number' ? parsed.l : null;
    return { v: 2, s: slots, l: legacy };
  } catch {
    return empty; // dữ liệu hỏng -> coi như không có phiên (an toàn: buộc đăng nhập lại)
  }
}

function prune(store: RefreshStore, nowS: number): RefreshStore {
  return {
    v: 2,
    s: store.s.filter((x) => x.t >= nowS - SLOT_MAX_AGE_S),
    l: store.l && store.l.u > nowS ? store.l : null,
  };
}

/** null nếu không còn phiên nào hợp lệ (để cột về NULL - đúng nghĩa "đã đăng xuất"). */
export function serializeRefreshStore(store: RefreshStore): string | null {
  if (store.s.length === 0 && !store.l) return null;
  return JSON.stringify(store);
}

function withNewSlot(store: RefreshStore, replaceIndex: number, newToken: string, nowS: number): RefreshStore {
  const slots = [...store.s];
  const slot: Slot = { h: hashRefreshToken(newToken), t: nowS };
  if (replaceIndex >= 0) slots[replaceIndex] = slot;
  else slots.push(slot);
  // Vượt giới hạn thiết bị -> bỏ phiên CŨ NHẤT (thiết bị đó sẽ phải đăng nhập lại).
  slots.sort((a, b) => a.t - b.t);
  while (slots.length > MAX_REFRESH_SESSIONS) slots.shift();
  return { v: 2, s: slots, l: store.l };
}

/** Đăng nhập: thêm 1 phiên mới (các thiết bị khác KHÔNG bị ảnh hưởng). */
export function addRefreshSession(raw: string | null | undefined, newToken: string, nowS: number): string | null {
  const store = prune(parseRefreshStore(raw, nowS), nowS);
  return serializeRefreshStore(withNewSlot(store, -1, newToken, nowS));
}

export type RotateResult = { ok: true; next: string | null } | { ok: false };

/**
 * Làm mới: `presented` phải khớp 1 slot (hoặc hash bcrypt cũ còn hiệu lực). Khớp -> thay bằng `newToken`.
 * Không khớp -> `{ ok: false }` (tái sử dụng / token không thuộc phiên nào).
 */
export async function rotateRefreshSession(
  raw: string | null | undefined,
  presented: string,
  newToken: string,
  nowS: number,
): Promise<RotateResult> {
  const store = prune(parseRefreshStore(raw, nowS), nowS);
  const presentedHash = hashRefreshToken(presented);

  const idx = store.s.findIndex((x) => safeEqualHex(x.h, presentedHash));
  if (idx >= 0) {
    return { ok: true, next: serializeRefreshStore(withNewSlot(store, idx, newToken, nowS)) };
  }

  // Chuyển tiếp từ dữ liệu cũ: chỉ so bcrypt khi KHÔNG slot nào khớp (mỗi thiết bị cũ tốn 1 lần duy nhất).
  if (store.l && (await bcrypt.compare(presented, store.l.b))) {
    return { ok: true, next: serializeRefreshStore(withNewSlot(store, -1, newToken, nowS)) };
  }
  return { ok: false };
}
