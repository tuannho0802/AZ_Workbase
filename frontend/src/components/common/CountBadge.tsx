'use client';

import { Badge } from 'antd';
import type { ReactNode } from 'react';

interface CountBadgeProps {
  /** Số đếm cần hiển thị. undefined/0 -> tự ẩn badge, chỉ render children trơn. */
  count?: number;
  children: ReactNode;
  /** Chặn số hiển thị tối đa trước khi rút gọn thành "99+" (mặc định 99). */
  overflowCount?: number;
}

/**
 * Component dùng CHUNG cho mọi nơi cần "chấm đỏ báo số lượng đang chờ xử lý"
 * (sidebar menu, card trang chủ, tab, nút...) - bọc AntD Badge với behavior
 * chuẩn hoá 1 lần: tự ẩn khi count <= 0 (không cần mỗi nơi gọi tự viết lại
 * điều kiện `count > 0 ? <Badge>...` như thường thấy), size nhỏ đồng nhất.
 *
 * Dùng lại được cho MỌI badge số đếm sau này (không riêng sidebar) - chỉ
 * cần truyền count khác nhau, không cần biết nguồn dữ liệu tới từ đâu.
 *
 * Ví dụ:
 *   <CountBadge count={pendingCount}>{item.label}</CountBadge>
 */
export function CountBadge({ count, children, overflowCount = 99 }: CountBadgeProps) {
  if (!count || count <= 0) {
    return <>{children}</>;
  }

  return (
    <Badge count={count} overflowCount={overflowCount} size="small" offset={[8, 2]}>
      {children}
    </Badge>
  );
}
