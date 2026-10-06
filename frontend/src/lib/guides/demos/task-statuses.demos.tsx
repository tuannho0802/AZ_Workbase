'use client';

import { Alert, Button, ColorPicker, Form, Input, InputNumber, Select, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, InfoCircleOutlined, LockOutlined } from '@ant-design/icons';
import type { GuideDemo } from '../guide-demo.types';

const { Text } = Typography;

interface DemoTaskStatusRow {
    id: number;
    code: string;
    name: string;
    color: string;
    description: string | null;
    isSystem: boolean;
    isDoneState: boolean;
    inUseCount: number;
    sortOrder: number;
}

/**
 * Dữ liệu mẫu bám bộ mặc định seed ở migration CreatePeriodicTaskStatuses1781900000000 + dữ liệu thật của hệ thống: 5 trạng thái hệ thống
 * (khớp màn hình trang thật) + 1 trạng thái tuỳ chỉnh BỊA để minh hoạ nút Xoá. Tên/màu/số "Đang dùng" có thể khác ở hệ thống của bạn.
 */
const DEMO_ROWS: DemoTaskStatusRow[] = [
    { id: 1, code: 'not_started', name: 'To-Do', color: '#faad14', description: 'Trạng thái mặc định khi vừa tạo Task', isSystem: true, isDoneState: false, inUseCount: 0, sortOrder: 0 },
    { id: 2, code: 'in_progress', name: 'Đang làm', color: '#1890ff', description: 'Trạng thái Task đang được làm', isSystem: true, isDoneState: false, inUseCount: 11, sortOrder: 1 },
    { id: 3, code: 'in_review', name: 'Xem xét', color: '#722ed1', description: 'Trạng thái khi Task đang được Manager hoặc Mentor xem xét và đánh giá lại', isSystem: true, isDoneState: false, inUseCount: 6, sortOrder: 2 },
    { id: 4, code: 'completed', name: 'Hoàn thành', color: '#52c41a', description: 'Trạng thái Task khi đã hoàn thành qua giai đoạn Review hoặc Đánh giá xong', isSystem: true, isDoneState: true, inUseCount: 74, sortOrder: 3 },
    { id: 5, code: 'not_completed', name: 'Không hoàn thành', color: '#f5222d', description: 'Trạng thái khi Task được đánh giá là không hoàn thành', isSystem: true, isDoneState: false, inUseCount: 0, sortOrder: 4 },
    { id: 6, code: 'waiting_client', name: 'Chờ khách phản hồi', color: '#13c2c2', description: 'Do Admin tự thêm (ví dụ)', isSystem: false, isDoneState: false, inUseCount: 3, sortOrder: 5 },
];

/** Mẫu bảng trang "Quản lý Trạng thái Công việc định kỳ" - cột và nút đúng như trang thật (Xoá chỉ có ở trạng thái tuỳ chỉnh). */
function TaskStatusManageTableDemo() {
    const columns: ColumnsType<DemoTaskStatusRow> = [
        {
            title: 'Trạng thái',
            key: 'name',
            render: (_v, r) => (
                <Space>
                    <Tag color={r.color} style={{ marginRight: 0 }}>
                        {r.name}
                    </Tag>
                    {r.isSystem && (
                        <Tooltip title="Trạng thái hệ thống - không xoá được, chỉ sửa tên/màu/mô tả">
                            <LockOutlined style={{ color: '#faad14' }} />
                        </Tooltip>
                    )}
                </Space>
            ),
        },
        { title: 'Mã (code)', key: 'code', width: 150, render: (_v, r) => <Text code>{r.code}</Text> },
        { title: 'Mô tả', key: 'description', ellipsis: true, render: (_v, r) => r.description || <Text type="secondary">-</Text> },
        {
            title: (
                <Space size={4}>
                    Tính % hoàn thành
                    <Tooltip title="Task ở trạng thái này có tính vào TỬ SỐ % rollup không">
                        <InfoCircleOutlined style={{ color: '#8c8c8c' }} />
                    </Tooltip>
                </Space>
            ),
            key: 'isDoneState',
            width: 170,
            render: (_v, r) => (r.isDoneState ? <Tag color="success">Hoàn thành</Tag> : <Tag>Chưa tính</Tag>),
        },
        {
            title: 'Đang dùng',
            key: 'inUseCount',
            width: 110,
            render: (_v, r) => (r.inUseCount > 0 ? <Tag color="blue">{r.inUseCount} Task</Tag> : <Text type="secondary">0</Text>),
        },
        { title: 'Thứ tự hiển thị', dataIndex: 'sortOrder', key: 'sortOrder', width: 130 },
        {
            title: 'Thao tác',
            key: 'action',
            width: 170,
            render: (_v, r) => (
                <Space>
                    <Button size="small" icon={<EditOutlined />}>
                        Sửa
                    </Button>
                    {!r.isSystem && (
                        <Button size="small" danger icon={<DeleteOutlined />}>
                            Xoá
                        </Button>
                    )}
                </Space>
            ),
        },
    ];
    return <Table<DemoTaskStatusRow> rowKey="id" size="small" columns={columns} dataSource={DEMO_ROWS} pagination={false} scroll={{ x: 900 }} />;
}

/** Mẫu form Thêm/Sửa trạng thái: có thêm 2 công tắc rollup so với Status khách. */
function TaskStatusFormDemo() {
    return (
        <Form layout="vertical" style={{ maxWidth: 480 }} initialValues={{ sortOrder: 0, isDoneState: false, isExcludedFromRollup: false }}>
            <Form.Item label="Mã trạng thái (code)" tooltip="Giá trị THẬT lưu vào dữ liệu Công việc định kỳ - không đổi được sau khi tạo" required>
                <Input placeholder="vd: in_review" />
            </Form.Item>
            <Form.Item label="Tên hiển thị" required>
                <Input placeholder="Ví dụ: Đang xem xét" />
            </Form.Item>
            <Form.Item label="Mô tả">
                <Input.TextArea rows={2} placeholder="Ghi chú ngắn về ý nghĩa trạng thái này (không bắt buộc)" />
            </Form.Item>
            <Form.Item label="Màu hiển thị" required>
                <ColorPicker showText format="hex" defaultValue="#1890ff" />
            </Form.Item>
            <Form.Item name="sortOrder" label="Thứ tự hiển thị (số nhỏ hơn hiện trước)">
                <InputNumber style={{ width: '100%' }} min={0} placeholder="0" />
            </Form.Item>
            <Form.Item
                name="isDoneState"
                label="Tính là Hoàn thành (cho % rollup)"
                valuePropName="checked"
                tooltip="Bật nếu Task ở trạng thái này được tính là ĐÃ XONG khi tính % hoàn thành theo phòng ban/kỳ"
            >
                <Switch />
            </Form.Item>
            <Form.Item
                name="isExcludedFromRollup"
                label="Loại khỏi % rollup"
                valuePropName="checked"
                tooltip="Bật nếu Task ở trạng thái này KHÔNG được tính vào cả tử số lẫn mẫu số % rollup (vd trạng thái 'Đã huỷ')"
            >
                <Switch />
            </Form.Item>
        </Form>
    );
}

/** Mẫu hộp thoại Xoá khi trạng thái đang có Task dùng: bắt buộc chọn trạng thái thay thế. */
function TaskStatusDeleteFallbackDemo() {
    const fallbackOptions = DEMO_ROWS.filter((s) => s.code !== 'waiting_client');
    return (
        <div style={{ maxWidth: 480 }}>
            <Text strong style={{ display: 'block', marginBottom: 12 }}>
                Xoá trạng thái &quot;Chờ khách phản hồi&quot;?
            </Text>
            <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                title="Đang có 3 Công việc định kỳ dùng trạng thái này"
                description="Chọn trạng thái thay thế bên dưới - toàn bộ Task đang dùng trạng thái này sẽ được tự động chuyển sang trạng thái bạn chọn trước khi trạng thái cũ bị xoá."
            />
            <Text strong>Chuyển sang trạng thái:</Text>
            <Select
                style={{ width: '100%', marginTop: 8, marginBottom: 16 }}
                placeholder="Chọn trạng thái thay thế"
                options={fallbackOptions.map((s) => ({
                    value: s.id,
                    label: (
                        <Tag color={s.color} style={{ marginRight: 0 }}>
                            {s.name}
                        </Tag>
                    ),
                }))}
            />
            <Space>
                <Button>Huỷ</Button>
                <Button danger type="primary" disabled>
                    Xoá
                </Button>
            </Space>
        </div>
    );
}

/** Mẫu của trang "Quản lý Trạng thái công việc". */
export const TASK_STATUS_DEMOS: GuideDemo[] = [
    {
        id: 'task-status-manage-table',
        title: 'Bảng Quản lý Trạng thái công việc',
        description: 'Các cột Trạng thái / Mã / Mô tả / Tính % hoàn thành / Đang dùng / Thứ tự hiển thị / Thao tác; trạng thái Hệ thống (ổ khoá) không có nút Xoá',
        render: () => <TaskStatusManageTableDemo />,
    },
    {
        id: 'task-status-form',
        title: 'Form thêm/sửa trạng thái công việc',
        description: 'Các ô của modal "Thêm trạng thái mới", gồm 2 công tắc Tính là Hoàn thành và Loại khỏi % rollup (bản tĩnh, không lưu)',
        render: () => <TaskStatusFormDemo />,
    },
    {
        id: 'task-status-delete-fallback',
        title: 'Xoá trạng thái đang có Task dùng',
        description: 'Hộp thoại bắt buộc chọn trạng thái thay thế trước khi xoá (bản tĩnh)',
        render: () => <TaskStatusDeleteFallbackDemo />,
    },
];
