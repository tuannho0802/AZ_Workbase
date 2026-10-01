'use client';

import { useSyncExternalStore } from 'react';
import { SearchOutlined } from '@ant-design/icons';
import { useCommandPaletteStore } from '@/lib/stores/command-palette.store';

const noopSubscribe = () => () => {};
const isMacClient = () => /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || '');

/**
 * Ô "Tìm kiếm" trên Header: nhìn như ô input nhưng là <button> mở command palette
 * (cùng palette với Ctrl/Cmd+K). Dùng button thay vì <input> để khi Modal đóng và
 * focus quay lại ô này thì KHÔNG tự mở lại palette. Placeholder gợi ý phím tắt cho
 * người dùng. Màn hình hẹp (< md) thu gọn còn icon để Header không bị chật.
 */
export function HeaderSearchTrigger() {
  const openPalette = useCommandPaletteStore((s) => s.openPalette);
  // Server render luôn "Ctrl"; client đọc nền tảng sau hydrate (không lệch hydration).
  const isMac = useSyncExternalStore(noopSubscribe, isMacClient, () => false);
  const shortcut = isMac ? '⌘ K' : 'Ctrl + K';

  return (
    <button
      type="button"
      onClick={openPalette}
      aria-label={`Tìm trang nhanh (${shortcut})`}
      aria-haspopup="dialog"
      aria-keyshortcuts="Control+K Meta+K"
      className="hover:border-[#91caff] hover:bg-white"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 36,
        minWidth: 36,
        padding: '0 10px',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        background: '#f8fafc',
        color: '#94a3b8',
        cursor: 'pointer',
        transition: 'border-color 0.2s, background 0.2s',
      }}
    >
      <SearchOutlined style={{ fontSize: 14 }} />
      <span className="hidden md:inline" style={{ fontSize: 13, width: 170, textAlign: 'left' }}>
        Tìm trang... ({shortcut})
      </span>
    </button>
  );
}
