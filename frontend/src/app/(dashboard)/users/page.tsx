'use client';

import { useState, useEffect } from 'react';
import { Table, Card, Button, Space, Tag, App, Modal, Form, Input, Select, Switch } from 'antd';
import { UserAddOutlined, EditOutlined, KeyOutlined, ReloadOutlined } from '@ant-design/icons';
import { usersApi } from '@/lib/api/users.api';
import { departmentsApi } from '@/lib/api'; // Updated to use index.ts
import dayjs from 'dayjs';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
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
  const [departments, setDepartments] = useState([]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await usersApi.getUsers({ page, limit: pageSize });
      setUsers(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Không thể tải danh sách nhân viên');
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    // Basic departments fetch if API exists, else empty
    try {
      const response = await departmentsApi.getDepartments();
      setDepartments(response);
    } catch (error) {}
  };

  useEffect(() => {
    fetchUsers();
    fetchDepartments();
  }, [page, pageSize]);

  const handleSave = async (values: any) => {
    try {
      if (editingUser) {
        await usersApi.updateUser(editingUser.id, values);
        message.success('Cập nhật nhân viên thành công');
      } else {
        await usersApi.createUser(values);
        message.success('Tạo nhân viên thành công');
      }
      setIsModalOpen(false);
      fetchUsers();
    } catch (error: any) {
      message.error(error.response?.data?.message || 'Có lỗi xảy ra');
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
      dataIndex: 'isActive', 
      render: (active: boolean) => <Tag color={active ? 'success' : 'error'}>{active ? 'Đang hoạt động' : 'Khóa'}</Tag>
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: any, record: any) => (
        <Space>
          <Button 
            icon={<EditOutlined />} 
            onClick={() => { setEditingUser(record); form.setFieldsValue(record); setIsModalOpen(true); }}
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
          <Button icon={<ReloadOutlined />} onClick={fetchUsers}>Làm mới</Button>
          <Button type="primary" icon={<UserAddOutlined />} onClick={() => { setEditingUser(null); form.resetFields(); setIsModalOpen(true); }}>
            Thêm nhân viên
          </Button>
        </Space>
      }
    >
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
                <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>
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
