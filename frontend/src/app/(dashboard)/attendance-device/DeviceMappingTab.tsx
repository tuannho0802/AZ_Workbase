'use client';

import { useState } from 'react';
import { Table, Button, Tag, Space, Modal, Select, App, Alert, Popconfirm } from 'antd';
import { LinkOutlined, DisconnectOutlined, SyncOutlined } from '@ant-design/icons';
import {
  useDeviceUsers,
  useMapDeviceUser,
  useUnmapDeviceUser,
  useSyncDeviceNow,
  useRematchDeviceLogs,
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
  const rematchMutation = useRematchDeviceLogs();

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
        // Gọi thêm rematch NGAY sau khi sync xong - đây chính là bước bị
        // thiếu trước đây gây "lệch pha" dữ liệu hiển thị: sync có thể kéo
        // về log của user VỪA được map (hoặc unmap/map lại) nhưng nếu không
        // rematch lại, log của những user đó có thể vẫn kẹt ở trạng thái map
        // cũ. syncNow() ở backend đã tự rematch ở ĐẦU quy trình (trước khi
        // tải log mới), nên gọi thêm ở đây là bước rematch THỨ 2, sau khi có
        // dữ liệu mới nhất - vô hại nếu không có gì để khớp lại (trả về
        // updated: 0), nhưng đảm bảo không sót trường hợp nào.
        rematchMutation.mutate(undefined, {
          onSuccess: (rematchResult) => {
            modal.success({
              title: 'Đồng bộ hoàn tất',
              content: (
                <div>
                  <p>Tổng log đọc được từ máy: {summary.totalFetchedFromDevice}</p>
                  <p>Ghi mới: {summary.insertedNew}</p>
                  <p>Đã khớp nhân viên: {summary.matchedToUser}</p>
                  {rematchResult.updated > 0 && (
                    <p style={{ color: '#1677ff' }}>
                      Khớp lại thêm {rematchResult.updated} log cũ (trước đây chưa map được, giờ đã có mapping) - Bảng chấm công/Tổng hợp chấm công đã được cập nhật.
                    </p>
                  )}
                  {summary.unmatchedDeviceUserIds.length > 0 && (
                    <p>
                      Mã user trên máy vẫn còn chưa map: {summary.unmatchedDeviceUserIds.join(', ')}
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
          onError: () => {
            // Rematch lỗi không nên che mất việc sync đã thành công - vẫn
            // báo kết quả sync, chỉ thêm cảnh báo nhỏ về việc rematch thất bại.
            modal.success({
              title: 'Đồng bộ hoàn tất',
              content: (
                <div>
                  <p>Tổng log đọc được từ máy: {summary.totalFetchedFromDevice}</p>
                  <p>Ghi mới: {summary.insertedNew}</p>
                  <p>Đã khớp nhân viên: {summary.matchedToUser}</p>
                  <p style={{ color: '#faad14' }}>
                    ⚠️ Bước khớp lại mapping sau đồng bộ bị lỗi - có thể cần bấm "Đồng bộ ngay" thêm 1 lần nữa.
                  </p>
                </div>
              ),
            });
          },
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