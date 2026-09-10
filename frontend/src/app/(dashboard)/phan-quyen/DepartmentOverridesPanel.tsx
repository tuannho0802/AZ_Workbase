'use client';

import { useState } from 'react';
import { Select, Tag, Space, Typography, Alert, Empty, Spin, Button } from 'antd';
import { BankOutlined, UndoOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useDepartments } from '@/lib/hooks/useDepartments';
import {
  useDepartmentOverrides,
  useDeleteDepartmentOverride,
} from '@/lib/hooks/useRoles';
import { RoleWithPermissions, DepartmentOverride, RolePermissionEntry } from '@/lib/types/roles.types';

const { Text, Paragraph } = Typography;

/**
 * Hợp nhất ma trận Toàn cục với override (nếu có) của 1 phòng ban, ra đúng
 * trạng thái HIỆU LỰC để hiển thị lúc mở Editor - FIX bug thật: trước đây
 * Editor override luôn khởi tạo từ mảng override THÔ (`selectedOverride?.
 * permissions ?? []`), nên phòng ban CHƯA override gì thấy TOÀN BỘ checkbox
 * trống trơn dù Toàn cục đang bật đầy đủ - muốn override 1 quyền, Admin
 * buộc phải tự tay tick lại HẾT các quyền Toàn cục khác trong tab Override
 * (hoặc tệ hơn, phải tắt ở Toàn cục trước). Hàm này đảm bảo Editor LUÔN mở
 * ra ở đúng trạng thái "phòng ban này thật sự có quyền gì" (Toàn cục đã áp
 * dụng override, nếu có) - sync 1 chiều Toàn cục -> Override ngay lúc mở,
 * đúng yêu cầu nghiệp vụ.
 */
function mergeGlobalWithOverride(
  globalPermissions: RolePermissionEntry[],
  overridePermissions: RolePermissionEntry[],
): RolePermissionEntry[] {
  const map = new Map<string, RolePermissionEntry['scope']>(
    globalPermissions.map((p) => [p.permissionKey, p.scope]),
  );
  for (const o of overridePermissions) {
    if (o.scope === 'none') {
      // Từ chối tường minh - phòng ban KHÔNG có quyền này dù Toàn cục bật.
      map.delete(o.permissionKey);
    } else {
      map.set(o.permissionKey, o.scope);
    }
  }
  return Array.from(map.entries()).map(([permissionKey, scope]) => ({ permissionKey, scope }));
}

/**
 * Tab "Theo phòng ban" trong Drawer ma trận quyền - CHÍNH LÀ phần bạn yêu
 * cầu ("1 bảng điều khiển Permission Dành cho department khớp với BE").
 *
 * Cả 4 endpoint override (GET/PUT/DELETE department-overrides) đều yêu cầu
 * `roles.manage` - KHÔNG có phiên bản `roles.view`-only để chỉ xem (xem
 * roles.controller.ts) - nên panel này chỉ render khi `canManage=true`,
 * component cha (RolePermissionsDrawer) không mount panel này cho người
 * chỉ có `roles.view` thay vì gọi API rồi dính 403.
 */
export function DepartmentOverridesPanel({
  role,
  canManageDepartments,
  renderEditor,
}: {
  role: RoleWithPermissions;
  /** can('departments.view') - lấy TỪ NGOÀI vào thay vì tự gọi useMyPermissions()
   * ở đây, tránh 1 nơi khác trong cây phải đoán lại đúng permission key. */
  canManageDepartments: boolean;
  /** Render UI chỉnh quyền dùng lại nguyên `RolePermissionsEditor` của cha -
   * nhận vào để tránh vòng phụ thuộc import giữa 2 file. */
  renderEditor: (departmentId: number, initialPermissions: DepartmentOverride['permissions']) => React.ReactNode;
}) {
  const { message } = App.useApp();
  const { departments, isLoading: loadingDepartments } = useDepartments();
  const { overrides, isLoading: loadingOverrides } = useDepartmentOverrides(role.id);
  const deleteMutation = useDeleteDepartmentOverride(role.id);

  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);

  if (!canManageDepartments) {
    // GET /departments yêu cầu departments.view riêng (khác roles.manage) -
    // không giả định người có roles.manage LUÔN có luôn departments.view.
    return (
      <Alert
        type="info"
        showIcon
        message="Thiếu quyền departments.view"
        description="Bạn có quyền sửa ma trận quyền (roles.manage) nhưng chưa có quyền xem danh sách phòng ban (departments.view) - cần quyền này để chọn phòng ban muốn override."
      />
    );
  }

  const overrideMap = new Map(overrides.map((o) => [o.departmentId, o]));
  const selectedOverride = selectedDeptId ? overrideMap.get(selectedDeptId) : undefined;

  return (
    <div>
      <Paragraph type="secondary" style={{ marginBottom: 12 }}>
        Cấp quyền RIÊNG cho 1 phòng ban, khác với ma trận Toàn cục ở trên - ví dụ role &quot;Nhân
        viên&quot; không có <Text code>customers.assign</Text> ở Toàn cục, nhưng phòng Marketing vẫn
        cần quyền này thì thêm override tại đây, chỉ áp dụng cho đúng phòng ban đó. Bảng bên dưới LUÔN
        mở ra đúng trạng thái phòng ban đang thật sự có (đã tự đồng bộ với Toàn cục) - chỉ cần tick/bỏ
        tick đúng quyền muốn khác đi, không cần qua tab Toàn cục để tắt trước.
      </Paragraph>

      {overrides.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ fontSize: 13 }}>Đang có override:</Text>{' '}
          <Space wrap size={[4, 4]} style={{ marginTop: 4 }}>
            {overrides.map((o) => (
              <Tag
                key={o.departmentId}
                color={selectedDeptId === o.departmentId ? 'blue' : 'default'}
                icon={<BankOutlined />}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedDeptId(o.departmentId)}
              >
                {o.departmentName} ({o.permissions.length} quyền)
              </Tag>
            ))}
          </Space>
        </div>
      )}

      <Select
        placeholder="Chọn phòng ban để xem/sửa override..."
        style={{ width: '100%', marginBottom: 16 }}
        loading={loadingDepartments}
        value={selectedDeptId}
        onChange={(v) => setSelectedDeptId(v)}
        options={departments.map((d) => ({
          value: d.id,
          label: overrideMap.has(d.id) ? `${d.name} (đang override)` : d.name,
        }))}
        showSearch={{
          optionFilterProp: "label"
        }}
      />

      {loadingOverrides ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      ) : selectedDeptId ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text strong>
              {departments.find((d) => d.id === selectedDeptId)?.name}
            </Text>
            {selectedOverride && (
              <Button
                size="small"
                icon={<UndoOutlined />}
                loading={deleteMutation.isPending}
                onClick={() =>
                  deleteMutation.mutate(selectedDeptId, {
                    onSuccess: () => message.success('Đã gỡ override - phòng ban quay lại dùng ma trận Toàn cục'),
                    onError: (err: any) =>
                      message.error(err?.response?.data?.message || 'Gỡ override thất bại'),
                  })
                }
              >
                Gỡ override (dùng lại Toàn cục)
              </Button>
            )}
          </div>
            {renderEditor(selectedDeptId, mergeGlobalWithOverride(role.permissions, selectedOverride?.permissions ?? []))}
        </>
      ) : (
        <Empty description="Chọn 1 phòng ban ở trên để xem/sửa override" />
      )}
    </div>
  );
}