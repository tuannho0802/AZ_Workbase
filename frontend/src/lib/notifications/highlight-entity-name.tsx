import type { ReactNode } from 'react';
import type { NotificationItem } from '../types/notification.types';
import { UserMiniCard } from '@/app/(dashboard)/attendance-device/UserMiniCard';
import { resolveEntityColor } from '../utils/entityColor';

/** `UserMiniCard` đòi `getRoleColor`/`getRoleName` - ở đây CỐ TÌNH không có
 * Vai trò (yêu cầu chủ dự án: "bỏ role" trong text thông báo), luôn trả màu
 * mặc định/tên rỗng, KHÔNG gọi API `/roles/colors` (khác `chia-data/page.tsx`
 * đang có sẵn context Vai trò cho cột "Người tạo"). */
const getRoleColorNoop = () => resolveEntityColor(undefined);
const getRoleNameNoop = () => '';

/**
 * Tô sáng tên khách hàng/tiêu đề task (`params.entityName`, giữ nguyên
 * `<mark>` vàng như cũ) VÀ tên người thực hiện (`params.actorName`, MỚI -
 * 2026-09-23, yêu cầu chủ dự án) trong `title` thông báo, dùng ĐÚNG
 * `UserMiniCard` dùng chung đang có sẵn ở `/chia-data` (Avatar + tên, bỏ Tag
 * Vai trò qua `hideRoleTag`) thay vì tô chữ trơn cho tên người. Cả 2 giá trị
 * do BE gộp vào `params` (xem `notifications.service.ts` `emitNow()`) - CHỈ
 * split chuỗi rồi thay thế phần khớp, KHÔNG `dangerouslySetInnerHTML` (giữ
 * nguyên nguyên tắc 8 của PLAN, `title` vẫn là text thuần từ BE, chỉ render
 * khác đi ở FE).
 *
 * Thông báo thủ công (`manual.broadcast`) không có `actorName` trong params
 * (chỉ có `senderName`, xem `notification-broadcasts.service.ts`) nên hàm
 * này tự động bỏ qua phần actor cho loại đó - dòng "Từ ... đến ..." riêng
 * cho thông báo thủ công nằm ở `NotificationRow.tsx`, không xử lý ở đây.
 *
 * Không tìm thấy `entityName`/`actorName` trong `title` (bị `truncate()` cắt
 * mất, hoặc actor = "Hệ thống" không gộp vào params) → phần đó giữ nguyên
 * text gốc, không tô/thay.
 */
export function highlightEntityName(
  title: string,
  params: NotificationItem['params'],
): ReactNode {
  const entityName = typeof params?.entityName === 'string' ? params.entityName : null;
  const actorName = typeof params?.actorName === 'string' ? params.actorName : null;

  type Match = { start: number; end: number; kind: 'actor' | 'entity' };
  const matches: Match[] = [];

  if (actorName) {
    const idx = title.indexOf(actorName);
    if (idx !== -1) matches.push({ start: idx, end: idx + actorName.length, kind: 'actor' });
  }
  if (entityName) {
    // Tìm SAU vị trí actorName (nếu có match) để tránh 2 vùng highlight
    // chồng lấn trong trường hợp hiếm entityName trùng 1 phần actorName.
    const searchFrom = matches.length > 0 ? matches[0].end : 0;
    const idx = title.indexOf(entityName, searchFrom);
    if (idx !== -1) matches.push({ start: idx, end: idx + entityName.length, kind: 'entity' });
  }

  if (matches.length === 0) return title;
  matches.sort((a, b) => a.start - b.start);

  const nodes: ReactNode[] = [];
  let cursor = 0;
  matches.forEach((m, i) => {
    if (m.start > cursor) nodes.push(title.slice(cursor, m.start));
    const text = title.slice(m.start, m.end);
    if (m.kind === 'entity') {
      nodes.push(
        <mark
          key={`entity-${i}`}
          style={{
            background: '#fff1b8',
            color: 'inherit',
            fontWeight: 600,
            padding: '0 2px',
            borderRadius: 2,
          }}
        >
          {text}
        </mark>,
      );
    } else {
      nodes.push(
        <UserMiniCard
          key={`actor-${i}`}
          name={text}
          getRoleColor={getRoleColorNoop}
          getRoleName={getRoleNameNoop}
          hideRoleTag
          nameFontSize={13}
        />,
      );
    }
    cursor = m.end;
  });
  if (cursor < title.length) nodes.push(title.slice(cursor));

  return <>{nodes}</>;
}