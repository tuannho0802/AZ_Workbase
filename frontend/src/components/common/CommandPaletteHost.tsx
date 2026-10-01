'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { isPaletteHotkey } from '@/lib/command-palette';

// Palette (antd Modal + Input + logic lọc) chỉ nạp khi user bấm Ctrl+K lần đầu -
// không nằm trong bundle ban đầu của layout dashboard.
const CommandPalette = dynamic(() => import('./CommandPalette'), { ssr: false });

/**
 * Chỉ gồm listener phím tắt (rất nhẹ) + cổng nạp lười palette.
 * Đặt 1 lần trong `(dashboard)/layout.tsx` -> dùng được trên mọi trang dashboard.
 */
export function CommandPaletteHost() {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isPaletteHotkey(e)) return;
      // Chặn hành vi mặc định của trình duyệt (vd Firefox/Chrome focus thanh tìm kiếm).
      e.preventDefault();
      setEverOpened(true);
      setOpen((prev) => !prev);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!everOpened) return null;
  return <CommandPalette open={open} onClose={() => setOpen(false)} />;
}
