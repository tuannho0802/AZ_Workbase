'use client';

import { useMemo, useState } from 'react';
import { Table, Select, DatePicker, Space, Tag, Button, Tooltip, App, Avatar } from 'antd';
import { ReloadOutlined, FileExcelOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useAttendanceSummary, useExportAttendanceSummary } from '@/lib/hooks/useZkDevice';
import { useUsersList } from '@/lib/hooks/useUsers';
import { AttendanceStatus, AttendanceSummaryRow } from '@/lib/types/zk-device.types';
// ⚠️ MỚI - dropdown "Lọc theo nhân viên" trước đây chỉ hiện text trơn
// `u.name` (gap y hệt đã sửa ở AttendanceLogsTab.tsx/AttendanceMonthlyTab.tsx)
// - đồng bộ Tag màu Vai trò/Phòng ban/Vị trí theo đúng pattern renderUserOption
// ở CustomerFilters.tsx.
import { useRoleColorMap, useRoleColors } from '@/lib/hooks/useRoleColorMap';
import { UserMiniCard } from './UserMiniCard';
import ExportPeriodModal from './ExportPeriodModal';

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
  const [exportModalOpen, setExportModalOpen] = useState(false);

  const exportMutation = useExportAttendanceSummary();

  const { getRoleColor } = useRoleColorMap();
  const { roleColors: allRoles } = useRoleColors();
  const roleNameMap = useMemo(() => new Map(allRoles.map((r) => [r.code, r.name])), [allRoles]);
  const getRoleName = (code?: string) => (code ? roleNameMap.get(code) || code : '');
  const userSelectOptions = useMemo(
    () => (users || []).map((u: any) => ({ value: u.id, label: u.name, user: u })),
    [users],
  );
  // ⚠️ MỚI - tra cứu role/department/position theo `r.userId` để hiện Tag ở
  // cột "Nhân viên" của BẢNG (khác dropdown lọc ở trên) - `AttendanceSummaryRow`
  // (BE) không tự mang theo role/department/position, nên phải lookup qua
  // danh sách `users` đã fetch sẵn ở component này, giống pattern
  // `usersById` ở DeviceMappingTab.tsx.
  const usersById = useMemo(
    () => new Map<number, any>((users || []).map((u: any) => [u.id, u] as [number, any])),
    [users],
  );

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
      key: 'userName',
      render: (_: unknown, r: AttendanceSummaryRow) => {
        // ⚠️ MỚI - trước hiện nhiều Tag rời rạc cạnh tên (khó nhìn theo phản
        // hồi người dùng), giờ gom vào UserMiniCard dùng chung.
        if (!r.isMapped) {
          return (
            <span title={`Chưa map - mã máy: ${r.deviceUserId}`}>
              <span style={{ color: '#d46b08' }}>{r.userName}</span>{' '}
              <Tag color="orange" style={{ marginLeft: 2 }}>chưa map</Tag>
            </span>
          );
        }
        const u = r.userId != null ? usersById.get(r.userId) : undefined;
        return (
          <UserMiniCard
            name={r.userName}
            role={u?.role}
            departmentName={u?.department?.name}
            positionName={u?.position?.name}
            getRoleColor={getRoleColor}
            getRoleName={getRoleName}
          />
        );
      },
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
          style={{ width: 240 }}
          popupMatchSelectWidth={false}
          value={userId}
          onChange={(v) => {
            setUserId(v);
            setPage(1);
          }}
          options={userSelectOptions}
          optionRender={(option) => {
            const u = (option.data as { user: any }).user;
            const tagStyle = { fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 };
            return (
              <Space size={4} align="center">
                <Avatar size={20} style={{ backgroundColor: getRoleColor(u?.role), fontSize: 11, flexShrink: 0 }}>
                  {u?.name?.[0]?.toUpperCase()}
                </Avatar>
                <span style={{ fontSize: 13 }}>{u?.name}</span>
                {u?.role && <Tag style={tagStyle} color={getRoleColor(u.role)}>{getRoleName(u.role)}</Tag>}
                {u?.department?.name && <Tag style={tagStyle} color="default">{u.department.name}</Tag>}
                {u?.position?.name && <Tag style={tagStyle} color="default">{u.position.name}</Tag>}
              </Space>
            );
          }}
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
          onClick={() => setExportModalOpen(true)}
        >
          Xuất Excel
        </Button>
      </Space>

      <ExportPeriodModal
        open={exportModalOpen}
        loading={exportMutation.isPending}
        defaultRange={range}
        onCancel={() => setExportModalOpen(false)}
        onConfirm={(confirmedRange) => {
          exportMutation.mutate(
            {
              userId,
              from: confirmedRange[0].format('YYYY-MM-DD'),
              to: confirmedRange[1].format('YYYY-MM-DD'),
            },
            {
              onSuccess: () => setExportModalOpen(false),
              onError: (err: any) =>
                message.error(err?.response?.data?.message || 'Xuất Excel thất bại'),
            },
          );
        }}
      />

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