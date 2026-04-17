'use client';

import { useState, useEffect } from 'react';
import { Table, Card, Button, Space, Tag, App, Modal, Form, Input, Select, Switch, Spin } from 'antd';
import { UserAddOutlined, EditOutlined, KeyOutlined, ReloadOutlined } from '@ant-design/icons';
import { useUsersList } from '@/lib/hooks/useUsers';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useRouter } from 'next/navigation';
import { usersApi } from '@/lib/api/users.api';
import { useDepartments } from '@/lib/hooks/useDepartments';
import dayjs from 'dayjs';

export default function UsersPage() {
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { message, modal } = App.useApp();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [form] = Form.useForm();
  const [resetForm] = Form.useForm();
  const { departments } = useDepartments();
  const { user } = useAuthStore();
  const router = useRouter();
  
  // Dùng hook useUsersList để lấy danh sách nhân viên
  const { users, isLoading: usersLoading, refetch } = useUsersList();



  useEffect(() => {
    if (user && user.role !== 'admin') {
      message.error("Bạn không có quyền truy cập trang này");
      router.replace('/customers');
    }
  }, [user, router, message]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const handleSave = async (values: any) => {
    try {
      setLoading(true);
      let payload: any = {
        name: values.name,
        role: String(values.role).toLowerCase(),
        departmentId: values.departmentId ? Number(values.departmentId) : undefined,
      };
      
      if (editingUser) {
        payload.isActive = values.isActive;
        console.log('[USERS PAGE] Updating user:', editingUser.id, payload);
        await usersApi.updateUser(editingUser.id, payload);
        message.success('Cập nhật nhân viên thành công');
      } else {
        payload.email = values.email;
        payload.password = values.password;
        payload.isActive = values.isActive ?? true;
        console.log('[USERS PAGE] Creating user:', payload);
        await usersApi.createUser(payload);
        message.success('Tạo nhân viên thành công');
      }
      
      setIsModalOpen(false);
      form.resetFields();
      await refetch();
    } catch (error: any) {
      console.error("Create/Update Error Detail:", error.response?.data);
      const errorData = error.response?.data;
      
      if (errorData?.message) {
        if (Array.isArray(errorData.message)) {
          // Hiển thị từng lỗi nếu là mảng validation
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
    { title: 'Họ tên', dataIndex: 'name', key: 'name' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { 
      title: 'Chức vụ', 
      dataIndex: 'role', 
      render: (role: string) => {
        const roles: any = { admin: 'red', manager: 'orange', assistant: 'blue', employee: 'green' };
        return <Tag color={roles[role]}>{role.toUpperCase()}</Tag>;
      }
    },
    { 
      title: 'Phòng ban', 
      dataIndex: ['department', 'name'], 
      render: (val: any) => val || '-' 
    },
    { 
      title: 'Trạng thái', 
      key: 'status', 
      dataIndex: 'isActive',
      render: (val: any) => {
        return Number(val) === 1 ? <Tag color="green">Đang hoạt động</Tag> : <Tag color="red">Khóa</Tag>;
      }
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: any, record: any) => (
        <Space>
          <Button 
            icon={<EditOutlined />} 
            onClick={() => { 
              setEditingUser(record); 
              form.setFieldsValue({
                ...record,
                departmentId: record.department?.id || record.departmentId
              }); 
              setIsModalOpen(true); 
            }}
          >
            Sửa
          </Button>
          <Button 
            icon={<KeyOutlined />} 
            onClick={() => { setEditingUser(record); setIsResetOpen(true); }}
          >
            Reset Pass
          </Button>
        </Space>
      ),
    },
  ];

  if (user && user.role !== 'admin') {
    return null; // Return null while redirecting
  }

  return (
    <Card 
      title="Quản lý nhân viên" 
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => window.location.reload()}>Làm mới</Button>
          <Button type="primary" icon={<UserAddOutlined />} onClick={() => { setEditingUser(null); form.resetFields(); setIsModalOpen(true); }}>
            Thêm nhân viên
          </Button>
        </Space>
      }
    >
      {usersLoading ? (
        <div className="flex justify-center items-center my-10 py-10">
          <Spin size="large" description="Đang nạp dữ liệu..." />
        </div>
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
      )}

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
            name="name"
            label="Họ và tên"
            rules={[
              { required: true, message: 'Vui lòng nhập họ tên' },
              { min: 2, message: 'Họ tên phải có ít nhất 2 ký tự' },
            ]}
          >
            <Input placeholder="Nguyễn Văn A" />
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
            <Select placeholder="Chọn vai trò">
              <Select.Option value="admin">Admin</Select.Option>
              <Select.Option value="manager">Manager</Select.Option>
              <Select.Option value="assistant">Assistant</Select.Option>
              <Select.Option value="employee">Employee</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="departmentId"
            label="Phòng ban"
          >
            <Select placeholder="Chọn phòng ban" allowClear>
              {departments.map((d: any) => (
                <Select.Option key={d.id} value={Number(d.id)}>{d.name}</Select.Option>
              ))}
            </Select>
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
