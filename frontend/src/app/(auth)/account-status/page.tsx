'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, Button, Typography, Space } from 'antd';
import {
  ClockCircleOutlined,
  CloseCircleOutlined,
  LockOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';

const { Title, Paragraph } = Typography;

type StatusKind = 'pending' | 'rejected' | 'locked' | 'generic';

// Đoán loại trạng thái từ NỘI DUNG message thật của backend (không hardcode
// message riêng ở FE) - để luôn khớp đúng lý do thật, kể cả khi BE đổi câu
// chữ sau này (message hiển thị vẫn lấy nguyên văn từ BE, phần "đoán loại"
// chỉ quyết định icon/màu sắc cho đẹp, không ảnh hưởng tính đúng đắn).
function detectStatusKind(message: string): StatusKind {
  const lower = message.toLowerCase();
  if (lower.includes('chờ') || lower.includes('duyệt')) return 'pending';
  if (lower.includes('từ chối')) return 'rejected';
  if (lower.includes('khóa') || lower.includes('khoá')) return 'locked';
  return 'generic';
}

const STATUS_CONFIG: Record<
  StatusKind,
  { icon: React.ReactNode; color: string; title: string }
> = {
  pending: {
    icon: <ClockCircleOutlined style={{ fontSize: 56, color: '#faad14' }} />,
    color: '#faad14',
    title: 'Đang chờ duyệt',
  },
  rejected: {
    icon: <CloseCircleOutlined style={{ fontSize: 56, color: '#ff4d4f' }} />,
    color: '#ff4d4f',
    title: 'Yêu cầu bị từ chối',
  },
  locked: {
    icon: <LockOutlined style={{ fontSize: 56, color: '#ff4d4f' }} />,
    color: '#ff4d4f',
    title: 'Tài khoản bị khóa',
  },
  generic: {
    icon: <InfoCircleOutlined style={{ fontSize: 56, color: '#1677ff' }} />,
    color: '#1677ff',
    title: 'Thông báo',
  },
};

function AccountStatusContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const message =
    searchParams.get('message') || 'Tài khoản của bạn hiện chưa thể đăng nhập.';
  const kind = detectStatusKind(message);
  const config = STATUS_CONFIG[kind];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <Card className="w-full max-w-md" style={{ textAlign: 'center' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {config.icon}
          <div>
            <Title level={3} style={{ color: config.color, marginBottom: 8 }}>
              {config.title}
            </Title>
            <Paragraph style={{ fontSize: 15, color: '#595959' }}>{message}</Paragraph>
          </div>
          <Button type="primary" size="large" block onClick={() => router.push('/login')}>
            Quay lại đăng nhập
          </Button>
        </Space>
      </Card>
    </div>
  );
}

// Bọc Suspense - bắt buộc cho useSearchParams() trong Next.js App Router,
// nếu không `next build` sẽ lỗi và chặn deploy Vercel.
export default function AccountStatusPage() {
  return (
    <Suspense fallback={null}>
      <AccountStatusContent />
    </Suspense>
  );
}
