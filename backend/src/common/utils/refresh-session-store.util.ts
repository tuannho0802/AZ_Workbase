import { createHash, randomBytes, timingSafeEqual } from 'crypto';
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
 *  - JSON v3 (PLAN P5): `{"v":3,"s":[{"id","h":hex,"t":epochSec,"c":tạoLúc,"l":hoạtĐộngCuốiLúc,"ip"?,"ua"?}],"l":{"b":bcryptHash,"u":epochSecHếtHạn}|null}`
 *    `id` (= `sid` trong payload token) ỔN ĐỊNH qua các lần rotate; chỉ `h`, `t`, `l` đổi.
 *  - JSON v2 (cũ, chưa có id/c/l): vẫn đọc được, `id = h.slice(0,12)`; ghi lại thành v3 ở lần ghi kế tiếp.
 */
export const MAX_REFRESH_SESSIONS = 10;
// Refresh token sống 7 ngày (JWT_REFRESH_EXPIRES_IN) - giữ slot dư 1 ngày rồi dọn.
const SLOT_MAX_AGE_S = 8 * 24 * 3600;
// Token phát hành TRƯỚC khi triển khai chỉ sống tối đa 7 ngày -> hash bcrypt cũ chỉ cần tin cậy trong khoảng đó.
const LEGACY_GRACE_S = 7 * 24 * 3600;

export interface RefreshSessionSlot {
  /** Mã phiên (= `sid` trong payload access/refresh token). */
  id: string;
  h: string;
  t: number;
  /** Tạo lúc (epoch giây). */
  c: number;
  /** Hoạt động gần nhất = lần refresh gần nhất (epoch giây). */
  l: number;
  ip?: string;
  ua?: string;
}
type Slot = RefreshSessionSlot;

/** Thông tin thiết bị ghi vào phiên (đăng nhập/refresh). `sid` chỉ để ép id phiên cụ thể. */
export interface RefreshSessionMeta {
  sid?: string;
  ip?: string | null;
  ua?: string | null;
}
interface LegacyEntry {
  b: string;
  u: number;
}
export interface RefreshStore {
  v: 3;
  s: Slot[];
  l: LegacyEntry | null;
}

const SID_RE = /^[a-f0-9]{12}$/;
export function newSessionId(): string {
  return randomBytes(6).toString('hex');
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
  const empty: RefreshStore = { v: 3, s: [], l: null };
  if (!raw) return empty;
  if (raw.startsWith('$2')) return { v: 3, s: [], l: { b: raw, u: nowS + LEGACY_GRACE_S } };
  try {
    const parsed = JSON.parse(raw) as { v?: number; s?: Array<Partial<Slot>>; l?: LegacyEntry | null };
    if ((parsed?.v !== 2 && parsed?.v !== 3) || !Array.isArray(parsed.s)) return empty;
    const slots: Slot[] = [];
    for (const x of parsed.s) {
      if (!x || typeof x.h !== 'string' || typeof x.t !== 'number') continue;
      slots.push({
        id: typeof x.id === 'string' && x.id ? x.id : x.h.slice(0, 12), // v2: chưa có id
        h: x.h,
        t: x.t,
        c: typeof x.c === 'number' ? x.c : x.t,
        l: typeof x.l === 'number' ? x.l : x.t,
        ...(typeof x.ip === 'string' ? { ip: x.ip } : {}),
        ...(typeof x.ua === 'string' ? { ua: x.ua } : {}),
      });
    }
    const legacy =
      parsed.l && typeof parsed.l.b === 'string' && typeof parsed.l.u === 'number' ? parsed.l : null;
    return { v: 3, s: slots, l: legacy };
  } catch {
    return empty; // dữ liệu hỏng -> coi như không có phiên (an toàn: buộc đăng nhập lại)
  }
}

export function pruneRefreshStore(store: RefreshStore, nowS: number): RefreshStore {
  return prune(store, nowS);
}

function prune(store: RefreshStore, nowS: number): RefreshStore {
  return {
    v: 3,
    s: store.s.filter((x) => x.t >= nowS - SLOT_MAX_AGE_S),
    l: store.l && store.l.u > nowS ? store.l : null,
  };
}

/** null nếu không còn phiên nào hợp lệ (để cột về NULL - đúng nghĩa "đã đăng xuất"). */
export function serializeRefreshStore(store: RefreshStore): string | null {
  if (store.s.length === 0 && !store.l) return null;
  return JSON.stringify(store);
}

function cleanMeta(meta?: RefreshSessionMeta): { ip?: string; ua?: string } {
  return {
    ...(meta?.ip ? { ip: meta.ip.slice(0, 45) } : {}),
    ...(meta?.ua ? { ua: meta.ua.slice(0, 160) } : {}),
  };
}

function withNewSlot(
  store: RefreshStore,
  replaceIndex: number,
  newToken: string,
  nowS: number,
  meta?: RefreshSessionMeta,
): RefreshStore {
  const slots = [...store.s];
  const prev = replaceIndex >= 0 ? slots[replaceIndex] : undefined;
  const sid = meta?.sid && SID_RE.test(meta.sid) ? meta.sid : undefined;
  const info = cleanMeta(meta);
  const slot: Slot = {
    // Rotate: giữ id cũ (trừ khi caller ép sid khớp với token đã phát). Phiên mới: sid ép sẵn hoặc sinh ngẫu nhiên.
    id: sid ?? prev?.id ?? newSessionId(),
    h: hashRefreshToken(newToken),
    t: nowS,
    c: prev?.c ?? nowS,
    l: nowS,
    // Refresh thiếu ip/ua (không đọc được) -> giữ giá trị cũ của phiên.
    ...(info.ip ?? prev?.ip ? { ip: (info.ip ?? prev?.ip) as string } : {}),
    ...(info.ua ?? prev?.ua ? { ua: (info.ua ?? prev?.ua) as string } : {}),
  };
  if (replaceIndex >= 0) slots[replaceIndex] = slot;
  else slots.push(slot);
  // Vượt giới hạn thiết bị -> bỏ phiên CŨ NHẤT (thiết bị đó sẽ phải đăng nhập lại).
  slots.sort((a, b) => a.t - b.t);
  while (slots.length > MAX_REFRESH_SESSIONS) slots.shift();
  return { v: 3, s: slots, l: store.l };
}

/** Đăng nhập: thêm 1 phiên mới (các thiết bị khác KHÔNG bị ảnh hưởng). */
export function addRefreshSession(
  raw: string | null | undefined,
  newToken: string,
  nowS: number,
  meta?: RefreshSessionMeta,
): string | null {
  const store = prune(parseRefreshStore(raw, nowS), nowS);
  return serializeRefreshStore(withNewSlot(store, -1, newToken, nowS, meta));
}

export type RotateResult = { ok: true; next: string | null; sid: string } | { ok: false };

/**
 * Làm mới: `presented` phải khớp 1 slot (hoặc hash bcrypt cũ còn hiệu lực). Khớp -> thay bằng `newToken`.
 * Không khớp -> `{ ok: false }` (tái sử dụng / token không thuộc phiên nào).
 */
export async function rotateRefreshSession(
  raw: string | null | undefined,
  presented: string,
  newToken: string,
  nowS: number,
  meta?: RefreshSessionMeta,
): Promise<RotateResult> {
  const store = prune(parseRefreshStore(raw, nowS), nowS);
  const presentedHash = hashRefreshToken(presented);

  const idx = store.s.findIndex((x) => safeEqualHex(x.h, presentedHash));
  if (idx >= 0) {
    const next = withNewSlot(store, idx, newToken, nowS, meta);
    return { ok: true, next: serializeRefreshStore(next), sid: next.s.find((x) => x.h === hashRefreshToken(newToken))!.id };
  }

  // Chuyển tiếp từ dữ liệu cũ: chỉ so bcrypt khi KHÔNG slot nào khớp (mỗi thiết bị cũ tốn 1 lần duy nhất).
  if (store.l && (await bcrypt.compare(presented, store.l.b))) {
    const next = withNewSlot(store, -1, newToken, nowS, meta);
    return { ok: true, next: serializeRefreshStore(next), sid: next.s.find((x) => x.h === hashRefreshToken(newToken))!.id };
  }
  return { ok: false };
}

// ─────────────────────────── PLAN P5: quản lý phiên/thiết bị ───────────────────────────

/** Các phiên còn hạn, hoạt động gần nhất trước. */
export function listRefreshSessions(raw: string | null | undefined, nowS: number): Slot[] {
  return [...prune(parseRefreshStore(raw, nowS), nowS).s].sort((a, b) => b.l - a.l);
}

export function countRefreshSessions(raw: string | null | undefined, nowS: number): number {
  return prune(parseRefreshStore(raw, nowS), nowS).s.length;
}

export function hasRefreshSession(raw: string | null | undefined, sid: string, nowS: number): boolean {
  return prune(parseRefreshStore(raw, nowS), nowS).s.some((x) => x.id === sid);
}

/**
 * Thu hồi phiên. `sid` = 1 phiên; `exceptSid` = mọi phiên TRỪ phiên đó (xoá luôn hash bcrypt cũ vì không gắn được
 * với thiết bị nào); không truyền gì = tất cả (-> null, xoá cả bcrypt cũ). `removed` chỉ đếm phiên có slot.
 */
export function revokeRefreshSessions(
  raw: string | null | undefined,
  opts: { sid?: string; exceptSid?: string },
  nowS: number,
): { next: string | null; removed: number } {
  const store = prune(parseRefreshStore(raw, nowS), nowS);
  if (opts.sid) {
    const keep = store.s.filter((x) => x.id !== opts.sid);
    const removed = store.s.length - keep.length;
    return { next: serializeRefreshStore({ ...store, s: keep }), removed };
  }
  if (opts.exceptSid) {
    const keep = store.s.filter((x) => x.id === opts.exceptSid);
    return { next: serializeRefreshStore({ v: 3, s: keep, l: null }), removed: store.s.length - keep.length };
  }
  return { next: null, removed: store.s.length };
}

/** Nhãn thiết bị từ User-Agent (vd "Chrome · Windows"). Regex nhỏ, không thêm dependency. */
export function describeDevice(ua: string | null | undefined): string {
  if (!ua) return 'Thiết bị không rõ';
  const browser = /Edg(e|A|iOS)?\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox|FxiOS/.test(ua)
        ? 'Firefox'
        : /Chrome|CriOS/.test(ua)
          ? 'Chrome'
          : /Safari/.test(ua)
            ? 'Safari'
            : null;
  // Thứ tự quan trọng: Android UA chứa "Linux", iPhone UA chứa "Mac OS X".
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(ua)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  const parts = [browser, os].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Thiết bị không rõ';
}

export interface SessionView {
  id: string;
  device: string;
  ip: string | null;
  createdAgoSeconds: number;
  lastActiveAgoSeconds: number;
  isCurrent: boolean;
}

/** Dạng trả ra API: thời gian là SỐ GIÂY TRƯỚC (tránh lệch múi giờ), TUYỆT ĐỐI không có hash. */
export function toSessionView(slot: Slot, nowS: number, currentSid?: string | null): SessionView {
  return {
    id: slot.id,
    device: describeDevice(slot.ua),
    ip: slot.ip ?? null,
    createdAgoSeconds: Math.max(nowS - slot.c, 0),
    lastActiveAgoSeconds: Math.max(nowS - slot.l, 0),
    isCurrent: !!currentSid && slot.id === currentSid,
  };
}
