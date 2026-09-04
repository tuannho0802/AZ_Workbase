'use client';

import { useState, useEffect } from 'react';
import {
  Table, Card, Button, Space, Tag, App, Modal, Form,
  Input, Select, Switch, Spin, Typography, Divider, Pagination, Tabs, Badge
} from 'antd';
import {
  UserAddOutlined, EditOutlined, KeyOutlined,
  ReloadOutlined, MailOutlined, TeamOutlined
} from '@ant-design/icons';

import { useAuthStore } from '@/lib/stores/auth.store';
import { useRouter } from 'next/navigation';
import { usersApi } from '@/lib/api/users.api';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useDepartments } from '@/lib/hooks/useDepartments';
import { PendingApprovalsTab } from './PendingApprovalsTab';

const { Text } = Typography;

const ROLE_COLOR: Record<string, string> = {
  admin: 'red', manager: 'orange', assistant: 'blue', employee: 'green'
};

// ── mobile card ──────────────────────────────────────────────────────────────
function UserMobileCard({
  record,
  onEdit,
  onResetPass,
}: {
  record: any;
  onEdit: (r: any) => void;
  onResetPass: (r: any) => void;
}) {
  return (
    <Card
      variant="outlined"
      style={{ marginBottom: 10 }}
      styles={{ body: { padding: '12px 14px' } }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{record.name || '—'}</div>
            {record.employeeCode && (
              <Tag color="default" style={{ fontSize: 11, marginInlineEnd: 0 }}>{record.employeeCode}</Tag>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <MailOutlined style={{ fontSize: 11, color: '#8c8c8c' }} />
            <Text style={{ fontSize: 12, color: '#8c8c8c' }}>{record.email}</Text>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <Tag color={ROLE_COLOR[record.role] ?? 'default'}>{record.role?.toUpperCase()}</Tag>
          <Tag color={record.isActive ? 'green' : 'red'}>
            {record.isActive ? 'Hoạt động' : 'Bị khóa'}
          </Tag>
        </div>
      </div>

      <Divider style={{ margin: '8px 0' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <TeamOutlined style={{ fontSize: 12, color: '#8c8c8c' }} />
          <Text style={{ fontSize: 12, color: '#595959' }}>
            {record.department?.name || 'Chưa có phòng ban'}
          </Text>
        </div>
        <Text style={{ fontSize: 11, color: '#bfbfbf' }}>ID: {record.id}</Text>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <Button
          size="small"
          icon={<EditOutlined />}
          style={{ flex: 1 }}
          onClick={() => onEdit(record)}
        >
          Sửa
        </Button>
        <Button
          size="small"
          icon={<KeyOutlined />}
          style={{ flex: 1 }}
          onClick={() => onResetPass(record)}
        >
          Reset Pass
        </Button>
      </div>
    </Card>
  );
}

// ── main page ────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [isMobile, setIsMobile] = useState(false);

  const { message } = App.useApp();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [form] = Form.useForm();
  const [resetForm] = Form.useForm();
  const { departments } = useDepartments();
  const { user } = useAuthStore();
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState(0);
  const [activeTab, setActiveTab] = useState<string>('list');

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await usersApi.getUsers({ page, limit: pageSize });
      if (res && res.data) {
        setUsers(res.data);
        setTotal(res.total);
      }
    } catch (err) {
      console.error(err);
      message.error('Lấy danh sách nhân viên thất bại');
    } finally {
      setLoading(false);
    }
  };

  // Khớp PERMISSIONS.md §2.2 (đối chiếu trực tiếp code 2026-08-28):
  // GET/POST /users đã là @Roles(ADMIN, ASSISTANT, MANAGER) + BE tự lọc
  // theo phòng ban cho Manager (UsersAccessHelper.applyViewFilter) - KHÔNG
  // còn là Admin-only như comment cũ ở đây từng ghi (đã lỗi thời, gây bug:
  // Manager/Assistant bị chặn nhầm khỏi tab "Danh sách nhân viên" dù BE đã
  // cho phép từ trước). Đặt tên lại cho đúng ý nghĩa thay vì giữ "isAdmin"
  const { can, isLoading: permissionsLoading } = useMyPermissions();
  const canAccessPage = can('users.view');
  const canSeeFullList = canAccessPage;

  useEffect(() => {
    if (!permissionsLoading && user && !canAccessPage) {
      message.error('Bạn không có quyền truy cập trang này');
      router.replace('/customers');
    }
  }, [user, canAccessPage, router, message, permissionsLoading]);

  useEffect(() => {
    if (canSeeFullList) {
      fetchUsers();
    }
  }, [canSeeFullList, page, pageSize]);

  // Trước đây đẩy về tab "Chờ duyệt" cho MỌI role không phải Admin - giờ
  // Assistant/Manager cũng thấy được tab "Danh sách nhân viên" nên chỉ cần
  // đẩy về khi thực sự không xem được tab list (về lý thuyết không còn xảy
  // ra nữa vì canAccessPage đã lọc từ trước, giữ lại cho chắc/phòng hờ).
  useEffect(() => {
    if (user && !canSeeFullList) setActiveTab('pending');
  }, [user, canSeeFullList]);

  const openEdit = (record: any) => {
    setEditingUser(record);
    form.setFieldsValue({
      ...record,
      departmentId: record.department?.id || record.departmentId,
    });
    setIsModalOpen(true);
  };

  const openResetPass = (record: any) => {
    setEditingUser(record);
    setIsResetOpen(true);
  };

  const handleSave = async (values: any) => {
    try {
      setLoading(true);
      const payload: any = {
        name: values.name,
        phone: values.phone || undefined,
        role: String(values.role).toLowerCase(),
        departmentId: values.departmentId ? Number(values.departmentId) : undefined,
        // Để trống -> KHÔNG gửi field này -> BE tự sinh mã kế tiếp
        // (generateNextEmployeeCode()). Có nhập tay -> BE tự check trùng,
        // ném lỗi rõ ràng nếu đã tồn tại (xem catch bên dưới).
        employeeCode: values.employeeCode?.trim() || undefined,
      };

      if (editingUser) {
        payload.isActive = values.isActive;
        await usersApi.updateUser(editingUser.id, payload);
        message.success('Cập nhật nhân viên thành công');
      } else {
        payload.email = values.email;
        payload.password = values.password;
        payload.isActive = values.isActive ?? true;
        await usersApi.createUser(payload);
        message.success('Tạo nhân viên thành công');
      }

      setIsModalOpen(false);
      form.resetFields();
      fetchUsers();
    } catch (error: any) {
      const errorData = error.response?.data;
      if (errorData?.message) {
        if (Array.isArray(errorData.message)) {
          errorData.message.forEach((msg: string) => message.error(msg));
        } else {
          message.error(errorData.message);
        }
      } else {
        message.error('Có lỗi xảy ra khi lưu thông tin nhân viên');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (values: any) => {
    try {
      await usersApi.resetPassword(editingUser.id, values);
      message.success('Đã đặt lại mật khẩu thành công');
      setIsResetOpen(false);
      resetForm.resetFields();
    } catch (error: any) {
      message.error(error.response?.data?.message || 'Lỗi khi đặt lại mật khẩu');
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    {
      title: 'Mã NV',
      dataIndex: 'employeeCode',
      key: 'employeeCode',
      width: 90,
      render: (val: string | null) => val || <Text type="secondary">—</Text>,
    },
    { title: 'Họ tên', dataIndex: 'name', key: 'name' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: 'Chức vụ',
      dataIndex: 'role',
      render: (role: string) => (
        <Tag color={ROLE_COLOR[role] ?? 'default'}>{role?.toUpperCase()}</Tag>
      )
    },
    {
      title: 'Phòng ban',
      dataIndex: ['department', 'name'],
      render: (val: any) => val || '-'
    },
    {
      title: 'Trạng thái',
      dataIndex: 'isActive',
      render: (val: any) =>
        val ? <Tag color="green">Đang hoạt động</Tag> : <Tag color="red">Không hoạt động</Tag>
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: any, record: any) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => openEdit(record)}>Sửa</Button>
          <Button icon={<KeyOutlined />} onClick={() => openResetPass(record)}>Reset Pass</Button>
        </Space>
      ),
    },
  ];

  const userListContent = (
    loading && users.length === 0 ? (
      <div className="flex justify-center items-center my-10 py-10">
        <Spin size="large" />
      </div>
    ) : isMobile ? (
      <>
        {users.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: '#8c8c8c' }}>
            Chưa có nhân viên nào
          </div>
        ) : (
          users.map(u => (
            <UserMobileCard
              key={u.id}
              record={u}
              onEdit={openEdit}
              onResetPass={openResetPass}
            />
          ))
        )}
        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
          size="small"
          simple
          onChange={p => setPage(p)}
          style={{ textAlign: 'center', marginTop: 12 }}
        />
      </>
    ) : (
      <Table
        columns={columns}
        dataSource={users}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          total: total,
          pageSize: pageSize,
          onChange: (p, s) => { setPage(p); setPageSize(s); }
        }}
      />
    )
  );

  // Admin/Assistant/Manager đều thấy tab "Danh sách nhân viên" (khớp
  // PERMISSIONS.md §2.2 - GET /users không còn Admin-only).
  const tabItems = [
    ...(canSeeFullList
      ? [
          {
            key: 'list',
            label: 'Danh sách nhân viên',
            children: userListContent,
          },
        ]
      : []),
    {
      key: 'pending',
      label: (
        <Badge count={pendingCount} offset={[10, 0]} size="small">
          <span>Chờ duyệt đăng ký</span>
        </Badge>
      ),
      children: <PendingApprovalsTab onCountChange={setPendingCount} />,
    },
  ];

  return (
    <Card
      title="Quản lý nhân viên"
      extra={
        // Nút "Làm mới"/"Thêm nhân viên" chỉ liên quan tab danh sách nhân
        // viên - ẩn khi đang ở tab "Chờ duyệt" hoặc khi role không xem được
        // tab list, để tránh gây nhầm lẫn (bấm "Thêm nhân viên" trong lúc
        // đang xem danh sách chờ duyệt sẽ không hợp ngữ cảnh).
        canSeeFullList && activeTab === 'list' ? (
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => window.location.reload()}>Làm mới</Button>
            <Button
              type="primary"
              icon={<UserAddOutlined />}
              onClick={() => { setEditingUser(null); form.resetFields(); setIsModalOpen(true); }}
            >
              Thêm nhân viên
            </Button>
          </Space>
        ) : undefined
      }
    >
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />

      {/* Modal Thêm/Sửa */}
      <Modal
        title={editingUser ? 'Sửa thông tin nhân viên' : 'Thêm nhân viên mới'}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: !editingUser, message: 'Vui lòng nhập email' },
              { type: 'email', message: 'Email không hợp lệ' },
            ]}
          >
            <Input disabled={!!editingUser} placeholder="user@azworkbase.com" />
          </Form.Item>

          <Form.Item
            name="employeeCode"
            label="Mã nhân viên"
            tooltip="Để trống sẽ tự sinh mã kế tiếp dạng AZ001, AZ002..."
            rules={[
              {
                pattern: /^[A-Za-z0-9-]{1,20}$/,
                message: 'Mã nhân viên chỉ gồm chữ, số, dấu gạch ngang, tối đa 20 ký tự',
              },
            ]}
          >
            <Input placeholder="Để trống để tự sinh (AZ001, AZ002...)" />
          </Form.Item>

          <Form.Item
            name="name"
            label="Họ và tên"
            rules={[
              { required: true, message: 'Vui lòng nhập họ tên' },
              { min: 2, message: 'Họ tên phải có ít nhất 2 ký tự' },
            ]}
          >
            <Input placeholder="Nguyễn Văn A" />
          </Form.Item>

          <Form.Item
            name="phone"
            label="Số điện thoại"
            rules={[
              {
                pattern: /^(09|08|07|03|05)[0-9]{8}$/,
                message: 'Số điện thoại không hợp lệ',
              },
            ]}
          >
            <Input placeholder="0901234567" />
          </Form.Item>

          {!editingUser && (
            <Form.Item
              name="password"
              label="Mật khẩu"
              rules={[
                { required: true, message: 'Vui lòng nhập mật khẩu' },
                { min: 8, message: 'Mật khẩu phải có ít nhất 8 ký tự' },
                {
                  pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
                  message: 'Mật khẩu phải có chữ hoa, chữ thường, số và ký tự đặc biệt',
                },
              ]}
            >
              <Input.Password placeholder="Password@123" />
            </Form.Item>
          )}

          <Form.Item
            name="role"
            label="Vai trò"
            rules={[{ required: true, message: 'Vui lòng chọn vai trò' }]}
          >
            <Select
              placeholder="Chọn vai trò"
              options={[
                { value: 'admin', label: 'Admin' },
                { value: 'manager', label: 'Manager' },
                { value: 'assistant', label: 'Assistant' },
                { value: 'employee', label: 'Employee' },
              ]}
            />
          </Form.Item>

          <Form.Item name="departmentId" label="Phòng ban">
            <Select
              placeholder="Chọn phòng ban"
              allowClear
              options={departments.map((d: any) => ({ value: Number(d.id), label: d.name }))}
            />
          </Form.Item>

          <Form.Item
            name="isActive"
            label="Trạng thái"
            valuePropName="checked"
            initialValue={true}
          >
            <Switch checkedChildren="Hoạt động" unCheckedChildren="Khóa" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Reset Pass */}
      <Modal
        title={`Đặt lại mật khẩu cho: ${editingUser?.name}`}
        open={isResetOpen}
        onCancel={() => setIsResetOpen(false)}
        onOk={() => resetForm.submit()}
      >
        <Form form={resetForm} layout="vertical" onFinish={handleResetPassword}>
          <Form.Item name="newPassword" label="Mật khẩu mới" rules={[{ required: true, min: 8 }]}>
            <Input.Password placeholder="Nhập ít nhất 8 ký tự..." />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}