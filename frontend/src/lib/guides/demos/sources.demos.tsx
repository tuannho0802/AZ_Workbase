'use client';

import { Alert, Button, ColorPicker, Form, Input, InputNumber, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, LockOutlined, UnlockOutlined } from '@ant-design/icons';
import type { GuideDemo } from '../guide-demo.types';

const { Text } = Typography;

interface DemoSourceRow {
    name: string;
    color: string;
    sortOrder: number;
    isLocked: boolean;
}

/**
 * Dữ liệu mẫu bám 6 nguồn seed ở migration CreateMediaSources1777700000000 (tên + màu + thứ tự) và thêm 1 nguồn Admin tự
 * thêm đã bị khoá. Tên/màu thật do Admin cấu hình nên có thể khác.
 */
const DEMO_SOURCE_ROWS: DemoSourceRow[] = [
    { name: 'Facebook', color: '#1877F2', sortOrder: 1, isLocked: false },
    { name: 'TikTok', color: '#000000', sortOrder: 2, isLocked: false },
    { name: 'Google', color: '#EA4335', sortOrder: 3, isLocked: false },
    { name: 'Instagram', color: '#E1306C', sortOrder: 4, isLocked: false },
    { name: 'LinkedIn', color: '#0A66C2', sortOrder: 5, isLocked: false },
    { name: 'Other', color: '#8c8c8c', sortOrder: 6, isLocked: false },
    { name: 'Zalo OA (cũ)', color: '#1677ff', sortOrder: 10, isLocked: true },
];

/** Mẫu bảng trang "Quản lý nguồn" - cột và nút đúng như trang thật. */
function SourceManageTableDemo() {
    const columns: ColumnsType<DemoSourceRow> = [
        {
            title: 'Tên nguồn',
            key: 'name',
            render: (_v, r) => (
                <Tag color={r.color} style={{ marginRight: 0 }}>
                    {r.name}
                </Tag>
            ),
        },
        { title: 'Thứ tự hiển thị', dataIndex: 'sortOrder', key: 'sortOrder', width: 140 },
        {
            title: 'Trạng thái',
            key: 'status',
            width: 140,
            render: (_v, r) => (r.isLocked ? <Tag color="red">Đã khoá</Tag> : <Tag color="green">Đang mở</Tag>),
        },
        {
            title: 'Thao tác',
            key: 'action',
            width: 270,
            render: (_v, r) => (
                <Space>
                    <Button size="small" icon={<EditOutlined />}>
                        Sửa
                    </Button>
                    <Button size="small" icon={r.isLocked ? <UnlockOutlined /> : <LockOutlined />}>
                        {r.isLocked ? 'Mở khoá' : 'Khoá'}
                    </Button>
                    <Button size="small" danger icon={<DeleteOutlined />}>
                        Xoá
                    </Button>
                </Space>
            ),
        },
    ];
    return <Table<DemoSourceRow> rowKey="name" size="small" columns={columns} dataSource={DEMO_SOURCE_ROWS} pagination={false} scroll={{ x: 640 }} />;
}

/** Mẫu modal Thêm/Sửa nguồn (kèm cảnh báo đổi tên chỉ hiện khi Sửa). */
function SourceFormDemo() {
    return (
        <div style={{ maxWidth: 460 }}>
            <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                title="Đổi tên KHÔNG cập nhật lại các khách hàng cũ đang dùng tên nguồn hiện tại - họ vẫn giữ nguyên tên cũ."
            />
            <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
                (Cảnh báo trên chỉ hiện khi bấm Sửa; khi Thêm nguồn mới thì không có.)
            </Text>
            <Form layout="vertical" initialValues={{ sortOrder: 0 }}>
                <Form.Item label="Tên nguồn" required>
                    <Input placeholder="Ví dụ: Zalo" />
                </Form.Item>
                <Form.Item label="Màu hiển thị" required>
                    <ColorPicker showText format="hex" defaultValue="#1677ff" />
                </Form.Item>
                <Form.Item name="sortOrder" label="Thứ tự hiển thị (số nhỏ hơn hiện trước)">
                    <InputNumber style={{ width: '100%' }} min={0} placeholder="0" />
                </Form.Item>
            </Form>
        </div>
    );
}

/** Mẫu hiệu ứng của "Khoá": ô Nguồn khi thêm khách mới (ẩn nguồn khoá) so với khi sửa khách cũ (vẫn giữ nguồn khoá, không chọn lại được). */
function SourceLockEffectDemo() {
    const open = DEMO_SOURCE_ROWS.filter((s) => !s.isLocked);
    const panelStyle = { flex: '1 1 240px', border: '1px solid #f0f0f0', borderRadius: 6, padding: 12 } as const;
    return (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={panelStyle}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>
                    Thêm khách mới - ô &quot;Nguồn&quot; chỉ liệt kê nguồn đang mở
                </Text>
                <Space wrap size={[4, 8]}>
                    {open.map((s) => (
                        <Tag key={s.name} color={s.color}>
                            {s.name}
                        </Tag>
                    ))}
                </Space>
                <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
                    Không thấy &quot;Zalo OA (cũ)&quot; vì nguồn đã khoá.
                </Text>
            </div>
            <div style={panelStyle}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>
                    Sửa một khách cũ có nguồn đã khoá
                </Text>
                <Space>
                    <Tag color="#1677ff">Zalo OA (cũ)</Tag>
                    <Tag color="default">Đã khoá</Tag>
                </Space>
                <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
                    Giá trị vẫn hiển thị đúng nhưng bị làm mờ, không chọn lại được cho khách khác.
                </Text>
            </div>
        </div>
    );
}

/** Mẫu của trang "Quản lý nguồn". */
export const SOURCE_DEMOS: GuideDemo[] = [
    {
        id: 'source-manage-table',
        title: 'Bảng Quản lý nguồn',
        description: 'Các cột Tên nguồn / Thứ tự hiển thị / Trạng thái / Thao tác (Sửa, Khoá hoặc Mở khoá, Xoá)',
        render: () => <SourceManageTableDemo />,
    },
    {
        id: 'source-form',
        title: 'Form thêm/sửa nguồn',
        description: 'Các ô của modal "Thêm nguồn mới" (Tên nguồn, Màu, Thứ tự) và cảnh báo đổi tên khi Sửa',
        render: () => <SourceFormDemo />,
    },
    {
        id: 'source-lock-effect',
        title: 'Khoá nguồn ảnh hưởng thế nào',
        description: 'So sánh ô "Nguồn" khi thêm khách mới (ẩn nguồn khoá) với khi sửa khách cũ (giữ nguồn khoá, không chọn lại được)',
        render: () => <SourceLockEffectDemo />,
    },
];
