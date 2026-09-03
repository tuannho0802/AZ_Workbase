'use client';

import { useState } from 'react';
import { Table, Select, DatePicker, Space, Tag, Button, Tooltip, App } from 'antd';
import { ReloadOutlined, FileExcelOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useAttendanceSummary, useExportAttendanceSummary } from '@/lib/hooks/useZkDevice';
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

export default function AttendanceSummaryTab() {
  const { message } = App.useApp();
  const { users } = useUsersList();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(31);
  const [userId, setUserId] = useState<number | undefined>(undefined);
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);

  const exportMutation = useExportAttendanceSummary();

  const { data, isLoading, refetch, isFetching } = useAttendanceSummary({
    page,
    limit,
    userId,
    from: range?.[0]?.format('YYYY-MM-DD'),
    to: range?.[1]?.format('YYYY-MM-DD'),
  });

  const columns = [
    {
      title: 'Ngày',
      dataIndex: 'date',
      key: 'date',
      width: 150,
      render: (v: string) => dayjs(v).format('dddd, DD/MM/YYYY'),
    },
    {
      title: 'Nhân viên',
      dataIndex: 'userName',
      key: 'userName',
    },
    {
      title: 'Giờ vào',
      dataIndex: 'checkIn',
      key: 'checkIn',
      width: 110,
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
      render: (v: number | null) => (v != null ? `${v}h` : '—'),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 160,
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
          showSearch={{ optionFilterProp: 'label' }}
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
        <Button
          icon={<FileExcelOutlined />}
          loading={exportMutation.isPending}
          onClick={() => {
            // Xuất Excel theo ĐÚNG bộ lọc đang áp dụng trên bảng (nhân
            // viên/khoảng ngày) - "y chang bảng gốc" đúng yêu cầu.
            exportMutation.mutate(
              {
                userId,
                from: range?.[0]?.format('YYYY-MM-DD'),
                to: range?.[1]?.format('YYYY-MM-DD'),
              },
              {
                onError: (err: any) =>
                  message.error(err?.response?.data?.message || 'Xuất Excel thất bại'),
              },
            );
          }}
        >
          Xuất Excel
        </Button>
      </Space>

      <Table
        // ⚠️ Không dùng thẳng `${r.userId}_${r.date}` - nhiều device user
        // CHƯA MAP đều có userId=null, nếu cùng ngày sẽ ra key trùng
        // (vd "null_2026-08-25") -> React cảnh báo duplicate key, dòng có
        // thể bị mất/nhân đôi khi render. Dùng deviceUserId (luôn có, kể cả
        // chưa map) làm phần phân biệt cho nhánh chưa map - giống pattern
        // đã dùng ở AttendanceMonthlyTab.tsx (rowKey `u-${id}` / `d-${deviceUserId}`).
        rowKey={(r: AttendanceSummaryRow) =>
          r.isMapped ? `u-${r.userId}_${r.date}` : `d-${r.deviceUserId}_${r.date}`
        }
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
