'use client';

import { useState } from 'react';
import { Table, Select, DatePicker, Space, Tag, Button, Tooltip } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useAttendanceSummary } from '@/lib/hooks/useZkDevice';
import { useUsersList } from '@/lib/hooks/useUsers';
import { AttendanceStatus, AttendanceSummaryRow } from '@/lib/types/zk-device.types';

const { RangePicker } = DatePicker;

// Khớp đúng quy định: sau 9h00 tính đi muộn, trước 18h00 tính về sớm,
// từ 18h00 trở đi luôn tính tan ca đúng giờ.
const STATUS_CONFIG: Record<AttendanceStatus, { text: string; color: string }> = {
  on_time: { text: 'Đúng giờ', color: 'green' },
  late: { text: 'Đi muộn', color: 'orange' },
  early_leave: { text: 'Về sớm', color: 'gold' },
  late_and_early: { text: 'Đi muộn & về sớm', color: 'red' },
  missing_checkout: { text: 'Thiếu chấm ra', color: 'default' },
};

// dayjs locale 'vi' trả tên thứ viết thường ("thứ sáu") - viết hoa chữ đầu cho đẹp
const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Chọn nhanh khoảng ngày thay vì phải bấm 2 lần trên lịch - đỡ mất công chọn
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

export default function AttendanceSummaryTab() {
  const { users } = useUsersList();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(31);
  const [userId, setUserId] = useState<number | undefined>(undefined);
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);

  const { data, isLoading, refetch, isFetching } = useAttendanceSummary({
    page,
    limit,
    userId,
    from: range?.[0]?.format('YYYY-MM-DD'),
    to: range?.[1]?.format('YYYY-MM-DD'),
  });

  // Tổng width các cột cố định dưới đây = 150+180+110+110+110+160 = 820px,
  // kết hợp tableLayout 'fixed' để mỗi cột giữ đúng tỉ lệ, không bị dồn
  // trống lệch nhau giữa các cột như trước (cột "Nhân viên" trước đây
  // không có width cố định nên chiếm hết phần dư, đẩy layout lệch).
  const columns = [
    {
      title: 'Ngày',
      dataIndex: 'date',
      key: 'date',
      width: 150,
      render: (v: string) => capitalize(dayjs(v).format('dddd, DD/MM/YYYY')),
    },
    {
      title: 'Nhân viên',
      dataIndex: 'userName',
      key: 'userName',
      width: 180,
      ellipsis: true,
    },
    {
      title: 'Giờ vào',
      dataIndex: 'checkIn',
      key: 'checkIn',
      width: 110,
      align: 'center' as const,
      render: (v: string, r: AttendanceSummaryRow) => (
        <span style={{ color: r.isLate ? '#fa8c16' : undefined, fontWeight: r.isLate ? 600 : undefined }}>
          {dayjs(v).format('HH:mm:ss')}
        </span>
      ),
    },
    {
      title: 'Giờ ra',
      dataIndex: 'checkOut',
      key: 'checkOut',
      width: 110,
      align: 'center' as const,
      render: (v: string | null, r: AttendanceSummaryRow) =>
        v ? (
          <span style={{ color: r.isEarlyLeave ? '#faad14' : undefined, fontWeight: r.isEarlyLeave ? 600 : undefined }}>
            {dayjs(v).format('HH:mm:ss')}
          </span>
        ) : (
          <Tooltip title="Chỉ có 1 lượt quẹt trong ngày, chưa xác định được giờ ra thật">
            <span style={{ color: '#bfbfbf' }}>—</span>
          </Tooltip>
        ),
    },
    {
      title: 'Tổng giờ làm',
      dataIndex: 'workHours',
      key: 'workHours',
      width: 110,
      align: 'center' as const,
      render: (v: number | null) => (v != null ? `${v}h` : '—'),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      align: 'center' as const,
      render: (v: AttendanceStatus) => (
        <Tag color={STATUS_CONFIG[v]?.color}>{STATUS_CONFIG[v]?.text || v}</Tag>
      ),
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
        <RangePicker
          value={range}
          allowClear={false}
          presets={RANGE_PRESETS}
          onChange={(v) => {
            if (v && v[0] && v[1]) {
              setRange(v as [Dayjs, Dayjs]);
              setPage(1);
            }
          }}
        />
        <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching}>
          Tải lại
        </Button>
      </Space>

      <Table
        rowKey={(r: AttendanceSummaryRow) => `${r.userId}_${r.date}`}
        loading={isLoading}
        columns={columns}
        dataSource={data?.data || []}
        bordered
        tableLayout="fixed"
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