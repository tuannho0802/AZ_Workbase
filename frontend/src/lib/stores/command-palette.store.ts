import { create } from 'zustand';

/**
 * Trạng thái mở/đóng của command palette Ctrl+K - dùng chung giữa
 * `CommandPaletteHost` (phím tắt + nạp lười palette) và ô tìm kiếm trên Header.
 * `everOpened` giữ palette đã nạp (dynamic import) sau lần mở đầu tiên để
 * animation đóng/mở mượt, không nạp lại.
 */
interface CommandPaletteState {
  open: boolean;
  everOpened: boolean;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  open: false,
  everOpened: false,
  openPalette: () => set({ open: true, everOpened: true }),
  closePalette: () => set({ open: false }),
  togglePalette: () => set((s) => ({ open: !s.open, everOpened: true })),
}));
