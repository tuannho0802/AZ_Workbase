'use client';

import { useState } from 'react';
import { Table, Select, DatePicker, Space, Tag, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useAttendanceLogs } from '@/lib/hooks/useZkDevice';
import { useUsersList } from '@/lib/hooks/useUsers';
import { AttendanceLog } from '@/lib/types/zk-device.types';

const { RangePicker } = DatePicker;

const SOURCE_LABEL: Record<string, { text: string; color: string }> = {
  device_push: { text: 'Máy tự đẩy', color: 'blue' },
  device_pull: { text: 'Đồng bộ thủ công', color: 'purple' },
};

const RANGE_PRESETS = [
  { label: 'Hôm nay', value: [dayjs(), dayjs()] as [Dayjs, Dayjs] },
  { label: 'Tuần này', value: [dayjs().startOf('week'), dayjs()] as [Dayjs, Dayjs] },
  { label: 'Tháng này', value: [dayjs().startOf('month'), dayjs()] as [Dayjs, Dayjs] },
  {
    label: 'Tháng trước',
    value: [
      dayjs().subtract(1, 'month').startOf('month'),
      dayjs().subtract(1, 'month').endOf('month'),
    ] as [Dayjs, Dayjs],
  },
];

export default function AttendanceLogsTab() {
  const { users } = useUsersList();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [userId, setUserId] = useState<number | undefined>(undefined);
  const [matched, setMatched] = useState<'matched' | 'unmatched' | undefined>(undefined);
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);

  const { data, isLoading, refetch, isFetching } = useAttendanceLogs({
    page,
    limit,
    userId,
    matched,
    from: range?.[0]?.format('YYYY-MM-DD'),
    to: range?.[1]?.format('YYYY-MM-DD'),
  });

  const columns = [
    {
      title: 'Thời gian',
      dataIndex: 'recordTime',
      key: 'recordTime',
      render: (v: string) => dayjs(v).format('DD/MM/YYYY HH:mm:ss'),
      width: 170,
    },
    {
      title: 'Nhân viên',
      key: 'matchedUser',
      render: (_: any, r: AttendanceLog) =>
        r.matchedUser ? (
          <Tag color="green">{r.matchedUser.name}</Tag>
        ) : (
          <Tag color="orange">Chưa khớp (mã máy: {r.deviceUserId})</Tag>
        ),
    },
    {
      title: 'Nguồn',
      dataIndex: 'source',
      key: 'source',
      width: 140,
      render: (v: string) => (
        <Tag color={SOURCE_LABEL[v]?.color}>{SOURCE_LABEL[v]?.text || v}</Tag>
      ),
    },
    {
      title: 'Mã máy',
      dataIndex: 'deviceSerialNumber',
      key: 'deviceSerialNumber',
      width: 160,
    },
  ];

  return (
    <div>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Lọc theo nhân viên"
          style={{ width: 220 }}
          value={userId}
          onChange={(v) => {
            setUserId(v);
            setPage(1);
          }}
          options={(users || []).map((u: any) => ({ value: u.id, label: u.name }))}
        />
        <Select
          allowClear
          placeholder="Trạng thái khớp"
          style={{ width: 160 }}
          value={matched}
          onChange={(v) => {
            setMatched(v);
            setPage(1);
          }}
          options={[
            { value: 'matched', label: 'Đã khớp' },
            { value: 'unmatched', label: 'Chưa khớp' },
          ]}
        />
        <RangePicker
          value={range}
          presets={RANGE_PRESETS}
          onChange={(v) => {
            setRange(v as [Dayjs, Dayjs] | null);
            setPage(1);
          }}
        />
        <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching}>
          Tải lại
        </Button>
      </Space>

      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.data || []}
        pagination={{
          current: page,
          pageSize: limit,
          total: data?.total || 0,
          showSizeChanger: true,
          onChange: (p, ps) => {
            setPage(p);
            setLimit(ps);
          },
        }}
      />
    </div>
  );
}