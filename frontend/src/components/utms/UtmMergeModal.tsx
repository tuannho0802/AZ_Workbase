'use client';

import { useState } from 'react';
import { Alert, App, Modal, Select, Typography } from 'antd';
import { useMergeUtm } from '@/lib/hooks/useUtms';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { UtmTag } from './UtmTag';

const { Text } = Typography;

export interface MergeCandidate {
  id: number;
  name: string;
  color?: string;
  isActive: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  source: { id: number; name: string } | null;
  /** Các UTM có thể làm đích (đã loại chính nguồn). */
  candidates: MergeCandidate[];
  defaultTargetId?: number;
}

/**
 * Gộp UTM nguồn vào UTM đích: mọi khách hàng của nguồn (kể cả trong thùng rác) chuyển sang đích, nguồn bị xoá.
 * KHÔNG hoàn tác được nên luôn hiện cảnh báo. Chỉ người có quyền sửa UTM phạm vi "Tất cả" mới thấy nút mở modal này
 * (BE chặn 403 nếu gọi sai).
 */
export function UtmMergeModal({ open, onClose, source, candidates, defaultTargetId }: Props) {
  const { message } = App.useApp();
  const mergeMutation = useMergeUtm();
  // State khởi tạo từ prop; nơi gọi truyền `key` theo UTM nguồn để remount (reset) khi đổi nguồn.
  const [targetId, setTargetId] = useState<number | undefined>(defaultTargetId);

  const target = candidates.find((c) => c.id === targetId);

  const handleOk = () => {
    if (!source || !targetId) return;
    mergeMutation.mutate(
      { sourceId: source.id, targetId },
      {
        onSuccess: (res) => {
          message.success(`Đã gộp "${source.name}" vào "${res.target.name}" — chuyển ${res.movedCustomers} khách hàng`);
          onClose();
        },
        onError: (e) => message.error(getApiErrorMessage(e, 'Gộp UTM thất bại')),
      },
    );
  };

  return (
    <Modal
      title={source ? `Gộp UTM "${source.name}"` : 'Gộp UTM'}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      okText="Gộp"
      okButtonProps={{ danger: true, disabled: !targetId }}
      cancelText="Huỷ"
      confirmLoading={mergeMutation.isPending}
      destroyOnHidden
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 12 }}
        title="Không thể hoàn tác"
        description={`Toàn bộ khách hàng đang dùng UTM "${source?.name ?? ''}" sẽ chuyển sang UTM đích, sau đó UTM này bị xoá (cả danh sách Quản lý phụ của nó).`}
      />
      <Text strong>Gộp vào UTM đích:</Text>
      <Select
        showSearch
        style={{ width: '100%', marginTop: 8 }}
        placeholder="Chọn UTM đích..."
        value={targetId}
        onChange={setTargetId}
        optionFilterProp="searchText"
        options={candidates.map((c) => ({
          value: c.id,
          searchText: c.name,
          disabled: !c.isActive,
          label: (
            <span>
              <UtmTag name={c.name} color={c.color} inactive={!c.isActive} />
              {!c.isActive && <Text type="secondary"> (đang khoá)</Text>}
            </span>
          ),
        }))}
      />
      {target && (
        <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
          Sau khi gộp, tên UTM trên các khách hàng đó sẽ là &quot;{target.name}&quot;.
        </Text>
      )}
    </Modal>
  );
}
