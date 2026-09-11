'use client';

import { useRouter } from 'next/navigation';
import { Typography, Row, Col, Card, Space, Tag, Avatar, Skeleton } from 'antd';
import { RightOutlined, BankOutlined, IdcardOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/lib/stores/auth.store';
import { getVisibleNavItems } from '@/lib/nav-config';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useSidebarBadgeCounts } from '@/lib/hooks/useSidebarBadgeCounts';
import { useRoleColors } from '@/lib/hooks/useRoleColorMap';
import { useDepartments } from '@/lib/hooks/useDepartments';
import { usePositions } from '@/lib/hooks/usePositions';
import { useMe } from '@/lib/hooks/useMe';
import { resolveEntityColor } from '@/lib/utils/entityColor';
import { CountBadge } from '@/components/common/CountBadge';

const { Title, Text, Paragraph } = Typography;

export default function HomePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { can } = useMyPermissions();
  const badgeCounts = useSidebarBadgeCounts();

  // Cùng 1 danh sách + role-gate với Sidebar (lib/nav-config.tsx) - "sidebar
  // có gì thì trang chủ có đó" theo đúng yêu cầu, không định nghĩa lại.
  const items = getVisibleNavItems(user?.role, can);

  // ── Trang trí lại khối chào mừng: Tag màu Vai trò/Phòng ban/Vị trí ──
  // Trước đây chỉ có 1 dòng text xám ("Employee") lấy tên role từ map
  // `ROLE_LABEL` HARDCODE ngay trong file này - không đồng bộ màu/tên với
  // phần còn lại của app (đã migrate qua `useRoleColorMap()` từ lâu, xem
  // JSDoc đầy đủ ở `useRoleColorMap.ts`: layout.tsx/users/profile/
  // audit-logs/SalesUserSelect đều đã đổi, riêng trang này bị bỏ sót), và
  // hoàn toàn không hiện Phòng ban/Vị trí dù dữ liệu đã có sẵn ở nơi khác
  // trong app (CustomerFilters.tsx, phong-ban/vi-tri page...).
  //
  // 3 nguồn dữ liệu dùng chung, đều là API KHÔNG cần permission riêng (an
  // toàn gọi ở Trang chủ - mọi user đăng nhập đều thấy, không được phép gây
  // toast lỗi 403 nền như vụ `useRoles()` cũ, xem cảnh báo ở useRoleColorMap.ts):
  // - `useRoleColors()` -> GET /roles/colors (tên + màu Role thật, không còn
  //   map cứng 4 role hệ thống, role tuỳ chỉnh cũng lên đúng màu).
  // - `useDepartments()`/`usePositions()` -> GET /departments, /positions
  //   (đều CỐ Ý không gắn permission riêng, xem JSDoc ở 2 controller BE) -
  //   dùng để tra `color` thật của phòng ban/vị trí theo id (authStore chỉ
  //   có {id, name}, không có color).
  // - `useMe()` (MỚI) -> GET /users/me riêng cho trang này, vì
  //   `authStore.user.position` KHÔNG được vòng tự-lành ở layout.tsx merge
  //   lại (chỉ merge avatarUrl/avatarKey/isRootAdmin) - đọc thẳng authStore
  //   có thể thiếu Vị trí dù Admin vừa gán. `department` thì authStore đã đủ
  //   tin cậy, nhưng vẫn ưu tiên `me` nếu có để 1 nguồn sự thật duy nhất.
  const { roleColors } = useRoleColors();
  const { departments } = useDepartments();
  const { positions } = usePositions();
  const { me, isLoading: meLoading } = useMe();

  const roleInfo = roleColors.find((r) => r.code === user?.role);
  const roleName = roleInfo?.name || user?.role || '';
  const roleColor = resolveEntityColor(roleInfo?.color);

  const departmentId = me?.department?.id ?? user?.department?.id;
  const departmentName = me?.department?.name ?? user?.department?.name;
  const departmentColor = resolveEntityColor(
    departments.find((d) => d.id === departmentId)?.color,
  );

  const positionId = me?.position?.id;
  const positionName = me?.position?.name;
  const positionColor = resolveEntityColor(
    positions.find((p) => p.id === positionId)?.color,
  );

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 24,
          padding: '20px 24px',
          borderRadius: 12,
          background: 'linear-gradient(135deg, #f0f7ff 0%, #fafcff 100%)',
          border: '1px solid #e6f0ff',
        }}
      >
        <Avatar
          size={56}
          style={{ backgroundColor: roleColor, fontSize: 22, flexShrink: 0 }}
        >
          {user?.name?.[0]?.toUpperCase()}
        </Avatar>
        <div style={{ minWidth: 0 }}>
          <Title level={3} style={{ marginBottom: 6 }}>
            Chào mừng trở lại, {user?.name}!
          </Title>
          {meLoading && !me ? (
            <Skeleton.Button active size="small" style={{ width: 220 }} />
          ) : (
            <Space size={[8, 8]} wrap>
              {user?.role && (
                <Tag color={roleColor} style={{ marginInlineEnd: 0 }}>
                  {roleName}
                </Tag>
              )}
              {departmentName && (
                <Tag
                  color={departmentColor}
                  icon={<BankOutlined />}
                  style={{ marginInlineEnd: 0 }}
                >
                  {departmentName}
                </Tag>
              )}
              {positionName && (
                <Tag
                  color={positionColor}
                  icon={<IdcardOutlined />}
                  style={{ marginInlineEnd: 0 }}
                >
                  {positionName}
                </Tag>
              )}
            </Space>
          )}
        </div>
      </div>

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
                  <CountBadge count={badgeCounts[item.key]}>
                    <Text strong style={{ fontSize: 15 }}>
                      {item.label}
                    </Text>
                  </CountBadge>
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