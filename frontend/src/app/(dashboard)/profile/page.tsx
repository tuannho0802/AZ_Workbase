'use client';

import { useState, useEffect } from 'react';
import {
  Card, Table, Button, Space, Tag, App, Modal, Form,
  Input, Select, Spin, Typography, Empty, List, Avatar, Tooltip, Alert,
} from 'antd';
import {
  EditOutlined, PlusOutlined, DeleteOutlined,
  FacebookOutlined, TeamOutlined, LinkOutlined, ReloadOutlined,
} from '@ant-design/icons';

import { useAuthStore } from '@/lib/stores/auth.store';
import { usersApi, ManagedLink } from '@/lib/api/users.api';

const { Text, Link: TypoLink } = Typography;

const ROLE_COLOR: Record<string, string> = {
  admin: 'red', manager: 'orange', assistant: 'blue', employee: 'green',
};

const LINK_TYPE_LABEL: Record<string, string> = {
  fanpage: 'Fanpage',
  group: 'Group',
};

// ── Danh sách link (dùng chung cho cả 2 chế độ xem/sửa) ────────────────────
function ManagedLinksList({ links }: { links: ManagedLink[] }) {
  if (!links || links.length === 0) {
    return (
      <Empty
        description="Chưa có Fanpage/Group nào được gán"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        style={{ padding: '24px 0' }}
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

// ── Chế độ xem của CHÍNH MÌNH (All roles) ───────────────────────────────────
function MyProfileView({ userId }: { userId: number }) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [links, setLinks] = useState<ManagedLink[]>([]);

  const fetchMyProfile = async () => {
    setLoading(true);
    try {
      const res = await usersApi.getUserProfile(userId);
      setLinks(res.profile || []);
    } catch (err) {
      console.error(err);
      message.error('Lấy thông tin profile thất bại');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return (
    <Card
      title="Fanpage / Group tôi quản lý"
      extra={
        <Button icon={<ReloadOutlined />} onClick={fetchMyProfile} loading={loading}>
          Làm mới
        </Button>
      }
    >
      <Alert
        type="info"
        showIcon
        message="Danh sách này chỉ Admin mới có thể chỉnh sửa. Liên hệ Admin nếu cần cập nhật."
        style={{ marginBottom: 16 }}
      />
      {loading ? (
        <div className="flex justify-center items-center my-10 py-10">
          <Spin size="large" />
        </div>
      ) : (
        <ManagedLinksList links={links} />
      )}
    </Card>
  );
}

// ── Chế độ quản lý TOÀN BỘ user (Chỉ Admin) ─────────────────────────────────
function AdminProfileManager() {
  const { message } = App.useApp();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [form] = Form.useForm();

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
    } catch (err) {
      console.error(err);
      message.error('Lấy danh sách nhân viên thất bại');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const openManage = async (record: any) => {
    setEditingUser(record);
    setIsModalOpen(true);
    setModalLoading(true);
    try {
      const res = await usersApi.getUserProfile(record.id);
      form.setFieldsValue({ profile: res.profile || [] });
    } catch (err) {
      console.error(err);
      message.error('Lấy profile của nhân viên thất bại');
      form.setFieldsValue({ profile: [] });
    } finally {
      setModalLoading(false);
    }
  };

  const handleSave = async (values: { profile: ManagedLink[] }) => {
    if (!editingUser) return;
    setSaving(true);
    try {
      await usersApi.updateUserProfile(editingUser.id, values.profile || []);
      message.success(`Đã cập nhật profile của ${editingUser.name}`);
      setIsModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      const errorData = error.response?.data;
      if (errorData?.message) {
        if (Array.isArray(errorData.message)) {
          errorData.message.forEach((msg: string) => message.error(msg));
        } else {
          message.error(errorData.message);
        }
      } else {
        message.error('Có lỗi xảy ra khi lưu profile');
      }
    } finally {
      setSaving(false);
    }
  };

  const columns = [
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
        <Button icon={<EditOutlined />} onClick={() => openManage(record)}>
          Quản lý Profile
        </Button>
      ),
    },
  ];

  return (
    <Card
      title="Quản lý Profile nhân viên (Fanpage/Group)"
      extra={
        <Button icon={<ReloadOutlined />} onClick={fetchUsers} loading={loading}>
          Làm mới
        </Button>
      }
    >
      {isMobile ? (
        loading && users.length === 0 ? (
          <div className="flex justify-center items-center my-10 py-10">
            <Spin size="large" />
          </div>
        ) : (
          users.map((u) => (
            <Card key={u.id} size="small" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{u.name}</div>
                  <Text style={{ fontSize: 12, color: '#8c8c8c' }}>{u.email}</Text>
                  <div style={{ marginTop: 4 }}>
                    <Tag color={ROLE_COLOR[u.role] ?? 'default'}>{u.role?.toUpperCase()}</Tag>
                  </div>
                </div>
                <Button size="small" icon={<EditOutlined />} onClick={() => openManage(u)}>
                  Quản lý
                </Button>
              </div>
            </Card>
          ))
        )
      ) : (
        <Table
          columns={columns}
          dataSource={users}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20 }}
        />
      )}

      <Modal
        title={`Quản lý Fanpage/Group: ${editingUser?.name ?? ''}`}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saving}
        width={720}
        destroyOnHidden
      >
        {modalLoading ? (
          <div className="flex justify-center items-center my-10 py-10">
            <Spin size="large" />
          </div>
        ) : (
          <Form form={form} layout="vertical" onFinish={handleSave}>
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
                        <Input placeholder="Tên hiển thị" style={{ width: 200 }} />
                      </Form.Item>
                      <Form.Item
                        {...restField}
                        name={[name, 'url']}
                        rules={[
                          { required: true, message: 'Nhập URL' },
                          { type: 'url', message: 'URL không hợp lệ' },
                        ]}
                      >
                        <Input placeholder="https://facebook.com/..." style={{ width: 260 }} />
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
          </Form>
        )}
      </Modal>
    </Card>
  );
}

// ── Entry point ──────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { user } = useAuthStore();

  if (!user) return null;

  return user.role === 'admin' ? (
    <AdminProfileManager />
  ) : (
    <MyProfileView userId={user.id} />
  );
}
