'use client';

import { Button, Popconfirm, Tag, Tooltip } from 'antd';
import { CloseOutlined, DeleteOutlined, RedoOutlined } from '@ant-design/icons';
import type { NotificationItem } from '@/lib/types/notification.types';
import { resolveNotificationTarget } from '@/lib/notifications/resolve-link';
import { highlightEntityName } from '@/lib/notifications/highlight-entity-name';
import { formatFullTime, formatRelative } from '@/lib/utils/relative-time';
import { CategoryIconBadge } from '@/lib/notifications/category-meta';
// ⚠️ MỚI (2026-09-23, yêu cầu chủ dự án) - dòng "Từ ... đến ..." riêng cho
// thông báo THỦ CÔNG (category='manual'), dùng CHUNG <UserMiniCard> (Avatar +
// tên, bỏ Tag Vai trò), ĐÚNG pattern cột "Người tạo" ở /chia-data thay vì tự
// vẽ text trơn. Người nhận = CHÍNH người đang xem hộp thư (mỗi dòng
// `notifications` là 1 bản ghi/1 recipient) - lấy thẳng từ `useAuthStore`,
// không cần BE trả thêm field nào.
import { UserMiniCard } from '@/app/(dashboard)/attendance-device/UserMiniCard';
import { useAuthStore } from '@/lib/stores/auth.store';
import { resolveEntityColor } from '@/lib/utils/entityColor';

// Xem JSDoc đầy đủ ở `highlight-entity-name.tsx` - "bỏ role" là yêu cầu rõ
// ràng của chủ dự án cho khối này, không phải thiếu dữ liệu.
const getRoleColorNoop = () => resolveEntityColor(undefined);
const getRoleNameNoop = () => '';

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
  /**
   * Xoá VĨNH VIỄN (hard delete, không khôi phục được) - chỉ hiện ở
   * `mode="hidden"`, cạnh nút "Khôi phục". Bắt buộc xác nhận qua Popconfirm
   * vì không thể hoàn tác (khác `onRemove` chỉ ẩn).
   */
  onPurge?: (item: NotificationItem) => void;
}

/**
 * 1 dòng thông báo - dùng chung cho chuông (Popover) và trang /thong-bao.
 *
 * ⚠️ `title` (và `body` ở Modal chi tiết) chỉ được render dạng TEXT
 * (`white-space: pre-wrap`) - TUYỆT ĐỐI không `dangerouslySetInnerHTML`
 * (PLAN nguyên tắc 8): nội dung thông báo thủ công là văn bản tự do của người gửi.
 */
export function NotificationRow({
  item,
  onOpen,
  onRemove,
  mode = 'active',
  onRestore,
  onPurge,
}: NotificationRowProps) {
  const unavailable = resolveNotificationTarget(item).kind === 'unavailable';
  const hidden = mode === 'hidden';
  // Mọi loại (tự động lẫn thủ công) đều chỉ ẨN khỏi hộp thư (BE set
  // `dismissed_at`, không xoá dòng) - xem lại + khôi phục ở tab "Đã ẩn".
  const removeLabel = 'Ẩn thông báo';

  // "Từ ... đến ..." - CHỈ thông báo thủ công (xem JSDoc import ở đầu file).
  const currentUserName = useAuthStore((s) => s.user?.name);
  const senderName = typeof item.params?.senderName === 'string' ? item.params.senderName : null;

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
        <CategoryIconBadge category={item.category} />

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

          {item.category === 'manual' && (
            <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, fontSize: 10 }}>
              <span style={{ color: '#94a3b8' }}>Từ</span>
              <UserMiniCard
                name={senderName ?? 'Hệ thống'}
                getRoleColor={getRoleColorNoop}
                getRoleName={getRoleNameNoop}
                hideRoleTag
                nameFontSize={11}
              />
              <span style={{ color: '#94a3b8' }}>đến</span>
              <UserMiniCard
                name={currentUserName ?? 'Bạn'}
                getRoleColor={getRoleColorNoop}
                getRoleName={getRoleNameNoop}
                hideRoleTag
                nameFontSize={11}
              />
            </span>
          )}
        </span>

        {!item.isRead && (
          <span
            aria-label="Chưa đọc"
            style={{ width: 8, height: 8, borderRadius: '50%', background: '#1890ff', flexShrink: 0, marginTop: 6 }}
          />
        )}
      </button>

      {hidden ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <Tooltip title="Khôi phục thông báo">
            <Button
              type="text"
              size="small"
              icon={<RedoOutlined />}
              aria-label="Khôi phục thông báo"
              onClick={() => onRestore?.(item)}
              style={{ color: '#1890ff' }}
            />
          </Tooltip>
          <Popconfirm
            title="Xoá vĩnh viễn thông báo này?"
            description="Không thể khôi phục sau khi xoá."
            okText="Xoá vĩnh viễn"
            okButtonProps={{ danger: true }}
            cancelText="Huỷ"
            onConfirm={() => onPurge?.(item)}
          >
            <Tooltip title="Xoá vĩnh viễn">
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                aria-label="Xoá vĩnh viễn"
                style={{ color: '#ff4d4f' }}
              />
            </Tooltip>
          </Popconfirm>
        </span>
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