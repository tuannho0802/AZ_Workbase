'use client';

import { useRouter } from 'next/navigation';
import { Typography, Row, Col, Card } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/lib/stores/auth.store';
import { getVisibleNavItems } from '@/lib/nav-config';

const { Title, Text, Paragraph } = Typography;

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  assistant: 'Assistant',
  manager: 'Manager',
  employee: 'Employee',
};

export default function HomePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  // Cùng 1 danh sách + role-gate với Sidebar (lib/nav-config.tsx) - "sidebar
  // có gì thì trang chủ có đó" theo đúng yêu cầu, không định nghĩa lại.
  const items = getVisibleNavItems(user?.role);

  return (
    <div>
      <Title level={3} style={{ marginBottom: 4 }}>
        Chào mừng trở lại, {user?.name}!
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 24 }}>
        {ROLE_LABEL[user?.role || ''] || user?.role}
        {user?.department?.name ? ` · ${user.department.name}` : ''}
      </Paragraph>

      <Row gutter={[16, 16]}>
        {items.map((item) => (
          <Col xs={24} sm={12} lg={8} xl={6} key={item.key}>
            <Card
              hoverable
              onClick={() => router.push(item.path)}
              styles={{ body: { padding: 20 } }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div
                  style={{
                    fontSize: 22,
                    color: '#1677ff',
                    lineHeight: 1,
                    marginTop: 2,
                  }}
                >
                  {item.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text strong style={{ fontSize: 15 }}>
                    {item.label}
                  </Text>
                  <Paragraph
                    type="secondary"
                    style={{ margin: '4px 0 0', fontSize: 13 }}
                  >
                    {item.description}
                  </Paragraph>
                </div>
                <RightOutlined style={{ color: '#bfbfbf', marginTop: 4 }} />
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}