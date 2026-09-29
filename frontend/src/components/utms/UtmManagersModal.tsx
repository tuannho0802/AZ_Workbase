'use client';

import { useMemo, useState } from 'react';
import { App, Avatar, Button, Modal, Popconfirm, Tag, Typography } from 'antd';
import { CrownOutlined, DeleteOutlined, PlusOutlined, SwapOutlined, UserOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { usersApi } from '@/lib/api/users.api';
import {
  useAddUtmManager,
  useRemoveUtmManager,
  useTransferUtmPrimary,
  useUtmManagers,
} from '@/lib/hooks/useUtms';
import { SimpleList } from '@/components/common/SimpleList';
import { SalesUserSelect, type UserOption } from '@/components/customers/SalesUserSelect';
import { toastApiError } from '@/lib/utils/error-message.util';

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
  utmId: number | null;
  utmName?: string;
}

/**
 * Xem Quản lý chính + phụ của 1 UTM; thêm/gỡ Quản lý phụ và chuyển Quản lý chính.
 * Nút hiện theo `managers.canEdit` (BE tính sẵn theo scope `utms.assign` + quan hệ với UTM) - KHÔNG tự
 * suy từ role. Quyền thật vẫn do BE chặn 403.
 */
export function UtmManagersModal({ open, onClose, utmId, utmName }: Props) {
  const { message } = App.useApp();
  const { managers, isLoading } = useUtmManagers(open ? utmId : null);
  const addMutation = useAddUtmManager();
  const removeMutation = useRemoveUtmManager();
  const transferMutation = useTransferUtmPrimary();
  const [addUserId, setAddUserId] = useState<number | undefined>();
  const [transferUserId, setTransferUserId] = useState<number | undefined>();

  const canEdit = !!managers?.canEdit;
  const { data: allUsers = [] } = useQuery<UserOption[]>({
    queryKey: ['users-for-select'],
    queryFn: () => usersApi.getAllForSelect(),
    staleTime: 5 * 60 * 1000,
    enabled: open && canEdit,
  });

  const primaryId = managers?.primaryManager?.id;
  const secondaryIds = useMemo(() => new Set((managers?.secondaryManagers ?? []).map((m) => m.id)), [managers]);
  // Người được thêm phụ: loại chính + phụ hiện có. Người được chuyển chính: loại chính hiện tại.
  const addCandidates = useMemo(
    () => allUsers.filter((u) => u.id !== primaryId && !secondaryIds.has(u.id)),
    [allUsers, primaryId, secondaryIds],
  );
  const transferCandidates = useMemo(() => allUsers.filter((u) => u.id !== primaryId), [allUsers, primaryId]);

  const close = () => {
    setAddUserId(undefined);
    setTransferUserId(undefined);
    onClose();
  };

  const handleAdd = () => {
    if (!utmId || !addUserId) return;
    addMutation.mutate(
      { utmId, userId: addUserId },
      {
        onSuccess: () => {
          message.success('Đã thêm Quản lý phụ');
          setAddUserId(undefined);
        },
        onError: (e) => toastApiError(message, e, 'Thêm Quản lý phụ thất bại'),
      },
    );
  };

  const handleRemove = (userId: number, name: string) => {
    if (!utmId) return;
    removeMutation.mutate(
      { utmId, userId },
      {
        onSuccess: () => message.success(`Đã gỡ "${name}" khỏi Quản lý phụ`),
        onError: (e) => toastApiError(message, e, 'Gỡ Quản lý phụ thất bại'),
      },
    );
  };

  const handleTransfer = () => {
    if (!utmId || !transferUserId) return;
    transferMutation.mutate(
      { utmId, userId: transferUserId },
      {
        onSuccess: () => {
          message.success('Đã chuyển Quản lý chính');
          setTransferUserId(undefined);
        },
        onError: (e) => toastApiError(message, e, 'Chuyển Quản lý chính thất bại'),
      },
    );
  };

  return (
    <Modal
      title={`Quản lý chính/phụ — ${utmName ?? managers?.utmName ?? ''}`}
      open={open}
      onCancel={close}
      footer={<Button onClick={close}>Đóng</Button>}
      destroyOnHidden
    >
      <div style={{ marginBottom: 16 }}>
        <Text strong>Quản lý chính:</Text>{' '}
        {managers?.primaryManager ? (
          <Tag color="gold" icon={<CrownOutlined />}>
            {managers.primaryManager.name}
          </Tag>
        ) : (
          <Text type="secondary">Chưa gán</Text>
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
        <>
          <div style={{ marginTop: 16, marginBottom: 8 }}>
            <Text strong>Thêm Quản lý phụ:</Text>
          </div>
          <SalesUserSelect
            value={addUserId}
            onChange={(id) => setAddUserId(id ?? undefined)}
            users={addCandidates}
            placeholder="Chọn nhân viên..."
            hidePreviewCard
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            style={{ marginTop: 8 }}
            disabled={!addUserId}
            loading={addMutation.isPending}
            onClick={handleAdd}
          >
            Thêm
          </Button>

          <div style={{ marginTop: 20, marginBottom: 8 }}>
            <Text strong>Chuyển Quản lý chính:</Text>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Người nhận sẽ trở thành Quản lý chính; nếu họ đang là Quản lý phụ thì tự được gỡ khỏi danh sách phụ.
              </Text>
            </div>
          </div>
          <SalesUserSelect
            value={transferUserId}
            onChange={(id) => setTransferUserId(id ?? undefined)}
            users={transferCandidates}
            placeholder="Chọn người nhận quyền chính..."
            hidePreviewCard
          />
          <Popconfirm
            title="Chuyển quyền Quản lý chính?"
            description="Bạn có thể mất quyền quản lý UTM này sau khi chuyển."
            okText="Chuyển"
            cancelText="Huỷ"
            disabled={!transferUserId}
            onConfirm={handleTransfer}
          >
            <Button icon={<SwapOutlined />} style={{ marginTop: 8 }} disabled={!transferUserId} loading={transferMutation.isPending}>
              Chuyển quyền chính
            </Button>
          </Popconfirm>
        </>
      ) : (
        !isLoading && (
          <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
            Chỉ Quản lý chính (hoặc người có quyền rộng) mới thêm/gỡ Quản lý phụ.
          </Text>
        )
      )}
    </Modal>
  );
}
