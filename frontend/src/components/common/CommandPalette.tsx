'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input, Modal, theme } from 'antd';
import type { InputRef } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { buildPaletteItems, filterPaletteItems } from '@/lib/command-palette';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

const LISTBOX_ID = 'command-palette-listbox';
const optionId = (key: string) => `command-palette-option-${key}`;

/**
 * Command palette Ctrl+K - chỉ liệt kê trang user được phép vào (cùng nguồn
 * `nav-config.tsx` + `can()` với Sidebar, xem `lib/command-palette.ts`).
 * Được nạp bằng `dynamic import` từ `CommandPaletteHost` nên không nằm trong
 * bundle ban đầu của layout.
 */
export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      // Thân palette bị huỷ khi đóng -> mỗi lần mở lại là state mới (query rỗng, chọn mục đầu).
      destroyOnHidden
      width={560}
      style={{ top: 96 }}
      styles={{ body: { padding: 0 } }}
    >
      <CommandPaletteBody onClose={onClose} />
    </Modal>
  );
}

function CommandPaletteBody({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const { can } = useMyPermissions();
  const { token } = theme.useToken();

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<InputRef>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allItems = useMemo(() => buildPaletteItems(role, can), [role, can]);
  const results = useMemo(() => filterPaletteItems(allItems, query), [allItems, query]);
  const safeIndex = results.length === 0 ? -1 : Math.min(activeIndex, results.length - 1);
  const activeItem = safeIndex >= 0 ? results[safeIndex] : undefined;

  // Focus ô tìm ngay khi palette hiện ra.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Giữ mục đang chọn trong vùng nhìn thấy khi di chuyển bằng phím.
  useEffect(() => {
    if (!activeItem) return;
    const el = listRef.current?.querySelector<HTMLElement>(`#${optionId(activeItem.key)}`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [activeItem]);

  const go = (path: string) => {
    onClose();
    router.push(path);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Đang gõ tiếng Việt qua IME: Enter/mũi tên thuộc về bộ gõ, không điều hướng.
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (results.length) setActiveIndex((safeIndex + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length) setActiveIndex((safeIndex - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeItem) go(activeItem.path);
    }
    // Esc: antd Modal tự đóng (keyboard mặc định bật).
  };

  return (
    <>
      <div style={{ padding: 12, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <Input
          ref={inputRef}
          autoFocus
          size="large"
          variant="borderless"
          prefix={<SearchOutlined style={{ color: token.colorTextTertiary }} />}
          placeholder="Tìm trang... (không cần gõ dấu)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded
          aria-controls={LISTBOX_ID}
          aria-activedescendant={activeItem ? optionId(activeItem.key) : undefined}
          aria-label="Tìm trang"
          autoComplete="off"
        />
      </div>

      <div
        ref={listRef}
        id={LISTBOX_ID}
        role="listbox"
        aria-label="Danh sách trang"
        style={{ maxHeight: 360, overflowY: 'auto', padding: 8 }}
      >
        {results.length === 0 ? (
          <div style={{ padding: '24px 12px', textAlign: 'center', color: token.colorTextTertiary }}>
            Không tìm thấy trang phù hợp
          </div>
        ) : (
          results.map((item, index) => {
            const active = index === safeIndex;
            return (
              <div
                key={item.key}
                id={optionId(item.key)}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => go(item.path)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 12px',
                  borderRadius: token.borderRadius,
                  cursor: 'pointer',
                  background: active ? token.colorPrimaryBg : 'transparent',
                }}
              >
                <span style={{ fontSize: 16, width: 20, textAlign: 'center', color: token.colorTextSecondary }}>
                  {item.icon}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{item.label}</div>
                  <div
                    style={{
                      fontSize: 12,
                      color: token.colorTextTertiary,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.description}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 16,
          padding: '8px 16px',
          fontSize: 12,
          color: token.colorTextTertiary,
          borderTop: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <span>↑↓ chọn</span>
        <span>Enter mở</span>
        <span>Esc đóng</span>
      </div>
    </>
  );
}
