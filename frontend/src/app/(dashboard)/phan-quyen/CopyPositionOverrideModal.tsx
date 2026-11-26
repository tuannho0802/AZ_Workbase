'use client';

import { useMemo, useState } from 'react';
import { Alert, App, Modal, Select, Space, Tag, Typography } from 'antd';
import { Position } from '@/lib/api/positions.api';
import { useCopyPositionOverride, useRoles } from '@/lib/hooks/useRoles';
import { CopyPositionOverrideTarget, RoleWithPermissions } from '@/lib/types/roles.types';
import { resolveEntityColor } from '@/lib/utils/entityColor';

const { Text } = Typography;

/** Ghép Role × Vị trí đã chọn thành danh sách đích, bỏ chính nguồn. */
export function buildCopyTargets(
  roleIds: number[],
  positionIds: number[],
  source: { roleId: number; positionId: number },
): CopyPositionOverrideTarget[] {
  const out: CopyPositionOverrideTarget[] = [];
  for (const roleId of roleIds) {
    for (const positionId of positionIds) {
      if (roleId === source.roleId && positionId === source.positionId) continue;
      out.push({ roleId, positionId });
    }
  }
  return out;
}

/**
 * Chép override của (Role, Vị trí) đang xem sang Vị trí khác (cùng Role) và/hoặc Role khác để setup nhanh.
 * Đích = tích Role × Vị trí đã chọn. Override đã có của đích bị THAY THẾ hoàn toàn (BE `copyPositionOverride`).
 */
export function CopyPositionOverrideModal({
  open,
  onClose,
  sourceRole,
  sourcePosition,
  positions,
  /** positionId đang có override ở role nguồn - chỉ để gợi ý "(đang override)" khi chọn đúng role nguồn. */
  overriddenPositionIds,
}: {
  open: boolean;
  onClose: () => void;
  sourceRole: RoleWithPermissions;
  sourcePosition: Position;
  positions: Position[];
  overriddenPositionIds: number[];
}) {
  const { message } = App.useApp();
  const { roles, isLoading: loadingRoles } = useRoles();
  const copyMutation = useCopyPositionOverride(sourceRole.id);
  const [roleIds, setRoleIds] = useState<number[]>([sourceRole.id]);
  const [positionIds, setPositionIds] = useState<number[]>([]);

  const targets = useMemo(
    () => buildCopyTargets(roleIds, positionIds, { roleId: sourceRole.id, positionId: sourcePosition.id }),
    [roleIds, positionIds, sourceRole.id, sourcePosition.id],
  );
  const overwriteKnown = targets.filter(
    (t) => t.roleId === sourceRole.id && overriddenPositionIds.includes(t.positionId),
  ).length;

  const handleOk = () => {
    copyMutation.mutate(
      { positionId: sourcePosition.id, targets },
      {
        onSuccess: (res) => {
          const failed = res.results.filter((r) => !r.success);
          if (failed.length === 0) {
            message.success(`Đã chép ${res.permissionCount} quyền sang ${res.results.length} đích`);
          } else {
            message.warning(
              `Chép xong ${res.results.length - failed.length}/${res.results.length} đích. Lỗi: ${failed
                .map((f) => f.message)
                .join('; ')}`,
            );
          }
          onClose();
        },
        onError: (err: any) => message.error(err?.response?.data?.message || 'Chép override thất bại'),
      },
    );
  };

  return (
    <Modal
      open={open}
      title={`Chép override "${sourcePosition.name}" (${sourceRole.name}) sang...`}
      onCancel={onClose}
      onOk={handleOk}
      okText={targets.length > 0 ? `Chép sang ${targets.length} đích` : 'Chép'}
      okButtonProps={{ disabled: targets.length === 0, loading: copyMutation.isPending }}
      cancelText="Huỷ"
      destroyOnHidden
    >
      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        <div>
          <Text strong>Role đích</Text>
          <Select
            mode="multiple"
            style={{ width: '100%', marginTop: 4 }}
            loading={loadingRoles}
            value={roleIds}
            onChange={setRoleIds}
            optionFilterProp="label"
            options={roles.map((r) => ({
              value: r.id,
              label: r.id === sourceRole.id ? `${r.name} (role hiện tại)` : r.name,
            }))}
            placeholder="Chọn 1 hoặc nhiều Role"
          />
        </div>
        <div>
          <Text strong>Vị trí đích</Text>
          <Select
            mode="multiple"
            style={{ width: '100%', marginTop: 4 }}
            value={positionIds}
            onChange={setPositionIds}
            optionFilterProp="label"
            maxTagCount="responsive"
            options={positions.map((p) => ({
              value: p.id,
              label: p.id === sourcePosition.id ? `${p.name} (nguồn)` : p.name,
              position: p,
            }))}
            optionRender={(option) => {
              const p = (option.data as { position: Position }).position;
              return (
                <Space size={4}>
                  <Tag color={resolveEntityColor(p.color)} style={{ marginInlineEnd: 0 }}>{p.name}</Tag>
                  {p.id === sourcePosition.id && <Text type="secondary" style={{ fontSize: 11 }}>(nguồn)</Text>}
                </Space>
              );
            }}
            placeholder="Chọn 1 hoặc nhiều Vị trí"
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Chọn Vị trí khác + giữ Role hiện tại = chép sang Vị trí khác của cùng Role. Chọn thêm Role khác =
            chép sang tổ hợp Role × Vị trí đã chọn.
          </Text>
        </div>
        <Alert
          type="warning"
          showIcon
          title="Override đã có ở đích sẽ bị thay thế hoàn toàn"
          description={
            overwriteKnown > 0
              ? `Trong đó ${overwriteKnown} đích cùng Role hiện tại đang có override sẽ bị ghi đè.`
              : 'Đích chưa có override thì được tạo mới; các quyền lệch với Role đích vẫn được chép nguyên văn.'
          }
        />
      </Space>
    </Modal>
  );
}
