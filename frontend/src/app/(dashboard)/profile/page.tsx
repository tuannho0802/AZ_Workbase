'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Card, Table, Button, Space, Tag, App,
  Spin, Typography, Avatar,
  Descriptions, Divider, Drawer, Row, Col,
} from 'antd';
import {
  ReloadOutlined,
  MailOutlined, PhoneOutlined, ApartmentOutlined, ClockCircleOutlined,
  CalendarOutlined, UserOutlined, EyeOutlined,
  LinkOutlined, CrownOutlined, TeamOutlined, ArrowRightOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import dayjs from 'dayjs';

import { useAuthStore } from '@/lib/stores/auth.store';
import { usersApi, UserDetail } from '@/lib/api/users.api';
import { useManagedByMe, useAllLinkGroups } from '@/lib/hooks/useLinkGroups';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { SimpleList } from '@/components/common/SimpleList';

const { Text, Title } = Typography;

const ROLE_COLOR: Record<string, string> = {
  admin: 'red', manager: 'orange', assistant: 'blue', employee: 'green',
};

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin', manager: 'Manager', assistant: 'Assistant', employee: 'Employee',
};

function getInitials(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1]?.[0]?.toUpperCase() ?? '?';
}

interface ManagedGroupRow {
  groupId: number;
  groupName: string;
  url?: string;
  categoryName?: string;
  categoryColor?: string;
  isPrimary: boolean;
}

// ── Danh sách nhóm (Fanpage/Group) mà 1 user đang là Quản lý chính/phụ ──────
// ⚠️ Đã bỏ hẳn Form.List chỉnh sửa thủ công (nhập tay URL) - dữ liệu này giờ
// HOÀN TOÀN tự động, lấy từ `LinkGroup.primaryManagerId` +
// `LinkGroupSecondaryManager` (xem GET /link-groups/managed-by-me). Muốn
// đổi ai quản lý nhóm nào -> vào trang "Nhóm tôi quản lý" (hoặc trang Admin
// "Quản lý nhóm liên kết" nếu là gán cho người khác), KHÔNG sửa trực tiếp ở
// đây nữa - tránh 2 nơi cùng sửa 1 dữ liệu dễ lệch nhau.
function ManagedGroupsSection({ groups }: { groups: ManagedGroupRow[] }) {
  return (
    <SimpleList
      dataSource={groups}
      rowKey={(g) => g.groupId}
      emptyText="Chưa được gán làm Quản lý chính/phụ của nhóm nào"
      renderMeta={(g) => ({
        avatar: (
          <Avatar
            icon={g.isPrimary ? <CrownOutlined /> : <TeamOutlined />}
            style={{ backgroundColor: g.isPrimary ? '#faad14' : '#1677ff' }}
          />
        ),
        title: (
          <Space wrap>
            <Text strong>{g.groupName}</Text>
            {g.categoryName && <Tag color={g.categoryColor}>{g.categoryName}</Tag>}
            {g.isPrimary ? (
              <Tag color="gold">Quản lý chính</Tag>
            ) : (
              <Tag color="blue">Quản lý phụ</Tag>
            )}
          </Space>
        ),
        description: g.url ? (
          <a href={g.url} target="_blank" rel="noopener noreferrer">
            <LinkOutlined /> {g.url}
          </a>
        ) : undefined,
      })}
    />
  );
}

// ── Trang Profile kiểu "cổng thông tin" cho 1 user ──────────────────────────
function ProfilePortal({ userId }: { userId: number }) {
  const { message } = App.useApp();
  const { user: currentUser } = useAuthStore();
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [detail, setDetail] = useState<UserDetail | null>(null);

  // GET /link-groups/managed-by-me: admin trả TOÀN BỘ nhóm trong hệ thống
  // (không chỉ của admin) -> phải tự lọc ở client theo đúng userId đang xem
  // (áp dụng luôn cho cả trường hợp tự xem mình - vô hại vì lúc đó mọi dòng
  // trả về vốn đã thuộc về mình sẵn). Giống hệt cách /nhom-toi-quan-ly làm.
  const { groups: managedGroups, isLoading: loadingManaged, refetch: refetchManaged } = useManagedByMe();
  const { groups: allGroups, isLoading: loadingAllGroups } = useAllLinkGroups();

  const isSelf = currentUser?.id === userId;

  const fetchDetail = async () => {
    setLoadingDetail(true);
    try {
      const res = isSelf ? await usersApi.getMe() : await usersApi.getUserDetail(userId);
      setDetail(res);
    } catch (err) {
      console.error(err);
      message.error('Lấy thông tin cá nhân thất bại');
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    fetchDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const groupRows: ManagedGroupRow[] = useMemo(() => {
    const detailById = new Map(allGroups.map((g) => [g.id, g]));
    return managedGroups
      .filter(
        (mg) =>
          mg.primaryManager?.id === userId ||
          mg.secondaryManagers.some((m) => m.id === userId),
      )
      .map((mg) => {
        const groupDetail = detailById.get(mg.groupId);
        return {
          groupId: mg.groupId,
          groupName: mg.groupName,
          url: groupDetail?.url,
          categoryName: groupDetail?.category?.name,
          categoryColor: groupDetail?.category?.color,
          isPrimary: mg.primaryManager?.id === userId,
        };
      });
  }, [managedGroups, allGroups, userId]);

  const loadingGroups = loadingManaged || loadingAllGroups;

  if (loadingDetail || !detail) {
    return (
      <div className="flex justify-center items-center my-10 py-10">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      {/* ── Header: Avatar + tên + tags ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <Avatar size={72} style={{ backgroundColor: '#1677ff', fontSize: 28 }}>
          {getInitials(detail.name)}
        </Avatar>
        <div>
          <Title level={4} style={{ margin: 0 }}>{detail.name}</Title>
          <Space style={{ marginTop: 6 }}>
            <Tag color={ROLE_COLOR[detail.role] ?? 'default'}>
              {(ROLE_LABEL[detail.role] ?? detail.role)?.toUpperCase()}
            </Tag>
            <Tag color={detail.isActive ? 'green' : 'red'}>
              {detail.isActive ? 'Đang hoạt động' : 'Bị khóa'}
            </Tag>
          </Space>
        </div>
      </div>

      {/* ── Thông tin cá nhân ── */}
      <Descriptions
        bordered
        column={{ xs: 1, sm: 1, md: 2 }}
        size="middle"
      >
        <Descriptions.Item label={<><MailOutlined /> Email</>}>
          {detail.email}
        </Descriptions.Item>
        <Descriptions.Item label={<><PhoneOutlined /> Số điện thoại</>}>
          {detail.phone || <Text type="secondary">Chưa cập nhật</Text>}
        </Descriptions.Item>
        <Descriptions.Item label={<><ApartmentOutlined /> Phòng ban</>}>
          {detail.department?.name || <Text type="secondary">Chưa có phòng ban</Text>}
        </Descriptions.Item>
        <Descriptions.Item label={<><CalendarOutlined /> Ngày tham gia</>}>
          {dayjs(detail.createdAt).format('DD/MM/YYYY')}
        </Descriptions.Item>
        <Descriptions.Item label={<><ClockCircleOutlined /> Đăng nhập gần nhất</>}>
          {detail.lastLoginAt
            ? dayjs(detail.lastLoginAt).format('DD/MM/YYYY HH:mm')
            : <Text type="secondary">Chưa đăng nhập</Text>}
        </Descriptions.Item>
        <Descriptions.Item label={<><UserOutlined /> Phép năm còn lại</>}>
          {detail.annualLeaveBalance} / {detail.annualLeaveTotal} ngày (năm {detail.leaveYear})
        </Descriptions.Item>
        <Descriptions.Item label="Phép bù tích lũy" span={2}>
          {detail.compensatoryLeaveBalance} ngày
        </Descriptions.Item>
      </Descriptions>

      <Divider titlePlacement="left" style={{ marginTop: 32 }}>
        <Space>
          Fanpage / Group đang quản lý
        </Space>
      </Divider>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <Space>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => refetchManaged()}>
            Tải lại
          </Button>
          {isSelf && (
            <Link href="/nhom-toi-quan-ly">
              <Button size="small" type="link" icon={<ArrowRightOutlined />}>
                Quản lý Quản lý phụ tại &quot;Nhóm tôi quản lý&quot;
              </Button>
            </Link>
          )}
        </Space>
      </div>

      {loadingGroups ? (
        <div className="flex justify-center items-center my-6 py-6">
          <Spin />
        </div>
      ) : (
        <ManagedGroupsSection groups={groupRows} />
      )}
    </div>
  );
}

// ── Chế độ xem nhiều người: danh sách nhân viên (trái) + Profile chi tiết (phải) ──
// Hiện ra cho bất kỳ role nào có permission `users.view` (Admin/Assistant/
// Manager theo mặc định - xem migration RBAC), KHÔNG còn hardcode "chỉ
// Admin" như trước. Danh sách trả về đã tự lọc đúng phạm vi (department cho
// Manager) ở BE, xem fetchUsers() bên dưới.
function AdminProfileManager() {
  const { message } = App.useApp();
  const { user: currentUser } = useAuthStore();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // ⚠️ FIX BUG THẬT: trước đây dùng usersApi.getUsersList() -> GET
      // /users/all - endpoint này CỐ TÌNH không áp filter phạm vi (dùng cho
      // dropdown chọn nhân viên ở khắp nơi), nên Manager xem "Quản lý
      // Profile nhân viên" sẽ thấy TOÀN BỘ nhân viên công ty, không chỉ
      // phòng ban mình quản lý - bấm vào người ngoài phạm vi sẽ bị BE chặn
      // 403 ở bước sau (GET /users/:id yêu cầu users.view có scope đúng).
      // Đổi sang usersApi.getUsers() -> GET /users (đã áp
      // UsersAccessHelper.applyViewFilter() ở BE) - danh sách hiện ra khớp
      // 100% phạm vi thật, không còn trường hợp click vào rồi mới báo lỗi.
      const res = await usersApi.getUsers({ limit: 100 });
      setUsers(res?.data || []);
      // Desktop: mặc định chọn sẵn chính người đang đăng nhập
      if (!isMobile && !selectedUserId && currentUser) {
        setSelectedUserId(currentUser.id);
      }
    } catch (err) {
      console.error(err);
      message.error('Lấy danh sách nhân viên thất bại');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectUser = (id: number) => {
    setSelectedUserId(id);
    if (isMobile) setDrawerOpen(true);
  };

  const columns: any[] = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: 'Họ tên', dataIndex: 'name', key: 'name' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: 'Chức vụ',
      dataIndex: 'role',
      render: (role: string) => (
        <Tag color={ROLE_COLOR[role] ?? 'default'}>{role?.toUpperCase()}</Tag>
      ),
    },
    {
      title: 'Phòng ban',
      dataIndex: ['department', 'name'],
      render: (val: any) => val || '-',
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: any, record: any) => (
        <Button icon={<EyeOutlined />} onClick={() => handleSelectUser(record.id)}>
          Xem Profile
        </Button>
      ),
    },
  ];

  if (isMobile) {
    return (
      <Card
        title="Quản lý Profile nhân viên"
        extra={
          <Button icon={<ReloadOutlined />} onClick={fetchUsers} loading={loading} size="small" />
        }
      >
        {loading && users.length === 0 ? (
          <div className="flex justify-center items-center my-10 py-10">
            <Spin size="large" />
          </div>
        ) : (
          users.map((u) => (
            <Card
              key={u.id}
              size="small"
              style={{ marginBottom: 10, cursor: 'pointer' }}
              onClick={() => handleSelectUser(u.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{u.name}</div>
                  <Text style={{ fontSize: 12, color: '#8c8c8c' }}>{u.email}</Text>
                  <div style={{ marginTop: 4 }}>
                    <Tag color={ROLE_COLOR[u.role] ?? 'default'}>{u.role?.toUpperCase()}</Tag>
                  </div>
                </div>
                <EyeOutlined style={{ fontSize: 16, color: '#8c8c8c' }} />
              </div>
            </Card>
          ))
        )}

        <Drawer
          title="Profile nhân viên"
          placement="right"
          size="100%"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          destroyOnHidden
        >
          {selectedUserId && <ProfilePortal userId={selectedUserId} />}
        </Drawer>
      </Card>
    );
  }

  return (
    <Row gutter={16}>
      <Col span={9}>
        <Card
          title="Danh sách nhân viên"
          extra={
            <Button icon={<ReloadOutlined />} onClick={fetchUsers} loading={loading} size="small" />
          }
          styles={{ body: { padding: 0 } }}
        >
          <Table
            columns={columns.filter((c) => c.key !== 'action').concat([
              {
                title: '',
                key: 'action',
                width: 40,
                render: (_: any, record: any) => (
                  <Button
                    type={selectedUserId === record.id ? 'primary' : 'default'}
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => handleSelectUser(record.id)}
                  />
                ),
              },
            ])}
            dataSource={users}
            rowKey="id"
            loading={loading}
            size="small"
            pagination={{ pageSize: 10 }}
            onRow={(record) => ({
              onClick: () => handleSelectUser(record.id),
              style: {
                cursor: 'pointer',
                background: selectedUserId === record.id ? '#e6f4ff' : undefined,
              },
            })}
          />
        </Card>
      </Col>
      <Col span={15}>
        <Card title="Profile chi tiết">
          {selectedUserId ? (
            <ProfilePortal userId={selectedUserId} />
          ) : (
            <Text type="secondary">Chọn 1 nhân viên bên trái để xem Profile</Text>
          )}
        </Card>
      </Col>
    </Row>
  );
}

// ── Entry point ──────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { user } = useAuthStore();
  const { can, isLoading: loadingPermissions } = useMyPermissions();

  if (!user) return null;

  // ⚠️ FIX BUG THẬT (đúng câu hỏi rà soát): trước đây gate cứng
  // `user.role === 'admin'` - Manager/Assistant dù BE đã cấp quyền
  // `users.view` (xem GET /users/:id ở users.controller.ts) vẫn bị rớt
  // xuống nhánh "chỉ xem profile của chính mình", không dùng được tính năng
  // họ thực sự có quyền. Đợi permission tải xong trước khi quyết định (an
  // toàn: "chưa biết thì coi như chưa có quyền", tránh nhấp nháy UI).
  if (loadingPermissions) {
    return (
      <div className="flex justify-center items-center my-10 py-10">
        <Spin size="large" />
      </div>
    );
  }

  if (can('users.view')) {
    return <AdminProfileManager />;
  }

  return (
    <Card title="Profile của tôi">
      <ProfilePortal userId={user.id} />
    </Card>
  );
}