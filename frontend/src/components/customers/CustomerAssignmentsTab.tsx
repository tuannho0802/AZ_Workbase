'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Space,
  Typography,
  Tag,
  Popconfirm,
  App,
  Select,
  Input,
  Modal,
  Form,
} from 'antd';
import {
  ReloadOutlined,
  EditOutlined,
  UndoOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { assignmentsApi, AssignmentHistory } from '@/lib/api/assignments.api';
import { usersApi } from '@/lib/api/users.api';
import { useAuthStore } from '@/lib/stores/auth.store';
import axiosInstance from '@/lib/api/axios-instance';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';

const { Text } = Typography;

interface Props {
  customerId: number;
  primarySalesUserId?: number | null; // ai đang là Sales phụ trách chính (customer.salesUser.id) - dùng để đánh dấu/khoá option trong modal Gán thêm
  onUpdate?: () => void; // gọi khi có thay đổi (gán mới/sửa/thu hồi) - để drawer cha refetch lại customer.salesUser
}

interface UserOption {
  id: number;
  name: string;
  email: string;
}

const STATUS_TAG: Record<AssignmentHistory['status'], { color: string; label: string }> = {
  active: { color: 'green', label: 'Đang hoạt động' },
  transferred: { color: 'blue', label: 'Đã chuyển giao' },
  reclaimed: { color: 'default', label: 'Đã thu hồi' },
};

export const CustomerAssignmentsTab = ({ customerId, primarySalesUserId, onUpdate }: Props) => {
  const { message } = App.useApp();
  const { user: currentUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<AssignmentHistory[]>([]);

  // ── Sửa 1 lượt gán ──────────────────────────────────
  const [editing, setEditing] = useState<AssignmentHistory | null>(null);
  const [editForm] = Form.useForm();
  const [editSubmitting, setEditSubmitting] = useState(false);

  // ── Gán thêm nhiều Sales mới cho khách hàng này ─────
  const [addOpen, setAddOpen] = useState(false);
  const [addSalesIds, setAddSalesIds] = useState<number[]>([]);
  const [addReason, setAddReason] = useState('');
  const [addSubmitting, setAddSubmitting] = useState(false);

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ['users-for-select'],
    queryFn: () => usersApi.getAllForSelect(),
    staleTime: 5 * 60 * 1000,
  });

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const data = await assignmentsApi.getAssignmentHistory(customerId);
      setHistory(data);
    } catch {
      message.error('Không lấy được lịch sử gán data');
    } finally {
      setLoading(false);
    }
  }, [customerId, message]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Chỉ Admin/Manager, hoặc chính người đã tạo ra lượt gán đó, mới được sửa/
  // thu hồi - khớp đúng quyền `canModifyAssignment()` phía backend. Backend
  // vẫn là nơi thực thi thật; kiểm tra ở đây chỉ để ẩn nút cho gọn UI, không
  // phải lớp bảo mật.
  const canModify = (a: AssignmentHistory) =>
    currentUser?.role === 'admin' ||
    currentUser?.role === 'manager' ||
    a.assignedById === currentUser?.id;

  const handleReclaim = async (a: AssignmentHistory) => {
    try {
      const res = await assignmentsApi.reclaimAssignment(a.id);
      message.success(res.message || 'Đã thu hồi lượt gán data thành công');
      fetchHistory();
      onUpdate?.();
    } catch (e) {
      message.error(getApiErrorMessage(e, 'Thu hồi thất bại'));
    }
  };

  const openEdit = (a: AssignmentHistory) => {
    setEditing(a);
    editForm.setFieldsValue({ assignedToId: a.assignedToId, reason: a.reason || '' });
  };

  const handleEditSubmit = async () => {
    if (!editing) return;
    try {
      const values = await editForm.validateFields();
      setEditSubmitting(true);
      await assignmentsApi.updateAssignment(editing.id, {
        assignedToId: values.assignedToId !== editing.assignedToId ? values.assignedToId : undefined,
        reason: values.reason !== (editing.reason || '') ? values.reason : undefined,
      });
      message.success('Đã cập nhật lượt gán data');
      setEditing(null);
      fetchHistory();
      onUpdate?.();
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return; // lỗi validate form, không phải lỗi API
      message.error(getApiErrorMessage(e, 'Cập nhật thất bại'));
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleAddAssignees = async () => {
    if (addSalesIds.length === 0) return;
    setAddSubmitting(true);
    try {
      const res = await axiosInstance.patch('/customers/bulk-assign', {
        customerIds: [customerId],
        salesUserIds: addSalesIds,
        ...(addReason.trim() ? { reason: addReason.trim() } : {}),
      });
      message.success(res.data?.message || `Đã gán thêm ${addSalesIds.length} nhân viên`);
      setAddOpen(false);
      setAddSalesIds([]);
      setAddReason('');
      fetchHistory();
      onUpdate?.();
    } catch (e) {
      message.error(getApiErrorMessage(e, 'Gán thêm thất bại'));
    } finally {
      setAddSubmitting(false);
    }
  };

  // ── Trạng thái từng user để hiển thị tag + khoá option trong modal "Gán
  // thêm Sales" - tránh chọn nhầm người đã có assignment (chính hoặc đã
  // được chia), gây lỗi 400 từ backend hoặc gán trùng vô nghĩa.
  const activeAssigneeIds = new Set(
    history.filter((a) => a.status === 'active').map((a) => a.assignedToId),
  );

  type AddUserStatus = 'primary' | 'assigned' | 'available';

  const getUserStatus = (userId: number): AddUserStatus => {
    if (primarySalesUserId != null && userId === primarySalesUserId) return 'primary';
    if (activeAssigneeIds.has(userId)) return 'assigned';
    return 'available';
  };

  const STATUS_OPTION_TAG: Record<AddUserStatus, { color: string; label: string }> = {
    primary: { color: 'gold', label: 'Sales chính' },
    assigned: { color: 'orange', label: 'Đã gán' },
    available: { color: 'green', label: 'Chưa gán' },
  };

  const addModalOptions = users.map((u) => {
    const status = getUserStatus(u.id);
    return {
      value: u.id,
      label: u.name || u.email, // dùng cho hiển thị tag ĐÃ CHỌN gọn gàng (không kèm status tag)
      email: u.email,
      status,
      disabled: status !== 'available',
    };
  });

  const columns = [
    {
      title: 'Người nhận',
      key: 'assignedTo',
      render: (_: unknown, a: AssignmentHistory) => a.assignedTo?.name || `#${a.assignedToId}`,
    },
    {
      title: 'Trạng thái',
      key: 'status',
      render: (_: unknown, a: AssignmentHistory) => (
        <Tag color={STATUS_TAG[a.status].color}>{STATUS_TAG[a.status].label}</Tag>
      ),
    },
    {
      title: 'Người gán',
      key: 'assignedBy',
      render: (_: unknown, a: AssignmentHistory) => a.assignedBy?.name || `#${a.assignedById}`,
    },
    {
      title: 'Lý do',
      dataIndex: 'reason',
      key: 'reason',
      render: (v: string | null) => v || <Text type="secondary">—</Text>,
    },
    {
      title: 'Ngày gán',
      key: 'assignedAt',
      render: (_: unknown, a: AssignmentHistory) => dayjs(a.assignedAt).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      render: (_: unknown, a: AssignmentHistory) => {
        if (a.status !== 'active' || !canModify(a)) return null;
        return (
          <Space size={4}>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(a)}>
              Sửa
            </Button>
            <Popconfirm
              title="Thu hồi lượt gán"
              description="Không thể hoàn tác. Xác nhận thu hồi?"
              onConfirm={() => handleReclaim(a)}
              okText="Thu hồi"
              cancelText="Huỷ"
              okButtonProps={{ danger: true }}
            >
              <Button size="small" danger icon={<UndoOutlined />}>
                Thu hồi
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text strong>Lịch sử gán data</Text>
        <Space>
          <Button type="primary" size="small" icon={<UserAddOutlined />} onClick={() => setAddOpen(true)}>
            Gán thêm Sales
          </Button>
          <Button size="small" icon={<ReloadOutlined />} onClick={fetchHistory} loading={loading}>
            Làm mới
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={history}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={false}
        locale={{ emptyText: 'Chưa có lượt gán nào' }}
      />

      {/* ── Modal sửa 1 lượt gán ──────────────────────── */}
      <Modal
        title="Sửa lượt gán data"
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={handleEditSubmit}
        confirmLoading={editSubmitting}
        okText="Lưu"
        cancelText="Huỷ"
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="assignedToId" label="Người nhận" rules={[{ required: true }]}>
            <Select
              showSearch
              options={users.map((u) => ({ value: u.id, label: u.name || u.email }))}
              filterOption={(input, option) =>
                (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
          <Form.Item name="reason" label="Lý do">
            <Input.TextArea rows={2} placeholder="Lý do gán/đổi người nhận" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Modal gán thêm nhiều Sales cùng lúc ──────── */}
      <Modal
        title="Gán thêm Sales cho khách hàng này"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={handleAddAssignees}
        confirmLoading={addSubmitting}
        okText={`Xác nhận gán${addSalesIds.length > 0 ? ` cho ${addSalesIds.length} người` : ''}`}
        okButtonProps={{ disabled: addSalesIds.length === 0 }}
        cancelText="Huỷ"
        destroyOnHidden
      >
        <div style={{ marginBottom: 8 }}>
          <Text strong>Chọn Sales (có thể chọn nhiều):</Text>
        </div>
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          placeholder="Tìm tên hoặc email sales..."
          value={addSalesIds}
          onChange={setAddSalesIds}
          options={addModalOptions}
          optionRender={(option) => {
            const status = option.data.status as AddUserStatus;
            return (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span>{option.data.label}</span>
                <Tag color={STATUS_OPTION_TAG[status].color} style={{ marginRight: 0 }}>
                  {STATUS_OPTION_TAG[status].label}
                </Tag>
              </div>
            );
          }}
          filterOption={(input, option) => {
            const q = input.toLowerCase();
            return (
              !!option?.label?.toString().toLowerCase().includes(q) ||
              !!option?.email?.toLowerCase?.().includes(q)
            );
          }}
          showSearch
          maxTagCount="responsive"
        />
        <div style={{ marginTop: 16, marginBottom: 8 }}>
          <Text strong>Lý do (tuỳ chọn):</Text>
        </div>
        <Input.TextArea
          rows={2}
          value={addReason}
          onChange={(e) => setAddReason(e.target.value)}
          placeholder="Vd: Chia sẻ hỗ trợ thêm"
        />
      </Modal>
    </div>
  );
};