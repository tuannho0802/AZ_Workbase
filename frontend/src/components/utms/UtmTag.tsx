'use client';

import { Tag } from 'antd';
import { resolveEntityColor } from '@/lib/utils/entityColor';

interface Props {
  name?: string | null;
  color?: string | null;
  /** Hiện mờ + gạch khi UTM đang bị khoá. */
  inactive?: boolean;
  style?: React.CSSProperties;
}

/** Tag UTM dùng chung (bảng khách hàng, chi tiết, dropdown). Màu lấy từ `utms.color`, fallback màu mặc định. */
export function UtmTag({ name, color, inactive, style }: Props) {
  if (!name) return <span style={{ color: '#bfbfbf' }}>—</span>;
  return (
    <Tag
      color={resolveEntityColor(color)}
      style={{ marginInlineEnd: 0, ...(inactive ? { opacity: 0.55, textDecoration: 'line-through' } : null), ...style }}
    >
      {name}
    </Tag>
  );
}
