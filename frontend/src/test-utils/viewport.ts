/**
 * Helper test cho layout Mobile (PLAN_MOBILE_SIDEBAR.md).
 *
 * ⚠️ GIỚI HẠN: jsdom KHÔNG tính layout/CSS thật. Helper này chỉ giả lập
 * `window.innerWidth` + `window.matchMedia` để các nhánh code theo breakpoint
 * (AntD `Grid.useBreakpoint`, hook `useIsMobile`) chạy đúng nhánh. Nó KHÔNG
 * chứng minh "không tràn ngang" hay "đủ rộng để bấm" - phần đó kiểm bằng tay
 * (DevTools) theo checklist trong plan.
 */
import { act } from '@testing-library/react';

/** Các độ rộng chuẩn dùng xuyên suốt plan. */
export const VIEWPORTS = {
  phoneS: 360,
  phone: 390,
  tablet: 768,
  laptop: 1280,
} as const;

type Listener = (e: MediaQueryListEvent) => void;
interface Entry {
  query: string;
  list: MediaQueryList;
  listeners: Set<Listener>;
  matches: boolean;
}

let entries: Entry[] = [];
let currentWidth = 1280;
const original = typeof window !== 'undefined' ? window.matchMedia : undefined;

/** Đánh giá media query dạng `(min-width: Npx)` / `(max-width: Npx)` nối bằng `and`. */
export function evalMediaQuery(query: string, width: number): boolean {
  const parts = query.split(/\band\b/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((part) => {
    if (part === 'screen' || part === 'all') return true;
    const m = part.match(/^\(\s*(min|max)-width\s*:\s*([\d.]+)px\s*\)$/i);
    if (!m) return false; // query lạ (prefers-color-scheme...) -> coi là không khớp
    const px = parseFloat(m[2]);
    return m[1].toLowerCase() === 'min' ? width >= px : width <= px;
  });
}

function install() {
  window.matchMedia = ((query: string) => {
    const entry: Entry = {
      query,
      listeners: new Set(),
      matches: evalMediaQuery(query, currentWidth),
      list: undefined as unknown as MediaQueryList,
    };
    const list = {
      get matches() {
        return entry.matches;
      },
      media: query,
      onchange: null,
      addListener: (l: Listener) => entry.listeners.add(l),
      removeListener: (l: Listener) => entry.listeners.delete(l),
      addEventListener: (_t: string, l: Listener) => entry.listeners.add(l),
      removeEventListener: (_t: string, l: Listener) => entry.listeners.delete(l),
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
    entry.list = list;
    entries.push(entry);
    return list;
  }) as typeof window.matchMedia;
}

/** Đặt độ rộng viewport và báo cho mọi listener `change` (bọc `act` để React cập nhật). */
export function setViewport(width: number, height = 800) {
  currentWidth = width;
  if (window.matchMedia === original || !entries) install();
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: height });
  act(() => {
    for (const e of entries) {
      const next = evalMediaQuery(e.query, width);
      if (next !== e.matches) {
        e.matches = next;
        e.listeners.forEach((l) => l({ matches: next, media: e.query } as MediaQueryListEvent));
      }
    }
    window.dispatchEvent(new Event('resize'));
  });
}

/** Gọi trong `afterEach` để trả về mặc định, tránh rò rỉ giữa các test. */
export function resetViewport() {
  entries = [];
  currentWidth = 1280;
  if (original) window.matchMedia = original;
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1024 });
}
