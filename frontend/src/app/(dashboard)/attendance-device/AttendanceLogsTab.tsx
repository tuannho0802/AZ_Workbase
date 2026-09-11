'use client';

import { useMemo, useState } from 'react';
import { Table, Select, DatePicker, Space, Tag, Button, Modal, App, Typography, Avatar } from 'antd';
import { ReloadOutlined, DeleteOutlined, FileExcelOutlined, UserOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useAttendanceLogs, useCleanupAttendanceLogs, useExportAttendanceLogs, useDeviceUsers } from '@/lib/hooks/useZkDevice';
import { useUsersList } from '@/lib/hooks/useUsers';
import { AttendanceLog } from '@/lib/types/zk-device.types';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
// ⚠️ MỚI - dropdown "Lọc theo nhân viên" trước đây chỉ hiện text trơn
// `u.name`, không có Tag màu Vai trò/Phòng ban/Vị trí như các dropdown chọn
// nhân viên khác (đồng bộ pattern renderUserOption ở CustomerFilters.tsx).
// Đồng thời gộp thêm nhóm "Chưa map (mã máy)" lấy từ useDeviceUsers() - hoàn
// thiện field `deviceUserId` đã thêm ở QueryAttendanceLogDto (BE) nhưng
// trước đây FE chưa có chỗ nào truyền lên.
import { useRoleColorMap, useRoleColors } from '@/lib/hooks/useRoleColorMap';
import { UserMiniCard } from './UserMiniCard';
import ExportPeriodModal from './ExportPeriodModal';

const { RangePicker } = DatePicker;
const { Text } = Typography;

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
  const { message } = App.useApp();
  const { users } = useUsersList();
  // ⚠️ FIX BUG THẬT (rà soát permission 2026-09): comment cũ ở đây ghi
  // "vẫn tách decorator @Roles(Role.ADMIN) ở BE" - ĐÃ STALE, BE đã đổi
  // sang @RequirePermission('attendance.delete') động từ lâu (xem
  // zk-device.controller.ts + migration AddMissingRbacPermissions). Trước
  // đây FE hardcode role==='admin' khiến nút DỌN DẸP LOG không bao giờ
  // hiện cho Assistant/role tuỳ chỉnh dù Admin đã cấp attendance.delete qua
  // trang Phân quyền - đúng kiểu lệch UI/API đang rà soát.
  const { can } = useMyPermissions();
  const canCleanup = can('attendance.delete');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [userId, setUserId] = useState<number | undefined>(undefined);
  // Chọn 1 user CHƯA map (qua mã trên máy) trong dropdown "Lọc theo nhân
  // viên" - luôn tách riêng với `userId` (chỉ 1 trong 2 có giá trị tại 1
  // thời điểm, xem onChange của Select bên dưới).
  const [deviceUserId, setDeviceUserId] = useState<string | undefined>(undefined);
  const [matched, setMatched] = useState<'matched' | 'unmatched' | undefined>(undefined);
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);

  const { data: deviceUsers } = useDeviceUsers();
  const { getRoleColor } = useRoleColorMap();
  const { roleColors: allRoles } = useRoleColors();
  const roleNameMap = useMemo(() => new Map(allRoles.map((r) => [r.code, r.name])), [allRoles]);
  const getRoleName = (code?: string) => (code ? roleNameMap.get(code) || code : '');

  // Nhóm 1: nhân viên hệ thống đã map - value dạng `u:{id}` để phân biệt
  // với nhóm 2 khi decode ở onChange.
  const mappedOptions = (users || []).map((u: any) => ({
    value: `u:${u.id}`,
    label: u.name,
    kind: 'user' as const,
    user: u,
  }));
  // Nhóm 2: user TRÊN MÁY chưa map với ai (mappedUserId null) - hoàn thiện
  // filter `deviceUserId` mới thêm ở BE, để admin rà soát log của riêng 1
  // user lạ trước khi vào tab Mapping gán.
  const unmappedOptions = (deviceUsers || [])
    .filter((d) => !d.mappedUserId)
    .map((d) => ({
      value: `d:${d.userId}`,
      label: d.name || `UID ${d.userId}`,
      kind: 'device' as const,
    }));
  const userSelectOptions = [
    { label: 'Nhân viên hệ thống', options: mappedOptions },
    { label: 'Chưa map (mã máy)', options: unmappedOptions },
  ];
  const userSelectValue = userId != null ? `u:${userId}` : deviceUserId ? `d:${deviceUserId}` : undefined;
  const handleUserSelectChange = (v: string | undefined) => {
    if (!v) {
      setUserId(undefined);
      setDeviceUserId(undefined);
    } else if (v.startsWith('u:')) {
      setUserId(Number(v.slice(2)));
      setDeviceUserId(undefined);
    } else if (v.startsWith('d:')) {
      setDeviceUserId(v.slice(2));
      setUserId(undefined);
    }
    setPage(1);
  };

  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupDate, setCleanupDate] = useState<Dayjs | null>(
    dayjs().subtract(6, 'month').startOf('month'),
  );
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const cleanupMutation = useCleanupAttendanceLogs();
  const exportMutation = useExportAttendanceLogs();

  const { data, isLoading, refetch, isFetching } = useAttendanceLogs({
    page,
    limit,
    userId,
    deviceUserId,
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
      render: (_: any, r: AttendanceLog) => {
        if (!r.matchedUser) {
          return (
            <Tag color="orange">
              Chưa khớp: {r.deviceUserName || `UID ${r.deviceUserId}`}
            </Tag>
          );
        }
        // ⚠️ MỚI - trước hiện nhiều Tag rời rạc cạnh tên (khó nhìn theo phản
        // hồi người dùng), giờ gom vào UserMiniCard dùng chung.
        const u = r.matchedUser;
        return (
          <UserMiniCard
            name={u.name}
            role={u.role}
            departmentName={u.department?.name}
            positionName={u.position?.name}
            getRoleColor={getRoleColor}
            getRoleName={getRoleName}
          />
        );
      },
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
          showSearch={{ optionFilterProp: 'label' }}
          placeholder="Lọc theo nhân viên"
          style={{ width: 260 }}
          popupMatchSelectWidth={false}
          value={userSelectValue}
          onChange={handleUserSelectChange}
          options={userSelectOptions}
          optionRender={(option) => {
            const data = option.data as unknown as { kind: 'user' | 'device'; user?: any; label: string };
            if (data.kind === 'device') {
              return (
                <Space size={4} align="center">
                  <Avatar size={20} icon={<UserOutlined />} style={{ backgroundColor: '#d9d9d9', flexShrink: 0 }} />
                  <span style={{ fontSize: 13 }}>{data.label}</span>
                  <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }} color="orange">
                    Chưa map
                  </Tag>
                </Space>
              );
            }
            const u = data.user;
            const tagStyle = { fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 };
            return (
              <Space size={4} align="center">
                <Avatar size={20} style={{ backgroundColor: getRoleColor(u?.role), fontSize: 11, flexShrink: 0 }}>
                  {u?.name?.[0]?.toUpperCase()}
                </Avatar>
                <span style={{ fontSize: 13 }}>{u?.name}</span>
                {u?.role && (
                  <Tag style={tagStyle} color={getRoleColor(u.role)}>{getRoleName(u.role)}</Tag>
                )}
                {u?.department?.name && <Tag style={tagStyle} color="default">{u.department.name}</Tag>}
                {u?.position?.name && <Tag style={tagStyle} color="default">{u.position.name}</Tag>}
              </Space>
            );
          }}
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
        <Button
          icon={<FileExcelOutlined />}
          loading={exportMutation.isPending}
          onClick={() => setExportModalOpen(true)}
        >
          Xuất Excel
        </Button>
        {canCleanup && (
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={() => setCleanupOpen(true)}
          >
            Dọn dẹp log cũ
          </Button>
        )}
      </Space>

      <Modal
        title="Dọn dẹp log chấm công cũ"
        open={cleanupOpen}
        onCancel={() => setCleanupOpen(false)}
        confirmLoading={cleanupMutation.isPending}
        okText="Xoá vĩnh viễn"
        okButtonProps={{ danger: true, disabled: !cleanupDate }}
        onOk={() => {
          if (!cleanupDate) return;
          const olderThan = cleanupDate.format('YYYY-MM-DD');
          Modal.confirm({
            title: 'Xác nhận lần cuối',
            content: (
              <>
                Xoá <Text strong>vĩnh viễn</Text> toàn bộ log chấm công trước ngày{' '}
                <Text strong>{cleanupDate.format('DD/MM/YYYY')}</Text>? Thao tác này{' '}
                <Text strong type="danger">
                  không thể hoàn tác
                </Text>
                .
              </>
            ),
            okText: 'Tôi hiểu, xoá luôn',
            okButtonProps: { danger: true },
            cancelText: 'Huỷ',
            onOk: async () => {
              try {
                const res = await cleanupMutation.mutateAsync(olderThan);
                message.success(`Đã xoá vĩnh viễn ${res.deleted} dòng log cũ hơn ${res.olderThan}.`);
                setCleanupOpen(false);
              } catch (err: any) {
                message.error(
                  `Dọn dẹp thất bại: ${err?.response?.data?.message || err?.message || 'Lỗi không xác định'}`,
                );
              }
            },
          });
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>
            Xoá vĩnh viễn mọi log chấm công có thời gian <Text strong>trước</Text> ngày chọn bên
            dưới. Dùng khi bảng log đã tích luỹ quá lâu, chiếm nhiều dung lượng DB.
          </Text>
          <Text type="danger">⚠️ Không thể hoàn tác - hãy chắc chắn trước khi xoá.</Text>
          <DatePicker
            style={{ width: '100%' }}
            value={cleanupDate}
            onChange={setCleanupDate}
            format="DD/MM/YYYY"
            placeholder="Xoá log trước ngày..."
          />
        </Space>
      </Modal>

      <ExportPeriodModal
        open={exportModalOpen}
        loading={exportMutation.isPending}
        defaultRange={range}
        onCancel={() => setExportModalOpen(false)}
        onConfirm={(confirmedRange) => {
          // Chỉ export ĐÚNG khoảng ngày đã xác nhận trong Modal - KHÔNG còn
          // khả năng "xuất toàn bộ" nếu người dùng chưa chọn ngày ở filter
          // trên bảng (đúng yêu cầu: luôn phải qua bước xác nhận Period).
          // Vẫn giữ userId/matched theo filter hiện tại trên bảng cho tiện.
          exportMutation.mutate(
            {
              userId,
              deviceUserId,
              matched,
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