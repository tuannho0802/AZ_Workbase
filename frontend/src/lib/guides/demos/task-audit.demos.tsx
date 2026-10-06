'use client';

import type { ReactNode } from 'react';
import { Alert, Avatar, Badge, Button, Card, Collapse, DatePicker, Input, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, SearchOutlined, UserOutlined, ExclamationCircleFilled } from '@ant-design/icons';
import dayjs from 'dayjs';
import { PERIODIC_TASK_AUDIT_ACTION_META } from '@/lib/types/periodic-task-audit.types';
import type { GuideDemo } from '../guide-demo.types';

const { Text } = Typography;
const { RangePicker } = DatePicker;

interface DemoAuditRow {
    id: number;
    at: string;
    task: string;
    user: string;
    role: string;
    action: string;
}

/** Dữ liệu cứng, tên người/việc là BỊA. Tuần 05/10/2026 là "Tuần này" theo `DEMO_TODAY` của bộ mẫu Công việc. */
const WEEK_THIS: DemoAuditRow[] = [
    { id: 1, at: '2026-10-05T09:12:40', task: 'Gọi lại 5 khách tiềm năng', user: 'Sales An', role: 'Employee', action: 'status_changed' },
    { id: 2, at: '2026-10-05T08:40:11', task: 'Báo cáo tuần Kinh doanh 1', user: 'Quản lý Bình', role: 'Manager', action: 'checklist_item_added' },
    { id: 3, at: '2026-10-05T07:00:05', task: 'Chốt số liệu tháng 9', user: 'Admin', role: 'Admin', action: 'locked' },
];
const WEEK_PREV: DemoAuditRow[] = [
    { id: 4, at: '2026-10-02T16:20:00', task: 'Gọi lại 5 khách tiềm năng', user: 'Sales An', role: 'Employee', action: 'created' },
    { id: 5, at: '2026-09-30T10:05:33', task: 'Báo cáo tuần Kinh doanh 1', user: 'Quản lý Bình', role: 'Manager', action: 'primary_assignee_changed' },
];

const ROLE_COLORS: Record<string, string> = { Admin: 'red', Manager: 'blue', Assistant: 'purple', Employee: 'green' };

const columns: ColumnsType<DemoAuditRow> = [
    {
        title: 'Thời gian',
        key: 'at',
        width: 130,
        render: (_v, r) => (
            <Space orientation="vertical" size={0}>
                <Text style={{ fontSize: 13, fontWeight: 500 }}>{dayjs(r.at).format('HH:mm:ss')}</Text>
                <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(r.at).format('DD/MM/YYYY')}</Text>
            </Space>
        ),
    },
    { title: 'Công việc', key: 'task', render: (_v, r) => <Text style={{ fontSize: 13, fontWeight: 500, color: '#1890ff' }}>{r.task}</Text> },
    {
        title: 'Người thực hiện',
        key: 'user',
        width: 190,
        render: (_v, r) => (
            <Space>
                <Avatar size={28} icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />
                <Space orientation="vertical" size={0}>
                    <Text strong style={{ fontSize: 13 }}>{r.user}</Text>
                    <Tag color={ROLE_COLORS[r.role]} style={{ fontSize: 10, margin: 0 }}>{r.role}</Tag>
                </Space>
            </Space>
        ),
    },
    {
        title: 'Hành động',
        key: 'action',
        width: 170,
        render: (_v, r) => {
            const meta = PERIODIC_TASK_AUDIT_ACTION_META[r.action];
            return <Tag color={meta?.color}>{meta?.label ?? r.action}</Tag>;
        },
    },
];

function weekLabel(start: string, count: number, isCurrent: boolean): ReactNode {
    const s = dayjs(start);
    return (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text strong>Tuần {s.format('DD/MM')} - {s.add(6, 'day').format('DD/MM/YYYY')}</Text>
            {isCurrent && <Tag color="blue">Tuần này</Tag>}
            <Badge count={count} color="#1890ff" showZero />
        </span>
    );
}

/** Bản rút gọn trang "Lịch sử Công việc": thanh lọc + các tuần gập/mở. Bản thật còn chọn dòng để xoá, mở rộng dòng để xem trước/sau, phân trang theo tuần. */
function TaskAuditPageDemo() {
    return (
        <div>
            <Card variant="outlined" size="small" style={{ marginBottom: 12 }}>
                <Space wrap>
                    <Input style={{ width: 260 }} placeholder="Tìm theo tên Công việc/người thực hiện..." prefix={<SearchOutlined />} />
                    <Select style={{ width: 180 }} placeholder="Loại hành động" options={[]} />
                    <RangePicker format="DD/MM/YYYY" />
                    <Button type="primary">Lọc</Button>
                    <Button icon={<ReloadOutlined />} />
                </Space>
            </Card>
            <Collapse
                defaultActiveKey={['2026-10-05']}
                items={[
                    {
                        key: '2026-10-05',
                        label: weekLabel('2026-10-05', WEEK_THIS.length, true),
                        children: <Table<DemoAuditRow> size="middle" pagination={false} rowKey="id" columns={columns} dataSource={WEEK_THIS} />,
                    },
                    {
                        key: '2026-09-28',
                        label: weekLabel('2026-09-28', WEEK_PREV.length, false),
                        children: <Table<DemoAuditRow> size="middle" pagination={false} rowKey="id" columns={columns} dataSource={WEEK_PREV} />,
                    },
                ]}
            />
        </div>
    );
}

function DemoModalBox({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div style={{ maxWidth: 480, margin: '0 auto 16px', border: '1px solid #d9d9d9', borderRadius: 8, boxShadow: '0 6px 16px rgba(0,0,0,0.08)', background: '#fff' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #f0f0f0', fontWeight: 600, fontSize: 16 }}>
                <ExclamationCircleFilled style={{ color: '#faad14', marginRight: 8 }} />
                {title}
            </div>
            <div style={{ padding: 20 }}>{children}</div>
            <div style={{ padding: '10px 20px', borderTop: '1px solid #f0f0f0', textAlign: 'right' }}>
                <Space>
                    <Button>Cancel</Button>
                    <Button type="primary">OK</Button>
                </Space>
            </div>
        </div>
    );
}

/** Hai hộp thoại xác nhận của Admin: xoá các dòng đã chọn, và dọn dẹp theo khoảng ngày. Cả hai đều bắt gõ "XÁC NHẬN". */
function TaskAuditCleanupDemo() {
    return (
        <div>
            <DemoModalBox title="Xác nhận xóa hàng loạt">
                <Text>Bạn có chắc chắn muốn xóa <b>3</b> bản ghi lịch sử đã chọn?</Text>
                <p style={{ marginTop: 8, color: 'red' }}>Hành động này không thể hoàn tác. Vui lòng nhập &quot;XÁC NHẬN&quot; để tiếp tục:</p>
                <Input placeholder="XÁC NHẬN" />
            </DemoModalBox>
            <DemoModalBox title="Xóa lịch sử theo khoảng thời gian">
                <Text type="secondary">Vui lòng chọn khoảng thời gian cần dọn dẹp:</Text>
                <div style={{ marginTop: 8 }}><RangePicker format="DD/MM/YYYY" /></div>
                <p style={{ marginTop: 16, color: 'red' }}>Vui lòng nhập &quot;XÁC NHẬN&quot; để thực hiện xóa:</p>
                <Input placeholder="XÁC NHẬN" />
            </DemoModalBox>
            <Alert type="info" showIcon title="Bản tĩnh, không xoá gì. Hai hộp thoại này chỉ hiện với người có quyền Xoá phạm vi Toàn bộ." />
        </div>
    );
}

export const TASK_AUDIT_DEMOS: GuideDemo[] = [
    {
        id: 'task-audit-page',
        title: 'Trang Lịch sử Công việc (rút gọn)',
        description: 'Thanh lọc và các tuần gập/mở, mỗi tuần là bảng Thời gian / Công việc / Người thực hiện / Hành động (bản tĩnh, không mở rộng dòng)',
        render: () => <TaskAuditPageDemo />,
    },
    {
        id: 'task-audit-cleanup',
        title: 'Hộp thoại xoá hàng loạt và dọn dẹp lịch sử',
        description: 'Hai hộp thoại xác nhận bắt gõ "XÁC NHẬN" (bản tĩnh, không xoá gì)',
        render: () => <TaskAuditCleanupDemo />,
    },
];
