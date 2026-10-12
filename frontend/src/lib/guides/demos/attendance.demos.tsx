'use client';

import { Button, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DisconnectOutlined, LinkOutlined, SyncOutlined } from '@ant-design/icons';
import type { GuideDemo } from '../guide-demo.types';

const { Text } = Typography;

type Status = 'on_time' | 'late' | 'early_leave' | 'late_and_early' | 'missing_checkout';
const STATUS_CONFIG: Record<Status, { text: string; color: string }> = {
    on_time: { text: 'Đúng giờ', color: 'green' },
    late: { text: 'Đi muộn', color: 'orange' },
    early_leave: { text: 'Về sớm', color: 'gold' },
    late_and_early: { text: 'Đi muộn & về sớm', color: 'red' },
    missing_checkout: { text: 'Thiếu chấm ra', color: 'default' },
};

interface SummaryRow {
    key: string;
    date: string;
    name: string;
    mapped: boolean;
    checkIn: string;
    checkOut: string | null;
    hours: number | null;
    status: Status;
}

/** Dữ liệu mẫu (tên giả định). Quy tắc: vào sau 09:00 = muộn, ra trước 18:00 = sớm, chỉ 1 lượt quẹt = thiếu chấm ra. */
const SUMMARY_ROWS: SummaryRow[] = [
    { key: '1', date: 'Thứ Hai, 12/10/2026', name: 'Nguyễn Văn A', mapped: true, checkIn: '08:52:10', checkOut: '18:05:33', hours: 9.22, status: 'on_time' },
    { key: '2', date: 'Thứ Hai, 12/10/2026', name: 'Trần Thị B', mapped: true, checkIn: '09:14:02', checkOut: '18:30:00', hours: 9.27, status: 'late' },
    { key: '3', date: 'Thứ Hai, 12/10/2026', name: 'Lê Văn C', mapped: true, checkIn: '08:58:40', checkOut: '16:40:12', hours: 7.7, status: 'early_leave' },
    { key: '4', date: 'Thứ Hai, 12/10/2026', name: 'Phạm Thị D', mapped: true, checkIn: '09:30:00', checkOut: '17:10:00', hours: 7.67, status: 'late_and_early' },
    { key: '5', date: 'Thứ Hai, 12/10/2026', name: 'Hoàng Văn E', mapped: true, checkIn: '08:45:00', checkOut: null, hours: null, status: 'missing_checkout' },
    { key: '6', date: 'Thứ Hai, 12/10/2026', name: 'Nhân viên mới', mapped: false, checkIn: '08:50:00', checkOut: '18:01:00', hours: 9.18, status: 'on_time' },
];

interface LogRow {
    key: string;
    time: string;
    name: string;
    mapped: boolean;
    source: 'device_push' | 'device_pull';
    serial: string;
}

const SOURCE_LABEL = { device_push: { text: 'Máy tự đẩy', color: 'blue' }, device_pull: { text: 'Đồng bộ thủ công', color: 'purple' } };

const LOG_ROWS: LogRow[] = [
    { key: '1', time: '12/10/2026 18:05:33', name: 'Nguyễn Văn A', mapped: true, source: 'device_push', serial: 'ABC1234567' },
    { key: '2', time: '12/10/2026 08:52:10', name: 'Nguyễn Văn A', mapped: true, source: 'device_push', serial: 'ABC1234567' },
    { key: '3', time: '11/10/2026 18:01:00', name: 'UID 45', mapped: false, source: 'device_pull', serial: 'ABC1234567' },
];

/**
 * `tab=summary`: bảng "Bảng chấm công" (mỗi dòng = 1 nhân viên trong 1 ngày; cột Ngày / Nhân viên / Giờ vào / Giờ ra / Tổng giờ làm / Trạng thái).
 * `tab=logs`: bảng "Logs chấm công" (log thô: Thời gian / Nhân viên / Nguồn / Mã máy), dòng chưa map hiện thẻ cam "Chưa khớp: ...".
 */
function AttendanceTableDemo({ tab }: { tab: string }) {
    if (tab === 'logs') {
        const columns: ColumnsType<LogRow> = [
            { title: 'Thời gian', dataIndex: 'time', key: 'time', width: 170 },
            { title: 'Nhân viên', key: 'name', render: (_v, r) => (r.mapped ? r.name : <Tag color="orange">Chưa khớp: {r.name}</Tag>) },
            { title: 'Nguồn', key: 'source', width: 150, render: (_v, r) => <Tag color={SOURCE_LABEL[r.source].color}>{SOURCE_LABEL[r.source].text}</Tag> },
            { title: 'Mã máy', dataIndex: 'serial', key: 'serial', width: 150 },
        ];
        return <Table<LogRow> size="small" rowKey="key" columns={columns} dataSource={LOG_ROWS} pagination={false} />;
    }
    const columns: ColumnsType<SummaryRow> = [
        { title: 'Ngày', dataIndex: 'date', key: 'date', width: 170 },
        {
            title: 'Nhân viên',
            key: 'name',
            render: (_v, r) =>
                r.mapped ? (
                    r.name
                ) : (
                    <span>
                        <span style={{ color: '#d46b08' }}>{r.name}</span> <Tag color="orange">chưa map</Tag>
                    </span>
                ),
        },
        {
            title: 'Giờ vào',
            key: 'in',
            width: 100,
            render: (_v, r) => <span style={r.status === 'late' || r.status === 'late_and_early' ? { color: '#fa8c16', fontWeight: 600 } : undefined}>{r.checkIn}</span>,
        },
        {
            title: 'Giờ ra',
            key: 'out',
            width: 100,
            render: (_v, r) =>
                r.checkOut ? (
                    <span style={r.status === 'early_leave' || r.status === 'late_and_early' ? { color: '#faad14', fontWeight: 600 } : undefined}>{r.checkOut}</span>
                ) : (
                    <Tooltip title="Chỉ có 1 lượt quẹt trong ngày, chưa xác định được giờ ra thật">
                        <span style={{ color: '#bfbfbf' }}>—</span>
                    </Tooltip>
                ),
        },
        { title: 'Tổng giờ làm', key: 'hours', width: 110, render: (_v, r) => (r.hours != null ? `${r.hours}h` : '—') },
        { title: 'Trạng thái', key: 'status', width: 160, render: (_v, r) => <Tag color={STATUS_CONFIG[r.status].color}>{STATUS_CONFIG[r.status].text}</Tag> },
    ];
    return <Table<SummaryRow> size="small" rowKey="key" columns={columns} dataSource={SUMMARY_ROWS} pagination={false} scroll={{ x: 'max-content' }} />;
}

interface DeviceUserRow {
    uid: number;
    userId: string;
    name: string;
    mappedTo: string | null;
}

const DEVICE_USERS: DeviceUserRow[] = [
    { uid: 1, userId: '12', name: 'NVA', mappedTo: 'Nguyễn Văn A' },
    { uid: 2, userId: '13', name: 'TTB', mappedTo: 'Trần Thị B' },
    { uid: 3, userId: '45', name: 'NV moi', mappedTo: null },
];

/**
 * Mẫu tab "Mapping nhân viên" (cột Mã User (máy) / Tên trên máy / Trạng thái map / Thao tác).
 * `viewer=manage` (có attendance.manage): có nút Đồng bộ ngay, Gán nhân viên / Đổi mapping, Gỡ. `viewer=view`: chỉ xem, không có cột Thao tác.
 */
function ZkMappingDemo({ viewer }: { viewer: string }) {
    const canManage = viewer !== 'view';
    const columns: ColumnsType<DeviceUserRow> = [
        { title: 'Mã User (máy)', dataIndex: 'userId', key: 'userId', width: 140 },
        { title: 'Tên trên máy', dataIndex: 'name', key: 'name' },
        {
            title: 'Trạng thái map',
            key: 'mapped',
            render: (_v, r) =>
                r.mappedTo ? (
                    <Space size={6}>
                        <Tag color="green" style={{ margin: 0 }}>Đã map</Tag>
                        <Text>{r.mappedTo}</Text>
                    </Space>
                ) : (
                    <Tag color="orange">Chưa map</Tag>
                ),
        },
        ...(canManage
            ? [
                {
                    title: 'Thao tác',
                    key: 'action',
                    width: 240,
                    render: (_v: unknown, r: DeviceUserRow) => (
                        <Space>
                            <Button size="small" icon={<LinkOutlined />}>{r.mappedTo ? 'Đổi mapping' : 'Gán nhân viên'}</Button>
                            {r.mappedTo && (
                                <Button size="small" danger icon={<DisconnectOutlined />}>
                                    Gỡ
                                </Button>
                            )}
                        </Space>
                    ),
                } as ColumnsType<DeviceUserRow>[number],
            ]
            : []),
    ];
    return (
        <div>
            {canManage && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                    <Button type="primary" icon={<SyncOutlined />}>
                        Đồng bộ ngay
                    </Button>
                </div>
            )}
            <Table<DeviceUserRow> size="small" rowKey="uid" columns={columns} dataSource={DEVICE_USERS} pagination={false} />
        </div>
    );
}

export const ATTENDANCE_DEMOS: GuideDemo[] = [
    {
        id: 'attendance-table',
        title: 'Bảng chấm công / Logs chấm công',
        description: 'tab=summary: bảng tổng hợp theo ngày với trạng thái Đúng giờ/Đi muộn/Về sớm...; tab=logs: log thô từng lượt quẹt.',
        params: { tab: ['summary', 'logs'] },
        render: (p) => <AttendanceTableDemo tab={p.tab ?? 'summary'} />,
    },
    {
        id: 'zk-mapping',
        title: 'Mapping nhân viên với mã máy',
        description: 'Bảng user trên máy chấm công và trạng thái map; viewer=manage hoặc view.',
        params: { viewer: ['manage', 'view'] },
        render: (p) => <ZkMappingDemo viewer={p.viewer ?? 'manage'} />,
    },
];