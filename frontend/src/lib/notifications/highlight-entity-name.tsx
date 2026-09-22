import type { ReactNode } from 'react';
import type { NotificationItem } from '../types/notification.types';

/**
 * Tô sáng tên khách hàng (hoặc tiêu đề task) trong `title` thông báo, dùng
 * `params.entityName` do BE gộp vào (xem `notifications.service.ts`
 * `emitNow()`). Chỉ split chuỗi rồi bọc `<mark>` quanh phần khớp - KHÔNG
 * `dangerouslySetInnerHTML` (giữ nguyên nguyên tắc 8 của PLAN, `title` vẫn
 * là text thuần từ BE, chỉ render khác đi ở FE).
 *
 * Không tìm thấy `entityName` trong `title` (bị `truncate()` cắt mất, hoặc
 * thông báo thủ công không có `entityName`) → trả về text gốc, không tô.
 */
export function highlightEntityName(
  title: string,
  params: NotificationItem['params'],
): ReactNode {
  const entityName = typeof params?.entityName === 'string' ? params.entityName : null;
  if (!entityName) return title;

  const idx = title.indexOf(entityName);
  if (idx === -1) return title;

  const before = title.slice(0, idx);
  const match = title.slice(idx, idx + entityName.length);
  const after = title.slice(idx + entityName.length);

  return (
    <>
      {before}
      <mark
        style={{
          background: '#fff1b8',
          color: 'inherit',
          fontWeight: 600,
          padding: '0 2px',
          borderRadius: 2,
        }}
      >
        {match}
      </mark>
      {after}
    </>
  );
}
