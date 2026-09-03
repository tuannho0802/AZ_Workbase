'use client';

import { useState } from 'react';
import { Table, Button, Tag, Space, Modal, Select, App, Alert, Popconfirm, DatePicker, Radio } from 'antd';
import { LinkOutlined, DisconnectOutlined, SyncOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import {
  useDeviceUsers,
  useMapDeviceUser,
  useUnmapDeviceUser,
  useSyncDeviceNow,
  useRematchDeviceLogs,
} from '@/lib/hooks/useZkDevice';
import { useUsersList } from '@/lib/hooks/useUsers';
import { DeviceUser } from '@/lib/types/zk-device.types';

const { RangePicker } = DatePicker;

type SyncPreset = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all' | 'custom';

const PRESET_LABEL: Record<Exclude<SyncPreset, 'custom'>, string> = {
  today: 'Hôm nay',
  week: '1 tuần gần đây',
  month: '1 tháng gần đây',
  quarter: '3 tháng gần đây',
  year: '1 năm gần đây',
  all: 'Toàn bộ (không giới hạn)',
};

/** Tính khoảng ngày [from, to] (YYYY-MM-DD) theo preset - `to` luôn là hôm nay. */
function presetToRange(preset: Exclude<SyncPreset, 'custom' | 'all'>): { from: string; to: string } {
  const to = dayjs();
  const fromMap: Record<typeof preset, Dayjs> = {
    today: dayjs(),
    week: dayjs().subtract(7, 'day'),
    month: dayjs().subtract(1, 'month'),
    quarter: dayjs().subtract(3, 'month'),
    year: dayjs().subtract(1, 'year'),
  };
  return { from: fromMap[preset].format('YYYY-MM-DD'), to: to.format('YYYY-MM-DD') };
}

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
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncPreset, setSyncPreset] = useState<SyncPreset>('week');
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null);

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

  const handleSync = (range?: { from?: string; to?: string }) => {
    setSyncModalOpen(false);
    syncMutation.mutate(range, {
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
              width: 480,
              content: renderSyncResult(summary, rematchResult.updated),
            });
          },
          onError: () => {
            // Rematch lỗi không nên che mất việc sync đã thành công - vẫn
            // báo kết quả sync, chỉ thêm cảnh báo nhỏ về việc rematch thất bại.
            modal.success({
              title: 'Đồng bộ hoàn tất',
              width: 480,
              content: (
                <div>
                  {renderSyncResult(summary, null)}
                  <p style={{ color: '#faad14', marginTop: 8 }}>
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

  /** Nội dung dialog kết quả - tách riêng vì dùng ở 2 nhánh (rematch thành công/lỗi) giống hệt nhau. */
  const renderSyncResult = (summary: any, rematchUpdated: number | null) => (
    <div>
      {(summary.fromDate || summary.toDate) && (
        <p>
          Khoảng ngày đã đồng bộ: <b>{summary.fromDate || '(không giới hạn)'}</b> →{' '}
          <b>{summary.toDate || '(không giới hạn)'}</b>
        </p>
      )}
      <p>Tổng log đọc được từ máy: {summary.totalFetchedFromDevice}</p>
      {(summary.fromDate || summary.toDate) && (
        <p>Trong đó rơi vào khoảng ngày đã chọn: {summary.recordsInRange}</p>
      )}
      <p>Ghi mới: {summary.insertedNew}</p>
      <p>Đã khớp nhân viên: {summary.matchedToUser}</p>
      {rematchUpdated != null && rematchUpdated > 0 && (
        <p style={{ color: '#1677ff' }}>
          Khớp lại thêm {rematchUpdated} log cũ (trước đây chưa map được, giờ đã có mapping) - Bảng chấm công/Tổng hợp chấm công đã được cập nhật.
        </p>
      )}
      {summary.unmatchedDeviceUserIds.length > 0 && (
        <p>Mã user trên máy vẫn còn chưa map: {summary.unmatchedDeviceUserIds.join(', ')}</p>
      )}
      {summary.invalidTimeCount > 0 && (
        <p style={{ color: '#faad14' }}>
          ⚠️ {summary.invalidTimeCount} dòng log không giải mã được giờ (dữ liệu hỏng ở tầng giao thức) - đã bỏ qua, không ghi vào DB.
        </p>
      )}
      {summary.partialFetch && (
        <p style={{ color: '#ff4d4f', fontWeight: 600 }}>
          ⚠️ Có thể CHƯA lấy đủ dữ liệu từ máy sau {summary.fetchAttempts} lần thử
          {summary.expectedLogCount != null && ` (máy báo có ${summary.expectedLogCount} log)`}.
          {summary.fetchWarning && ` Lý do: ${summary.fetchWarning}.`} Nên thử bấm "Đồng bộ ngay" lại.
        </p>
      )}
    </div>
  );

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
          title="Không lấy được danh sách user từ máy chấm công"
          description={(error as any)?.response?.data?.message || (error as any)?.message}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button
          type="primary"
          icon={<SyncOutlined spin={syncMutation.isPending} />}
          loading={syncMutation.isPending}
          onClick={() => setSyncModalOpen(true)}
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
          showSearch={{ optionFilterProp: 'label' }}
          value={selectedUserId ?? undefined}
          onChange={(val) => setSelectedUserId(val)}
          options={(users || []).map((u: any) => ({
            value: u.id,
            label: `${u.name} (${u.email})`,
          }))}
        />
      </Modal>

      <Modal
        title="Đồng bộ log chấm công"
        open={syncModalOpen}
        onCancel={() => setSyncModalOpen(false)}
        footer={null}
      >
        <p style={{ marginBottom: 12, color: '#595959' }}>
          Chọn khoảng ngày cần đồng bộ - chỉ log trong khoảng này sẽ được ghi/khớp
          vào hệ thống, giúp mỗi lần đồng bộ nhẹ và nhanh hơn thay vì luôn quét
          lại toàn bộ lịch sử.
        </p>

        <Radio.Group
          value={syncPreset}
          onChange={(e) => setSyncPreset(e.target.value)}
          style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}
        >
          {(Object.keys(PRESET_LABEL) as Array<keyof typeof PRESET_LABEL>).map((key) => (
            <Radio key={key} value={key}>
              {PRESET_LABEL[key]}
            </Radio>
          ))}
          <Radio value="custom">Tuỳ chọn khoảng ngày khác</Radio>
        </Radio.Group>

        {syncPreset === 'custom' && (
          <RangePicker
            style={{ width: '100%', marginBottom: 16 }}
            value={customRange}
            onChange={(v) => setCustomRange(v && v[0] && v[1] ? [v[0], v[1]] : null)}
          />
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={() => setSyncModalOpen(false)}>Huỷ</Button>
          <Button
            type="primary"
            icon={<SyncOutlined />}
            disabled={syncPreset === 'custom' && !customRange}
            onClick={() => {
              if (syncPreset === 'all') {
                handleSync(undefined); // không truyền from/to = đồng bộ toàn bộ như cũ
              } else if (syncPreset === 'custom') {
                if (!customRange) return;
                handleSync({
                  from: customRange[0].format('YYYY-MM-DD'),
                  to: customRange[1].format('YYYY-MM-DD'),
                });
              } else {
                handleSync(presetToRange(syncPreset));
              }
            }}
          >
            Bắt đầu đồng bộ
          </Button>
        </div>
      </Modal>
    </div>
  );
}