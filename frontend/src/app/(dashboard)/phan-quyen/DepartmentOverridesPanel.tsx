'use client';

import { useState } from 'react';
import { Select, Tag, Space, Typography, Alert, Empty, Spin, Button } from 'antd';
import { BankOutlined, CopyOutlined, UndoOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useDepartments } from '@/lib/hooks/useDepartments';
import { Department } from '@/lib/api/departments.api';
import {
  useDepartmentOverrides,
  useDeleteDepartmentOverride,
} from '@/lib/hooks/useRoles';
import { RoleWithPermissions, DepartmentOverride } from '@/lib/types/roles.types';
import { mergeGlobalWithOverride, OverrideCopyDraft } from './override-utils';
import { CopyOverrideModal } from './CopyOverrideModal';
import { resolveEntityColor } from '@/lib/utils/entityColor';

const { Text, Paragraph } = Typography;

// Logic hợp nhất đã chuyển sang `override-utils.ts` (dùng chung với modal "Chép từ...") - re-export để import cũ không vỡ.
export { mergeGlobalWithOverride };

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
  renderEditor: (
    departmentId: number,
    initialPermissions: DepartmentOverride['permissions'],
    /** Có giá trị khi bảng đang mở từ bản nháp "Chép từ..." (chưa lưu). */
    draft?: { version: number; sourceLabel: string },
  ) => React.ReactNode;
}) {
  const { message } = App.useApp();
  const { departments, isLoading: loadingDepartments } = useDepartments();
  const { overrides, isLoading: loadingOverrides } = useDepartmentOverrides(role.id);
  const deleteMutation = useDeleteDepartmentOverride(role.id);

  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  // Bản nháp "Chép từ..." - chỉ trong state, chưa ghi DB. Gắn với 1 phòng ban đích;
  // đổi phòng ban đang xem thì bản nháp không còn áp dụng (activeDraft = undefined).
  const [draft, setDraft] = useState<OverrideCopyDraft | null>(null);

  if (!canManageDepartments) {
    // GET /departments yêu cầu departments.view riêng (khác roles.manage) -
    // không giả định người có roles.manage LUÔN có luôn departments.view.
    return (
      <Alert
        type="info"
        showIcon
        title="Thiếu quyền departments.view"
        description="Bạn có quyền sửa ma trận quyền (roles.manage) nhưng chưa có quyền xem danh sách phòng ban (departments.view) - cần quyền này để chọn phòng ban muốn override."
      />
    );
  }

  const overrideMap = new Map(overrides.map((o) => [o.departmentId, o]));
  const selectedOverride = selectedDeptId ? overrideMap.get(selectedDeptId) : undefined;
  const activeDraft = draft && draft.entityId === selectedDeptId ? draft : undefined;
  const selectedDept = departments.find((d) => d.id === selectedDeptId);

  // Render Tag màu (đúng màu thật của phòng ban, xem `resolveEntityColor`) +
  // nhãn "(đang override)" cho từng dòng trong dropdown - đồng bộ với pattern
  // đã dùng ở CustomerFilters.tsx/phong-ban/page.tsx thay vì chỉ text trơn
  // như trước (bug thật báo qua ảnh chụp 2026-09-11: dropdown "Chọn phòng ban
  // để xem/sửa override..." không có Tag màu như các dropdown chọn phòng ban
  // khác trong app).
  const renderDepartmentOption = (option: { data: { department: Department } }) => {
    const d = option.data.department;
    return (
      <Space size={4} align="center">
        <Tag color={resolveEntityColor(d.color)} style={{ marginInlineEnd: 0 }}>{d.name}</Tag>
        {overrideMap.has(d.id) && (
          <Text type="warning" style={{ fontSize: 11 }}>(đang override)</Text>
        )}
      </Space>
    );
  };

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
        optionLabelProp="label"
        optionRender={renderDepartmentOption}
        popupMatchSelectWidth={false}
        options={departments.map((d) => ({
          value: d.id,
          // `label` giữ NGUYÊN dạng string (không phải Tag) - vẫn cần cho
          // filter tìm kiếm (`optionFilterProp="label"` bên dưới so khớp
          // text) và cho ô Select hiển thị khi đã chọn xong (đóng dropdown) -
          // Tag màu CHỈ hiện trong danh sách dropdown đang mở qua `optionRender`.
          label: overrideMap.has(d.id) ? `${d.name} (đang override)` : d.name,
          department: d,
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
            <Space size={8}>
              <Button size="small" icon={<CopyOutlined />} onClick={() => setCopyOpen(true)}>
                Chép từ...
              </Button>
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
            </Space>
          </div>
          {renderEditor(
            selectedDeptId,
            activeDraft
              ? activeDraft.permissions
              : mergeGlobalWithOverride(role.permissions, selectedOverride?.permissions ?? []),
            activeDraft && { version: activeDraft.version, sourceLabel: activeDraft.sourceLabel },
          )}
          {selectedDept && (
            <CopyOverrideModal
              open={copyOpen}
              onClose={() => setCopyOpen(false)}
              kind="department"
              targetRole={role}
              targetName={selectedDept.name}
              targetEntityId={selectedDept.id}
              entities={departments}
              onApply={(permissions, sourceLabel) =>
                setDraft({ entityId: selectedDept.id, permissions, sourceLabel, version: (draft?.version ?? 0) + 1 })
              }
            />
          )}
        </>
      ) : (
        <Empty description="Chọn 1 phòng ban ở trên để xem/sửa override" />
      )}
    </div>
  );
}