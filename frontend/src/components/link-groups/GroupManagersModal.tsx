'use client';

import { useState } from 'react';
import { Modal, Avatar, Tag, Select, Button, Typography, App, Popconfirm } from 'antd';
import { UserOutlined, DeleteOutlined, PlusOutlined, CrownOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/stores/auth.store';
import { usersApi } from '@/lib/api/users.api';
import { useGroupManagers, useAddSecondaryManager, useRemoveSecondaryManager } from '@/lib/hooks/useLinkGroups';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { SimpleList } from '@/components/common/SimpleList';

const { Text } = Typography;

interface UserOption {
  id: number;
  name: string;
  email: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  groupId: number | null;
  groupName?: string;
}

/**
 * Xem Quản lý chính + phụ của 1 nhóm, và thêm/xoá Quản lý phụ.
 * - Quản lý CHÍNH của nhóm KHÔNG đổi được ở đây (chỉ admin đổi được, qua
 *   form Sửa nhóm ở trang "Quản lý nhóm liên kết" - PATCH /link-groups/:id).
 * - Thêm/xoá Quản lý phụ: chỉ admin hoặc chính Quản lý chính của nhóm đó -
 *   khớp `LinkGroupAccessHelper.canEditSecondaryManagers()` ở BE. Ở đây chỉ
 *   ẩn/hiện UI cho gọn, quyền thật sự vẫn do BE chặn (403 nếu cố gọi sai).
 */
export const GroupManagersModal = ({ open, onClose, groupId, groupName }: Props) => {
  const { message } = App.useApp();
  const currentUser = useAuthStore((s) => s.user);
  const { managers, isLoading } = useGroupManagers(groupId ?? undefined);
  const addMutation = useAddSecondaryManager();
  const removeMutation = useRemoveSecondaryManager();
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>(undefined);

  const { data: users } = useQuery<UserOption[]>({
    queryKey: ['users-for-select'],
    queryFn: () => usersApi.getAllForSelect(),
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });
  const userList = users ?? [];

  const isAdmin = currentUser?.role === 'admin';
  const isPrimary = !!managers?.primaryManager && managers.primaryManager.id === currentUser?.id;
  const canEdit = isAdmin || isPrimary;

  const primaryId = managers?.primaryManager?.id;
  const secondaryIds = new Set((managers?.secondaryManagers ?? []).map((m) => m.id));

  // Loại người đã là chính/phụ rồi khỏi danh sách chọn - tránh gọi API rồi
  // ăn lỗi 400/409 (Người này đang là Quản lý chính.../Đã là Quản lý phụ rồi)
  const availableOptions = userList
    .filter((u) => u.id !== primaryId && !secondaryIds.has(u.id))
    .map((u) => ({ value: u.id, label: u.name || u.email }));

  const resetAndClose = () => {
    setSelectedUserId(undefined);
    onClose();
  };

  const handleAdd = () => {
    if (!groupId || !selectedUserId) return;
    addMutation.mutate(
      { groupId, userId: selectedUserId },
      {
        onSuccess: () => {
          message.success('Đã thêm Quản lý phụ');
          setSelectedUserId(undefined);
        },
        onError: (err) => message.error(getApiErrorMessage(err, 'Thêm Quản lý phụ thất bại')),
      },
    );
  };

  const handleRemove = (userId: number, name: string) => {
    if (!groupId) return;
    removeMutation.mutate(
      { groupId, userId },
      {
        onSuccess: () => message.success(`Đã gỡ "${name}" khỏi Quản lý phụ`),
        onError: (err) => message.error(getApiErrorMessage(err, 'Gỡ Quản lý phụ thất bại')),
      },
    );
  };

  return (
    <Modal
      title={`Quản lý chính/phụ - ${groupName ?? managers?.groupName ?? ''}`}
      open={open}
      onCancel={resetAndClose}
      footer={
        <Button onClick={resetAndClose}>Đóng</Button>
      }
      destroyOnHidden
    >
      <div style={{ marginBottom: 16 }}>
        <Text strong>Quản lý chính:</Text>{' '}
        {managers?.primaryManager ? (
          <Tag color="gold" icon={<CrownOutlined />}>
            {managers.primaryManager.name}
          </Tag>
        ) : (
          <Text type="secondary">
            Chưa gán - chỉ admin gán được (ở trang &quot;Quản lý nhóm liên kết&quot;)
          </Text>
        )}
      </div>

      <div style={{ marginBottom: 8 }}>
        <Text strong>Quản lý phụ ({managers?.secondaryManagers.length ?? 0}):</Text>
      </div>
      <SimpleList
        loading={isLoading}
        size="small"
        dataSource={managers?.secondaryManagers ?? []}
        rowKey={(m) => m.id}
        emptyText="Chưa có Quản lý phụ nào"
        renderMeta={(m) => ({
          avatar: <Avatar size="small" icon={<UserOutlined />} />,
          title: m.name,
          description: m.email,
        })}
        renderActions={(m) =>
          canEdit
            ? [
                <Popconfirm
                  key="remove"
                  title={`Gỡ "${m.name}" khỏi Quản lý phụ?`}
                  onConfirm={() => handleRemove(m.id, m.name)}
                  okText="Gỡ"
                  cancelText="Huỷ"
                >
                  <Button
                    size="small"
                    danger
                    type="text"
                    icon={<DeleteOutlined />}
                    loading={removeMutation.isPending && removeMutation.variables?.userId === m.id}
                  />
                </Popconfirm>,
              ]
            : []
        }
      />

      {canEdit ? (
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <Select
            showSearch={{
              filterOption: (input, option) =>
                (option?.label as string)?.toLowerCase().includes(input.toLowerCase()),
            }}
            style={{ flex: 1 }}
            placeholder="Chọn nhân viên để thêm làm Quản lý phụ"
            value={selectedUserId}
            onChange={setSelectedUserId}
            options={availableOptions}
            notFoundContent="Không còn ai để thêm"
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!selectedUserId}
            loading={addMutation.isPending}
            onClick={handleAdd}
          >
            Thêm
          </Button>
        </div>
      ) : (
        <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
          Chỉ Quản lý chính (hoặc admin) mới có quyền thêm/xoá Quản lý phụ. Bạn đang xem với quyền
          Quản lý phụ.
        </Text>
      )}
    </Modal>
  );
};
