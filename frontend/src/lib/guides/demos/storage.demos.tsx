'use client';

import { Alert, Button, Card, Col, Progress, Row, Space, Table, Tabs, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import type { GuideDemo } from '../guide-demo.types';

const { Text, Title } = Typography;

const BUCKETS = [
    { label: 'Avatar nhân viên', size: '1.20 GB', count: 340 },
    { label: 'Đính kèm nghỉ phép', size: '3.85 GB', count: 912 },
    { label: 'Thư viện ảnh chung', size: '0.45 GB', count: 58 },
];

/** Thanh dung lượng. `viewer=manage` (có storage.manage) thấy thêm "Tính lại ngay" và "Đổi hạn mức mềm"; `viewer=view` chỉ xem. Số liệu là dữ liệu mẫu. */
function StorageUsageDemo({ viewer }: { viewer: string }) {
    const canManage = viewer !== 'view';
    return (
        <Card variant="outlined">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                <Title level={5} style={{ margin: 0 }}>Dung lượng đã dùng</Title>
                <Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>Cập nhật lúc 09:00 12/10/2026</Text>
                    {canManage && <Button size="small">Tính lại ngay</Button>}
                </Space>
            </div>
            <Progress percent={11} format={() => '5.50 / 50 GB'} />
            <Text type="secondary" style={{ fontSize: 12 }}>
                Còn lại: <Text strong style={{ fontSize: 12 }}>44.50 GB</Text> (89% hạn mức mềm)
            </Text>
            <Row gutter={16} style={{ marginTop: 12 }}>
                {BUCKETS.map((b) => (
                    <Col xs={24} sm={8} key={b.label}>
                        <Card size="small" variant="borderless" style={{ background: '#fafafa' }}>
                            <Text strong style={{ fontSize: 12 }}>{b.label}</Text>
                            <div style={{ fontSize: 13 }}>{b.size}</div>
                            <Text type="secondary" style={{ fontSize: 12 }}>{b.count} file</Text>
                        </Card>
                    </Col>
                ))}
            </Row>
            {canManage && (
                <div style={{ marginTop: 12 }}>
                    <Button size="small" type="link" icon={<EditOutlined />}>Đổi hạn mức mềm</Button>
                </div>
            )}
        </Card>
    );
}

interface FileRow {
    key: string;
    name: string;
    size: string;
    time: string;
}

const FILES: FileRow[] = [
    { key: '1', name: 'avatar-1710000001.webp', size: '120 KB', time: '10:12 05/10/2026' },
    { key: '2', name: 'avatar-1710000002.png', size: '340 KB', time: '15:40 07/10/2026' },
    { key: '3', name: 'avatar-1710000003.jpg', size: '95 KB', time: '08:05 11/10/2026' },
];

/** Tab "Dọn dẹp Media" (chỉ người có storage.manage thấy): chọn file -> "Xoá đã chọn (n)". Hàng đầu được chọn sẵn để minh hoạ. */
function StorageCleanupDemo() {
    const columns: ColumnsType<FileRow> = [
        { title: 'Tên file', dataIndex: 'name', key: 'name' },
        { title: 'Dung lượng', dataIndex: 'size', key: 'size', width: 110 },
        { title: 'Cập nhật lúc', dataIndex: 'time', key: 'time', width: 160 },
    ];
    return (
        <div>
            <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 12 }}
                title="Xoá file ở đây sẽ dọn luôn dữ liệu liên quan (bỏ avatar khỏi hồ sơ nhân viên / xoá đính kèm khỏi đơn nghỉ phép) trước khi xoá file thật trên B2."
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text type="secondary" style={{ fontSize: 13 }}>Đã chọn 1 / 3 file đang tải</Text>
                <Button danger type="primary" size="small" icon={<DeleteOutlined />}>Xoá đã chọn (1)</Button>
            </div>
            <Table<FileRow> size="small" rowKey="key" columns={columns} dataSource={FILES} pagination={false} rowSelection={{ selectedRowKeys: ['1'] }} />
        </div>
    );
}

/** Các tab của trang theo quyền: `viewer=manage` có thêm tab "Dọn dẹp Media"; `viewer=view` chỉ 3 tab bucket. */
function StorageTabsDemo({ viewer }: { viewer: string }) {
    const items = [
        { key: 'avatars', label: 'Avatar nhân viên' },
        { key: 'leave-attachments', label: 'Đính kèm nghỉ phép' },
        { key: 'media-library', label: 'Thư viện ảnh chung' },
        ...(viewer === 'view' ? [] : [{ key: 'cleanup', label: '🧹 Dọn dẹp Media' }]),
    ];
    return <Tabs items={items.map((i) => ({ ...i, children: null }))} defaultActiveKey="avatars" />;
}

export const STORAGE_DEMOS: GuideDemo[] = [
    {
        id: 'storage-usage',
        title: 'Thanh dung lượng lưu trữ',
        description: 'Thanh tiến độ so với hạn mức mềm và dung lượng từng nhóm; viewer=manage hoặc view.',
        params: { viewer: ['manage', 'view'] },
        render: (p) => <StorageUsageDemo viewer={p.viewer ?? 'manage'} />,
    },
    {
        id: 'storage-tabs',
        title: 'Các tab của trang theo quyền',
        description: 'viewer=manage có thêm tab Dọn dẹp Media; viewer=view chỉ 3 tab nhóm ảnh.',
        params: { viewer: ['manage', 'view'] },
        render: (p) => <StorageTabsDemo viewer={p.viewer ?? 'manage'} />,
    },
    {
        id: 'storage-cleanup',
        title: 'Dọn dẹp Media',
        description: 'Bảng chọn nhiều file và nút Xoá đã chọn, kèm cảnh báo dọn dữ liệu liên quan.',
        render: () => <StorageCleanupDemo />,
    },
];
