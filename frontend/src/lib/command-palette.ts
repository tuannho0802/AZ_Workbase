import type { ReactNode } from 'react';
import { getVisibleNavItems } from './nav-config';

/**
 * Logic THUẦN (không React) cho command palette Ctrl+K - tách riêng để test
 * được không cần render. Nguồn danh sách trang là `nav-config.tsx` (CÙNG nguồn
 * với Sidebar và trang chủ) -> palette KHÔNG tự khai báo route/permission nào,
 * nên không thể lệch quyền với sidebar. Quyền chặn thật vẫn ở BE (xem
 * PERMISSIONS.md); lọc ở đây chỉ để không hiện mục user không vào được.
 */

export interface PaletteItem {
  key: string;
  label: string;
  description: string;
  path: string;
  icon?: ReactNode;
}

/** Sidebar có mục "Trang chủ" đứng riêng ngoài NAV_ITEMS (luôn hiện, không đòi quyền). */
export const HOME_PALETTE_ITEM: PaletteItem = {
  key: 'home',
  label: 'Trang chủ',
  description: 'Tổng quan và lối tắt tới các trang bạn được phép dùng',
  path: '/',
};

/**
 * Bỏ dấu tiếng Việt + lowercase để so khớp ("Khach hang" khớp "Khách hàng").
 * `đ/Đ` KHÔNG tách được bằng NFD nên phải thay tay.
 */
export function normalizeVietnamese(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim();
}

/**
 * Danh sách trang user được phép vào = ĐÚNG những mục sidebar hiển thị.
 * Lưu ý `getVisibleNavItems` tự ẩn mọi mục có `permission` khi `can` chưa có
 * dữ liệu (đang loading) -> an toàn mặc định, không lộ mục rồi 403.
 * Chưa có resource `ui-visibility` nào áp cho menu (BE chỉ có resource
 * `customers` cho cột/tab/trường) nên không cần lọc thêm ở đây.
 */
export function buildPaletteItems(
  role: string | undefined,
  can?: (permissionKey: string) => boolean,
): PaletteItem[] {
  return [
    HOME_PALETTE_ITEM,
    ...getVisibleNavItems(role, can).map((item) => ({
      key: item.key,
      label: item.label,
      description: item.description,
      path: item.path,
      icon: item.icon,
    })),
  ];
}

/**
 * Mọi từ trong query phải xuất hiện (AND) ở nhãn / mô tả / đường dẫn.
 * Xếp hạng: nhãn bắt đầu bằng query > nhãn chứa query > khớp từng từ ở nhãn >
 * chỉ khớp mô tả/đường dẫn. Cùng điểm thì giữ thứ tự sidebar (sort ổn định).
 * Query rỗng -> trả nguyên danh sách.
 */
export function filterPaletteItems(items: PaletteItem[], query: string): PaletteItem[] {
  const q = normalizeVietnamese(query);
  if (!q) return items;
  const tokens = q.split(/\s+/).filter(Boolean);

  const scored: { item: PaletteItem; score: number; index: number }[] = [];
  items.forEach((item, index) => {
    const label = normalizeVietnamese(item.label);
    const haystack = `${label} ${normalizeVietnamese(item.description)} ${normalizeVietnamese(item.path)}`;
    if (!tokens.every((t) => haystack.includes(t))) return;

    let score = 1;
    if (tokens.every((t) => label.includes(t))) score = 2;
    if (label.includes(q)) score = 3;
    if (label.startsWith(q)) score = 4;
    scored.push({ item, score, index });
  });

  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map((s) => s.item);
}

/** Tối thiểu phần event mà logic phím tắt cần - để test không phải dựng KeyboardEvent thật. */
export interface HotkeyEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  defaultPrevented?: boolean;
  isComposing?: boolean;
  target?: EventTarget | null;
}

/** Vùng soạn thảo/dòng nhập tự dùng Ctrl+K (vd chèn link) thì palette phải nhường. */
export const PALETTE_OPT_OUT_SELECTOR = '[data-no-command-palette], [contenteditable=""], [contenteditable="true"]';

/**
 * Ctrl+K (Windows/Linux) hoặc Cmd+K (Mac), không kèm Alt/Shift.
 * Không kích hoạt khi: đang gõ tiếng Việt qua IME (isComposing), sự kiện đã bị
 * nơi khác xử lý (defaultPrevented), hoặc đang ở trình soạn thảo đã tự dùng
 * Ctrl+K (contenteditable / phần tử gắn `data-no-command-palette`).
 * Ô input/textarea thường KHÔNG bị chặn: Ctrl+K không gõ ra ký tự nào nên
 * không xung đột với việc nhập liệu.
 */
export function isPaletteHotkey(e: HotkeyEventLike): boolean {
  // [AGENT] OLD CODE: if (e.key.toLowerCase() !== 'k') return false;
  // Một số sự kiện keydown (autofill trình duyệt, extension, IME) có `key` undefined -> crash.
  if (typeof e.key !== 'string' || e.key.toLowerCase() !== 'k') return false;
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return false;
  if (e.isComposing || e.defaultPrevented) return false;
  const target = e.target as { closest?: (selector: string) => unknown } | null | undefined;
  if (target && typeof target.closest === 'function' && target.closest(PALETTE_OPT_OUT_SELECTOR)) {
    return false;
  }
  return true;
}
