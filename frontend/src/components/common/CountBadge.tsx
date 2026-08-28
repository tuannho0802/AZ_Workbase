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
 * điều kiện `count > 0 ? <Badge>...` như thường thấy).
 *
 * Dùng lại được cho MỌI badge số đếm sau này (không riêng sidebar) - chỉ
 * cần truyền count khác nhau, không cần biết nguồn dữ liệu tới từ đâu.
 *
 * Ví dụ:
 *   <CountBadge count={pendingCount}>{item.label}</CountBadge>
 *
 * ⚠️ GHI CHÚ KỸ THUẬT (đọc trước khi chỉnh size/màu):
 * 1. Badge tự áp `color: token.colorText` (chữ đen, theme sáng) lên chính
 *    root wrapper `.ant-badge` của nó, đè lên màu trắng lẽ ra kế thừa từ
 *    Menu dark theme (sidebar) -> chữ label bị xỉn màu. Bắt buộc set qua
 *    prop `styles={{root:{color:'inherit'}}}` (semantic API) - prop `style`
 *    thường KHÔNG áp dụng cho root wrapper khi Badge có children (đã verify
 *    bằng render test, chỉ áp cho <sup> số đếm).
 * 2. Số đếm bên trong <sup> có 2 lớp lồng nhau: <sup class="ant-badge-count">
 *    (áp được qua prop `styles.indicator`) bọc ngoài
 *    <span class="ant-scroll-number-only"> (KHÔNG áp được qua prop nào của
 *    Badge - chỉ tồn tại dưới dạng CSS class nội bộ của antd). Nếu chỉ
 *    chỉnh height của lớp ngoài mà không chỉnh lớp trong theo ĐÚNG cùng giá
 *    trị, số sẽ bị lệch tâm dọc (không nằm giữa hình tròn) - đây là lý do
 *    phải dùng CSS global bên dưới để đồng bộ CẢ 2 lớp cùng lúc, thay vì
 *    chỉ dùng prop `styles` của Badge (không với tới được lớp trong).
 */
export function CountBadge({ count, children, overflowCount = 99 }: CountBadgeProps) {
  if (!count || count <= 0) {
    return <>{children}</>;
  }

  return (
    <span className="az-count-badge">
      <Badge
        count={count}
        overflowCount={overflowCount}
        offset={[16, 2]}
        styles={{ root: { color: 'inherit' } }}
      >
        {children}
      </Badge>
      {/* eslint-disable-next-line react/no-unknown-property */}
      <style jsx global>{`
        .az-count-badge .ant-badge-count {
          min-width: 16px;
          height: 16px;
          line-height: 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 700;
        }
        .az-count-badge .ant-scroll-number-only,
        .az-count-badge .ant-scroll-number-only > p.ant-scroll-number-only-unit {
          height: 16px;
        }
      `}</style>
    </span>
  );
}
