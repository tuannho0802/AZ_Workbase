'use client';

import { Button, Modal } from 'antd';
import { useNotificationUiStore } from '@/lib/stores/notification-ui.store';
import { formatFullTime } from '@/lib/utils/relative-time';

/**
 * Modal chi tiết cho thông báo THỦ CÔNG (bấm vào không điều hướng - PLAN 7.1).
 * Mount 1 lần ở Dashboard layout; mở qua `useNotificationUiStore.openDetail()`.
 * Nội dung render text thuần (`pre-wrap`), KHÔNG HTML.
 */
export function NotificationDetailModal() {
  const detail = useNotificationUiStore((s) => s.detail);
  const close = useNotificationUiStore((s) => s.closeDetail);

  const sender = typeof detail?.params?.senderName === 'string' ? detail.params.senderName : null;

  return (
    <Modal
      open={!!detail}
      onCancel={close}
      title={sender ? `Thông báo từ ${sender}` : 'Thông báo'}
      footer={
        <Button type="primary" onClick={close}>
          Đóng
        </Button>
      }
      width={560}
    >
      {detail && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{formatFullTime(detail.createdAt)}</div>
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 15, fontWeight: 600 }}>
            {detail.title}
          </div>
          {detail.body && (
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 14, lineHeight: 1.6 }}>
              {detail.body}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
