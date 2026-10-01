import { describe, it, expect } from 'vitest';
import {
  buildPaletteItems,
  filterPaletteItems,
  isPaletteHotkey,
  normalizeVietnamese,
  type HotkeyEventLike,
} from './command-palette';
import { NAV_ITEMS, getVisibleNavItems } from './nav-config';

describe('normalizeVietnamese', () => {
  it('bỏ dấu, xử lý đ/Đ và lowercase', () => {
    expect(normalizeVietnamese('Khách hàng')).toBe('khach hang');
    expect(normalizeVietnamese('Đăng Ký Phân Quyền')).toBe('dang ky phan quyen');
    expect(normalizeVietnamese('  Nghỉ phép ')).toBe('nghi phep');
  });
});

describe('buildPaletteItems - lọc theo quyền, khớp sidebar', () => {
  it('luôn có Trang chủ, kể cả khi không có quyền nào', () => {
    const items = buildPaletteItems('employee', () => false);
    expect(items[0].key).toBe('home');
    expect(items[0].path).toBe('/');
  });

  it('các mục còn lại KHỚP CHÍNH XÁC getVisibleNavItems (cùng thứ tự, cùng path)', () => {
    const can = (key: string) => ['customers.view', 'reports.view'].includes(key);
    const palette = buildPaletteItems('employee', can).filter((i) => i.key !== 'home');
    const sidebar = getVisibleNavItems('employee', can);
    expect(palette.map((i) => i.key)).toEqual(sidebar.map((i) => i.key));
    expect(palette.map((i) => i.path)).toEqual(sidebar.map((i) => i.path));
  });

  it('không hiện mục user không có quyền (vd Phân quyền khi thiếu roles.view)', () => {
    const items = buildPaletteItems('employee', (key) => key === 'customers.view');
    expect(items.some((i) => i.key === 'customers')).toBe(true);
    expect(items.some((i) => i.key === 'phan-quyen')).toBe(false);
    expect(items.some((i) => i.key === 'users')).toBe(false);
  });

  it('requireAll vẫn được tôn trọng (UTM cần cả utms.my_managed + customers.view)', () => {
    const onlyUtm = buildPaletteItems('employee', (key) => key === 'utms.my_managed');
    expect(onlyUtm.some((i) => i.key === 'quan-ly-utm')).toBe(false);
    const both = buildPaletteItems('employee', (key) => ['utms.my_managed', 'customers.view'].includes(key));
    expect(both.some((i) => i.key === 'quan-ly-utm')).toBe(true);
  });

  it('AN TOÀN MẶC ĐỊNH: chưa có can() (đang loading) -> không lộ mục nào đòi permission', () => {
    const items = buildPaletteItems('admin');
    const gated = NAV_ITEMS.filter((i) => i.permission);
    expect(gated.length).toBeGreaterThan(0);
    for (const g of gated) expect(items.some((i) => i.key === g.key)).toBe(false);
  });
});

describe('filterPaletteItems - tìm không dấu', () => {
  const items = buildPaletteItems('admin', () => true);

  it('query rỗng -> trả nguyên danh sách', () => {
    expect(filterPaletteItems(items, '   ')).toEqual(items);
  });

  it('gõ không dấu vẫn khớp nhãn có dấu', () => {
    const keys = filterPaletteItems(items, 'khach hang').map((i) => i.key);
    expect(keys).toContain('customers');
    const phep = filterPaletteItems(items, 'nghi phep').map((i) => i.key);
    expect(phep).toContain('nghi-phep');
  });

  it('gõ có dấu hay chữ hoa đều khớp như nhau', () => {
    expect(filterPaletteItems(items, 'NGHỈ PHÉP').map((i) => i.key)).toEqual(
      filterPaletteItems(items, 'nghi phep').map((i) => i.key),
    );
  });

  it('nhãn bắt đầu bằng query xếp trước mục chỉ khớp ở mô tả', () => {
    const result = filterPaletteItems(items, 'thong bao');
    expect(result[0].label.toLowerCase().startsWith('thông báo')).toBe(true);
  });

  it('nhiều từ: mọi từ phải có mặt (AND)', () => {
    const keys = filterPaletteItems(items, 'gui thong bao').map((i) => i.key);
    expect(keys).toContain('thong-bao-gui');
    expect(keys).not.toContain('customers');
  });

  it('khớp theo đường dẫn', () => {
    expect(filterPaletteItems(items, '/chia-data').map((i) => i.key)).toContain('chia-data');
  });

  it('không có kết quả -> mảng rỗng', () => {
    expect(filterPaletteItems(items, 'zzzzkhongtontai')).toEqual([]);
  });

  it('chỉ tìm trong danh sách đã lọc quyền, không "lòi" mục bị ẩn', () => {
    const limited = buildPaletteItems('employee', (key) => key === 'customers.view');
    expect(filterPaletteItems(limited, 'phan quyen')).toEqual([]);
  });
});

describe('isPaletteHotkey', () => {
  const base: HotkeyEventLike = {
    key: 'k',
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
  };

  it('Ctrl+K và Cmd+K (hoa/thường) -> true', () => {
    expect(isPaletteHotkey(base)).toBe(true);
    expect(isPaletteHotkey({ ...base, ctrlKey: false, metaKey: true })).toBe(true);
    expect(isPaletteHotkey({ ...base, key: 'K' })).toBe(true);
  });

  it('thiếu Ctrl/Cmd, hoặc kèm Alt/Shift, hoặc phím khác -> false', () => {
    expect(isPaletteHotkey({ ...base, ctrlKey: false })).toBe(false);
    expect(isPaletteHotkey({ ...base, altKey: true })).toBe(false);
    expect(isPaletteHotkey({ ...base, shiftKey: true })).toBe(false);
    expect(isPaletteHotkey({ ...base, key: 'j' })).toBe(false);
  });

  it('đang gõ IME hoặc event đã bị xử lý nơi khác -> false', () => {
    expect(isPaletteHotkey({ ...base, isComposing: true })).toBe(false);
    expect(isPaletteHotkey({ ...base, defaultPrevented: true })).toBe(false);
  });

  it('nhường cho trình soạn thảo đã dùng Ctrl+K (contenteditable / data-no-command-palette)', () => {
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    const inner = document.createElement('span');
    editor.appendChild(inner);
    expect(isPaletteHotkey({ ...base, target: inner })).toBe(false);

    const optOut = document.createElement('textarea');
    optOut.setAttribute('data-no-command-palette', '');
    expect(isPaletteHotkey({ ...base, target: optOut })).toBe(false);
  });

  it('ô input/textarea thường KHÔNG chặn (Ctrl+K không gõ ký tự nào)', () => {
    const input = document.createElement('input');
    expect(isPaletteHotkey({ ...base, target: input })).toBe(true);
  });
});
