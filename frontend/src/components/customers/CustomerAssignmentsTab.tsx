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
import { useRoleColorMap, useRoleColors } from '@/lib/hooks/useRoleColorMap';
import { resolveEntityColor } from '@/lib/utils/entityColor';

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
  // ⚠️ MỚI - BE (/users/all, dùng chung cho MỌI dropdown chọn nhân viên -
  // xem JSDoc findEmployees() ở users.service.ts) đã JOIN sẵn role/department/
  // position, trước đây interface này cắt bớt chỉ còn id/name/email nên
  // dropdown "Người nhận" bên dưới không có Tag màu như các dropdown chọn
  // nhân viên khác trong app (báo qua ảnh chụp). Khai đủ field (optional, có
  // thể thiếu ở vài API khác dùng chung type này) để dùng cho optionRender.
  role?: string;
  department?: { id: number; name: string; color: string } | null;
  position?: { id: number; name: string; color: string } | null;
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

  // ⚠️ MỚI - đồng bộ pattern renderUserOption (Avatar + Tag màu Vai trò/
  // Phòng ban/Vị trí) đã dùng ở CustomerFilters.tsx/chia-data cho dropdown
  // "Người nhận" (modal Sửa lượt gán) - trước đây chỉ hiện text trơn.
  const { getRoleColor } = useRoleColorMap();
  const { roleColors: allRoles } = useRoleColors();
  const roleNameMap = new Map(allRoles.map((r) => [r.code, r.name]));
  const getRoleName = (code?: string) => (code ? roleNameMap.get(code) || code : '');
  const renderUserOption = (option: { data: { user: UserOption } }) => {
    const u = option.data.user;
    const tagStyle: React.CSSProperties = { fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 };
    return (
      <Space size={4} align="center">
        <span style={{ fontSize: 13 }}>{u.name || u.email}</span>
        {u.role && <Tag style={tagStyle} color={getRoleColor(u.role)}>{getRoleName(u.role)}</Tag>}
        {u.department?.name && (
          <Tag style={tagStyle} color={resolveEntityColor(u.department.color)}>{u.department.name}</Tag>
        )}
        {u.position?.name && (
          <Tag style={tagStyle} color={resolveEntityColor(u.position.color)}>{u.position.name}</Tag>
        )}
      </Space>
    );
  };

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

  // ⚠️ FIX BUG THẬT (rà soát permission 2026-09): thiếu 'assistant' - đối
  // chiếu customers.service.ts `canModifyAssignment()` xác nhận BE cho
  // Assistant quyền y hệt Admin ở action này (không kèm điều kiện gì thêm),
  // nhưng FE trước đây quên liệt kê -> nút Sửa/Thu hồi bị ẩn SAI với
  // Assistant dù họ gọi API vẫn thành công (chỉ là phải gõ URL/gọi thẳng).
  //
  // Lưu ý: đây KHÔNG phải lỗi lệch permission-động (BE hàm này vẫn hardcode
  // theo Role enum, chưa migrate sang @RequirePermission()/scope - cùng
  // dạng ngoại lệ "Phòng ban thì giữ nguyên" như UsersAccessHelper) - nên
  // FE ở đây vẫn dùng role string cho khớp, chỉ sửa đúng cho ĐẦY ĐỦ theo
  // logic BE thật, không đổi sang can()/scope() vì BE chưa có gì để đọc.
  // Nhánh Manager giữ nguyên là ước lượng rộng hơn thực tế (BE còn kiểm tra
  // đúng phòng ban của assignment) - chấp nhận được vì đây chỉ là ẩn/hiện
  // nút cho gọn UI, chặn thật sự luôn nằm ở BE (có thể vẫn 403 nếu sai
  // phòng ban dù nút hiện ra).
  const canModify = (a: AssignmentHistory) =>
    currentUser?.role === 'admin' ||
    currentUser?.role === 'assistant' ||
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
  };

  // ⚠️ FIX BUG THẬT (console warning "Instance created by useForm is not
  // connected to any Form element"): Modal "Sửa lượt gán" dùng destroyOnHidden
  // nên <Form form={editForm}> chỉ mount sau khi state `editing` re-render và
  // Modal open=true. Trước đây openEdit() gọi editForm.setFieldsValue() NGAY
  // sau setEditing(a) trong cùng 1 lần gọi hàm - lúc đó setEditing chưa kịp
  // áp dụng (state update là bất đồng bộ), Modal vẫn open=false, <Form> chưa
  // tồn tại trong cây DOM -> editForm "chưa kết nối" -> warning. Dời sang
  // useEffect để setFieldsValue chỉ chạy SAU khi React đã re-render và Modal/
  // Form đã mount xong (đảm bảo đúng thứ tự effect chạy sau paint).
  useEffect(() => {
    if (editing) {
      editForm.setFieldsValue({ assignedToId: editing.assignedToId, reason: editing.reason || '' });
    }
  }, [editing, editForm]);

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
      user: u, // ⚠️ MỚI - đối xứng renderUserOption() ở dropdown "Người nhận" (modal Sửa): cần
      // nguyên object user (role/department/position) để optionRender vẽ đủ Tag màu, trước đây
      // chỉ truyền id/label/email/status nên dropdown "Gán thêm Sales" thiếu hẳn Tag Vai trò/
      // Phòng ban/Vị trí so với các dropdown chọn nhân viên khác trong app (báo qua ảnh chụp).
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
              showSearch={{
                filterOption: (input, option) =>
                  (option?.label as string)?.toLowerCase().includes(input.toLowerCase()),
              }}
              options={users.map((u) => ({ value: u.id, label: u.name || u.email, user: u }))}
              optionLabelProp="label"
              optionRender={renderUserOption}
              popupMatchSelectWidth={false}
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
            const u = option.data.user as UserOption;
            const tagStyle: React.CSSProperties = { fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 };
            return (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                {/* ⚠️ FIX BUG THẬT (báo qua ảnh chụp 14/09): dropdown này trước đây CHỈ hiện tên +
                    Tag trạng thái (Chưa gán/Đã gán/Sales chính), thiếu hẳn Tag Vai trò/Phòng ban/
                    Vị trí màu như MỌI dropdown chọn nhân viên khác trong app (đối chiếu
                    renderUserOption() ở dropdown "Người nhận" ngay trong cùng file này). Đồng bộ lại
                    cho đủ - vẫn giữ Tag trạng thái riêng ở cuối vì ý nghĩa khác nhau (trạng thái gán
                    data, không phải Vai trò/Phòng ban/Vị trí của user). */}
                <Space size={4} align="center" style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 13 }}>{u?.name || u?.email || option.data.label}</span>
                  {u?.role && <Tag style={tagStyle} color={getRoleColor(u.role)}>{getRoleName(u.role)}</Tag>}
                  {u?.department?.name && (
                    <Tag style={tagStyle} color={resolveEntityColor(u.department.color)}>{u.department.name}</Tag>
                  )}
                  {u?.position?.name && (
                    <Tag style={tagStyle} color={resolveEntityColor(u.position.color)}>{u.position.name}</Tag>
                  )}
                </Space>
                <Tag color={STATUS_OPTION_TAG[status].color} style={{ marginRight: 0, flexShrink: 0 }}>
                  {STATUS_OPTION_TAG[status].label}
                </Tag>
              </div>
            );
          }}
          showSearch={{
            filterOption: (input, option) => {
              const q = input.toLowerCase();
              return (
                !!option?.label?.toString().toLowerCase().includes(q) ||
                !!option?.email?.toLowerCase?.().includes(q)
              );
            },
          }}
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