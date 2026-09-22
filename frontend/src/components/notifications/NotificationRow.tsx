'use client';

import { Button, Tag, Tooltip } from 'antd';
import {
  CloseOutlined,
  NotificationOutlined,
  RedoOutlined,
  ScheduleOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import type { NotificationCategory, NotificationItem } from '@/lib/types/notification.types';
import { resolveNotificationTarget } from '@/lib/notifications/resolve-link';
import { highlightEntityName } from '@/lib/notifications/highlight-entity-name';
import { formatFullTime, formatRelative } from '@/lib/utils/relative-time';

const CATEGORY_META: Record<NotificationCategory, { icon: ReactNode; color: string; label: string }> = {
  customer: { icon: <TeamOutlined />, color: '#1890ff', label: 'Khách hàng' },
  task: { icon: <ScheduleOutlined />, color: '#fa8c16', label: 'Công việc' },
  manual: { icon: <NotificationOutlined />, color: '#722ed1', label: 'Thông báo' },
};

interface NotificationRowProps {
  item: NotificationItem;
  onOpen: (item: NotificationItem) => void;
  onRemove: (item: NotificationItem) => void;
  /**
   * `'hidden'` = đang ở tab "Đã ẩn" (`dismissed=true`) - nút hành động đổi
   * thành "Khôi phục" (gọi `onRestore` thay vì `onRemove`). Mặc định `'active'`.
   */
  mode?: 'active' | 'hidden';
  onRestore?: (item: NotificationItem) => void;
}

/**
 * 1 dòng thông báo - dùng chung cho chuông (Popover) và trang /thong-bao.
 *
 * ⚠️ `title` (và `body` ở Modal chi tiết) chỉ được render dạng TEXT
 * (`white-space: pre-wrap`) - TUYỆT ĐỐI không `dangerouslySetInnerHTML`
 * (PLAN nguyên tắc 8): nội dung thông báo thủ công là văn bản tự do của người gửi.
 */
export function NotificationRow({ item, onOpen, onRemove, mode = 'active', onRestore }: NotificationRowProps) {
  const meta = CATEGORY_META[item.category] ?? CATEGORY_META.manual;
  const unavailable = resolveNotificationTarget(item).kind === 'unavailable';
  const hidden = mode === 'hidden';
  // Mọi loại (tự động lẫn thủ công) đều chỉ ẨN khỏi hộp thư (BE set
  // `dismissed_at`, không xoá dòng) - xem lại + khôi phục ở tab "Đã ẩn".
  const removeLabel = 'Ẩn thông báo';

  return (
    <div
      data-testid="notification-row"
      data-unread={!item.isRead}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 4,
        padding: '10px 8px 10px 12px',
        borderBottom: '1px solid #f0f0f0',
        background: item.isRead ? '#fff' : '#f0f7ff',
        opacity: unavailable ? 0.65 : 1,
      }}
    >
      <button
        type="button"
        onClick={() => onOpen(item)}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          flex: 1,
          minWidth: 0,
          padding: 0,
          border: 'none',
          background: 'transparent',
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <span
          aria-hidden
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: meta.color,
            background: `${meta.color}1a`,
            fontSize: 16,
          }}
        >
          {meta.icon}
        </span>

        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
          <span
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: 13,
              lineHeight: 1.4,
              color: '#0f172a',
              fontWeight: item.isRead ? 400 : 600,
            }}
          >
            {highlightEntityName(item.title, item.params)}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8' }}>
            <Tooltip title={formatFullTime(item.sortAt)}>
              <span>{formatRelative(item.sortAt)}</span>
            </Tooltip>
            {item.occurrences > 1 && (
              <Tag style={{ margin: 0, lineHeight: '16px', fontSize: 11 }} title="Số lần cập nhật đã gộp">
                ×{item.occurrences}
              </Tag>
            )}
            {unavailable && (
              <Tag style={{ margin: 0, lineHeight: '16px', fontSize: 11 }}>Không khả dụng</Tag>
            )}
          </span>
        </span>

        {!item.isRead && (
          <span
            aria-label="Chưa đọc"
            style={{ width: 8, height: 8, borderRadius: '50%', background: '#1890ff', flexShrink: 0, marginTop: 6 }}
          />
        )}
      </button>

      {hidden ? (
        <Tooltip title="Khôi phục thông báo">
          <Button
            type="text"
            size="small"
            icon={<RedoOutlined />}
            aria-label="Khôi phục thông báo"
            onClick={() => onRestore?.(item)}
            style={{ color: '#1890ff', flexShrink: 0 }}
          />
        </Tooltip>
      ) : (
          <Tooltip title={removeLabel}>
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              aria-label={removeLabel}
              onClick={() => onRemove(item)}
              style={{ color: '#94a3b8', flexShrink: 0 }}
            />
          </Tooltip>
      )}
    </div>
  );
}