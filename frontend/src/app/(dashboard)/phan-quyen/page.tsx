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
  useUpdatePositionOverride, useDeletePositionOverride,
} from '@/lib/hooks/useRoles';
import { RoleWithPermissions, Permission, PermissionScope, RolePermissionEntry } from '@/lib/types/roles.types';
import { DepartmentOverridesPanel } from './DepartmentOverridesPanel';
import { PositionOverridesPanel } from './PositionOverridesPanel';
import { ColorPickerField } from '@/components/common/ColorPickerField';
import { resolveEntityColor } from '@/lib/utils/entityColor';

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
  // ⚠️ MỚI (2026-09-08): tách riêng khỏi `customers.edit` -
  // `customer_group_memberships.set` (bật/tắt "đã tham gia nhóm" ở tab
  // "Nhóm" trong chi tiết KH, và lúc tạo mới KH) - xem PERMISSIONS.md mục 3.
  customer_group_memberships: 'Tham gia nhóm (Checklist KH)',
  leave_requests: 'Nghỉ phép',
  attendance: 'Chấm công',
  reports: 'Báo cáo',
  // ⚠️ "users" gộp chung 2 trang: "/users" (Nhân viên) VÀ "/profile" (chế độ
  // xem Profile người khác) - CÙNG 1 permission users.view, không tách
  // riêng permission cho Profile (đúng kiến trúc, tránh trùng lặp permission
  // cho cùng 1 khả năng) - đổi label để Admin thấy rõ phạm vi ảnh hưởng thật,
  // không hiểu lầm là chỉ liên quan trang "Nhân viên".
  users: 'Nhân viên & Profile',
  // MỚI (migration AddUserSoftDeleteAndProfilePermissions): 3 permission
  // "tự phục vụ" (`profile.edit_info`/`profile.change_password`/
  // `profile.edit_email`) - tách riêng resource `profile` khỏi `users` vì
  // đây là hành động CHÍNH MÌNH làm trên hồ sơ CỦA MÌNH (PATCH /users/me/*),
  // khác hẳn `users.manage` (Admin/Assistant/Manager sửa NGƯỜI KHÁC).
  profile: 'Hồ sơ cá nhân (Tự phục vụ)',
  roles: 'Phân quyền',
  departments: 'Phòng ban',
  link_groups: 'Nhóm liên kết',
  media_sources: 'Nguồn Media',
  audit: 'Nhật ký hệ thống',
  // ⚠️ BỔ SUNG (2026-09-10, cùng lúc tách `assignment_groups.manage` thành
  // view/create/update/delete): resource này trước đó rơi vào fallback
  // `?? resource`, Admin nhìn thấy nhóm quyền hiện raw key
  // "assignment_groups" thay vì tên tiếng Việt như các resource khác.
  assignment_groups: 'Quản lý phụ trách',
  leave_types: 'Loại phép',
  // ⚠️ BỔ SUNG (2026-09-10, cùng lúc tách `customer_statuses.manage` thành
  positions: 'Vị trí',
  customer_statuses: 'Trạng thái khách hàng',
  // ⚠️ BỔ SUNG (2026-09-10, cùng lúc tách `customer_statuses.manage` thành
  // view/create/update/delete): resource này trước đó rơi vào fallback
  // `?? resource`, Admin nhìn thấy nhóm quyền hiện raw key
  // "customer_statuses" thay vì tên tiếng Việt như các resource khác.
  storage: 'Lưu trữ hình ảnh',
  uploads: 'Tải lên hình ảnh',
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
        color: resolveEntityColor(editingRole?.color),
      });
    }
  }, [open, editingRole, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingRole) {
        updateMutation.mutate(
          { id: editingRole.id, payload: { name: values.name, description: values.description, color: values.color } },
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
          { code: values.code, name: values.name, description: values.description, color: values.color },
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

        <ColorPickerField extra="Màu Tag role này hiển thị ở bảng danh sách nhân viên, hồ sơ cá nhân, nhật ký hệ thống..." />
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
  positionId,
  onSaved,
}: {
  role: RoleWithPermissions;
  canManage: boolean;
  initialPermissions: RolePermissionEntry[];
  departmentId?: number;
    // Override theo Vị trí - mirror y hệt departmentId, KHÔNG dùng đồng thời
    // cả hai (renderEditor của DepartmentOverridesPanel/PositionOverridesPanel
    // chỉ truyền đúng 1 trong 2, xem RolePermissionsDrawer bên dưới).
    positionId?: number;
  onSaved: () => void;
}) {
  const { message } = App.useApp();
  const { permissions: allPermissions, isLoading: loadingCatalog } = useAllPermissions();
  const updateGlobalMutation = useUpdateRolePermissions();
  const updateDeptMutation = useUpdateDepartmentOverride(role.id);
  const updatePosMutation = useUpdatePositionOverride(role.id);
  const isSaving = departmentId
    ? updateDeptMutation.isPending
    : positionId
      ? updatePosMutation.isPending
      : updateGlobalMutation.isPending;

  // Map cục bộ: permissionKey -> scope đã chọn (null = permission không hỗ
  // trợ scope nhưng ĐANG bật). Permission KHÔNG có mặt trong map = đang tắt.
  // `initialPermissions` có kiểu rộng hơn (OverrideScope, có thể lý thuyết
  // chứa 'none') nhưng nơi gọi (DepartmentOverridesPanel.mergeGlobalWithOverride,
  // hoặc role.permissions ở chế độ Toàn cục) ĐÃ giải quyết hết 'none' thành
  // "xoá khỏi danh sách" trước khi truyền vào đây - Editor chỉ thao tác
  // trên scope THẬT, không bao giờ tự set 'none' (chỉ handleSave() suy ra
  // 'none' lúc tính diff để gửi lên BE). Lọc phòng thân ở đây để khớp đúng
  // kiểu Map (PermissionScope | null), không lỡ tay giữ 'none' làm giá trị
  // hiển thị nếu sau này có nơi gọi khác truyền thiếu chuẩn.
  const [checked, setChecked] = useState<Map<string, PermissionScope | null>>(
    () =>
      new Map(
        initialPermissions
          .filter((entry) => entry.scope !== 'none')
          .map((entry) => [entry.permissionKey, entry.scope as PermissionScope | null]),
      ),
  );

  const grouped = useMemo(() => {
    const byResource = new Map<string, Permission[]>();
    for (const p of allPermissions) {
      if (!byResource.has(p.resource)) byResource.set(p.resource, []);
      byResource.get(p.resource)!.push(p);
    }
    return Array.from(byResource.entries());
  }, [allPermissions]);

  // Chỉ có ý nghĩa ở chế độ Override phòng ban (`departmentId` có giá trị) -
  // baseline Toàn cục để so sánh, hiện tag "Ghi đè" cho đúng permission đang
  // KHÁC so với Toàn cục (thêm mới, đổi scope, hoặc bị tắt hẳn dù Toàn cục
  // đang bật) - giúp Admin nhìn 1 phát biết ngay override đang chỉnh gì mà
  // không cần tự nhớ/so sánh lại với tab Toàn cục.
  const globalBaseline = useMemo(
    () => new Map(role.permissions.map((p) => [p.permissionKey, p.scope])),
    [role.permissions],
  );
  const isOverridden = (permissionKey: string): boolean => {
    if (!departmentId && !positionId) return false;
    const globalScope = globalBaseline.get(permissionKey);
    const hasGlobal = globalBaseline.has(permissionKey);
    const currentScope = checked.get(permissionKey) ?? null;
    const isChecked = checked.has(permissionKey);
    if (!hasGlobal && !isChecked) return false; // cả 2 đều tắt - không có gì để ghi đè
    if (!hasGlobal && isChecked) return true; // override THÊM quyền Toàn cục không có
    if (hasGlobal && !isChecked) return true; // override TỪ CHỐI quyền Toàn cục đang bật
    return globalScope !== currentScope; // cùng bật nhưng khác scope
  };

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
  const deletePosMutation = useDeletePositionOverride(role.id);

  const handleSave = () => {
    if (departmentId || positionId) {
    // Chế độ Override (phòng ban HOẶC vị trí - 2 nhánh dùng CHUNG logic diff
    // dưới đây, chỉ khác mutation gọi ở cuối): `initialPermissions` (và do
    // đó `checked` lúc khởi tạo) đã được Department/PositionOverridesPanel
    // đồng bộ với Toàn cục (mergeGlobalWithOverride) - nên `checked` hiện
    // tại LÀ trạng thái HIỆU LỰC MONG MUỐN cuối cùng, không phải override
    // thô. Phải tự tính lại phần CHÊNH LỆCH so với `role.permissions`
    // (Toàn cục) trước khi gửi lên BE (update*Override LUÔN thay thế toàn
    // bộ dòng override bằng đúng mảng gửi lên):
      //  - Có trong `checked`, khác/không có ở Toàn cục -> gửi kèm scope
      //    thật (override CHO PHÉP thêm/đổi quyền).
      //  - Có ở Toàn cục nhưng KHÔNG còn trong `checked` (vừa bị bỏ tick) ->
      //    gửi scope='none' (TỪ CHỐI TƯỜNG MINH - xem OverrideScope) để
      //    phòng ban/vị trí này thật sự mất quyền, không bị fallback ngược
      //    lại Toàn cục.
      //  - Giống hệt Toàn cục -> bỏ qua, không cần gửi (mặc định kế thừa).
      const globalMap = new Map(role.permissions.map((p) => [p.permissionKey, p.scope]));
      const diff: RolePermissionEntry[] = [];

      for (const [permissionKey, scope] of checked.entries()) {
        const globalScope = globalMap.get(permissionKey) ?? null;
        if (!globalMap.has(permissionKey) || globalScope !== scope) {
          diff.push({ permissionKey, scope });
        }
      }
      for (const globalEntry of role.permissions) {
        if (!checked.has(globalEntry.permissionKey)) {
          diff.push({ permissionKey: globalEntry.permissionKey, scope: 'none' });
        }
      }

      const scopeLabel = departmentId ? 'phòng ban' : 'vị trí';

      if (diff.length === 0) {
        // Trùng khớp hoàn toàn với Toàn cục -> không còn override nào cả,
        // gỡ hẳn dòng override (nếu có) thay vì lưu 1 mảng rỗng.
        const deleteMutation = departmentId ? deleteDeptMutation : deletePosMutation;
        const deleteId = (departmentId ?? positionId) as number;
        deleteMutation.mutate(deleteId, {
          onSuccess: () => {
            message.success(`Đã gỡ override cho ${scopeLabel} này (quay lại dùng ma trận Toàn cục)`);
            onSaved();
          },
          onError: (err: any) => message.error(err?.response?.data?.message || 'Cập nhật thất bại'),
        });
        return;
      }
      if (departmentId) {
        updateDeptMutation.mutate(
          { departmentId, payload: { permissions: diff } },
          {
            onSuccess: () => {
              message.success(`Đã lưu override riêng cho phòng ban`);
              onSaved();
            },
            onError: (err: any) => message.error(err?.response?.data?.message || 'Cập nhật thất bại'),
          },
        );
      } else {
        updatePosMutation.mutate(
          { positionId: positionId as number, payload: { permissions: diff } },
          {
            onSuccess: () => {
              message.success(`Đã lưu override riêng cho vị trí`);
              onSaved();
            },
            onError: (err: any) => message.error(err?.response?.data?.message || 'Cập nhật thất bại'),
          },
        );
      }
      return;
    }

    const payload: RolePermissionEntry[] = Array.from(checked.entries()).map(([permissionKey, scope]) => ({
      permissionKey,
      scope,
    }));

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
              const overridden = isOverridden(p.key);
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
                    border: overridden ? '1px solid #ffd591' : '1px solid #f0f0f0',
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
                      <Space size={6}>
                        <Text strong>{p.action}</Text>
                        {overridden && (
                          <Tag color="orange" style={{ marginInlineEnd: 0, fontSize: 11, lineHeight: '16px' }}>
                            Ghi đè
                          </Tag>
                        )}
                      </Space>
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
  canManagePositions,
  onClose,
}: {
  open: boolean;
  role: RoleWithPermissions | null;
  canManage: boolean;
  canManageDepartments: boolean;
    canManagePositions: boolean;
  onClose: () => void;
}) {
  // 'global' | 'department' | 'position' - reset về 'global' mỗi khi mở
  // Drawer cho 1 role khác (key={role.id} bên dưới lo phần reset state con,
  // còn tab thì tự quản qua state riêng, reset thủ công lúc onClose).
  const [tab, setTab] = useState<'global' | 'department' | 'position'>('global');

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
              onChange={(v) => setTab(v as 'global' | 'department' | 'position')}
              options={[
                { label: 'Toàn cục', value: 'global' },
                { label: 'Theo phòng ban', value: 'department' },
                { label: 'Theo Vị trí', value: 'position' },
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
          ) : tab === 'department' ? (
            <DepartmentOverridesPanel
              role={role}
              canManageDepartments={canManageDepartments}
              renderEditor={(departmentId, initialPermissions) => (
                <RolePermissionsEditor
                  key={`${role.id}-dept-${departmentId}`}
                  role={role}
                  canManage={canManage}
                  initialPermissions={initialPermissions}
                  departmentId={departmentId}
                  onSaved={onClose}
                />
              )}
            />
            ) : (
              <PositionOverridesPanel
                role={role}
                canManagePositions={canManagePositions}
                renderEditor={(positionId, initialPermissions) => (
                  <RolePermissionsEditor
                    key={`${role.id}-pos-${positionId}`}
                    role={role}
                    canManage={canManage}
                    initialPermissions={initialPermissions}
                    positionId={positionId}
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
  // GET /positions (để chọn Vị trí trong tab Override) yêu cầu
  // positions.view riêng - mirror y hệt canManageDepartments ở trên (xem
  // PositionOverridesPanel.tsx).
  const canManagePositions = can('positions.view');

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
            <Tag color={resolveEntityColor(role.color)} style={{ fontWeight: 600 }}>{role.name}</Tag>
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
        canManagePositions={canManagePositions}
        onClose={() => setPermDrawerOpen(false)}
      />
    </div>
  );
}