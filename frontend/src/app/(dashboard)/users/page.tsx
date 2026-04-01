'use client';

import { useState, useEffect } from 'react';
import { Table, Card, Button, Space, Tag, App, Modal, Form, Input, Select, Switch, Spin } from 'antd';
import { UserAddOutlined, EditOutlined, KeyOutlined, ReloadOutlined } from '@ant-design/icons';
import { useUsersList } from '@/lib/hooks/useUsers';
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
  
  // Dùng hook useUsersList để lấy danh sách nhân viên
  const { users, isLoading: usersLoading, refetch } = useUsersList();



  useEffect(() => {
    console.log("Processed Data for Table:", users);
    users.forEach((u: any) => console.log(`[USER DB CHECK] ID: ${u.id} - Name: ${u.name} - isActive: ${u.isActive} (${typeof u.isActive}) - Dept:`, u.department));
  }, [users]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const handleSave = async (values: any) => {
    try {
      let payload: any = {};
      
      // Fix Role: Ép thành chữ thường để khớp Backend Enum ['admin', 'manager', 'assistant', 'employee']
      if (values.role) {
        payload.role = String(values.role).toLowerCase();
      }
      
      // Fix Department: Ép kiểu sang Number nguyên dương
      if (values.departmentId) {
        payload.departmentId = Number(values.departmentId);
      }
      
      // Thêm tên
      if (values.name) {
        payload.name = values.name;
      }

      if (editingUser) {
        // KHI UPDATE: Bỏ qua email (vì Backend DTO không có), xử lý isActive
        if (values.isActive !== undefined) {
          payload.isActive = values.isActive === 1 || values.isActive === true || values.isActive === '1';
        }
        

        await usersApi.updateUser(editingUser.id, payload);
        message.success('Cập nhật nhân viên thành công');
        setIsModalOpen(false);
        await refetch();
      } else {
        // KHI CREATE: Gửi thêm email và password (những trường CreateUserDto cần)
        if (values.email) payload.email = values.email;
        if (values.password) payload.password = values.password;
        

        await usersApi.createUser(payload);
        message.success('Tạo nhân viên thành công');
        setIsModalOpen(false);
        await refetch();
      }
    } catch (error: any) {
      console.error("Create/Update Error:", error.response?.data);
      message.error(error.response?.data?.message || 'Có lỗi xảy ra, vui lòng xem F12 Network');
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
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input disabled={!!editingUser} />
          </Form.Item>
          {!editingUser && (
            <Form.Item name="password" label="Mật khẩu ban đầu" rules={[{ required: true, min: 6 }]}>
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item name="name" label="Họ tên" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="role" label="Chức vụ" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="admin">Admin</Select.Option>
              <Select.Option value="manager">Manager</Select.Option>
              <Select.Option value="assistant">Assistant</Select.Option>
              <Select.Option value="employee">Employee</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="departmentId" label="Phòng ban">
            <Select allowClear>
              {departments.map((d: any) => (
                <Select.Option key={d.id} value={Number(d.id)}>{d.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          {editingUser && (
            <Form.Item name="isActive" label="Hoạt động" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
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
