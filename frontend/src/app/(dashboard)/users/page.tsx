'use client';

import { useState, useEffect } from 'react';
import {
  Table, Card, Button, Space, Tag, App, Modal, Form,
  Input, Select, Switch, Spin, Typography, Divider, Pagination, Tabs, Badge
} from 'antd';
import {
  UserAddOutlined, EditOutlined, KeyOutlined,
  ReloadOutlined, MailOutlined, TeamOutlined, DeleteOutlined, CrownOutlined,
  IdcardOutlined,
} from '@ant-design/icons';

import { useAuthStore } from '@/lib/stores/auth.store';
import { useRouter } from 'next/navigation';
import { usersApi } from '@/lib/api/users.api';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useRoles } from '@/lib/hooks/useRoles';
import { useDepartments } from '@/lib/hooks/useDepartments';
import { usePositions } from '@/lib/hooks/usePositions';
import { PendingApprovalsTab } from './PendingApprovalsTab';
import { TrashTab } from './TrashTab';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { useRoleColorMap } from '@/lib/hooks/useRoleColorMap';

const { Text } = Typography;

// ── mobile card ──────────────────────────────────────────────────────────────
function UserMobileCard({
  record,
  roleMap,
  onEdit,
  onResetPass,
  onDelete,
  canDelete,
}: {
  record: any;
  roleMap: Map<string, string>;
  onEdit: (r: any) => void;
  onResetPass: (r: any) => void;
    onDelete: (r: any) => void;
    canDelete: boolean;
}) {
  const { getRoleColor } = useRoleColorMap();
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
          <Tag color={getRoleColor(record.role)}>{roleMap.get(record.role) || record.role?.toUpperCase()}</Tag>
          {record.isRootAdmin && (
            <Tag color="gold" icon={<CrownOutlined />}>Root Admin</Tag>
          )}
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
        {/* ⚠️ MỚI - Vị trí (Position), đối xứng Phòng ban ở trên. CHỈ hiện
            dòng này khi user thực sự có gán Vị trí - tránh rối UI card cho
            phần lớn user hiện tại chưa có Vị trí nào (nullable, mới thêm). */}
        {record.position?.name && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <IdcardOutlined style={{ fontSize: 12, color: '#8c8c8c' }} />
            <Text style={{ fontSize: 12, color: '#595959' }}>{record.position.name}</Text>
          </div>
        )}
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
        {canDelete && (
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => onDelete(record)}
          />
        )}
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

  const { message, modal } = App.useApp();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [form] = Form.useForm();
  const [resetForm] = Form.useForm();
  const { departments } = useDepartments();
  // ⚠️ MỚI - Vị trí (Position), đối xứng `departments` ở trên. Dùng cho
  // Select trong Modal Thêm/Sửa - cột "Vị trí" ở bảng đọc thẳng từ object
  // quan hệ `record.position` (GET /users đã JOIN sẵn), không cần tra map.
  const { positions } = usePositions();
  const { user } = useAuthStore();
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState(0);
  const [trashCount, setTrashCount] = useState(0);
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
  const { roles, isLoading: rolesLoading } = useRoles();
  const roleOptions = (roles || []).map(r => ({ value: r.code, label: r.name }));
  const roleMap = new Map((roles || []).map(r => [r.code, r.name]));
  const canAccessPage = can('users.view');
  const canManage = can('users.manage');
  // ⚠️ `users.delete` mặc định CHỈ Admin (khác `users.manage` - Admin/
  // Assistant/Manager) - tuỳ biến được qua "/phan-quyen", xem migration
  // `AddUserSoftDeleteAndProfilePermissions`. Nút "Xoá" + tab "Đã xoá" chỉ
  // hiện khi thực sự có quyền này, không hardcode role === 'admin'.
  const canDelete = can('users.delete');
  const canSeeFullList = canAccessPage;
  // ⚠️ MỚI (isRootAdmin) - toggle "Root Admin" trong Modal Thêm/Sửa CHỈ hiện
  // với người đang đăng nhập THẬT SỰ là Root Admin (khác `role === 'admin'`
  // - xem JSDoc User.isRootAdmin). BE (UsersService.create()/update()) mới
  // là nơi chặn thật sự nếu FE bị bypass.
  const isRootAdminCaller = !!user?.isRootAdmin;
  // ⚠️ MỚI (isRootAdmin - self-target & confirm password) - theo dõi giá trị
  // Switch "Root Admin" trong Modal theo thời gian thực để: (1) biết khi nào
  // caller thực sự ĐỔI trạng thái (khác giá trị gốc của record đang sửa) ->
  // chỉ lúc đó mới bắt buộc hiện ô "Mật khẩu hiện tại" và gửi kèm
  // `currentPassword` lên BE (khớp điều kiện BE chỉ đòi field này khi giá
  // trị THAY ĐỔI - xem UsersService.update()); (2) disable hẳn Switch khi
  // đang sửa CHÍNH MÌNH - BE đã chặn cứng (ForbiddenException nếu
  // `id === callerId`) nhưng vẫn ẩn/disable ở FE để tránh user bấm vào rồi
  // nhận lỗi 403 khó hiểu.
  const isRootAdminWatch = Form.useWatch('isRootAdmin', form);
  const isEditingSelf = !!(editingUser && user && editingUser.id === user.id);
  const isRootAdminChanged =
    !!editingUser && isRootAdminWatch !== undefined && !!isRootAdminWatch !== !!editingUser?.isRootAdmin;
  // ⚠️ MỚI - Root Admin CHỈ có ý nghĩa với role='admin' (BE cũng chặn cứng:
  // `UsersService.update()` ném BadRequestException "Root Admin chỉ áp dụng
  // cho role Admin" nếu gửi isRootAdmin=true mà role đích khác 'admin').
  // Trước đây Switch hiện với MỌI vai trò miễn caller là Root Admin - gây
  // khó hiểu khi sửa 1 nhân viên role khác (vd "Staff Marketing") vẫn thấy
  // toggle Root Admin dù bấm vào chắc chắn sẽ bị BE từ chối. Giờ chỉ render
  // khi vai trò ĐANG CHỌN trong Form (roleWatch - theo dõi realtime để cũng
  // ẩn/hiện ngay khi đổi Select "Vai trò", không cần đợi submit) là 'admin'.
  const roleWatch = Form.useWatch('role', form);
  const isTargetRoleAdmin = String(roleWatch ?? '').toLowerCase() === 'admin';

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
      // ⚠️ MỚI - đối xứng departmentId ở trên, lấy id từ object quan hệ
      // `position` (GET /users đã JOIN sẵn) ưu tiên, fallback về scalar
      // `positionId` thô nếu vì lý do gì đó object chưa được join.
      positionId: record.position?.id || record.positionId,
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
        // ⚠️ MỚI - đối xứng departmentId ở trên. `allowClear` nên gửi
        // `null` tường minh khi người dùng xoá lựa chọn (không phải
        // `undefined`) để BE thực sự XOÁ gán Vị trí cũ thay vì bỏ qua field
        // này (UpdateUserDto.positionId?: number | null - đã hỗ trợ null).
        positionId: values.positionId != null ? Number(values.positionId) : (editingUser ? null : undefined),
        // Để trống -> KHÔNG gửi field này -> BE tự sinh mã kế tiếp
        // (generateNextEmployeeCode()). Có nhập tay -> BE tự check trùng,
        // ném lỗi rõ ràng nếu đã tồn tại (xem catch bên dưới).
        employeeCode: values.employeeCode?.trim() || undefined,
      };

      // ⚠️ MỚI (isRootAdmin) - CHỈ gửi field này khi người đang thao tác
      // thật sự là Root Admin (toggle chỉ hiện với họ - xem Form.Item bên
      // dưới) - tránh gửi `undefined`/giá trị cũ nhầm cho request của Admin
      // thường, dù BE cũng tự chặn lại (ForbiddenException) nếu lỡ gửi.
      if (isRootAdminCaller) {
        payload.isRootAdmin = !!values.isRootAdmin;
        // ⚠️ MỚI - chỉ gửi kèm currentPassword khi THỰC SỰ đổi trạng thái
        // Root Admin so với giá trị gốc (khớp điều kiện BE yêu cầu field
        // này - xem UsersService.update()). Gửi rỗng/không gửi khi không đổi
        // để tránh lộ mật khẩu lên network log không cần thiết.
        if (isRootAdminChanged) {
          payload.currentPassword = values.currentPassword;
        }
      }

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

  // ── Xoá mềm (chuyển vào thùng rác) - nút "Xoá" ở bảng chính, đúng như
  // Profile page đã có (usersApi.softDeleteUser -> PATCH /users/:id/soft-
  // delete). BE tự chặn tự xoá chính mình (ForbiddenException) nên chỉ cần
  // ẩn nút với chính người đang đăng nhập cho UX gọn, không cần check lại
  // ở đây - vẫn an toàn dù có bấm được (BE là nguồn chặn thật sự).
  const handleSoftDelete = (record: any) => {
    modal.confirm({
      title: `Xoá tài khoản "${record.name}"?`,
      content: 'Tài khoản sẽ được chuyển vào thùng rác (tab "Đã xoá"), dữ liệu vẫn giữ nguyên và có thể khôi phục. Người này sẽ không đăng nhập được nữa ngay lập tức.',
      okText: 'Xoá (chuyển vào thùng rác)',
      okButtonProps: { danger: true },
      cancelText: 'Huỷ',
      onOk: async () => {
        try {
          await usersApi.softDeleteUser(record.id);
          message.success(`Đã chuyển "${record.name}" vào thùng rác`);
          fetchUsers();
        } catch (err) {
          message.error(getApiErrorMessage(err, 'Xoá thất bại'));
        }
      },
    });
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
      render: (role: string, record: any) => (
        <Space size={4}>
          <Tag color={getRoleColor(role)}>{roleMap.get(role) || role?.toUpperCase()}</Tag>
          {record.isRootAdmin && (
            <Tag color="gold" icon={<CrownOutlined />}>Root Admin</Tag>
          )}
        </Space>
      )
    },
    {
      title: 'Phòng ban',
      dataIndex: ['department', 'name'],
      render: (val: any) => val || '-'
    },
    {
      title: 'Vị trí',
      dataIndex: ['position', 'name'],
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
          {canManage && <Button icon={<EditOutlined />} onClick={() => openEdit(record)}>Sửa</Button>}
          {canManage && <Button icon={<KeyOutlined />} onClick={() => openResetPass(record)}>Reset Pass</Button>}
          {/* ⚠️ MỚI (isRootAdmin) - ẩn nút xoá với record là Root Admin, xem
              chú thích ở UserMobileCard bên trên. */}
          {canDelete && record.id !== user?.id && !record.isRootAdmin && (
            <Button danger icon={<DeleteOutlined />} onClick={() => handleSoftDelete(record)}>Xoá</Button>
          )}
        </Space>
      ),
    },
  ].filter((c: any) => canManage || canDelete || c.key !== 'action');

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
              roleMap={roleMap}
              onEdit={openEdit}
              onResetPass={openResetPass}
              onDelete={handleSoftDelete}
              // ⚠️ MỚI (isRootAdmin) - ẩn nút xoá với record là Root Admin ở
              // FE cho gọn UX; BE (softDeleteUser/hardDeleteUser) mới là nơi
              // chặn thật sự (ForbiddenException) - xem users.service.ts.
              canDelete={canDelete && u.id !== user?.id && !u.isRootAdmin}
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
    // Tab "Đã xoá" (thùng rác) - chỉ hiện với ai có quyền `users.delete`
    // (mặc định chỉ Admin, tuỳ biến qua "/phan-quyen"), tách bạch khỏi
    // `canSeeFullList`/`users.view` vì đây là hành động NHẠY CẢM hơn hẳn
    // chỉ xem danh sách.
    ...(canDelete
      ? [
        {
          key: 'trash',
          label: (
            <Badge count={trashCount} offset={[10, 0]} size="small">
              <span>Đã xoá</span>
            </Badge>
          ),
          children: <TrashTab onCountChange={setTrashCount} onRestored={fetchUsers} />,
        },
      ]
      : []),
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
            {canManage && (
              <Button
                type="primary"
                icon={<UserAddOutlined />}
                onClick={() => { setEditingUser(null); form.resetFields(); setIsModalOpen(true); }}
              >
                Thêm nhân viên
              </Button>
            )}
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
              loading={rolesLoading}
              options={roleOptions}
              // ⚠️ MỚI - đổi vai trò khỏi 'admin' -> tự tắt Switch "Root
              // Admin" đang ẩn đi (antd Form mặc định GIỮ NGUYÊN giá trị
              // field dù Form.Item của nó không render - preserve=true) và
              // xoá theo ô "Mật khẩu hiện tại" nếu đang hiện. Thiếu bước
              // này, payload vẫn có thể lỡ gửi `isRootAdmin: true` kèm role
              // khác 'admin' lên BE (BE sẽ từ chối đúng, nhưng trải nghiệm
              // khó hiểu vì Switch đã ẩn khỏi màn hình từ trước khi bấm Lưu).
              onChange={(value) => {
                if (String(value ?? '').toLowerCase() !== 'admin') {
                  form.setFieldsValue({ isRootAdmin: false, currentPassword: undefined });
                }
              }}
            />
          </Form.Item>

          <Form.Item name="departmentId" label="Phòng ban">
            <Select
              placeholder="Chọn phòng ban"
              allowClear
              options={departments.map((d: any) => ({ value: Number(d.id), label: d.name }))}
            />
          </Form.Item>

          {/* ⚠️ MỚI - Vị trí (Position), đối xứng Phòng ban ở trên. Tuỳ chọn
              (không bắt buộc), KHÔNG ràng buộc phải cùng phòng ban đã chọn ở
              trên - Position chỉ mang tính tổ chức/gợi ý hiển thị (xem JSDoc
              `positions.api.ts::Position.department`), không phải quan hệ
              cha-con bắt buộc. */}
          <Form.Item name="positionId" label="Vị trí">
            <Select
              placeholder="Chọn vị trí (không bắt buộc)"
              allowClear
              options={positions.map((p) => ({ value: p.id, label: p.name }))}
              showSearch
              filterOption={(input, option) =>
                (option?.label as string).toLowerCase().includes(input.toLowerCase())
              }
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

          {/* ⚠️ MỚI (isRootAdmin) - CHỈ hiện với Root Admin đang đăng nhập
              (xem `isRootAdminCaller`). Có thể có NHIỀU Root Admin - bật cờ
              này cho 1 nhân viên `role=admin` khác vẫn giữ nguyên Root Admin
              hiện tại. BE (UsersService) chặn: chỉ role=admin mới bật được,
              và không được tự gỡ Root Admin cuối cùng của hệ thống. */}
          {isRootAdminCaller && isTargetRoleAdmin && (
            <>
              <Form.Item
                name="isRootAdmin"
                label="Root Admin"
                valuePropName="checked"
                initialValue={false}
                tooltip={
                  isEditingSelf
                    ? 'Không thể tự thay đổi trạng thái Root Admin của chính mình - phải nhờ 1 Root Admin khác thực hiện.'
                    : 'Root Admin luôn giữ đủ quyền dù ma trận phân quyền của role Admin bị sửa/thu hồi thế nào đi nữa. Có thể có nhiều Root Admin. Chỉ Root Admin mới bật/tắt được cờ này, và không thể gỡ Root Admin cuối cùng của hệ thống.'
                }
              >
                {/* ⚠️ MỚI - disable tuyệt đối khi đang sửa chính tài khoản
                    đang đăng nhập (xem `isEditingSelf`) - BE cũng chặn cứng
                    hành động này (ForbiddenException), disable ở FE chỉ để
                    tránh gây khó hiểu (bấm được nhưng luôn báo lỗi). */}
                <Switch
                  checkedChildren="Root Admin"
                  unCheckedChildren="Admin thường"
                  disabled={isEditingSelf}
                />
              </Form.Item>

              {/* ⚠️ MỚI - chỉ hiện khi THỰC SỰ đổi trạng thái Root Admin so
                  với giá trị gốc của record đang sửa (xem
                  `isRootAdminChanged`) - khớp đúng điều kiện BE bắt buộc
                  `currentPassword` (UsersService.update()). Xác nhận lại
                  MẬT KHẨU CỦA CHÍNH ROOT ADMIN ĐANG THAO TÁC (không phải mật
                  khẩu của target). */}
              {isRootAdminChanged && (
                <Form.Item
                  name="currentPassword"
                  label="Mật khẩu hiện tại của bạn"
                  tooltip="Xác nhận lại mật khẩu của chính bạn (Root Admin đang thao tác) để cho phép thay đổi trạng thái Root Admin của tài khoản này."
                  rules={[
                    { required: true, message: 'Vui lòng nhập lại mật khẩu hiện tại của bạn để xác nhận' },
                  ]}
                >
                  <Input.Password placeholder="Nhập mật khẩu đăng nhập hiện tại của bạn" />
                </Form.Item>
              )}
            </>
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