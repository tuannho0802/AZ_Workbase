'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Table, Button, Space, App, Modal, Typography, Spin, Tag } from 'antd';
import { UndoOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { usersApi, TrashedUser } from '@/lib/api/users.api';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';

const { Text, Paragraph } = Typography;

const ROLE_COLOR: Record<string, string> = {
  admin: 'red', manager: 'orange', assistant: 'blue', employee: 'green',
};

interface Props {
  onCountChange?: (count: number) => void;
  onRestored?: () => void;
}

// ── Tab "Đã xoá" (thùng rác nhân viên) - GET /users/trash, gate bằng
// `users.delete` (đúng permission dùng cho soft-delete/hard-delete, xem
// UsersController). Khôi phục = xoá cứng là 2 hành động tách biệt, đúng
// yêu cầu chủ dự án "xoá mềm trước, xoá cứng là bước confirm riêng sau" -
// không gộp chung 1 nút để tránh bấm nhầm xoá vĩnh viễn.
export const TrashTab = ({ onCountChange, onRestored }: Props) => {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();

  const [restoring, setRestoring] = useState<TrashedUser | null>(null);
  const [restoreSubmitting, setRestoreSubmitting] = useState(false);
  const [hardDeleting, setHardDeleting] = useState<TrashedUser | null>(null);
  const [hardDeleteSubmitting, setHardDeleteSubmitting] = useState(false);

  const { data: trashedUsers = [], isLoading } = useQuery({
    queryKey: ['users-trash'],
    queryFn: async () => {
      const data = await usersApi.getTrash();
      onCountChange?.(data.length);
      return data;
    },
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['users-trash'] });

  const handleRestore = async () => {
    if (!restoring) return;
    try {
      setRestoreSubmitting(true);
      await usersApi.restoreUser(restoring.id);
      message.success(`Đã khôi phục tài khoản "${restoring.name}"`);
      setRestoring(null);
      refetch();
      // "Danh sách nhân viên" ở tab bên cạnh dùng useState/useEffect thô,
      // không phải react-query - khôi phục nghĩa là user XUẤT HIỆN LẠI ở
      // đó nên phải nhờ page cha tự fetchUsers() lại qua callback.
      onRestored?.();
    } catch (err) {
      message.error(getApiErrorMessage(err, 'Khôi phục thất bại'));
    } finally {
      setRestoreSubmitting(false);
    }
  };

  const handleHardDelete = async () => {
    if (!hardDeleting) return;
    try {
      setHardDeleteSubmitting(true);
      await usersApi.hardDeleteUser(hardDeleting.id);
      message.success(`Đã xoá vĩnh viễn tài khoản "${hardDeleting.name}"`);
      setHardDeleting(null);
      refetch();
    } catch (err) {
      message.error(getApiErrorMessage(err, 'Xoá vĩnh viễn thất bại'));
    } finally {
      setHardDeleteSubmitting(false);
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
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: 'Chức vụ',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => <Tag color={ROLE_COLOR[role] ?? 'default'}>{role?.toUpperCase()}</Tag>,
    },
    {
      title: 'Phòng ban',
      key: 'department',
      render: (_: unknown, record: TrashedUser) => record.department?.name || <Text type="secondary">—</Text>,
    },
    {
      title: 'Vị trí',
      key: 'position',
      render: (_: unknown, record: TrashedUser) => record.position?.name || <Text type="secondary">—</Text>,
    },
    {
      title: 'Đã xoá lúc',
      dataIndex: 'deletedAt',
      key: 'deletedAt',
      render: (v: string) => dayjs(v).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'Người xoá',
      key: 'deletedBy',
      render: (_: unknown, record: TrashedUser) => record.deletedBy?.name || <Text type="secondary">—</Text>,
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: unknown, record: TrashedUser) => (
        <Space>
          <Button icon={<UndoOutlined />} onClick={() => setRestoring(record)}>
            Khôi phục
          </Button>
          <Button danger icon={<DeleteOutlined />} onClick={() => setHardDeleting(record)}>
            Xoá vĩnh viễn
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
        dataSource={trashedUsers}
        rowKey="id"
        locale={{ emptyText: '🗑️ Thùng rác trống - chưa có tài khoản nào bị xoá' }}
        pagination={false}
      />

      {/* Modal khôi phục */}
      <Modal
        title={`Khôi phục tài khoản: ${restoring?.name}`}
        open={!!restoring}
        onCancel={() => setRestoring(null)}
        onOk={handleRestore}
        confirmLoading={restoreSubmitting}
        okText="Khôi phục"
      >
        <Paragraph type="secondary">
          Tài khoản sẽ đăng nhập được lại và xuất hiện trở lại ở "Danh sách nhân viên".
        </Paragraph>
      </Modal>

      {/* Modal xoá vĩnh viễn - cảnh báo rõ KHÔNG THỂ hoàn tác */}
      <Modal
        title={
          <Space>
            <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
            {`Xoá vĩnh viễn tài khoản: ${hardDeleting?.name}`}
          </Space>
        }
        open={!!hardDeleting}
        onCancel={() => setHardDeleting(null)}
        onOk={handleHardDelete}
        confirmLoading={hardDeleteSubmitting}
        okText="Tôi hiểu, xoá vĩnh viễn"
        okButtonProps={{ danger: true }}
      >
        <Paragraph>
          Hành động này <Text strong>KHÔNG THỂ hoàn tác</Text>. Toàn bộ dữ liệu khách
          hàng/deposit đang đứng tên tài khoản này sẽ tự động chuyển sang cho{' '}
          <Text strong>bạn</Text> (người bấm xoá), lịch sử giao-nhận data liên quan sẽ
          bị xoá hẳn.
        </Paragraph>
      </Modal>
    </div>
  );
};