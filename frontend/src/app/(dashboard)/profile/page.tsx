'use client';

import { useState, useEffect } from 'react';
import {
  Card, Table, Button, Space, Tag, App, Form,
  Input, Select, Spin, Typography, Empty, List, Avatar, Tooltip,
  Descriptions, Divider, Drawer, Row, Col,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, SaveOutlined,
  FacebookOutlined, TeamOutlined, LinkOutlined, ReloadOutlined,
  MailOutlined, PhoneOutlined, ApartmentOutlined, ClockCircleOutlined,
  CalendarOutlined, UserOutlined, EyeOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

import { useAuthStore } from '@/lib/stores/auth.store';
import { usersApi, ManagedLink, UserDetail } from '@/lib/api/users.api';

const { Text, Title, Link: TypoLink } = Typography;

const ROLE_COLOR: Record<string, string> = {
  admin: 'red', manager: 'orange', assistant: 'blue', employee: 'green',
};

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin', manager: 'Manager', assistant: 'Assistant', employee: 'Employee',
};

const LINK_TYPE_LABEL: Record<string, string> = {
  fanpage: 'Fanpage',
  group: 'Group',
};

function getInitials(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1]?.[0]?.toUpperCase() ?? '?';
}

// ── Danh sách link đọc (read-only) ─────────────────────────────────────────
function ManagedLinksReadOnly({ links }: { links: ManagedLink[] }) {
  if (!links || links.length === 0) {
    return (
      <Empty
        description="Chưa có Fanpage/Group nào được gán"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        style={{ padding: '16px 0' }}
      />
    );
  }

  return (
    <List
      itemLayout="horizontal"
      dataSource={links}
      renderItem={(link) => (
        <List.Item>
          <List.Item.Meta
            avatar={
              <Avatar
                icon={link.type === 'fanpage' ? <FacebookOutlined /> : <TeamOutlined />}
                style={{
                  backgroundColor: link.type === 'fanpage' ? '#1877f2' : '#52c41a',
                }}
              />
            }
            title={
              <Space>
                <Text strong>{link.name}</Text>
                <Tag color={link.type === 'fanpage' ? 'blue' : 'green'}>
                  {LINK_TYPE_LABEL[link.type] ?? link.type}
                </Tag>
              </Space>
            }
            description={
              <TypoLink href={link.url} target="_blank" rel="noopener noreferrer">
                <LinkOutlined /> {link.url}
              </TypoLink>
            }
          />
        </List.Item>
      )}
    />
  );
}

// ── Danh sách link editable (Form.List - chỉ Admin) ─────────────────────────
function ManagedLinksEditor({
  initialLinks,
  onSave,
  saving,
}: {
  initialLinks: ManagedLink[];
  onSave: (links: ManagedLink[]) => void;
  saving: boolean;
}) {
  const [form] = Form.useForm();

  useEffect(() => {
    form.setFieldsValue({ profile: initialLinks || [] });
  }, [initialLinks, form]);

  return (
    <Form form={form} layout="vertical" onFinish={(values) => onSave(values.profile || [])}>
      <Form.List name="profile">
        {(fields, { add, remove }) => (
          <>
            {fields.length === 0 && (
              <Empty
                description="Chưa có link nào. Bấm 'Thêm link' để bắt đầu."
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                style={{ marginBottom: 16 }}
              />
            )}
            {fields.map(({ key, name, ...restField }) => (
              <Space
                key={key}
                align="baseline"
                wrap
                style={{ display: 'flex', marginBottom: 8, width: '100%' }}
              >
                <Form.Item
                  {...restField}
                  name={[name, 'type']}
                  rules={[{ required: true, message: 'Chọn loại' }]}
                  initialValue="fanpage"
                >
                  <Select style={{ width: 110 }}>
                    <Select.Option value="fanpage">Fanpage</Select.Option>
                    <Select.Option value="group">Group</Select.Option>
                  </Select>
                </Form.Item>
                <Form.Item
                  {...restField}
                  name={[name, 'name']}
                  rules={[{ required: true, message: 'Nhập tên' }]}
                >
                  <Input placeholder="Tên hiển thị" style={{ width: 180 }} />
                </Form.Item>
                <Form.Item
                  {...restField}
                  name={[name, 'url']}
                  rules={[
                    { required: true, message: 'Nhập URL' },
                    { type: 'url', message: 'URL không hợp lệ' },
                  ]}
                >
                  <Input placeholder="https://facebook.com/..." style={{ width: 240 }} />
                </Form.Item>
                <Tooltip title="Xoá link này">
                  <Button
                    danger
                    type="text"
                    icon={<DeleteOutlined />}
                    onClick={() => remove(name)}
                  />
                </Tooltip>
              </Space>
            ))}
            <Form.Item>
              <Button
                type="dashed"
                onClick={() => add({ type: 'fanpage', name: '', url: '' })}
                icon={<PlusOutlined />}
                block
              >
                Thêm link
              </Button>
            </Form.Item>
          </>
        )}
      </Form.List>
      <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
        <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={saving}>
          Lưu thay đổi
        </Button>
      </Form.Item>
    </Form>
  );
}

// ── Trang Profile kiểu "cổng thông tin" cho 1 user ──────────────────────────
function ProfilePortal({
  userId,
  canEditLinks,
}: {
  userId: number;
  canEditLinks: boolean;
}) {
  const { message } = App.useApp();
  const { user: currentUser } = useAuthStore();
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [loadingLinks, setLoadingLinks] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [links, setLinks] = useState<ManagedLink[]>([]);

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

  const fetchLinks = async () => {
    setLoadingLinks(true);
    try {
      const res = await usersApi.getUserProfile(userId);
      setLinks(res.profile || []);
    } catch (err) {
      console.error(err);
      message.error('Lấy danh sách Fanpage/Group thất bại');
    } finally {
      setLoadingLinks(false);
    }
  };

  useEffect(() => {
    fetchDetail();
    fetchLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handleSaveLinks = async (newLinks: ManagedLink[]) => {
    setSaving(true);
    try {
      await usersApi.updateUserProfile(userId, newLinks);
      setLinks(newLinks);
      message.success('Đã cập nhật Fanpage/Group');
    } catch (error: any) {
      const errorData = error.response?.data;
      if (errorData?.message) {
        if (Array.isArray(errorData.message)) {
          errorData.message.forEach((msg: string) => message.error(msg));
        } else {
          message.error(errorData.message);
        }
      } else {
        message.error('Có lỗi xảy ra khi lưu Fanpage/Group');
      }
    } finally {
      setSaving(false);
    }
  };

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
        Fanpage / Group quản lý
      </Divider>

      {loadingLinks ? (
        <div className="flex justify-center items-center my-6 py-6">
          <Spin />
        </div>
      ) : canEditLinks ? (
        <ManagedLinksEditor initialLinks={links} onSave={handleSaveLinks} saving={saving} />
      ) : (
        <ManagedLinksReadOnly links={links} />
      )}
    </div>
  );
}

// ── Chế độ Admin: danh sách nhân viên (trái) + Profile chi tiết (phải) ──────
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
      const res = await usersApi.getUsersList();
      setUsers(res || []);
      // Desktop: mặc định chọn sẵn chính Admin đang đăng nhập
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
          width="100%"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          destroyOnClose
        >
          {selectedUserId && (
            <ProfilePortal userId={selectedUserId} canEditLinks />
          )}
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
            <ProfilePortal userId={selectedUserId} canEditLinks />
          ) : (
            <Empty description="Chọn 1 nhân viên bên trái để xem Profile" />
          )}
        </Card>
      </Col>
    </Row>
  );
}

// ── Entry point ──────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { user } = useAuthStore();

  if (!user) return null;

  if (user.role === 'admin') {
    return <AdminProfileManager />;
  }

  return (
    <Card title="Profile của tôi">
      <ProfilePortal userId={user.id} canEditLinks={false} />
    </Card>
  );
}
