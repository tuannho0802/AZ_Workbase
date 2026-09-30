'use client';

import { Badge, Tooltip } from 'antd';
import type { ReactNode } from 'react';

/** 1 chấm số đếm. count undefined/0 -> tự ẩn. */
export interface CountBadgeItem {
  count?: number;
  /** Màu nền chấm (mặc định đỏ của AntD). VD vàng: '#faad14'. */
  color?: string;
  /** Màu chữ số - cần khi nền sáng (vàng) để số vẫn đọc rõ. Mặc định trắng. */
  textColor?: string;
  /** Tooltip giải thích chấm này đang đếm cái gì (hiện khi rê chuột vào chấm). */
  title?: string;
}

interface CountBadgeProps extends CountBadgeItem {
  children: ReactNode;
  /** Chặn số hiển thị tối đa trước khi rút gọn thành "99+" (mặc định 99). */
  overflowCount?: number;
  /**
   * Các chấm PHỤ hiển thị nối tiếp sau chấm chính (cùng 1 hàng), VD chấm vàng
   * "Đang làm" cạnh chấm đỏ "To-Do". Chấm nào count <= 0 tự ẩn riêng.
   */
  extra?: CountBadgeItem[];
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
export function CountBadge({
  count,
  color,
  textColor,
  title,
  children,
  overflowCount = 99,
  extra,
}: CountBadgeProps) {
  const items: CountBadgeItem[] = [{ count, color, textColor, title }, ...(extra ?? [])].filter(
    (it) => it.count !== undefined && it.count > 0,
  );

  if (items.length === 0) {
    return <>{children}</>;
  }

  return (
    <span className="az-count-badge">
      {children}
      {items.map((it, idx) => {
        const dot = (
          <Badge
            count={it.count}
            overflowCount={overflowCount}
            color={it.color}
            styles={it.textColor ? { indicator: { color: it.textColor } } : undefined}
          />
        );
        return (
          <Tooltip key={idx} title={it.title}>
            {/* span bọc ngoài để Tooltip có phần tử nhận hover/ref ổn định */}
            <span className="az-count-badge-item" style={it.title ? { cursor: 'help' } : undefined}>
              {dot}
            </span>
          </Tooltip>
        );
      })}
      {/* eslint-disable-next-line react/no-unknown-property */}
      <style jsx global>{`
        .az-count-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .az-count-badge .az-count-badge-item {
          display: inline-flex;
          align-items: center;
        }
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
