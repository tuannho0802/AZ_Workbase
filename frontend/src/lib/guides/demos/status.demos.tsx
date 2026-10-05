'use client';

import { Alert, Button, ColorPicker, Form, Input, InputNumber, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, LockOutlined } from '@ant-design/icons';
import type { GuideDemo } from '../guide-demo.types';

const { Text } = Typography;

interface DemoStatusRow {
    code: string;
    name: string;
    color: string;
    description: string | null;
    isSystem: boolean;
    inUseCount: number;
    sortOrder: number;
}

/**
 * Dữ liệu mẫu bám bộ mặc định seed ở migration CreateCustomerStatuses1781400000000 (9 trạng thái hệ thống) + 1 trạng thái
 * tuỳ chỉnh. Tên/màu thật do Admin cấu hình nên có thể khác; số "Đang dùng" là số bịa để minh hoạ.
 */
const DEMO_STATUS_ROWS: DemoStatusRow[] = [
    { code: 'pending', name: 'Chờ xử lý', color: '#faad14', description: 'Trạng thái mặc định khi vừa nhập khách', isSystem: true, inUseCount: 120, sortOrder: 1 },
    { code: 'account_opened', name: 'Đã mở Tài khoản', color: '#13c2c2', description: null, isSystem: true, inUseCount: 18, sortOrder: 2 },
    { code: 'closed', name: 'Đã chốt', color: '#52c41a', description: null, isSystem: true, inUseCount: 35, sortOrder: 3 },
    { code: 'potential', name: 'Deal Tiềm Năng', color: '#1890ff', description: null, isSystem: true, inUseCount: 22, sortOrder: 4 },
    { code: 'callback_later', name: 'Liên hệ lại sau', color: '#722ed1', description: null, isSystem: true, inUseCount: 9, sortOrder: 5 },
    { code: 'lost', name: 'Deadlead', color: '#f5222d', description: null, isSystem: true, inUseCount: 41, sortOrder: 6 },
    { code: 'nurturing_group', name: 'Đang chăm sóc nhóm', color: '#eb2f96', description: null, isSystem: true, inUseCount: 0, sortOrder: 7 },
    { code: 'ib', name: 'IB', color: '#fa8c16', description: null, isSystem: true, inUseCount: 0, sortOrder: 8 },
    { code: 'inactive', name: 'Ngừng chăm sóc', color: '#8c8c8c', description: null, isSystem: true, inUseCount: 3, sortOrder: 99 },
    { code: 'vip_follow', name: 'Theo dõi VIP', color: '#2f54eb', description: 'Trạng thái do Admin tự thêm (ví dụ)', isSystem: false, inUseCount: 4, sortOrder: 10 },
];

/** Mẫu bảng trang \"Quản lý Status khách\" - cột và nút đúng như trang thật (Xoá chỉ có ở trạng thái tuỳ chỉnh). */
function StatusManageTableDemo() {
    const columns: ColumnsType<DemoStatusRow> = [
        {
            title: 'Trạng thái',
            key: 'name',
            render: (_v, r) => (
                <Space>
                    <Tag color={r.color} style={{ marginRight: 0 }}>
                        {r.name}
                    </Tag>
                    {r.isSystem && (
                        <Tag icon={<LockOutlined />} color="default">
                            Hệ thống
                        </Tag>
                    )}
                </Space>
            ),
        },
        { title: 'Mã (code)', key: 'code', width: 150, render: (_v, r) => <Text code>{r.code}</Text> },
        { title: 'Mô tả', key: 'description', ellipsis: true, render: (_v, r) => r.description || '-' },
        {
            title: 'Đang dùng',
            key: 'inUseCount',
            width: 130,
            align: 'center',
            render: (_v, r) => (r.inUseCount > 0 ? <Tag color="blue">{r.inUseCount} khách hàng</Tag> : <Text type="secondary">-</Text>),
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
    return <Table<DemoStatusRow> rowKey="code" size="small" columns={columns} dataSource={DEMO_STATUS_ROWS} pagination={false} scroll={{ x: 800 }} />;
}

/** Mẫu form Thêm/Sửa trạng thái (các ô đúng như modal thật). */
function StatusFormDemo() {
    return (
        <Form layout="vertical" style={{ maxWidth: 460 }} initialValues={{ sortOrder: 0 }}>
            <Form.Item label="Mã trạng thái (code)" tooltip="Giá trị THẬT lưu vào dữ liệu khách hàng - không đổi được sau khi tạo" required>
                <Input placeholder="vd: callback_later" />
            </Form.Item>
            <Form.Item label="Tên hiển thị" required>
                <Input placeholder="Ví dụ: Liên hệ lại sau" />
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
        </Form>
    );
}

/** Mẫu hộp thoại Xoá khi trạng thái đang có khách dùng: bắt buộc chọn trạng thái thay thế. */
function StatusDeleteFallbackDemo() {
    const fallbackOptions = DEMO_STATUS_ROWS.filter((s) => s.code !== 'vip_follow').slice(0, 4);
    return (
        <div style={{ maxWidth: 460 }}>
            <Text strong style={{ display: 'block', marginBottom: 12 }}>
                Xoá trạng thái &quot;Theo dõi VIP&quot;?
            </Text>
            <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                title="Đang có 4 khách hàng dùng trạng thái này"
                description="Chọn trạng thái thay thế bên dưới - toàn bộ khách hàng đang dùng trạng thái này sẽ được tự động chuyển sang trạng thái bạn chọn trước khi trạng thái cũ bị xoá."
            />
            <Text strong>Chuyển sang trạng thái:</Text>
            <Select
                style={{ width: '100%', marginTop: 8, marginBottom: 16 }}
                placeholder="Chọn trạng thái thay thế"
                options={fallbackOptions.map((s) => ({
                    value: s.code,
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

/** Mẫu của trang \"Quản lý Status khách\". */
export const STATUS_DEMOS: GuideDemo[] = [
    {
        id: 'status-manage-table',
        title: 'Bảng Quản lý Status khách',
        description: 'Các cột Trạng thái / Mã / Mô tả / Đang dùng / Thứ tự hiển thị / Thao tác; trạng thái Hệ thống không có nút Xoá',
        render: () => <StatusManageTableDemo />,
    },
    {
        id: 'status-form',
        title: 'Form thêm/sửa trạng thái',
        description: 'Các ô của modal \"Thêm trạng thái mới\" (Mã, Tên hiển thị, Mô tả, Màu, Thứ tự)',
        render: () => <StatusFormDemo />,
    },
    {
        id: 'status-delete-fallback',
        title: 'Xoá trạng thái đang có khách dùng',
        description: 'Hộp thoại bắt buộc chọn trạng thái thay thế trước khi xoá',
        render: () => <StatusDeleteFallbackDemo />,
    },
];
