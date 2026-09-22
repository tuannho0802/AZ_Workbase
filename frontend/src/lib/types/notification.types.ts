/**
 * Hợp đồng dữ liệu HỘP THƯ THÔNG BÁO (khớp `NotificationResponse` ở
 * `backend/src/modules/notifications/notifications.service.ts`).
 * PLAN_NOTIFICATION_SYSTEM.md mục 6.5/7.
 */
export type NotificationCategory = 'customer' | 'task' | 'manual';

export interface NotificationItem {
  id: number;
  eventType: string;
  category: NotificationCategory;
  relation: string;
  actorId: number | null;
  /** 'customer' | 'periodic_task' | null (thông báo thủ công không đính kèm) */
  entityType: string | null;
  /** null = thông báo gộp nhiều bản ghi (batch) hoặc thủ công */
  entityId: number | null;
  subEntityType: string | null;
  subEntityId: number | null;
  broadcastId: number | null;
  /** Text thuần - CHỈ render dạng text (`white-space: pre-wrap`), cấm HTML. */
  title: string;
  /** Tự động: hiếm khi có. Thủ công: nội dung đầy đủ (JOIN broadcast). */
  body: string | null;
  /** Snapshot KHÔNG PII: `unavailable`, `entityIds`, `senderName`, `isPrimary`... */
  params: Record<string, unknown> | null;
  /** > 1 = đã gộp nhiều lần khi chưa đọc */
  occurrences: number;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  sortAt: string;
}

export interface NotificationListResponse {
  data: NotificationItem[];
  nextCursor: string | null;
}

export interface NotificationPollResponse {
  unread: number;
  /** MAX(sort_at) epoch ms - tăng lên khi có thông báo mới / được gộp lại */
  version: number;
}

export interface ListNotificationsParams {
  cursor?: string;
  limit?: number;
  unreadOnly?: boolean;
  /** true = CHỈ lấy thông báo ĐÃ ẨN (tab "Đã ẩn") - chỉ thông báo thủ công mới có trạng thái này. */
  dismissed?: boolean;
  category?: NotificationCategory;
}