import type { NotificationItem } from '../types/notification.types';

/**
 * "Bấm vào thông báo thì đi đâu" - registry DUY NHẤT (PLAN 7.1/7.3), dùng chung
 * cho chuông, trang /thong-bao và toast.
 *
 * ⚠️ PHASE 4 = điều hướng CƠ BẢN:
 *  - Khách hàng dùng `?id=<customerId>` ĐÃ CÓ SẴN ở `customers/page.tsx` (mở
 *    Drawer chi tiết). Phase 5 sẽ đổi sang `focus=` + highlight.
 *  - Task: đã dùng hợp đồng URL cuối cùng (`focus` + `nid`) - trang Công việc
 *    định kỳ hiện CHƯA đọc các tham số này (Phase 5), nên tạm chỉ mở trang.
 *  - Batch (nhiều khách): mở danh sách Khách hàng (Phase 5: `focusIds`).
 */
export type NotificationTarget =
  /** Điều hướng tới trang */
  | { kind: 'navigate'; href: string }
  /** Không điều hướng - mở Modal chi tiết (thông báo thủ công) */
  | { kind: 'modal' }
  /** Bản ghi không còn (đã xoá) → không điều hướng, chỉ báo nhẹ */
  | { kind: 'unavailable' }
  /** Không có đích (chỉ đánh dấu đã đọc) */
  | { kind: 'none' };

type LinkInput = Pick<NotificationItem, 'id' | 'category' | 'eventType' | 'entityType' | 'entityId' | 'params'>;

export function resolveNotificationTarget(n: LinkInput): NotificationTarget {
  if (n.category === 'manual') return { kind: 'modal' };

  // BE đặt `params.unavailable` cho *.deleted; kiểm thêm theo tên event phòng khi thiếu.
  if (n.params?.unavailable === true || n.eventType.endsWith('.deleted')) {
    return { kind: 'unavailable' };
  }

  if (n.entityType === 'customer') {
    return typeof n.entityId === 'number'
      ? { kind: 'navigate', href: `/customers?id=${n.entityId}` }
      : { kind: 'navigate', href: '/customers' };
  }

  if (n.entityType === 'periodic_task' && typeof n.entityId === 'number') {
    return { kind: 'navigate', href: `/cong-viec-dinh-ky?focus=${n.entityId}&nid=${n.id}` };
  }

  return { kind: 'none' };
}
