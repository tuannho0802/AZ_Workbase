'use client';

import { useState } from 'react';
import { Alert, Modal, Select, Space, Tag, Typography } from 'antd';
import { useDepartmentOverrides, usePositionOverrides, useRoles } from '@/lib/hooks/useRoles';
import { RoleWithPermissions, RolePermissionEntry } from '@/lib/types/roles.types';
import { resolveEntityColor } from '@/lib/utils/entityColor';
import { buildCopyDraftPermissions } from './override-utils';

const { Text } = Typography;

export interface CopyOverrideEntity {
  id: number;
  name: string;
  color?: string;
}

/**
 * "Chép từ..." (kiểu copy TEMPLATE): chọn Role + Vị trí/Phòng ban NGUỒN, lấy toàn bộ
 * quyền hiệu lực của nguồn đổ vào bảng đang mở của ĐÍCH dưới dạng BẢN NHÁP.
 * KHÔNG gọi API ghi - chỉ khi người dùng kiểm tra/sửa rồi bấm "Lưu thay đổi" thì mới ghi DB.
 */
export function CopyOverrideModal({
  open,
  onClose,
  kind,
  targetRole,
  targetName,
  targetEntityId,
  entities,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  kind: 'position' | 'department';
  targetRole: RoleWithPermissions;
  targetName: string;
  targetEntityId: number;
  entities: CopyOverrideEntity[];
  onApply: (permissions: RolePermissionEntry[], sourceLabel: string) => void;
}) {
  const noun = kind === 'position' ? 'Vị trí' : 'Phòng ban';
  const { roles, isLoading: loadingRoles } = useRoles();
  const [sourceRoleId, setSourceRoleId] = useState<number>(targetRole.id);
  const [sourceEntityId, setSourceEntityId] = useState<number | null>(null);

  // Override của role nguồn (role nguồn có thể khác role đích) - chỉ bật hook đúng loại.
  const { overrides: posOverrides, isLoading: loadingPos } = usePositionOverrides(
    kind === 'position' ? sourceRoleId : undefined,
  );
  const { overrides: deptOverrides, isLoading: loadingDept } = useDepartmentOverrides(
    kind === 'department' ? sourceRoleId : undefined,
  );
  const loadingOverrides = kind === 'position' ? loadingPos : loadingDept;

  const sourceRole = roles.find((r) => r.id === sourceRoleId);
  const overrideIds = new Set(
    kind === 'position' ? posOverrides.map((o) => o.positionId) : deptOverrides.map((o) => o.departmentId),
  );
  const sourceEntity = entities.find((e) => e.id === sourceEntityId);
  const isSameAsTarget = sourceRoleId === targetRole.id && sourceEntityId === targetEntityId;
  const canApply = !!sourceRole && !!sourceEntity && !isSameAsTarget && !loadingOverrides;

  const handleOk = () => {
    if (!sourceRole || !sourceEntity) return;
    const found =
      kind === 'position'
        ? posOverrides.find((o) => o.positionId === sourceEntity.id)
        : deptOverrides.find((o) => o.departmentId === sourceEntity.id);
    onApply(
      buildCopyDraftPermissions(sourceRole.permissions, found?.permissions),
      `${sourceEntity.name} (${sourceRole.name})`,
    );
    onClose();
  };

  return (
    <Modal
      open={open}
      title={`Chép cấu hình vào "${targetName}" (${targetRole.name})`}
      onCancel={onClose}
      onOk={handleOk}
      okText="Chép vào bảng (chưa lưu)"
      okButtonProps={{ disabled: !canApply, loading: loadingOverrides }}
      cancelText="Huỷ"
      destroyOnHidden
    >
      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        <div>
          <Text strong>Role nguồn</Text>
          <Select
            style={{ width: '100%', marginTop: 4 }}
            loading={loadingRoles}
            value={sourceRoleId}
            onChange={(v) => {
              setSourceRoleId(v);
              setSourceEntityId(null); // đổi role -> danh sách override đổi theo, chọn lại nguồn
            }}
            optionFilterProp="label"
            showSearch
            options={roles.map((r) => ({
              value: r.id,
              label: r.id === targetRole.id ? `${r.name} (role hiện tại)` : r.name,
            }))}
          />
        </div>
        <div>
          <Text strong>{noun} nguồn</Text>
          <Select
            style={{ width: '100%', marginTop: 4 }}
            value={sourceEntityId}
            onChange={setSourceEntityId}
            optionFilterProp="label"
            showSearch
            placeholder={`Chọn ${noun} muốn lấy cấu hình`}
            options={entities.map((e) => ({
              value: e.id,
              label: `${e.name}${overrideIds.has(e.id) ? ' (đang override)' : ''}`,
              entity: e,
            }))}
            optionRender={(option) => {
              const e = (option.data as { entity: CopyOverrideEntity }).entity;
              return (
                <Space size={4}>
                  <Tag color={resolveEntityColor(e.color)} style={{ marginInlineEnd: 0 }}>{e.name}</Tag>
                  {overrideIds.has(e.id) && (
                    <Text type="warning" style={{ fontSize: 11 }}>(đang override)</Text>
                  )}
                </Space>
              );
            }}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Lấy quyền HIỆU LỰC của nguồn (Toàn cục của role nguồn + override của {noun} đó). {noun} chưa
            override thì lấy đúng quyền Toàn cục của role nguồn.
          </Text>
        </div>
        {isSameAsTarget && (
          <Alert type="info" showIcon title="Nguồn trùng với đích - hãy chọn nguồn khác" />
        )}
        <Alert
          type="warning"
          showIcon
          title="Chưa ghi vào hệ thống"
          description="Cấu hình nguồn chỉ được đổ vào bảng quyền đang mở, thay thế các tick chưa lưu hiện có. Bạn kiểm tra, sửa lại rồi bấm “Lưu thay đổi” thì mới thực sự có hiệu lực."
        />
      </Space>
    </Modal>
  );
}
