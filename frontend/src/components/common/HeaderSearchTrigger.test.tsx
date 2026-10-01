import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HeaderSearchTrigger } from './HeaderSearchTrigger';
import { useCommandPaletteStore } from '@/lib/stores/command-palette.store';

beforeEach(() => {
  useCommandPaletteStore.setState({ open: false, everOpened: false });
  vi.restoreAllMocks();
});

describe('useCommandPaletteStore', () => {
  it('open/close/toggle và đánh dấu everOpened sau lần mở đầu', () => {
    const s = useCommandPaletteStore.getState();
    expect(useCommandPaletteStore.getState()).toMatchObject({ open: false, everOpened: false });
    s.openPalette();
    expect(useCommandPaletteStore.getState()).toMatchObject({ open: true, everOpened: true });
    s.closePalette();
    expect(useCommandPaletteStore.getState()).toMatchObject({ open: false, everOpened: true });
    s.togglePalette();
    expect(useCommandPaletteStore.getState().open).toBe(true);
    s.togglePalette();
    expect(useCommandPaletteStore.getState().open).toBe(false);
  });
});

describe('HeaderSearchTrigger', () => {
  it('hiện placeholder gợi ý Ctrl + K cho người dùng (không phải Mac)', () => {
    vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('Win32');
    render(<HeaderSearchTrigger />);
    expect(screen.getByText('Tìm trang... (Ctrl + K)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tìm trang nhanh \(Ctrl \+ K\)/ })).toBeInTheDocument();
  });

  it('trên Mac hiện ⌘ K', () => {
    vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel');
    render(<HeaderSearchTrigger />);
    expect(screen.getByText('Tìm trang... (⌘ K)')).toBeInTheDocument();
  });

  it('bấm vào ô -> mở command palette (qua store)', () => {
    render(<HeaderSearchTrigger />);
    fireEvent.click(screen.getByRole('button'));
    expect(useCommandPaletteStore.getState()).toMatchObject({ open: true, everOpened: true });
  });

  it('là button (không phải input) nên focus quay lại sau khi đóng Modal không tự mở lại', () => {
    render(<HeaderSearchTrigger />);
    const btn = screen.getByRole('button');
    expect(btn.tagName).toBe('BUTTON');
    fireEvent.focus(btn);
    expect(useCommandPaletteStore.getState().open).toBe(false);
  });
});
