'use client';

import { Button, DatePicker, Form, Input, Select, Space, Table, Tag, TimePicker, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CloseCircleOutlined, PaperClipOutlined, PlusOutlined } from '@ant-design/icons';
import type { GuideDemo } from '../guide-demo.types';

const { Text } = Typography;

/** Trạng thái đơn - khớp `STATUS_MAP` ở `nghi-phep/page.tsx` (text + màu). */
const LEAVE_STATUS: Record<string, { text: string; color: string }> = {
    pending: { text: 'Chờ duyệt', color: 'gold' },
    approved: { text: 'Đã duyệt', color: 'green' },
    rejected: { text: 'Từ chối', color: 'red' },
    cancelled: { text: 'Đã hủy', color: 'default' },
};

/** Loại phép mẫu - bám seed migration CreateLeaveTypes1781500000000 (tên/màu thật do Admin cấu hình, có thể khác). */
const LEAVE_TYPES = [
    { code: 'annual', name: 'Phép năm', color: '#1890ff' },
    { code: 'sick', name: 'Nghỉ ốm', color: '#faad14' },
    { code: 'meet_client', name: 'Gặp khách', color: '#52c41a' },
    { code: 'unpaid', name: 'Không lương', color: '#8c8c8c' },
];
const typeOf = (code: string) => LEAVE_TYPES.find((t) => t.code === code) ?? { name: code, color: 'default' };

interface DemoLeaveRow {
    id: number;
    leaveType: string;
    startDate: string;
    endDate: string;
    totalDays: number;
    hours: string | null;
    reason: string;
    status: keyof typeof LEAVE_STATUS;
    approver: string | null;
    rejectionReason: string | null;
    attachmentCount: number;
    isSupplementary?: boolean;
}

const DEMO_ROWS: DemoLeaveRow[] = [
    { id: 1, leaveType: 'annual', startDate: '20/10/2026', endDate: '22/10/2026', totalDays: 3, hours: null, reason: 'Về quê có việc gia đình', status: 'pending', approver: null, rejectionReason: null, attachmentCount: 0 },
    { id: 2, leaveType: 'meet_client', startDate: '15/10/2026', endDate: '15/10/2026', totalDays: 1, hours: '14:00 - 17:00', reason: 'Gặp khách ký hợp đồng', status: 'approved', approver: 'Nguyễn Văn Quản Lý', rejectionReason: null, attachmentCount: 0 },
    { id: 3, leaveType: 'sick', startDate: '08/10/2026', endDate: '09/10/2026', totalDays: 2, hours: null, reason: 'Sốt, có giấy khám', status: 'approved', approver: 'Nguyễn Văn Quản Lý', rejectionReason: null, attachmentCount: 2, isSupplementary: true },
    { id: 4, leaveType: 'unpaid', startDate: '01/10/2026', endDate: '03/10/2026', totalDays: 3, hours: null, reason: 'Việc cá nhân', status: 'rejected', approver: 'Nguyễn Văn Quản Lý', rejectionReason: 'Trùng đợt chốt doanh số, xin dời sang tuần sau', attachmentCount: 0 },
    { id: 5, leaveType: 'annual', startDate: '25/09/2026', endDate: '25/09/2026', totalDays: 0.5, hours: null, reason: 'Đưa con đi khám', status: 'cancelled', approver: null, rejectionReason: null, attachmentCount: 0 },
];

/** Mẫu Tag Trạng thái đơn + Loại phép (Tag màu như ô lọc/ô chọn thật). */
function LeaveStatusTagsDemo() {
    return (
        <Space orientation="vertical" size={12}>
            <Space wrap>
                <Text type="secondary">Trạng thái đơn:</Text>
                {Object.values(LEAVE_STATUS).map((s) => (
                    <Tag key={s.text} color={s.color}>
                        {s.text}
                    </Tag>
                ))}
            </Space>
            <Space wrap>
                <Text type="secondary">Loại phép (do Admin cấu hình):</Text>
                {LEAVE_TYPES.map((t) => (
                    <Tag key={t.code} color={t.color}>
                        {t.name}
                    </Tag>
                ))}
                <Tag color="gold">Đơn bổ sung</Tag>
            </Space>
        </Space>
    );
}

/** Mẫu hộp thoại "Tạo đơn nghỉ phép" - trường đúng thứ tự/nhãn như trang thật. */
function LeaveFormDemo() {
    return (
        <Form layout="vertical" style={{ maxWidth: 560 }} initialValues={{ duration: 'full_day' }}>
            <Form.Item label="Loại phép" required>
                <Select
                    placeholder="Chọn loại phép"
                    options={LEAVE_TYPES.map((t) => ({ value: t.code, label: <Tag color={t.color} style={{ marginInlineEnd: 0 }}>{t.name}</Tag> }))}
                />
            </Form.Item>
            <Form.Item label="Thời gian nghỉ" required>
                <DatePicker.RangePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>
            <Form.Item name="duration" label="Thời lượng">
                <Select
                    options={[
                        { value: 'full_day', label: 'Cả ngày' },
                        { value: 'half_day_am', label: 'Nửa ngày (Sáng)' },
                        { value: 'half_day_pm', label: 'Nửa ngày (Chiều)' },
                    ]}
                />
            </Form.Item>
            <Form.Item
                label="Khung giờ (Period Hours) - Không bắt buộc"
                extra="Nếu cần nghỉ theo khung giờ cụ thể trong ngày (vd 14:00 - 17:00), chọn cả Từ giờ và Đến giờ. Bỏ trống nếu không cần."
            >
                <TimePicker.RangePicker style={{ width: '100%' }} format="HH:mm" minuteStep={15} placeholder={['Từ giờ', 'Đến giờ']} />
            </Form.Item>
            <Form.Item label="Lý do" required>
                <Input.TextArea rows={3} placeholder="Nhập lý do xin nghỉ phép..." />
            </Form.Item>
            <Form.Item label="Ảnh đính kèm (nếu có)">
                <Button icon={<PlusOutlined />}>Thêm ảnh</Button>
            </Form.Item>
            <Space>
                <Button>Hủy</Button>
                <Button type="primary">Tạo đơn</Button>
            </Space>
        </Form>
    );
}

/** Mẫu bảng "Đơn nghỉ phép của tôi" - cột và nút Hủy (chỉ đơn Chờ duyệt) đúng như trang thật. */
function LeaveMyRequestsDemo() {
    const columns: ColumnsType<DemoLeaveRow> = [
        {
            title: 'Loại phép',
            key: 'leaveType',
            render: (_v, r) => (
                <>
                    <Tag color={typeOf(r.leaveType).color}>{typeOf(r.leaveType).name}</Tag>
                    {r.isSupplementary && <Tag color="gold">Đơn bổ sung</Tag>}
                </>
            ),
        },
        { title: 'Từ ngày', dataIndex: 'startDate', key: 'startDate' },
        { title: 'Đến ngày', dataIndex: 'endDate', key: 'endDate' },
        { title: 'Số ngày', key: 'totalDays', render: (_v, r) => `${r.totalDays} ngày` },
        { title: 'Khung giờ', key: 'hours', render: (_v, r) => (r.hours ? <span style={{ color: '#722ed1' }}>{r.hours}</span> : '-') },
        { title: 'Lý do', dataIndex: 'reason', key: 'reason', ellipsis: true },
        {
            title: 'Trạng thái',
            key: 'status',
            render: (_v, r) => <Tag color={LEAVE_STATUS[r.status].color}>{LEAVE_STATUS[r.status].text}</Tag>,
        },
        { title: 'Người duyệt', key: 'approver', render: (_v, r) => r.approver || '-' },
        {
            title: 'Lý do từ chối',
            key: 'rejectionReason',
            ellipsis: true,
            render: (_v, r) =>
                r.status === 'rejected' && r.rejectionReason ? (
                    <Tooltip title={r.rejectionReason}>
                        <span style={{ color: '#f5222d', fontStyle: 'italic' }}>{r.rejectionReason}</span>
                    </Tooltip>
                ) : (
                    '-'
                ),
        },
        {
            title: 'Đính kèm',
            key: 'attachments',
            render: (_v, r) => (r.attachmentCount > 0 ? <Button size="small" icon={<PaperClipOutlined />}>{r.attachmentCount} ảnh</Button> : '-'),
        },
        {
            title: 'Thao tác',
            key: 'action',
            render: (_v, r) =>
                r.status === 'pending' && (
                    <Button type="link" danger icon={<CloseCircleOutlined />}>
                        Hủy
                    </Button>
                ),
        },
    ];
    return <Table<DemoLeaveRow> rowKey="id" size="small" columns={columns} dataSource={DEMO_ROWS} pagination={false} scroll={{ x: 1200 }} />;
}

export const LEAVE_DEMOS: GuideDemo[] = [
    { id: 'leave-status-tags', title: 'Tag trạng thái đơn và loại phép', description: 'Bốn trạng thái đơn nghỉ phép, Tag loại phép và Tag "Đơn bổ sung".', render: () => <LeaveStatusTagsDemo /> },
    { id: 'leave-form', title: 'Hộp thoại Tạo đơn nghỉ phép', description: 'Các trường của form tạo đơn, theo đúng thứ tự trên trang thật.', render: () => <LeaveFormDemo /> },
    { id: 'leave-my-requests', title: 'Bảng Đơn nghỉ phép của tôi', description: 'Các cột của bảng, đủ 4 trạng thái; nút Hủy chỉ hiện ở đơn Chờ duyệt.', render: () => <LeaveMyRequestsDemo /> },
];
