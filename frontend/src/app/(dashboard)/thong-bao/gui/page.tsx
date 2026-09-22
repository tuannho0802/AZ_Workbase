'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { App, Card, Empty, Typography } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useAuthStore } from '@/lib/stores/auth.store';
import { SendBroadcastModal } from '@/components/notifications/SendBroadcastModal';

const { Text } = Typography;

/**
 * `/thong-bao/gui` (PLAN mục 7.7) — permission `notification_broadcasts.create`.
 * Chỉ là điểm vào có gate quyền, mở sẵn `SendBroadcastModal` (Modal soạn &
 * gửi dùng chung với nút "Soạn thông báo mới" ở `/thong-bao/da-gui`).
 *
 * ⚠️ Trước đây nội dung file này từng bị lẫn với trang "Thông báo đã gửi"
 * (bảng lịch sử + Drawer) — đã tách lại đúng theo PLAN, phần bảng lịch sử
 * chuyển về `/thong-bao/da-gui/page.tsx`.
 */
export default function SendBroadcastEntryPage() {
  const { can, isLoading: permissionsLoading } = useMyPermissions();
  const { user } = useAuthStore();
  const router = useRouter();
  const { message } = App.useApp();

  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!permissionsLoading && user && !can('notification_broadcasts.create')) {
      message.warning('Bạn không có quyền gửi thông báo thủ công');
      router.replace('/thong-bao');
    }
  }, [user, permissionsLoading, can, router, message]);

  if (permissionsLoading) return null;

  return (
    <div style={{ padding: 24 }}>
      <Card>
        <Empty
          image={<SendOutlined style={{ fontSize: 48, color: '#1890ff' }} />}
          description={
            <Text type="secondary">
              Soạn thông báo thủ công gửi tới người dùng, phòng ban, hoặc toàn bộ nhân viên.
            </Text>
          }
        >
          <a onClick={() => setOpen(true)}>Mở lại form soạn thông báo</a>
        </Empty>
      </Card>

      <SendBroadcastModal
        open={open}
        onClose={() => setOpen(false)}
        onSent={() => {
          router.push('/thong-bao/da-gui');
        }}
      />
    </div>
  );
}
