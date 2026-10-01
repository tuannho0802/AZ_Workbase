'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { isPaletteHotkey } from '@/lib/command-palette';
import { useCommandPaletteStore } from '@/lib/stores/command-palette.store';

// Palette (antd Modal + Input + logic lọc) chỉ nạp khi user mở lần đầu (Ctrl+K hoặc
// bấm ô tìm trên Header) - không nằm trong bundle ban đầu của layout dashboard.
const CommandPalette = dynamic(() => import('./CommandPalette'), { ssr: false });

/**
 * Chỉ gồm listener phím tắt (rất nhẹ) + cổng nạp lười palette.
 * Đặt 1 lần trong `(dashboard)/layout.tsx` -> dùng được trên mọi trang dashboard.
 */
export function CommandPaletteHost() {
  const open = useCommandPaletteStore((s) => s.open);
  const everOpened = useCommandPaletteStore((s) => s.everOpened);
  const togglePalette = useCommandPaletteStore((s) => s.togglePalette);
  const closePalette = useCommandPaletteStore((s) => s.closePalette);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isPaletteHotkey(e)) return;
      // Chặn hành vi mặc định của trình duyệt (vd Firefox/Chrome focus thanh tìm kiếm).
      e.preventDefault();
      togglePalette();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePalette]);

  if (!everOpened) return null;
  return <CommandPalette open={open} onClose={closePalette} />;
}
