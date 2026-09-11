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

// Style dùng chung cho các Tag ở hàng Role/Phòng ban/Vị trí để đảm bảo
// padding, border-radius, font-weight đồng nhất giữa 3 tag (trước đây mỗi
// tag một icon/khác nhau khiến chiều cao/padding lệch nhau, nhìn "rối").
const infoTagStyle: React.CSSProperties = {
  marginInlineEnd: 0,
  padding: '2px 10px',
  borderRadius: 6,
  fontWeight: 500,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  lineHeight: '20px',
};

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
          gap: 18,
          marginBottom: 24,
          padding: '22px 26px',
          borderRadius: 14,
          background: 'linear-gradient(135deg, #f0f7ff 0%, #fafcff 100%)',
          border: '1px solid #e6f0ff',
          boxShadow: '0 2px 8px rgba(22, 119, 255, 0.05)',
        }}
      >
        <Avatar
          size={56}
          style={{
            backgroundColor: roleColor,
            fontSize: 22,
            fontWeight: 600,
            flexShrink: 0,
            boxShadow: `0 2px 6px ${roleColor}55`,
          }}
        >
          {user?.name?.[0]?.toUpperCase()}
        </Avatar>

        <div style={{ minWidth: 0 }}>
          <Title
            level={3}
            style={{
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 10,
              lineHeight: 1.4,
            }}
          >
            <span>Chào mừng trở lại,</span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 12px',
                borderRadius: 999,
                background: '#ffffff',
                border: `1px solid ${roleColor}`,
                fontWeight: 700,
                fontSize: 16,
                color: roleColor,
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              }}
            >
              {user?.name}
            </span>
            <span>!</span>
          </Title>

          <div style={{ marginTop: 10 }}>
            {meLoading && !me ? (
              <Skeleton.Button active size="small" style={{ width: 220 }} />
            ) : (
                // "Layer" nền trắng bên dưới nhóm Tag - Tag màu tuỳ ý (có thể
                // rất nhạt, vd xanh lá non) nằm trực tiếp trên nền gradient nhạt
                // của khối chào mừng dễ bị chìm/khó đọc chữ (báo qua ảnh chụp).
                // Bọc thêm 1 lớp nền trắng đục phía sau để chữ Tag luôn tương
                // phản tốt, bất kể Tag đó màu gì. Đồng thời dùng chung
                // `infoTagStyle` cho cả 3 tag để padding/bo góc/độ đậm chữ đều
                // nhau (trước đây lệch nhau do tag có/không có icon).
                <div
                  style={{
                    display: 'inline-block',
                    padding: '7px 10px',
                    borderRadius: 10,
                    background: 'rgba(255, 255, 255, 0.85)',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                  }}
                >
                  <Space size={[8, 8]} wrap>
                    {user?.role && (
                      <Tag color={roleColor} style={infoTagStyle}>
                        {roleName}
                      </Tag>
                    )}
                    {departmentName && (
                      <Tag
                        color={departmentColor}
                        icon={<BankOutlined />}
                        style={infoTagStyle}
                      >
                        {departmentName}
                      </Tag>
                    )}
                    {positionName && (
                      <Tag
                        color={positionColor}
                        icon={<IdcardOutlined />}
                        style={infoTagStyle}
                      >
                        {positionName}
                      </Tag>
                    )}
                  </Space>
                </div>
            )}
          </div>
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