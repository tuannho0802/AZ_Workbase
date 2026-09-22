'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { App, Button, Card, Spin, Typography } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useBroadcastCompose } from '@/lib/hooks/useBroadcastCompose';
import { BroadcastComposeFields } from '@/components/notifications/BroadcastComposeFields';

const { Title } = Typography;

/**
 * `/thong-bao/gui` (PLAN mục 7.7) — permission `notification_broadcasts.create`.
 *
 * ⚠️ ĐIỀU CHỈNH GIAO DIỆN (2026-09-22, phản hồi chủ dự án): trước đây trang
 * này chỉ là 1 Card `Empty` rỗng đứng sau, với `<Modal>` THẬT tự mở sẵn
 * (`useState(true)`) đè lên trên — vào trang là bị "giật" 1 modal bật lên,
 * đóng modal lại thì lộ ra trang trống trơn phía sau rất khó hiểu ("khá
 * phiền" theo đúng lời chủ dự án). Đổi cách làm: trang này KHÔNG dùng antd
 * `<Modal>` nữa — nội dung form nằm THẲNG trong 1 `Card` được style GIỐNG
 * hệt 1 Modal (thanh tiêu đề + khung bo góc/đổ bóng + thanh nút dưới cùng),
 * nhưng bản chất là nội dung trang bình thường, không có hành vi "tự bật
 * lên" nào cả — bấm vào `/thong-bao/gui` (menu/link) thấy ngay đúng cái
 * "hộp thoại" này, không còn khoảng trắng/nhấp nháy modal nữa.
 *
 * Logic soạn/gửi dùng chung với `SendBroadcastModal` (Modal thật ở nút
 * "Soạn thông báo mới" của `/thong-bao/da-gui`) qua `useBroadcastCompose` +
 * `BroadcastComposeFields` - sửa 1 chỗ, cả 2 nơi cùng đúng.
 */
export default function SendBroadcastEntryPage() {
  const { can, isLoading: permissionsLoading } = useMyPermissions();
  const { user } = useAuthStore();
  const router = useRouter();
  const { message } = App.useApp();

  useEffect(() => {
    if (!permissionsLoading && user && !can('notification_broadcasts.create')) {
      message.warning('Bạn không có quyền gửi thông báo thủ công');
      router.replace('/thong-bao');
    }
  }, [user, permissionsLoading, can, router, message]);

  const state = useBroadcastCompose({
    enabled: true,
    onSent: () => router.push('/thong-bao/da-gui'),
  });
  const { previewResult, dirtySincePreview, handleSend, sendPending, reset } = state;

  if (permissionsLoading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 620, margin: '0 auto' }}>
      {/*
        Card style GIỐNG Modal antd: bo góc 8px, đổ bóng, thanh tiêu đề +
        thanh nút dưới cùng có đường viền phân cách - KHÔNG phải Modal thật
        (không có overlay/backdrop, không "nổi" trên trang khác).
      */}
      <Card
        style={{ borderRadius: 8, boxShadow: '0 6px 16px -8px rgba(0,0,0,.12), 0 9px 28px 0 rgba(0,0,0,.05)' }}
        styles={{ body: { padding: 0 } }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '16px 24px',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <SendOutlined style={{ fontSize: 18, color: '#1890ff' }} />
          <Title level={5} style={{ margin: 0 }}>
            Soạn & gửi thông báo
          </Title>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <BroadcastComposeFields state={state} />
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '10px 16px',
            borderTop: '1px solid #f0f0f0',
          }}
        >
          <Button onClick={reset}>Huỷ</Button>
          <Button
            type="primary"
            loading={sendPending}
            disabled={!previewResult || dirtySincePreview || sendPending}
            onClick={handleSend}
          >
            {previewResult && !dirtySincePreview ? `Gửi tới ${previewResult.recipientCount} người` : 'Gửi'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
