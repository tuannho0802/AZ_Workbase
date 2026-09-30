'use client';

import type { ReactNode } from 'react';
import { Button, Space, Typography } from 'antd';

const { Text } = Typography;

interface Props {
  count: number;
  onClear: () => void;
  disabled?: boolean;
  /** Các nút hành động hàng loạt (Khoá/Xoá/Gỡ...). */
  children: ReactNode;
}

/** Thanh thao tác hàng loạt hiện phía trên bảng khi đã chọn ≥ 1 dòng. */
export function BulkActionBar({ count, onClear, disabled, children }: Props) {
  if (count <= 0) return null;
  return (
    <div
      role="toolbar"
      aria-label="Thao tác hàng loạt"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        flexWrap: 'wrap',
        padding: '8px 12px',
        marginBottom: 8,
        background: '#e6f4ff',
        border: '1px solid #91caff',
        borderRadius: 8,
      }}
    >
      <Text strong>Đã chọn {count}</Text>
      <Space size={8} wrap>
        {children}
        <Button size="small" type="text" onClick={onClear} disabled={disabled}>
          Bỏ chọn
        </Button>
      </Space>
    </div>
  );
}
