'use client';

import { Avatar, Button, Modal, Typography } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { useNotificationUiStore } from '@/lib/stores/notification-ui.store';
import { formatFullTime } from '@/lib/utils/relative-time';

const { Title, Text, Paragraph } = Typography;

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
      title="Chi tiết thông báo"
      footer={
        <Button type="primary" onClick={close}>
          Đóng
        </Button>
      }
      width={560}
    >
      {detail && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Người gửi + thời gian - tách riêng khỏi tiêu đề để luôn rõ
             "ai gửi" dù senderName vắng (thông báo hệ thống/tự động cũ). */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar size={36} icon={<UserOutlined />} style={{ backgroundColor: '#1890ff', flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
              <Text style={{ fontSize: 13, color: '#64748b' }}>Người gửi</Text>
              <Text strong style={{ fontSize: 14 }}>
                {sender ?? 'Hệ thống'}
              </Text>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8', alignSelf: 'flex-start' }}>
              {formatFullTime(detail.createdAt)}
            </div>
          </div>

          {/* Tiêu đề - nổi bật rõ ràng, tách khỏi nội dung. */}
          <Title level={5} style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {detail.title}
          </Title>

          {/* Nội dung - đặt trong khung riêng để phân biệt rõ với tiêu đề. */}
          {detail.body && (
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #eef2f7',
                borderRadius: 8,
                padding: '12px 14px',
              }}
            >
              <Paragraph
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: 14,
                  lineHeight: 1.7,
                }}
              >
                {detail.body}
              </Paragraph>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}