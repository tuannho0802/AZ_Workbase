import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

let granted: string[] = [];
vi.mock('@/lib/hooks/useMyPermissions', () => ({
  useMyPermissions: () => ({ can: (key: string) => granted.includes(key) }),
}));
vi.mock('@/lib/stores/auth.store', () => ({
  useAuthStore: (selector: (s: { user: { role: string } }) => unknown) =>
    selector({ user: { role: 'employee' } }),
}));

import CommandPalette from './CommandPalette';
import { CommandPaletteHost } from './CommandPaletteHost';
import { useCommandPaletteStore } from '@/lib/stores/command-palette.store';

const labels = () => screen.getAllByRole('option').map((el) => el.textContent ?? '');

beforeEach(() => {
  push.mockClear();
  useCommandPaletteStore.setState({ open: false, everOpened: false });
  granted = ['customers.view', 'customers.assign'];
});

describe('CommandPalette', () => {
  it('chỉ liệt kê trang user có quyền (+ Trang chủ), không lộ trang khác', async () => {
    render(<CommandPalette open onClose={() => {}} />);
    const text = (await screen.findAllByRole('option')).map((el) => el.textContent).join('|');
    expect(text).toContain('Trang chủ');
    expect(text).toContain('Khách hàng');
    expect(text).toContain('Chia Data');
    expect(text).not.toContain('Phân quyền');
    expect(text).not.toContain('Nhân viên');
  });

  it('tìm không dấu và Enter điều hướng tới trang đang chọn rồi đóng', async () => {
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} />);
    const input = await screen.findByRole('combobox');
    fireEvent.change(input, { target: { value: 'chia data' } });
    expect(labels()).toHaveLength(1);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/chia-data');
    expect(onClose).toHaveBeenCalled();
  });

  it('phím mũi tên đổi mục đang chọn (có vòng lặp), Enter mở đúng mục đó', async () => {
    render(<CommandPalette open onClose={() => {}} />);
    const input = await screen.findByRole('combobox');
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'ArrowUp' }); // từ mục đầu lên -> vòng xuống mục cuối
    const all = screen.getAllByRole('option');
    expect(all[all.length - 1]).toHaveAttribute('aria-selected', 'true');
  });

  it('không có kết quả -> hiện thông báo, Enter không điều hướng', async () => {
    render(<CommandPalette open onClose={() => {}} />);
    const input = await screen.findByRole('combobox');
    fireEvent.change(input, { target: { value: 'zzzzkhongtontai' } });
    expect(screen.getByText('Không tìm thấy trang phù hợp')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(push).not.toHaveBeenCalled();
  });

  it('đang gõ IME (isComposing) thì Enter không điều hướng', async () => {
    render(<CommandPalette open onClose={() => {}} />);
    const input = await screen.findByRole('combobox');
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(push).not.toHaveBeenCalled();
  });

  it('bấm chuột vào 1 mục -> điều hướng', async () => {
    render(<CommandPalette open onClose={() => {}} />);
    const option = (await screen.findAllByRole('option')).find((el) => el.textContent?.includes('Khách hàng'))!;
    fireEvent.click(option);
    expect(push).toHaveBeenCalledWith('/customers');
  });
});

describe('CommandPaletteHost', () => {
  it('Ctrl+K mở palette, Ctrl+K lần nữa đóng; không mở khi gõ trong contenteditable', async () => {
    render(<CommandPaletteHost />);
    expect(screen.queryByRole('combobox')).toBeNull();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    });
    expect(await screen.findByRole('combobox')).toBeInTheDocument();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
    });
    // Đã đóng: antd chạy animation rời đi nhưng jsdom không phát `transitionend` nên DOM còn nguyên.
    // Dấu hiệu đã đóng = mask mang class `ant-fade-leave`, hoặc wrapper đã ẩn/gỡ.
    await vi.waitFor(
      () => {
        const wrap = document.querySelector<HTMLElement>('.ant-modal-wrap');
        const mask = document.querySelector<HTMLElement>('.ant-modal-mask');
        const closed =
          !wrap || wrap.style.display === 'none' || !!mask?.classList.contains('ant-fade-leave');
        expect(closed).toBe(true);
      },
      { timeout: 5000 },
    );
  });

  it('mở palette khi store được mở từ ô tìm trên Header (không cần phím tắt)', async () => {
    render(<CommandPaletteHost />);
    expect(screen.queryByRole('combobox')).toBeNull();
    await act(async () => {
      useCommandPaletteStore.getState().openPalette();
    });
    expect(await screen.findByRole('combobox')).toBeInTheDocument();
  });

  it('không mở khi sự kiện đến từ vùng contenteditable', async () => {
    render(<CommandPaletteHost />);
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    document.body.appendChild(editor);
    await act(async () => {
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    });
    expect(screen.queryByRole('combobox')).toBeNull();
    editor.remove();
  });
});
