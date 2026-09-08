'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Table, Button, Tag, Space, Modal, Form, Input, App,
  Popconfirm, Typography, Drawer, Segmented, Empty, Spin,
  Alert, Checkbox,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SafetyOutlined,
  SaveOutlined, LockOutlined,
} from '@ant-design/icons';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import {
  useRoles, useAllPermissions, useCreateRole, useUpdateRole,
  useDeleteRole, useUpdateRolePermissions,
  useUpdateDepartmentOverride, useDeleteDepartmentOverride,
} from '@/lib/hooks/useRoles';
import { RoleWithPermissions, Permission, PermissionScope, RolePermissionEntry } from '@/lib/types/roles.types';
import { DepartmentOverridesPanel } from './DepartmentOverridesPanel';

const { Title, Text, Paragraph } = Typography;

const RESOURCE_LABEL: Record<string, string> = {
  customers: 'Khách hàng',
  // ⚠️ BỔ SUNG (rà soát bảng điều khiển phân quyền 2026-09-08): resource
  // `customer_notes` đã tách riêng khỏi `customers.note` từ migration
  // `1779200000000-SplitCustomerNotesPermissions.ts` (3 permission
  // customer_notes.create/edit/delete) nhưng label bị thiếu ở đây -
  // trước đây rơi vào nhánh fallback `?? resource` nên Admin nhìn thấy
  // nhóm quyền hiện raw key "customer_notes" xấu và khó hiểu thay vì tên
  // tiếng Việt như các resource khác.
  customer_notes: 'Ghi chú khách hàng',
  leave_requests: 'Nghỉ phép',
  attendance: 'Chấm công',
  reports: 'Báo cáo',
  // ⚠️ "users" gộp chung 2 trang: "/users" (Nhân viên) VÀ "/profile" (chế độ
  // xem Profile người khác) - CÙNG 1 permission users.view, không tách
  // riêng permission cho Profile (đúng kiến trúc, tránh trùng lặp permission
  // cho cùng 1 khả năng) - đổi label để Admin thấy rõ phạm vi ảnh hưởng thật,
  // không hiểu lầm là chỉ liên quan trang "Nhân viên".
  users: 'Nhân viên & Profile',
  roles: 'Phân quyền',
  departments: 'Phòng ban',
  link_groups: 'Nhóm liên kết',
  media_sources: 'Nguồn Media',
  audit: 'Nhật ký hệ thống',
};

const SCOPE_LABEL: Record<PermissionScope, string> = {
  own: 'Chỉ của mình',
  department: 'Phòng ban quản lý',
  all: 'Toàn bộ',
};

const SCOPE_OPTIONS = (['own', 'department', 'all'] as PermissionScope[]).map((v) => ({
  label: SCOPE_LABEL[v],
  value: v,
}));

// ── Modal Tạo/Sửa role (code + tên + mô tả) ─────────────────────────────────
function RoleFormModal({
  open,
  editingRole,
  onClose,
}: {
  open: boolean;
  editingRole: RoleWithPermissions | null;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const createMutation = useCreateRole();
  const updateMutation = useUpdateRole();

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        code: editingRole?.code ?? '',
        name: editingRole?.name ?? '',
        description: editingRole?.description ?? '',
      });
    }
  }, [open, editingRole, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingRole) {
        updateMutation.mutate(
          { id: editingRole.id, payload: { name: values.name, description: values.description } },
          {
            onSuccess: () => {
              message.success('Đã cập nhật Role');
              onClose();
            },
            onError: (err: any) => message.error(err?.response?.data?.message || 'Cập nhật thất bại'),
          },
        );
      } else {
        createMutation.mutate(
          { code: values.code, name: values.name, description: values.description },
          {
            onSuccess: () => {
              message.success('Đã tạo Role mới');
              onClose();
            },
            onError: (err: any) => message.error(err?.response?.data?.message || 'Tạo Role thất bại'),
          },
        );
      }
    } catch {
      // lỗi validate - antd tự hiển thị
    }
  };

  return (
    <Modal
      title={editingRole ? `Sửa Role "${editingRole.name}"` : 'Tạo Role mới'}
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={createMutation.isPending || updateMutation.isPending}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="code"
          label="Mã Role (code)"
          tooltip="Định danh nội bộ, KHÔNG đổi được sau khi tạo - dùng để lưu vào cột role của nhân viên"
          rules={[
            { required: true, message: 'Vui lòng nhập mã Role' },
            { pattern: /^[a-z][a-z0-9_]*$/, message: 'Chỉ chữ thường/số/gạch dưới, bắt đầu bằng chữ (vd: mkt_manager)' },
            { max: 50, message: 'Tối đa 50 ký tự' },
          ]}
        >
          <Input placeholder="mkt_manager" disabled={!!editingRole} />
        </Form.Item>
        <Form.Item
          name="name"
          label="Tên hiển thị"
          rules={[
            { required: true, message: 'Vui lòng nhập tên hiển thị' },
            { max: 100, message: 'Tối đa 100 ký tự' },
          ]}
        >
          <Input placeholder="Trưởng phòng Marketing" />
        </Form.Item>
        <Form.Item name="description" label="Mô tả">
          <Input.TextArea rows={2} placeholder="Ghi chú ngắn về vai trò này (không bắt buộc)" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// Tách thân Drawer ra component riêng, nhận `role` KHÔNG NULL - khởi tạo
// state `checked` TRỰC TIẾP từ `initialPermissions` qua `useState(() => ...)`
// thay vì dùng `useEffect` + `setChecked` (tránh set-state-trong-effect,
// không cần thiết khi có thể khởi tạo ngay từ đầu). Nơi gọi PHẢI truyền
// `key=...` duy nhất theo (role.id, departmentId) để React tự tạo instance
// mới (state mới) mỗi khi đổi role/phòng ban đang xem/sửa.
//
// Dùng CHUNG cho cả 2 loại lưu (đúng yêu cầu "tách rõ nhưng dùng lại UI cho
// nhất quán"): `departmentId=undefined` -> lưu vào ma trận TOÀN CỤC của role
// (PATCH /roles/:id/permissions); `departmentId=<number>` -> lưu vào
// OVERRIDE riêng của phòng ban đó (PUT
// /roles/:id/department-overrides/:departmentId) - permissions ở đây là
// phần "chênh" so với Toàn cục, không phải toàn bộ quyền thật sự phòng ban
// đó có (xem giải thích ở DepartmentOverride type).
function RolePermissionsEditor({
  role,
  canManage,
  initialPermissions,
  departmentId,
  onSaved,
}: {
  role: RoleWithPermissions;
  canManage: boolean;
  initialPermissions: RolePermissionEntry[];
  departmentId?: number;
  onSaved: () => void;
}) {
  const { message } = App.useApp();
  const { permissions: allPermissions, isLoading: loadingCatalog } = useAllPermissions();
  const updateGlobalMutation = useUpdateRolePermissions();
  const updateDeptMutation = useUpdateDepartmentOverride(role.id);
  const isSaving = departmentId ? updateDeptMutation.isPending : updateGlobalMutation.isPending;

  // Map cục bộ: permissionKey -> scope đã chọn (null = permission không hỗ
  // trợ scope nhưng ĐANG bật). Permission KHÔNG có mặt trong map = đang tắt.
  const [checked, setChecked] = useState<Map<string, PermissionScope | null>>(
    () => new Map(initialPermissions.map((entry) => [entry.permissionKey, entry.scope])),
  );

  const grouped = useMemo(() => {
    const byResource = new Map<string, Permission[]>();
    for (const p of allPermissions) {
      if (!byResource.has(p.resource)) byResource.set(p.resource, []);
      byResource.get(p.resource)!.push(p);
    }
    return Array.from(byResource.entries());
  }, [allPermissions]);

  const toggle = (permission: Permission, on: boolean) => {
    if (!canManage) return;
    setChecked((prev) => {
      const next = new Map(prev);
      if (on) {
        // Mặc định chọn scope hẹp nhất ('own') khi vừa bật - Admin phải chủ
        // động nới rộng, tránh lỡ tay cấp quyền "all" chỉ vì quên chỉnh.
        next.set(permission.key, permission.supportsScope ? 'own' : null);
      } else {
        next.delete(permission.key);
      }
      return next;
    });
  };

  const setScope = (permissionKey: string, scope: PermissionScope) => {
    if (!canManage) return;
    setChecked((prev) => {
      const next = new Map(prev);
      next.set(permissionKey, scope);
      return next;
    });
  };

  const deleteDeptMutation = useDeleteDepartmentOverride(role.id);

  const handleSave = () => {
    const payload: RolePermissionEntry[] = Array.from(checked.entries()).map(([permissionKey, scope]) => ({
      permissionKey,
      scope,
    }));

    if (departmentId) {
      if (payload.length === 0) {
        // Bỏ hết checkbox = coi như không còn override gì cho phòng ban này
        // nữa - gọi DELETE thay vì PUT với mảng rỗng, để dòng override biến
        // mất hẳn (phòng ban quay lại dùng đúng ma trận Toàn cục), thay vì
        // giữ lại 1 "override rỗng" gây hiểu nhầm là phòng ban đó có
        // 0 quyền tuyệt đối.
        deleteDeptMutation.mutate(departmentId, {
          onSuccess: () => {
            message.success(`Đã gỡ override cho phòng ban này (quay lại dùng ma trận Toàn cục)`);
            onSaved();
          },
          onError: (err: any) => message.error(err?.response?.data?.message || 'Cập nhật thất bại'),
        });
        return;
      }
      updateDeptMutation.mutate(
        { departmentId, payload: { permissions: payload } },
        {
          onSuccess: () => {
            message.success(`Đã lưu override riêng cho phòng ban`);
            onSaved();
          },
          onError: (err: any) => message.error(err?.response?.data?.message || 'Cập nhật thất bại'),
        },
      );
      return;
    }

    updateGlobalMutation.mutate(
      { id: role.id, payload: { permissions: payload } },
      {
        onSuccess: () => {
          message.success(`Đã cập nhật ma trận quyền cho "${role.name}"`);
          onSaved();
        },
        onError: (err: any) => message.error(err?.response?.data?.message || 'Cập nhật thất bại'),
      },
    );
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        {canManage && (
          <Button type="primary" icon={<SaveOutlined />} loading={isSaving} onClick={handleSave}>
            Lưu thay đổi
          </Button>
        )}
      </div>

      {!canManage && (
        <Alert
          type="info"
          showIcon
          icon={<LockOutlined />}
          message="Chỉ xem - bạn không có quyền roles.manage nên không sửa được ma trận này."
          style={{ marginBottom: 16 }}
        />
      )}

      {loadingCatalog ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : (
        grouped.map(([resource, perms]) => (
          <div key={resource} style={{ marginBottom: 24 }}>
            <Title level={5} style={{ marginBottom: 8 }}>
              {RESOURCE_LABEL[resource] ?? resource}
            </Title>
            {perms.map((p) => {
              const isChecked = checked.has(p.key);
              const scope = checked.get(p.key) ?? null;
              return (
                <div
                  key={p.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    marginBottom: 6,
                    borderRadius: 8,
                    border: '1px solid #f0f0f0',
                    background: isChecked ? '#f6ffed' : undefined,
                    opacity: canManage ? 1 : 0.85,
                  }}
                >
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: canManage ? 'pointer' : 'default', flex: 1, minWidth: 0 }}
                    onClick={() => toggle(p, !isChecked)}
                  >
                    <Checkbox
                      checked={isChecked}
                      disabled={!canManage}
                      onChange={(e) => toggle(p, e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div style={{ minWidth: 0 }}>
                      <Text strong>{p.action}</Text>
                      {p.description && (
                        <div style={{ fontSize: 12, color: '#8c8c8c' }}>{p.description}</div>
                      )}
                    </div>
                  </div>
                  {isChecked && p.supportsScope && (
                    <Segmented
                      size="small"
                      options={SCOPE_OPTIONS}
                      value={scope ?? 'own'}
                      disabled={!canManage}
                      onChange={(v) => setScope(p.key, v as PermissionScope)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}
    </>
  );
}

// ── Drawer chỉnh ma trận quyền của 1 role ───────────────────────────────────
function RolePermissionsDrawer({
  open,
  role,
  canManage,
  canManageDepartments,
  onClose,
}: {
  open: boolean;
  role: RoleWithPermissions | null;
  canManage: boolean;
  canManageDepartments: boolean;
  onClose: () => void;
}) {
  // 'global' | 'department' - reset về 'global' mỗi khi mở Drawer cho 1 role
  // khác (key={role.id} bên dưới lo phần reset state con, còn tab thì tự
  // quản qua state riêng, reset thủ công lúc onClose).
  const [tab, setTab] = useState<'global' | 'department'>('global');

  return (
    <Drawer
      title={role ? `Ma trận quyền: ${role.name}` : ''}
      open={open}
      onClose={() => {
        setTab('global');
        onClose();
      }}
      size={640}
      destroyOnHidden
    >
      {role && (
        <>
          {/* Endpoint department-overrides yêu cầu roles.manage (không có
              bản chỉ-xem) - người chỉ có roles.view không thấy tab này,
              khớp đúng BE thay vì hiện ra rồi gọi API dính 403. */}
          {canManage && (
            <Segmented
              block
              style={{ marginBottom: 16 }}
              value={tab}
              onChange={(v) => setTab(v as 'global' | 'department')}
              options={[
                { label: 'Toàn cục', value: 'global' },
                { label: 'Theo phòng ban', value: 'department' },
              ]}
            />
          )}

          {tab === 'global' || !canManage ? (
            <RolePermissionsEditor
              // key={role.id}: buộc React tạo instance MỚI (state mới, khởi tạo
              // lại từ đầu) mỗi khi đổi sang role khác - không cần useEffect.
              key={role.id}
              role={role}
              canManage={canManage}
              initialPermissions={role.permissions}
              onSaved={onClose}
            />
          ) : (
            <DepartmentOverridesPanel
              role={role}
              canManageDepartments={canManageDepartments}
              renderEditor={(departmentId, initialPermissions) => (
                <RolePermissionsEditor
                  key={`${role.id}-${departmentId}`}
                  role={role}
                  canManage={canManage}
                  initialPermissions={initialPermissions}
                  departmentId={departmentId}
                  onSaved={onClose}
                />
              )}
            />
          )}
        </>
      )}
    </Drawer>
  );
}

// ── Trang chính ──────────────────────────────────────────────────────────────
export default function PhanQuyenPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const { can, isLoading: loadingPermissions } = useMyPermissions();
  const canView = can('roles.view');
  const canManage = can('roles.manage');
  // GET /departments (để chọn phòng ban trong tab Override) yêu cầu
  // departments.view riêng - không giả định roles.manage kéo theo luôn
  // quyền này (xem DepartmentOverridesPanel.tsx).
  const canManageDepartments = can('departments.view');

  // ⚠️ Sidebar/trang chủ đã ẩn mục "Phân quyền" nếu không có `roles.view`
  // (xem nav-config.tsx), nhưng đó chỉ là UX - vào THẲNG url `/phan-quyen`
  // vẫn phải tự chặn ở đây, không dựa hoàn toàn vào việc sidebar đã ẩn link.
  // Cùng pattern với audit-logs/page.tsx (dùng router.replace + message.warning),
  // chỉ khác: dùng permission ĐỘNG (`can('roles.view')`) thay vì role tĩnh -
  // đúng tinh thần trang quản lý phân quyền phải tự tuân thủ chính hệ thống
  // permission mà nó quản lý.
  useEffect(() => {
    if (!loadingPermissions && !canView) {
      message.warning('Bạn không có quyền truy cập trang này');
      router.replace('/customers');
    }
  }, [loadingPermissions, canView, router, message]);

  const { roles, isLoading } = useRoles();
  const deleteMutation = useDeleteRole();

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleWithPermissions | null>(null);

  const [permDrawerOpen, setPermDrawerOpen] = useState(false);
  const [viewingRole, setViewingRole] = useState<RoleWithPermissions | null>(null);

  const openCreate = () => {
    setEditingRole(null);
    setFormModalOpen(true);
  };
  const openEdit = (role: RoleWithPermissions) => {
    setEditingRole(role);
    setFormModalOpen(true);
  };
  const openPermissions = (role: RoleWithPermissions) => {
    setViewingRole(role);
    setPermDrawerOpen(true);
  };

  const handleDelete = (role: RoleWithPermissions) => {
    deleteMutation.mutate(role.id, {
      onSuccess: () => message.success(`Đã xoá Role "${role.name}"`),
      onError: (err: any) => message.error(err?.response?.data?.message || 'Xoá thất bại'),
    });
  };

  // Đang chờ xác định quyền HOẶC không có quyền (chuẩn bị redirect ở effect
  // trên) -> không render bảng/nội dung nhạy cảm ra màn hình dù chỉ 1 khắc.
  if (loadingPermissions || !canView) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  const columns = [
    {
      title: 'Role',
      key: 'name',
      render: (_: unknown, role: RoleWithPermissions) => (
        <Space orientation="vertical" size={0}>
          <Space>
            <Text strong>{role.name}</Text>
            {role.isSystem && <Tag color="gold">Hệ thống</Tag>}
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            code: {role.code}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Mô tả',
      dataIndex: 'description',
      key: 'description',
      render: (v: string | null) => v || <Text type="secondary">—</Text>,
    },
    {
      title: 'Số quyền đang bật',
      key: 'permCount',
      width: 140,
      render: (_: unknown, role: RoleWithPermissions) => <Tag>{role.permissions.length}</Tag>,
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: canManage ? 320 : 140,
      render: (_: unknown, role: RoleWithPermissions) => (
        <Space wrap>
          <Button size="small" icon={<SafetyOutlined />} onClick={() => openPermissions(role)}>
            {canManage ? 'Sửa quyền' : 'Xem quyền'}
          </Button>
          {canManage && (
            <>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(role)}>
                Sửa tên
              </Button>
              {!role.isSystem && (
                <Popconfirm
                  title={`Xoá Role "${role.name}"?`}
                  description="Chỉ xoá được nếu không còn nhân viên nào đang gán Role này."
                  onConfirm={() => handleDelete(role)}
                >
                  <Button size="small" danger icon={<DeleteOutlined />}>
                    Xoá
                  </Button>
                </Popconfirm>
              )}
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Phân quyền
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Tạo Role tuỳ chỉnh và chỉnh ma trận quyền theo từng permission. Thay đổi ở đây ảnh hưởng
            trực tiếp tới API (chặn/không chặn) - Sidebar và các nút bấm tương ứng cũng tự ẩn/hiện
            theo trong tối đa 60 giây (không cần deploy lại).
          </Paragraph>
        </div>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Tạo Role mới
          </Button>
        )}
      </div>

      {!canManage && (
        <Alert
          type="info"
          showIcon
          title="Bạn chỉ có quyền xem (roles.view) - không tạo/sửa/xoá được Role hay ma trận quyền."
          style={{ marginBottom: 16 }}
        />
      )}

      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={roles}
        pagination={false}
        locale={{ emptyText: <Empty description="Chưa có Role nào" /> }}
      />

      <RoleFormModal
        open={formModalOpen}
        editingRole={editingRole}
        onClose={() => setFormModalOpen(false)}
      />

      <RolePermissionsDrawer
        open={permDrawerOpen}
        role={viewingRole}
        canManage={canManage}
        canManageDepartments={canManageDepartments}
        onClose={() => setPermDrawerOpen(false)}
      />
    </div>
  );
}