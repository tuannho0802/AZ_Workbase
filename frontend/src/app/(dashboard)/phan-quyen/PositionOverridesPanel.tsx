'use client';

import { useState } from 'react';
import { Select, Tag, Space, Typography, Alert, Empty, Spin, Button } from 'antd';
import { IdcardOutlined, UndoOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { usePositions } from '@/lib/hooks/usePositions';
import { Position } from '@/lib/api/positions.api';
import {
  usePositionOverrides,
  useDeletePositionOverride,
} from '@/lib/hooks/useRoles';
import { RoleWithPermissions, PositionOverride } from '@/lib/types/roles.types';
import { mergeGlobalWithOverride } from './DepartmentOverridesPanel';
import { resolveEntityColor } from '@/lib/utils/entityColor';

const { Text, Paragraph } = Typography;

/**
 * Tab "Theo Vị trí" trong Drawer ma trận quyền - COPY GẦN NHƯ Y HỆT
 * `DepartmentOverridesPanel.tsx` (chỉ đổi departmentId -> positionId, dùng
 * chung hàm `mergeGlobalWithOverride` vì logic hợp nhất Toàn cục + Override
 * hoàn toàn giống nhau, không phụ thuộc khái niệm phòng ban hay vị trí).
 *
 * Cả 3 endpoint override (GET/PUT/DELETE position-overrides) đều yêu cầu
 * `roles.manage` - panel này chỉ render khi `canManage=true` (component cha
 * `RolePermissionsDrawer` đã tự chặn, không mount panel này cho người chỉ có
 * `roles.view`).
 *
 * Tầng override này ƯU TIÊN CAO NHẤT (Position > Department > Global, xem
 * PERMISSIONS.md mục 1.8) - Vị trí KHÔNG bị ràng buộc theo phòng ban của
 * user, nên danh sách chọn ở đây liệt kê TOÀN BỘ Vị trí, không lọc theo
 * phòng ban nào.
 */
export function PositionOverridesPanel({
  role,
  canManagePositions,
  renderEditor,
}: {
  role: RoleWithPermissions;
  /** can('positions.view') - lấy TỪ NGOÀI vào, giống canManageDepartments ở
   * DepartmentOverridesPanel, tránh 1 nơi khác trong cây phải đoán lại đúng
   * permission key. */
  canManagePositions: boolean;
  /** Render UI chỉnh quyền dùng lại nguyên `RolePermissionsEditor` của cha -
   * nhận vào để tránh vòng phụ thuộc import giữa 2 file. */
  renderEditor: (positionId: number, initialPermissions: PositionOverride['permissions']) => React.ReactNode;
}) {
  const { message } = App.useApp();
  const { positions, isLoading: loadingPositions } = usePositions();
  const { overrides, isLoading: loadingOverrides } = usePositionOverrides(role.id);
  const deleteMutation = useDeletePositionOverride(role.id);

  const [selectedPositionId, setSelectedPositionId] = useState<number | null>(null);

  if (!canManagePositions) {
    // GET /positions yêu cầu positions.view riêng (khác roles.manage) -
    // không giả định người có roles.manage LUÔN có luôn positions.view.
    return (
      <Alert
        type="info"
        showIcon
        message="Thiếu quyền positions.view"
        description="Bạn có quyền sửa ma trận quyền (roles.manage) nhưng chưa có quyền xem danh mục Vị trí (positions.view) - cần quyền này để chọn Vị trí muốn override."
      />
    );
  }

  const overrideMap = new Map(overrides.map((o) => [o.positionId, o]));
  const selectedOverride = selectedPositionId ? overrideMap.get(selectedPositionId) : undefined;

  // Render Tag màu Vị trí (+ Tag Phòng ban đi kèm nếu có, cùng màu thật của
  // từng entity qua `resolveEntityColor`) cho dropdown - đồng bộ với pattern
  // đã dùng ở CustomerFilters.tsx/vi-tri/page.tsx thay vì chỉ text trơn như
  // trước (bug thật báo qua ảnh chụp 2026-09-11, y hệt gap ở DepartmentOverridesPanel).
  const renderPositionOption = (option: { data: { position: Position } }) => {
    const p = option.data.position;
    return (
      <Space size={4} align="center">
        <Tag color={resolveEntityColor(p.color)} style={{ marginInlineEnd: 0 }}>{p.name}</Tag>
        {p.department?.name && (
          <Tag color={resolveEntityColor(p.department.color)} style={{ marginInlineEnd: 0 }}>
            {p.department.name}
          </Tag>
        )}
        {overrideMap.has(p.id) && (
          <Text type="warning" style={{ fontSize: 11 }}>(đang override)</Text>
        )}
      </Space>
    );
  };

  return (
    <div>
      <Paragraph type="secondary" style={{ marginBottom: 12 }}>
        Cấp quyền RIÊNG cho 1 Vị trí, khác với ma trận Toàn cục ở trên - ví dụ role &quot;Nhân
        viên&quot; không có <Text code>customers.assign</Text> ở Toàn cục, nhưng Vị trí &quot;Content&quot;
        vẫn cần quyền này thì thêm override tại đây, chỉ áp dụng cho đúng Vị trí đó (bất kể user thuộc
        phòng ban nào). Override theo Vị trí ưu tiên CAO HƠN override theo phòng ban ở tab bên cạnh.
      </Paragraph>

      {overrides.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ fontSize: 13 }}>Đang có override:</Text>{' '}
          <Space wrap size={[4, 4]} style={{ marginTop: 4 }}>
            {overrides.map((o) => (
              <Tag
                key={o.positionId}
                color={selectedPositionId === o.positionId ? 'blue' : 'default'}
                icon={<IdcardOutlined />}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedPositionId(o.positionId)}
              >
                {o.positionName} ({o.permissions.length} quyền)
              </Tag>
            ))}
          </Space>
        </div>
      )}

      <Select
        placeholder="Chọn Vị trí để xem/sửa override..."
        style={{ width: '100%', marginBottom: 16 }}
        loading={loadingPositions}
        value={selectedPositionId}
        onChange={(v) => setSelectedPositionId(v)}
        optionLabelProp="label"
        optionRender={renderPositionOption}
        popupMatchSelectWidth={false}
        options={positions.map((p) => ({
          value: p.id,
          // `label` giữ NGUYÊN dạng string - vẫn cần cho filter tìm kiếm
          // (`optionFilterProp="label"`) và cho ô Select hiển thị khi đã
          // chọn xong - Tag màu CHỈ hiện trong dropdown đang mở qua `optionRender`.
          label: overrideMap.has(p.id) ? `${p.name} (đang override)` : p.name,
          position: p,
        }))}
        showSearch={{
          optionFilterProp: "label"
        }}
      />

      {loadingOverrides ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      ) : selectedPositionId ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text strong>
              {positions.find((p) => p.id === selectedPositionId)?.name}
            </Text>
            {selectedOverride && (
              <Button
                size="small"
                icon={<UndoOutlined />}
                loading={deleteMutation.isPending}
                onClick={() =>
                  deleteMutation.mutate(selectedPositionId, {
                    onSuccess: () => message.success('Đã gỡ override - Vị trí quay lại dùng ma trận Toàn cục'),
                    onError: (err: any) =>
                      message.error(err?.response?.data?.message || 'Gỡ override thất bại'),
                  })
                }
              >
                Gỡ override (dùng lại Toàn cục)
              </Button>
            )}
          </div>
            {renderEditor(selectedPositionId, mergeGlobalWithOverride(role.permissions, selectedOverride?.permissions ?? []))}
        </>
      ) : (
        <Empty description="Chọn 1 Vị trí ở trên để xem/sửa override" />
      )}
    </div>
  );
}