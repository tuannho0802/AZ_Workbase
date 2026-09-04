'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Table, Button, Space, App, Modal, Form, Select, Input, Typography, Spin,
} from 'antd';
import { CheckOutlined, CloseOutlined, MailOutlined, PhoneOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { usersApi, PendingUser } from '@/lib/api/users.api';
import { useDepartments } from '@/lib/hooks/useDepartments';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';

const { Text, Paragraph } = Typography;

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'assistant', label: 'Assistant' },
  { value: 'employee', label: 'Employee' },
];

interface Props {
  onCountChange?: (count: number) => void;
}

export const PendingApprovalsTab = ({ onCountChange }: Props) => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { departments } = useDepartments();

  const [approving, setApproving] = useState<PendingUser | null>(null);
  const [approveForm] = Form.useForm();
  const [approveSubmitting, setApproveSubmitting] = useState(false);
  const [rejecting, setRejecting] = useState<PendingUser | null>(null);
  const [rejectForm] = Form.useForm();
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  const { data: pendingUsers = [], isLoading } = useQuery({
    queryKey: ['pending-approvals'],
    queryFn: async () => {
      const data = await usersApi.getPendingApprovals();
      onCountChange?.(data.length);
      return data;
    },
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });

  const openApprove = (record: PendingUser) => {
    setApproving(record);
    approveForm.setFieldsValue({
      role: record.role, // mặc định 'employee' (hardcode ở BE lúc đăng ký) - admin/assistant có thể đổi ngay lúc duyệt
      departmentId: record.department?.id,
    });
  };

  const handleApprove = async () => {
    if (!approving) return;
    try {
      const values = await approveForm.validateFields();
      setApproveSubmitting(true);
      await usersApi.approveUser(approving.id, {
        role: values.role,
        departmentId: values.departmentId,
      });
      message.success(`Đã duyệt tài khoản "${approving.name}"`);
      setApproving(null);
      refetch();
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return; // lỗi validate form, không phải lỗi API
      message.error(getApiErrorMessage(err, 'Duyệt thất bại'));
    } finally {
      setApproveSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejecting) return;
    try {
      const values = await rejectForm.validateFields();
      setRejectSubmitting(true);
      await usersApi.rejectUser(rejecting.id, { reason: values.reason });
      message.success(`Đã từ chối tài khoản "${rejecting.name}"`);
      setRejecting(null);
      rejectForm.resetFields();
      refetch();
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(getApiErrorMessage(err, 'Từ chối thất bại'));
    } finally {
      setRejectSubmitting(false);
    }
  };

  const columns = [
    {
      title: 'Mã NV',
      dataIndex: 'employeeCode',
      key: 'employeeCode',
      width: 90,
      render: (val: string | null) => val || '—',
    },
    { title: 'Họ tên', dataIndex: 'name', key: 'name' },
    {
      title: 'Liên hệ',
      key: 'contact',
      render: (_: unknown, record: PendingUser) => (
        <Space direction="vertical" size={0}>
          <Space size={4}>
            <MailOutlined style={{ fontSize: 12, color: '#8c8c8c' }} />
            <Text style={{ fontSize: 13 }}>{record.email}</Text>
          </Space>
          {record.phone && (
            <Space size={4}>
              <PhoneOutlined style={{ fontSize: 12, color: '#8c8c8c' }} />
              <Text style={{ fontSize: 13 }}>{record.phone}</Text>
            </Space>
          )}
        </Space>
      ),
    },
    {
      title: 'Phòng ban đăng ký',
      key: 'department',
      render: (_: unknown, record: PendingUser) => record.department?.name || <Text type="secondary">Chưa chọn</Text>,
    },
    {
      title: 'Ngày đăng ký',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => dayjs(v).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: unknown, record: PendingUser) => (
        <Space>
          <Button type="primary" icon={<CheckOutlined />} onClick={() => openApprove(record)}>
            Duyệt
          </Button>
          <Button danger icon={<CloseOutlined />} onClick={() => setRejecting(record)}>
            Từ chối
          </Button>
        </Space>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <Table
        columns={columns}
        dataSource={pendingUsers}
        rowKey="id"
        locale={{ emptyText: '✅ Không có tài khoản nào đang chờ duyệt' }}
        pagination={false}
      />

      {/* Modal Duyệt - cho phép chỉnh role/phòng ban ngay lúc duyệt, đỡ phải sửa lại lần 2 */}
      <Modal
        title={`Duyệt tài khoản: ${approving?.name}`}
        open={!!approving}
        onCancel={() => setApproving(null)}
        onOk={handleApprove}
        confirmLoading={approveSubmitting}
        okText="Xác nhận duyệt"
      >
        <Paragraph type="secondary">
          Xác nhận vai trò và phòng ban chính thức cho tài khoản này trước khi duyệt.
        </Paragraph>
        <Form form={approveForm} layout="vertical">
          <Form.Item name="role" label="Vai trò" rules={[{ required: true, message: 'Vui lòng chọn vai trò' }]}>
            <Select options={ROLE_OPTIONS} />
          </Form.Item>
          <Form.Item name="departmentId" label="Phòng ban">
            <Select
              placeholder="Chọn phòng ban"
              allowClear
              options={departments.map((d: any) => ({ value: Number(d.id), label: d.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Từ chối - lý do không bắt buộc nhưng khuyến khích ghi rõ */}
      <Modal
        title={`Từ chối tài khoản: ${rejecting?.name}`}
        open={!!rejecting}
        onCancel={() => setRejecting(null)}
        onOk={handleReject}
        confirmLoading={rejectSubmitting}
        okText="Xác nhận từ chối"
        okButtonProps={{ danger: true }}
      >
        <Form form={rejectForm} layout="vertical">
          <Form.Item name="reason" label="Lý do từ chối (không bắt buộc)">
            <Input.TextArea rows={3} placeholder="Vd: Email không thuộc công ty, thông tin không hợp lệ..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};