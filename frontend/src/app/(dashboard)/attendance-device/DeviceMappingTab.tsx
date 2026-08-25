'use client';

import { useState } from 'react';
import { Table, Button, Tag, Space, Modal, Select, App, Alert, Popconfirm } from 'antd';
import { LinkOutlined, DisconnectOutlined, SyncOutlined } from '@ant-design/icons';
import {
  useDeviceUsers,
  useMapDeviceUser,
  useUnmapDeviceUser,
  useSyncDeviceNow,
} from '@/lib/hooks/useZkDevice';
import { useUsersList } from '@/lib/hooks/useUsers';
import { DeviceUser } from '@/lib/types/zk-device.types';

export default function DeviceMappingTab() {
  const { message, modal } = App.useApp();
  const { data: deviceUsers, isLoading, isError, error } = useDeviceUsers();
  const { users } = useUsersList();
  const mapMutation = useMapDeviceUser();
  const unmapMutation = useUnmapDeviceUser();
  const syncMutation = useSyncDeviceNow();

  const [mappingTarget, setMappingTarget] = useState<DeviceUser | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const handleOpenMap = (record: DeviceUser) => {
    setMappingTarget(record);
    setSelectedUserId(record.mappedUserId);
  };

  const handleConfirmMap = () => {
    if (!mappingTarget || !selectedUserId) return;
    mapMutation.mutate(
      { userId: selectedUserId, deviceUserId: mappingTarget.userId },
      {
        onSuccess: () => {
          message.success(`Đã gán "${mappingTarget.name}" (máy) với nhân viên đã chọn`);
          setMappingTarget(null);
        },
        onError: (err: any) => {
          message.error(err?.response?.data?.message || 'Gán thất bại');
        },
      },
    );
  };

  const handleUnmap = (record: DeviceUser) => {
    if (!record.mappedUserId) return;
    unmapMutation.mutate(record.mappedUserId, {
      onSuccess: () => message.success('Đã gỡ mapping'),
      onError: (err: any) => message.error(err?.response?.data?.message || 'Gỡ mapping thất bại'),
    });
  };

  const handleSync = () => {
    syncMutation.mutate(undefined, {
      onSuccess: (summary) => {
        modal.success({
          title: 'Đồng bộ hoàn tất',
          content: (
            <div>
              <p>Tổng log đọc được từ máy: {summary.totalFetchedFromDevice}</p>
              <p>Ghi mới: {summary.insertedNew}</p>
              <p>Đã khớp nhân viên: {summary.matchedToUser}</p>
              {summary.unmatchedDeviceUserIds.length > 0 && (
                <p>
                  Mã user trên máy chưa map: {summary.unmatchedDeviceUserIds.join(', ')}
                </p>
              )}
              {summary.invalidTimeCount > 0 && (
                <p style={{ color: '#faad14' }}>
                  ⚠️ {summary.invalidTimeCount} dòng log không giải mã được giờ (dữ liệu hỏng ở tầng giao thức) - đã bỏ qua, không ghi vào DB.
                </p>
              )}
            </div>
          ),
        });
      },
      onError: (err: any) => {
        message.error(err?.response?.data?.message || 'Đồng bộ thất bại');
      },
    });
  };

  const columns = [
    {
      title: 'Mã User (máy)',
      dataIndex: 'userId',
      key: 'userId',
      width: 140,
    },
    {
      title: 'Tên trên máy',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Trạng thái map',
      key: 'mapped',
      render: (_: any, record: DeviceUser) =>
        record.mappedUserId ? (
          <Tag color="green">Đã map: {record.mappedUserName}</Tag>
        ) : (
          <Tag color="orange">Chưa map</Tag>
        ),
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 220,
      render: (_: any, record: DeviceUser) => (
        <Space>
          <Button size="small" icon={<LinkOutlined />} onClick={() => handleOpenMap(record)}>
            {record.mappedUserId ? 'Đổi mapping' : 'Gán nhân viên'}
          </Button>
          {record.mappedUserId && (
            <Popconfirm
              title="Gỡ mapping nhân viên này?"
              description="Log chấm công cũ đã đồng bộ vẫn giữ nguyên, chỉ log mới sau khi gỡ sẽ thành chưa khớp."
              onConfirm={() => handleUnmap(record)}
            >
              <Button size="small" danger icon={<DisconnectOutlined />}>
                Gỡ
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      {isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="Không lấy được danh sách user từ máy chấm công"
          description={(error as any)?.response?.data?.message || (error as any)?.message}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button
          type="primary"
          icon={<SyncOutlined spin={syncMutation.isPending} />}
          loading={syncMutation.isPending}
          onClick={handleSync}
        >
          Đồng bộ ngay
        </Button>
      </div>

      <Table
        rowKey="uid"
        loading={isLoading}
        columns={columns}
        dataSource={deviceUsers || []}
        pagination={false}
      />

      <Modal
        title={`Gán nhân viên hệ thống cho user "${mappingTarget?.name}" (mã máy: ${mappingTarget?.userId})`}
        open={!!mappingTarget}
        onCancel={() => setMappingTarget(null)}
        onOk={handleConfirmMap}
        confirmLoading={mapMutation.isPending}
        okButtonProps={{ disabled: !selectedUserId }}
      >
        <Select
          style={{ width: '100%' }}
          placeholder="Chọn nhân viên trong hệ thống"
          showSearch
          optionFilterProp="label"
          value={selectedUserId ?? undefined}
          onChange={(val) => setSelectedUserId(val)}
          options={(users || []).map((u: any) => ({
            value: u.id,
            label: `${u.name} (${u.email})`,
          }))}
        />
      </Modal>
    </div>
  );
}