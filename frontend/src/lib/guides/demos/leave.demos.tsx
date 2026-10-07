'use client';

import { Alert, Button, ColorPicker, DatePicker, Form, Input, InputNumber, Select, Space, Switch, Table, Tag, TimePicker, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckOutlined, CloseCircleOutlined, CloseOutlined, DeleteOutlined, EditOutlined, LockOutlined, PaperClipOutlined, PlusOutlined } from '@ant-design/icons';
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

// ─────────────────────────────────────────────────────────────────────────────
// Duyệt phép (`/duyet-phep`) và Quản lý Loại phép (`/quan-ly-loai-phep`)
// ─────────────────────────────────────────────────────────────────────────────

/** Mẫu bảng tab "Chờ phê duyệt": cột và 3 nút Duyệt / Từ chối / Sửa đúng như `duyet-phep/page.tsx`. */
interface DemoPendingRow {
    id: number;
    name: string;
    email: string;
    sentAt: string;
    dept: string;
    deptColor: string;
    leaveType: string;
    start: string;
    end: string;
    totalDays: number;
    hours: string | null;
    reason: string;
    attachmentCount: number;
    isSupplementary?: boolean;
}

const DEMO_PENDING: DemoPendingRow[] = [
    { id: 1, name: 'Nguyễn Thị Lan', email: 'lan.nt@example.com', sentAt: '07/10/2026 08:45', dept: 'Kinh doanh 1', deptColor: 'blue', leaveType: 'annual', start: '20/10/2026', end: '22/10/2026', totalDays: 3, hours: null, reason: 'Về quê có việc gia đình', attachmentCount: 0 },
    { id: 2, name: 'Trần Văn Minh', email: 'minh.tv@example.com', sentAt: '07/10/2026 09:10', dept: 'Kinh doanh 2', deptColor: 'purple', leaveType: 'meet_client', start: '15/10/2026', end: '15/10/2026', totalDays: 1, hours: '14:00 - 17:00', reason: 'Gặp khách ký hợp đồng', attachmentCount: 0 },
    { id: 3, name: 'Lê Thu Hoa', email: 'hoa.lt@example.com', sentAt: '06/10/2026 16:30', dept: 'Marketing', deptColor: 'green', leaveType: 'sick', start: '05/10/2026', end: '06/10/2026', totalDays: 2, hours: null, reason: 'Sốt, có giấy khám', attachmentCount: 2, isSupplementary: true },
];

function LeaveApproveTableDemo() {
    const columns: ColumnsType<DemoPendingRow> = [
        {
            title: 'Người gửi',
            key: 'name',
            width: 170,
            render: (_v, r) => (
                <div>
                    <div style={{ fontWeight: 500 }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>{r.email}</div>
                </div>
            ),
        },
        { title: 'Ngày gửi', dataIndex: 'sentAt', key: 'sentAt', width: 130 },
        { title: 'Phòng ban', key: 'dept', width: 120, render: (_v, r) => <Tag color={r.deptColor}>{r.dept}</Tag> },
        {
            title: 'Loại phép',
            key: 'leaveType',
            width: 130,
            render: (_v, r) => (
                <>
                    <Tag color={typeOf(r.leaveType).color}>{typeOf(r.leaveType).name}</Tag>
                    {r.isSupplementary && <Tag color="gold">Đơn bổ sung</Tag>}
                </>
            ),
        },
        {
            title: 'Thời gian',
            key: 'time',
            width: 130,
            render: (_v, r) => (
                <div>
                    <div>{r.start}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>đến {r.end}</div>
                    <div style={{ fontSize: 12, color: '#1890ff' }}>{r.totalDays} ngày</div>
                </div>
            ),
        },
        { title: 'Khung giờ', key: 'hours', width: 110, render: (_v, r) => (r.hours ? <span style={{ color: '#722ed1' }}>{r.hours}</span> : '-') },
        { title: 'Lý do', dataIndex: 'reason', key: 'reason', width: 160, ellipsis: true },
        {
            title: 'Đính kèm',
            key: 'attachments',
            width: 100,
            render: (_v, r) => (r.attachmentCount > 0 ? <Button size="small" icon={<PaperClipOutlined />}>{r.attachmentCount} ảnh</Button> : '-'),
        },
        {
            title: 'Thao tác',
            key: 'action',
            width: 230,
            render: () => (
                <Space>
                    <Button type="primary" size="small" icon={<CheckOutlined />}>Duyệt</Button>
                    <Button danger size="small" icon={<CloseOutlined />}>Từ chối</Button>
                    <Button size="small" icon={<EditOutlined />}>Sửa</Button>
                </Space>
            ),
        },
    ];
    return (
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
            <Text type="secondary">Tab Chờ phê duyệt (nút Sửa chỉ hiện với người có quyền sửa hộ):</Text>
            <Table<DemoPendingRow> rowKey="id" size="small" columns={columns} dataSource={DEMO_PENDING} pagination={false} scroll={{ x: 1100 }} />
            <Text type="secondary">Bấm Từ chối sẽ mở hộp thoại bắt buộc nhập lý do:</Text>
            <div style={{ maxWidth: 460, padding: 12, border: '1px solid #f0f0f0', borderRadius: 8 }}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>Từ chối đơn nghỉ phép</Text>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
                    Lý do từ chối <span style={{ color: 'red' }}>*</span>
                </label>
                <Input.TextArea rows={3} placeholder="Nhập lý do từ chối (bắt buộc)..." />
                <Space style={{ marginTop: 12 }}>
                    <Button>Hủy</Button>
                    <Button danger type="primary">Xác nhận từ chối</Button>
                </Space>
            </div>
        </Space>
    );
}

// ── Quyền theo người xem (mirror `LeaveRequestsService.isEligibleApprover` / `applyApproverScope`) ──

export type LeaveViewerId = 'admin' | 'manager' | 'assistant';
type LeaveScope = 'all' | 'department';
export type LeaveRowStatus = 'pending' | 'approved' | 'rejected';

export interface LeaveViewer {
    id: LeaveViewerId;
    label: string;
    userId: number;
    managedDeptIds: number[];
    /** Phạm vi từng quyền; null = không có quyền. Theo SEED mặc định (Admin có thể đổi ở trang Phân quyền). */
    approve: LeaveScope | null;
    view: LeaveScope | null;
    edit: LeaveScope | null;
    del: LeaveScope | null;
    note: string;
}

const LEAVE_VIEWERS: LeaveViewer[] = [
    { id: 'admin', label: 'Admin', userId: 1, managedDeptIds: [], approve: 'all', view: 'all', edit: 'all', del: 'all', note: 'Admin luôn làm được mọi việc với mọi đơn.' },
    { id: 'manager', label: 'Manager (quản lý Kinh doanh 1)', userId: 10, managedDeptIds: [1], approve: 'department', view: 'department', edit: 'department', del: null, note: 'Chỉ xử lý đơn của phòng mình quản lý, cộng với người được gán riêng cho mình làm người duyệt. Mặc định không có quyền Huỷ/Xoá.' },
    { id: 'assistant', label: 'Assistant (quản lý Kinh doanh 2)', userId: 11, managedDeptIds: [2], approve: 'all', view: 'department', edit: 'all', del: null, note: 'Mặc định duyệt và sửa hộ được mọi đơn, nhưng phạm vi xem Lịch sử / Thùng rác / Thống kê chỉ theo phòng ban mình quản lý.' },
];

export interface DemoScopeRow {
    id: number;
    name: string;
    deptId: number;
    deptName: string;
    status: LeaveRowStatus;
    /** Người duyệt được gán riêng cho nhân viên này (ngoại lệ). */
    leaveApproverId: number | null;
}

const DEMO_SCOPE_ROWS: DemoScopeRow[] = [
    { id: 1, name: 'Nguyễn Thị Lan', deptId: 1, deptName: 'Kinh doanh 1', status: 'pending', leaveApproverId: null },
    { id: 2, name: 'Trần Văn Minh', deptId: 2, deptName: 'Kinh doanh 2', status: 'pending', leaveApproverId: null },
    { id: 3, name: 'Lê Thu Hoa', deptId: 3, deptName: 'Marketing', status: 'pending', leaveApproverId: 10 },
    { id: 4, name: 'Phạm Quốc Tuấn', deptId: 1, deptName: 'Kinh doanh 1', status: 'approved', leaveApproverId: null },
    { id: 5, name: 'Vũ Ngọc Nga', deptId: 2, deptName: 'Kinh doanh 2', status: 'rejected', leaveApproverId: null },
];

/** Phạm vi có phủ đơn này không: all = mọi đơn; department = phòng mình quản lý HOẶC được gán riêng làm người duyệt. */
function covers(scope: LeaveScope | null, viewer: LeaveViewer, row: DemoScopeRow): boolean {
    if (viewer.id === 'admin' || scope === 'all') return true;
    if (scope === 'department') return viewer.managedDeptIds.includes(row.deptId) || row.leaveApproverId === viewer.userId;
    return false;
}

export interface LeaveRowActions {
    approveReject: boolean;
    edit: boolean;
    trash: boolean;
    inHistory: boolean;
}

/** Việc người xem làm được trên 1 đơn - đúng điều kiện BE (trạng thái + phạm vi), không chỉ là nút hiện trên UI. */
export function leaveRowActions(viewer: LeaveViewer, row: DemoScopeRow): LeaveRowActions {
    return {
        approveReject: row.status === 'pending' && covers(viewer.approve, viewer, row),
        edit: (row.status === 'pending' || row.status === 'approved') && covers(viewer.edit, viewer, row),
        trash: (row.status === 'approved' || row.status === 'rejected') && covers(viewer.del, viewer, row),
        inHistory: row.status !== 'pending' && covers(viewer.view, viewer, row),
    };
}

export function leaveVisibleTabs(viewer: LeaveViewer): string[] {
    const tabs: string[] = [];
    if (viewer.approve) tabs.push('Chờ phê duyệt');
    if (viewer.view) tabs.push('Lịch sử phê duyệt', 'Thùng rác', 'Thống kê');
    return tabs;
}

export const LEAVE_VIEWERS_FOR_TEST = LEAVE_VIEWERS;
export const DEMO_SCOPE_ROWS_FOR_TEST = DEMO_SCOPE_ROWS;

const YES = <Tag color="green">Được</Tag>;
const NO = <Text type="secondary">-</Text>;

function LeaveActionsByViewerDemo({ viewerId }: { viewerId: string }) {
    const viewer = LEAVE_VIEWERS.find((v) => v.id === viewerId) ?? LEAVE_VIEWERS[0];
    const tabs = leaveVisibleTabs(viewer);
    const columns: ColumnsType<DemoScopeRow> = [
        { title: 'Người gửi', dataIndex: 'name', key: 'name', width: 160 },
        {
            title: 'Phòng ban',
            key: 'dept',
            width: 190,
            render: (_v, r) => (
                <Space size={4} wrap>
                    <Tag>{r.deptName}</Tag>
                    {r.leaveApproverId === 10 && <Tooltip title="Được gán riêng làm người duyệt phép cho nhân viên này"><Tag color="gold">Gán riêng cho Manager</Tag></Tooltip>}
                </Space>
            ),
        },
        { title: 'Trạng thái', key: 'status', width: 110, render: (_v, r) => <Tag color={LEAVE_STATUS[r.status].color}>{LEAVE_STATUS[r.status].text}</Tag> },
        { title: 'Duyệt / Từ chối', key: 'ar', width: 130, align: 'center', render: (_v, r) => (leaveRowActions(viewer, r).approveReject ? YES : NO) },
        { title: 'Sửa hộ', key: 'edit', width: 100, align: 'center', render: (_v, r) => (leaveRowActions(viewer, r).edit ? YES : NO) },
        { title: 'Huỷ (vào thùng rác)', key: 'trash', width: 160, align: 'center', render: (_v, r) => (leaveRowActions(viewer, r).trash ? YES : NO) },
        { title: 'Có trong Lịch sử', key: 'hist', width: 140, align: 'center', render: (_v, r) => (leaveRowActions(viewer, r).inHistory ? YES : NO) },
    ];
    return (
        <Space orientation="vertical" size={10} style={{ width: '100%' }}>
            <Text>
                Xem với tư cách: <b>{viewer.label}</b>. Tab thấy được: {tabs.length ? tabs.map((t) => <Tag key={t}>{t}</Tag>) : <Text type="secondary">không có tab nào (không vào được trang)</Text>}
            </Text>
            <Text type="secondary">{viewer.note}</Text>
            <Table<DemoScopeRow> rowKey="id" size="small" columns={columns} dataSource={DEMO_SCOPE_ROWS} pagination={false} scroll={{ x: 900 }} />
        </Space>
    );
}

// ── Quản lý Loại phép ──

interface DemoLeaveTypeRow {
    code: string;
    name: string;
    color: string;
    description: string | null;
    isSystem: boolean;
    isPaid: boolean;
    deductsAnnualBalance: boolean;
    inUseCount: number;
    sortOrder: number;
}

/** Bám seed `CreateLeaveTypes1781500000000` (7 loại hệ thống) + 1 loại tuỳ chỉnh. Tên/màu thật do Admin cấu hình; số "Đang dùng" là số bịa. */
const DEMO_LEAVE_TYPE_ROWS: DemoLeaveTypeRow[] = [
    { code: 'annual', name: 'Phép năm', color: '#1890ff', description: null, isSystem: true, isPaid: true, deductsAnnualBalance: true, inUseCount: 86, sortOrder: 1 },
    { code: 'sick', name: 'Nghỉ ốm', color: '#faad14', description: null, isSystem: true, isPaid: true, deductsAnnualBalance: true, inUseCount: 21, sortOrder: 2 },
    { code: 'maternity', name: 'Thai sản', color: '#eb2f96', description: null, isSystem: true, isPaid: true, deductsAnnualBalance: false, inUseCount: 0, sortOrder: 3 },
    { code: 'compensatory', name: 'Nghỉ bù', color: '#13c2c2', description: null, isSystem: true, isPaid: true, deductsAnnualBalance: false, inUseCount: 4, sortOrder: 4 },
    { code: 'meet_client', name: 'Gặp khách', color: '#52c41a', description: 'Ra ngoài gặp khách hàng trong giờ làm việc', isSystem: true, isPaid: true, deductsAnnualBalance: false, inUseCount: 33, sortOrder: 5 },
    { code: 'late_arrival', name: 'Đi trễ', color: '#fa8c16', description: null, isSystem: true, isPaid: true, deductsAnnualBalance: false, inUseCount: 12, sortOrder: 6 },
    { code: 'unpaid', name: 'Không lương', color: '#8c8c8c', description: null, isSystem: true, isPaid: false, deductsAnnualBalance: false, inUseCount: 7, sortOrder: 7 },
    { code: 'business_trip', name: 'Công tác', color: '#722ed1', description: 'Đi công tác ngoài tỉnh', isSystem: false, isPaid: true, deductsAnnualBalance: false, inUseCount: 5, sortOrder: 8 },
];

/** Ký hiệu chấm công suy từ cờ Hưởng lương - khớp `attendanceSymbols()` ở `quan-ly-loai-phep/page.tsx`. */
export function leaveAttendanceSymbols(isPaid: boolean): { fullDay: string; halfDay: string } {
    return isPaid ? { fullDay: 'P', halfDay: 'X/2' } : { fullDay: 'KL', halfDay: '1/2K' };
}

function LeaveTypeTableDemo() {
    const columns: ColumnsType<DemoLeaveTypeRow> = [
        {
            title: 'Loại phép',
            key: 'name',
            render: (_v, r) => (
                <Space>
                    <Tag color={r.color} style={{ marginRight: 0 }}>{r.name}</Tag>
                    {r.isSystem && <Tag icon={<LockOutlined />} color="default">Hệ thống</Tag>}
                </Space>
            ),
        },
        { title: 'Mã (code)', dataIndex: 'code', key: 'code', width: 150, render: (c: string) => <Text code>{c}</Text> },
        { title: 'Hưởng lương', key: 'isPaid', width: 120, align: 'center', render: (_v, r) => (r.isPaid ? <Tag color="green">Có lương</Tag> : <Tag color="red">Không lương</Tag>) },
        {
            title: 'Ký hiệu chấm công',
            key: 'symbols',
            width: 170,
            align: 'center',
            render: (_v, r) => {
                const s = leaveAttendanceSymbols(r.isPaid);
                return (
                    <Space size={4}>
                        <Tag color={r.color}>{s.fullDay}</Tag>
                        <Text type="secondary">/</Text>
                        <Tag color={r.color}>{s.halfDay}</Tag>
                    </Space>
                );
            },
        },
        { title: 'Trừ phép năm', key: 'deducts', width: 120, align: 'center', render: (_v, r) => (r.deductsAnnualBalance ? <Tag color="blue">Có</Tag> : <Text type="secondary">-</Text>) },
        { title: 'Mô tả', key: 'description', ellipsis: true, render: (_v, r) => r.description || '-' },
        { title: 'Đang dùng', key: 'inUse', width: 110, align: 'center', render: (_v, r) => (r.inUseCount > 0 ? <Tag color="blue">{r.inUseCount} đơn</Tag> : <Text type="secondary">-</Text>) },
        { title: 'Thứ tự hiển thị', dataIndex: 'sortOrder', key: 'sortOrder', width: 130 },
        {
            title: 'Thao tác',
            key: 'action',
            width: 170,
            render: (_v, r) => (
                <Space>
                    <Button size="small" icon={<EditOutlined />}>Sửa</Button>
                    {!r.isSystem && <Button size="small" danger icon={<DeleteOutlined />}>Xoá</Button>}
                </Space>
            ),
        },
    ];
    return <Table<DemoLeaveTypeRow> rowKey="code" size="small" columns={columns} dataSource={DEMO_LEAVE_TYPE_ROWS} pagination={false} scroll={{ x: 1100 }} />;
}

function LeaveTypeFormDemo() {
    return (
        <Form layout="vertical" style={{ maxWidth: 520 }} initialValues={{ color: '#1890ff', sortOrder: 0, isPaid: true, deductsAnnualBalance: false }}>
            <Text strong style={{ display: 'block', marginBottom: 12 }}>Thêm loại phép mới</Text>
            <Form.Item name="code" label="Mã loại phép (code)" tooltip="Không đổi được sau khi tạo" required>
                <Input placeholder="vd: meet_client" />
            </Form.Item>
            <Form.Item name="name" label="Tên hiển thị" required>
                <Input placeholder="Ví dụ: Gặp khách" />
            </Form.Item>
            <Form.Item name="description" label="Mô tả">
                <Input.TextArea rows={2} placeholder="Ghi chú ngắn về ý nghĩa loại phép này (không bắt buộc)" />
            </Form.Item>
            <Form.Item name="color" label="Màu hiển thị" required>
                <ColorPicker showText format="hex" defaultValue="#1890ff" />
            </Form.Item>
            <Form.Item name="isPaid" label="Hưởng lương" valuePropName="checked" tooltip="Quyết định ký hiệu chấm công: có lương -> P / X/2, không lương -> KL / 1/2K">
                <Switch checkedChildren="Có lương" unCheckedChildren="Không lương" />
            </Form.Item>
            <Form.Item name="deductsAnnualBalance" label="Trừ phép năm khi được duyệt" valuePropName="checked" tooltip="Nếu bật, đơn dùng loại này khi được duyệt sẽ trừ vào số ngày phép năm còn lại">
                <Switch checkedChildren="Có trừ" unCheckedChildren="Không trừ" />
            </Form.Item>
            <Form.Item name="sortOrder" label="Thứ tự hiển thị (số nhỏ hơn hiện trước)">
                <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
            <Space>
                <Button>Hủy</Button>
                <Button type="primary">OK</Button>
            </Space>
        </Form>
    );
}

function LeaveTypeDeleteFallbackDemo() {
    const options = DEMO_LEAVE_TYPE_ROWS.filter((t) => t.code !== 'business_trip');
    return (
        <div style={{ maxWidth: 460 }}>
            <Text strong style={{ display: 'block', marginBottom: 12 }}>Xoá loại phép &quot;Công tác&quot;?</Text>
            <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                title="Đang có 5 đơn nghỉ phép dùng loại phép này"
                description="Chọn loại phép thay thế bên dưới - toàn bộ đơn nghỉ phép đang dùng loại này sẽ được tự động chuyển sang loại bạn chọn trước khi loại cũ bị xoá."
            />
            <Text strong>Chuyển sang loại phép:</Text>
            <Select
                style={{ width: '100%', marginTop: 8, marginBottom: 16 }}
                placeholder="Chọn loại phép thay thế"
                options={options.map((t) => ({ value: t.code, label: <Tag color={t.color} style={{ marginRight: 0 }}>{t.name}</Tag> }))}
            />
            <Space>
                <Button>Huỷ</Button>
                <Button danger type="primary" disabled>Xoá</Button>
            </Space>
        </div>
    );
}

export const LEAVE_DEMOS: GuideDemo[] = [
    { id: 'leave-status-tags', title: 'Tag trạng thái đơn và loại phép', description: 'Bốn trạng thái đơn nghỉ phép, Tag loại phép và Tag "Đơn bổ sung".', render: () => <LeaveStatusTagsDemo /> },
    { id: 'leave-form', title: 'Hộp thoại Tạo đơn nghỉ phép', description: 'Các trường của form tạo đơn, theo đúng thứ tự trên trang thật.', render: () => <LeaveFormDemo /> },
    { id: 'leave-my-requests', title: 'Bảng Đơn nghỉ phép của tôi', description: 'Các cột của bảng, đủ 4 trạng thái; nút Hủy chỉ hiện ở đơn Chờ duyệt.', render: () => <LeaveMyRequestsDemo /> },
    { id: 'leave-approve-table', title: 'Bảng Chờ phê duyệt và hộp thoại Từ chối', description: 'Các cột của tab Chờ phê duyệt, ba nút Duyệt / Từ chối / Sửa và hộp thoại nhập lý do từ chối.', render: () => <LeaveApproveTableDemo /> },
    {
        id: 'leave-actions-by-viewer',
        title: 'Việc làm được trên từng đơn theo người xem',
        description: 'Với cùng 5 đơn mẫu, mỗi vai trò duyệt, sửa hộ, huỷ được đơn nào và thấy tab nào (theo quyền mặc định).',
        params: { viewer: ['admin', 'manager', 'assistant'] },
        render: (p) => <LeaveActionsByViewerDemo viewerId={p.viewer ?? 'admin'} />,
    },
    { id: 'leave-type-table', title: 'Bảng Quản lý Loại phép', description: 'Các cột Loại phép / Mã / Hưởng lương / Ký hiệu chấm công / Trừ phép năm / Đang dùng; loại Hệ thống không có nút Xoá.', render: () => <LeaveTypeTableDemo /> },
    { id: 'leave-type-form', title: 'Hộp thoại Thêm loại phép mới', description: 'Các trường của form, gồm hai công tắc Hưởng lương và Trừ phép năm.', render: () => <LeaveTypeFormDemo /> },
    { id: 'leave-type-delete-fallback', title: 'Xoá loại phép đang có đơn dùng', description: 'Hộp thoại bắt buộc chọn loại phép thay thế trước khi xoá.', render: () => <LeaveTypeDeleteFallbackDemo /> },
];

