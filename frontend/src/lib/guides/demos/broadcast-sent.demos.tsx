'use client';

import { Avatar, Button, Input, Progress, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { GuideDemo } from '../guide-demo.types';

const { Text, Paragraph } = Typography;

type SentViewer = 'admin' | 'manager';

interface DemoSentRow {
    id: number;
    title: string;
    edited?: string;
    sender: string;
    senderRole: string;
    time: string;
    audience: 'all' | 'dept' | 'users';
    audienceText: string;
    read: number;
    total: number;
}

/** Dữ liệu mẫu (tên/số liệu là giả định). */
const DEMO_SENT: DemoSentRow[] = [
    { id: 3, title: 'Thông báo lịch nghỉ lễ', sender: 'Admin Hệ thống', senderRole: 'Admin', time: '07/10/2026 08:30', audience: 'all', audienceText: 'Toàn bộ', read: 41, total: 58 },
    { id: 2, title: 'Nhắc nộp báo cáo cuối tháng', edited: '06/10/2026 16:10', sender: 'Lê Hương', senderRole: 'Manager', time: '06/10/2026 15:00', audience: 'dept', audienceText: '1 phòng ban', read: 11, total: 12 },
    { id: 1, title: 'Họp nhóm thứ Sáu', sender: 'Lê Hương', senderRole: 'Manager', time: '02/10/2026 09:15', audience: 'users', audienceText: '5 người', read: 3, total: 5 },
];

const AUDIENCE_COLOR: Record<DemoSentRow['audience'], string> = { all: 'purple', dept: 'blue', users: 'default' };

/**
 * Mẫu trang `/thong-bao/da-gui` (cột + bộ lọc đúng chữ thật).
 * `viewer=admin`: phạm vi xem "Toàn bộ" -> thấy mọi lần gửi + có bộ lọc "Người gửi", có Sửa + Xoá.
 * `viewer=manager`: phạm vi xem "Của tôi" -> chỉ lần do mình gửi, KHÔNG có bộ lọc "Người gửi", có Sửa, KHÔNG có Xoá.
 */
function SentTableDemo({ viewer }: { viewer: SentViewer }) {
    const isAdmin = viewer === 'admin';
    const rows = isAdmin ? DEMO_SENT : DEMO_SENT.filter((r) => r.sender === 'Lê Hương');

    const columns: ColumnsType<DemoSentRow> = [
        {
            title: 'Tiêu đề',
            key: 'title',
            render: (_v, r) => (
                <Space orientation="vertical" size={0}>
                    <Text strong>{r.title}</Text>
                    {r.edited && <Text type="secondary" style={{ fontSize: 11 }}>Đã chỉnh sửa lúc {r.edited}</Text>}
                </Space>
            ),
        },
        {
            title: 'Người gửi',
            key: 'sender',
            width: 170,
            render: (_v, r) => (
                <Space size={6}>
                    <Avatar size={24}>{r.sender[0]}</Avatar>
                    <Space orientation="vertical" size={0}>
                        <Text style={{ fontSize: 13 }}>{r.sender}</Text>
                        <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>{r.senderRole}</Tag>
                    </Space>
                </Space>
            ),
        },
        { title: 'Thời gian', dataIndex: 'time', key: 'time', width: 140 },
        { title: 'Đối tượng', key: 'aud', width: 120, render: (_v, r) => <Tag color={AUDIENCE_COLOR[r.audience]}>{r.audienceText}</Tag> },
        {
            title: 'Tiến độ đọc',
            key: 'progress',
            width: 180,
            render: (_v, r) => (
                <Space orientation="vertical" size={0} style={{ width: '100%' }}>
                    <Progress percent={Math.round((r.read / r.total) * 100)} size="small" showInfo={false} />
                    <Text type="secondary" style={{ fontSize: 12 }}>{r.read}/{r.total} đã đọc</Text>
                </Space>
            ),
        },
        {
            title: 'Thao tác',
            key: 'action',
            width: 90,
            render: () => (
                <Space size="small">
                    <Button type="text" size="small" icon={<EditOutlined />} />
                    {isAdmin && <Button type="text" danger size="small" icon={<DeleteOutlined />} />}
                </Space>
            ),
        },
    ];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 16, fontWeight: 500 }}>Thông báo đã gửi</Text>
                <Button type="primary" icon={<PlusOutlined />}>Soạn thông báo mới</Button>
            </div>
            <Space wrap style={{ marginBottom: 12 }}>
                <Input.Search style={{ width: 200 }} placeholder="Tìm theo tiêu đề..." readOnly />
                <Select style={{ width: 150 }} placeholder="Đối tượng" open={false} options={[]} />
                {isAdmin && <Select style={{ width: 170 }} placeholder="Người gửi" open={false} options={[]} />}
                <Input style={{ width: 200 }} placeholder="Từ ngày  →  Đến ngày" readOnly />
            </Space>
            <Table<DemoSentRow> rowKey="id" size="small" columns={columns} dataSource={rows} pagination={false} scroll={{ x: 'max-content' }} />
        </div>
    );
}

/** Mẫu ngăn chi tiết (Drawer) của 1 lần gửi: nội dung, số đọc/chưa đọc, tab người nhận. */
function SentDrawerDemo() {
    const people: { name: string; dept: string; status: 'read' | 'unread' | 'locked'; at: string }[] = [
        { name: 'Nguyễn An', dept: 'Kinh doanh 1', status: 'read', at: '06/10/2026 15:12' },
        { name: 'Trần Bình', dept: 'Kinh doanh 1', status: 'unread', at: '—' },
        { name: 'Phạm Dũng', dept: 'Kinh doanh 1', status: 'locked', at: '—' },
    ];
    const tag = (s: 'read' | 'unread' | 'locked') =>
        s === 'locked' ? <Tag>Đã khoá</Tag> : s === 'read' ? <Tag color="green">Đã đọc</Tag> : <Tag color="gold">Chưa đọc</Tag>;
    return (
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 16, background: '#fff', maxWidth: 560 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text strong style={{ fontSize: 16 }}>Nhắc nộp báo cáo cuối tháng</Text>
                <Space>
                    <Button size="small" icon={<EditOutlined />}>Sửa</Button>
                    <Button size="small" danger icon={<DeleteOutlined />}>Xoá</Button>
                </Space>
            </div>
            <Paragraph>Vui lòng nộp báo cáo tháng 10 trước 17h ngày 31/10.</Paragraph>
            <Text type="secondary" style={{ fontSize: 12 }}>Đã chỉnh sửa lúc 06/10/2026 16:10</Text>
            <div style={{ margin: '16px 0', display: 'flex', gap: 24 }}>
                <Space orientation="vertical" size={0}><Text type="secondary">Đã đọc</Text><Text strong style={{ fontSize: 18, color: '#52c41a' }}>11</Text></Space>
                <Space orientation="vertical" size={0}><Text type="secondary">Chưa đọc</Text><Text strong style={{ fontSize: 18, color: '#faad14' }}>1</Text></Space>
                <Space orientation="vertical" size={0}><Text type="secondary">Đối tượng</Text><Tag color="blue">1 phòng ban</Tag></Space>
            </div>
            <Tabs activeKey="all" items={[{ key: 'all', label: 'Tất cả' }, { key: 'unread', label: 'Chưa đọc' }, { key: 'read', label: 'Đã đọc' }]} />
            <Input.Search placeholder="Tìm theo tên..." readOnly style={{ marginBottom: 12 }} />
            <Table
                rowKey="name"
                size="small"
                pagination={false}
                dataSource={people}
                columns={[
                    { title: 'Nhân viên', dataIndex: 'name', key: 'name' },
                    { title: 'Phòng ban', dataIndex: 'dept', key: 'dept' },
                    { title: 'Trạng thái', key: 'status', render: (_v, r) => tag(r.status) },
                    { title: 'Thời điểm đọc', dataIndex: 'at', key: 'at' },
                ]}
            />
        </div>
    );
}

/** Ma trận ai làm được gì theo vai trò (đúng seed mặc định: view/edit Admin=all, Manager=own; delete chỉ Admin). */
function SentActionsDemo() {
    const rows = [
        { key: 'see', what: 'Thấy lần gửi nào', admin: 'Mọi lần gửi', manager: 'Chỉ lần do chính mình gửi' },
        { key: 'filter', what: 'Lọc theo Người gửi', admin: 'Có', manager: 'Không (đã tự khoá là mình)' },
        { key: 'edit', what: 'Sửa tiêu đề/nội dung', admin: 'Có, mọi lần gửi', manager: 'Có, chỉ lần của mình' },
        { key: 'del', what: 'Xoá', admin: 'Có', manager: 'Không có nút Xoá' },
        { key: 'new', what: 'Soạn thông báo mới', admin: 'Có (cần quyền gửi)', manager: 'Có (cần quyền gửi)' },
    ];
    return (
        <Table
            size="small"
            pagination={false}
            rowKey="key"
            dataSource={rows}
            columns={[
                { title: 'Việc', dataIndex: 'what', key: 'what', render: (v: string) => <Text strong>{v}</Text> },
                { title: <Tag color="red">Admin</Tag>, dataIndex: 'admin', key: 'admin' },
                { title: <Tag color="blue">Manager</Tag>, dataIndex: 'manager', key: 'manager' },
            ]}
        />
    );
}

export const BROADCAST_SENT_DEMOS: GuideDemo[] = [
    {
        id: 'broadcast-sent-table',
        title: 'Bảng Thông báo đã gửi',
        description: 'viewer=admin (thấy tất cả, có lọc Người gửi, có Xoá) hoặc viewer=manager (chỉ lần của mình, không lọc Người gửi, không Xoá)',
        params: { viewer: ['admin', 'manager'] },
        render: (p) => <SentTableDemo viewer={p.viewer === 'manager' ? 'manager' : 'admin'} />,
    },
    {
        id: 'broadcast-sent-drawer',
        title: 'Chi tiết một lần gửi',
        description: 'Ngăn chi tiết: nội dung, số đã đọc/chưa đọc, danh sách người nhận theo trạng thái',
        render: () => <SentDrawerDemo />,
    },
    {
        id: 'broadcast-sent-actions',
        title: 'Ai làm được gì ở Thông báo đã gửi',
        description: 'Bảng quyền xem/lọc/sửa/xoá theo Admin và Manager (mặc định)',
        render: () => <SentActionsDemo />,
    },
];
