'use client';

import { Alert, Button, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CrownOutlined, DeleteOutlined, EditOutlined, LockOutlined, MergeCellsOutlined, TeamOutlined, UnlockOutlined, UserOutlined } from '@ant-design/icons';
import { UtmTag } from '@/components/utms/UtmTag';
import type { GuideDemo } from '../guide-demo.types';

const { Text } = Typography;

interface DemoUtmRow {
    name: string;
    color: string;
    primary: string;
    secondary: string[];
    visibility: 'shared' | 'restricted';
    customers: number;
    isActive: boolean;
}

/** Dữ liệu mẫu (tên UTM/nhân viên là giả định, chỉ để minh hoạ cột và nút). */
const DEMO_UTM_ROWS: DemoUtmRow[] = [
    { name: 'FB_Q4', color: '#1677ff', primary: 'Nguyễn An', secondary: ['Trần Bình'], visibility: 'shared', customers: 128, isActive: true },
    { name: 'TT_Summer', color: '#eb2f96', primary: 'Nguyễn An', secondary: [], visibility: 'restricted', customers: 42, isActive: true },
    { name: 'GG_Old', color: '#52c41a', primary: 'Lê Châu', secondary: ['Nguyễn An', 'Trần Bình'], visibility: 'shared', customers: 7, isActive: false },
];

/** Mẫu bảng "Tất cả UTM": cột Quản lý chính/phụ, Hiển thị, Số KH và hàng nút Thao tác (đủ quyền). */
function UtmTableDemo() {
    const columns: ColumnsType<DemoUtmRow> = [
        {
            title: 'UTM',
            key: 'name',
            width: 200,
            render: (_v, r) => (
                <Space size={4} wrap>
                    <UtmTag name={r.name} color={r.color} inactive={!r.isActive} />
                    {r.visibility === 'restricted' && <Tag icon={<LockOutlined />}>Riêng tư</Tag>}
                    {!r.isActive && <Tag>Đã khoá</Tag>}
                </Space>
            ),
        },
        { title: 'Quản lý chính', dataIndex: 'primary', key: 'primary', width: 130 },
        {
            title: 'Quản lý phụ',
            key: 'secondary',
            width: 170,
            render: (_v, r) => (r.secondary.length > 0 ? r.secondary.join(', ') : <Text type="secondary">Chưa có</Text>),
        },
        {
            title: 'Hiển thị',
            key: 'visibility',
            width: 100,
            render: (_v, r) => (r.visibility === 'restricted' ? <Tag icon={<LockOutlined />}>Riêng tư</Tag> : <Tag color="green">Công khai</Tag>),
        },
        { title: 'Số KH', dataIndex: 'customers', key: 'customers', width: 80, align: 'right' },
        {
            title: 'Thao tác',
            key: 'action',
            width: 430,
            render: (_v, r) => (
                <Space size={4} wrap>
                    <Button size="small" icon={<EditOutlined />}>Sửa</Button>
                    <Button size="small" icon={<TeamOutlined />}>Quản lý</Button>
                    <Button size="small" icon={<UserOutlined />}>Khách hàng ({r.customers})</Button>
                    <Button size="small" icon={r.isActive ? <LockOutlined /> : <UnlockOutlined />}>{r.isActive ? 'Khoá' : 'Mở khoá'}</Button>
                    <Button size="small" icon={<MergeCellsOutlined />}>Gộp</Button>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                </Space>
            ),
        },
    ];
    return <Table<DemoUtmRow> rowKey="name" size="small" columns={columns} dataSource={DEMO_UTM_ROWS} pagination={false} scroll={{ x: 1110 }} />;
}

/** Mẫu hộp thoại Gộp UTM: cảnh báo không hoàn tác + chọn UTM đích + dòng báo tên sau khi gộp. */
function UtmMergeStepsDemo() {
    return (
        <div style={{ maxWidth: 480 }}>
            <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 12 }}
                title="Không thể hoàn tác"
                description='Toàn bộ khách hàng đang dùng UTM "FB-Q4" sẽ chuyển sang UTM đích, sau đó UTM này bị xoá (cả danh sách Quản lý phụ của nó).'
            />
            <Text strong>Gộp vào UTM đích:</Text>
            <div style={{ margin: '8px 0' }}>
                <Space wrap>
                    <UtmTag name="FB_Q4" color="#1677ff" />
                    <Text type="secondary">(đang chọn)</Text>
                    <UtmTag name="GG_Old" color="#52c41a" inactive />
                    <Text type="secondary">(đang khoá - không chọn được)</Text>
                </Space>
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
                Sau khi gộp, tên UTM trên các khách hàng đó sẽ là &quot;FB_Q4&quot;.
            </Text>
        </div>
    );
}

/** Mẫu hộp thoại Quản lý chính/phụ: 1 Quản lý chính + danh sách phụ + 2 hành động (Thêm phụ, Chuyển chính). */
function UtmManagersDemo() {
    return (
        <div style={{ maxWidth: 480, border: '1px solid #f0f0f0', borderRadius: 6, padding: 12 }}>
            <div style={{ marginBottom: 12 }}>
                <Text strong>Quản lý chính:</Text>{' '}
                <Tag color="gold" icon={<CrownOutlined />}>Nguyễn An</Tag>
            </div>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>Quản lý phụ (1):</Text>
            <div style={{ marginBottom: 12 }}>
                <Text>Trần Bình</Text> <Text type="secondary">binh@example.com</Text> <Button size="small" danger type="text" icon={<DeleteOutlined />} />
            </div>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>Thêm Quản lý phụ:</Text>
            <Space style={{ marginBottom: 12 }}>
                <Button size="small">Chọn nhân viên...</Button>
                <Button size="small" type="primary">Thêm</Button>
            </Space>
            <Text strong style={{ display: 'block', marginBottom: 2 }}>Chuyển Quản lý chính:</Text>
            <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>
                Người nhận sẽ trở thành Quản lý chính; nếu họ đang là Quản lý phụ thì tự được gỡ khỏi danh sách phụ.
            </Text>
            <Button size="small">Chuyển quyền chính</Button>
        </div>
    );
}

/** Mẫu của module UTM (`/quan-ly-utm`). */
export const UTM_DEMOS: GuideDemo[] = [
    {
        id: 'utm-tags',
        title: 'Tag UTM (bình thường và đã khoá)',
        description: 'UTM đã khoá hiện mờ + gạch ngang',
        render: () => (
            <Space wrap>
                <UtmTag name="FB_Q4" color="#1677ff" />
                <UtmTag name="TT_Summer" color="#eb2f96" />
                <UtmTag name="GG_Old" color="#52c41a" inactive />
            </Space>
        ),
    },
    {
        id: 'utm-table',
        title: 'Bảng Quản lý UTM',
        description: 'Cột UTM / Quản lý chính / Quản lý phụ / Hiển thị / Số KH và các nút Sửa, Quản lý, Khách hàng, Khoá, Gộp, Xoá',
        render: () => <UtmTableDemo />,
    },
    {
        id: 'utm-merge-steps',
        title: 'Hộp thoại Gộp UTM',
        description: 'Cảnh báo không hoàn tác, chọn UTM đích (UTM khoá bị mờ) và dòng báo tên sau khi gộp',
        render: () => <UtmMergeStepsDemo />,
    },
    {
        id: 'utm-managers',
        title: 'Hộp thoại Quản lý chính/phụ',
        description: 'Xem Quản lý chính, danh sách Quản lý phụ, thêm/gỡ phụ và chuyển quyền chính',
        render: () => <UtmManagersDemo />,
    },
];
