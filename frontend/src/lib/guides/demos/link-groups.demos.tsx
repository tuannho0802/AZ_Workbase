'use client';

import { Button, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CrownOutlined, DeleteOutlined, EditOutlined, LinkOutlined, LockOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons';
import type { GuideDemo } from '../guide-demo.types';

const { Text } = Typography;

interface DemoGroup {
    id: number;
    name: string;
    url: string;
    sortOrder: number;
    isActive: boolean;
    primary: string | null;
    secondaryCount: number;
    contentCount: number;
}

interface DemoCategory {
    id: number;
    name: string;
    color: string;
    sortOrder: number;
    isLocked: boolean;
    groups: DemoGroup[];
}

/** Dữ liệu mẫu (tên nhóm/người là giả định, chỉ để minh hoạ cột và nút). */
const DEMO_CATEGORIES: DemoCategory[] = [
    {
        id: 1,
        name: 'Zalo',
        color: '#1677ff',
        sortOrder: 0,
        isLocked: false,
        groups: [
            { id: 11, name: 'Nhóm Zalo Sales Hà Nội', url: 'https://zalo.me/g/abcxyz', sortOrder: 0, isActive: true, primary: 'Nguyễn An', secondaryCount: 2, contentCount: 1 },
            { id: 12, name: 'Nhóm Zalo cũ', url: 'https://zalo.me/g/old123', sortOrder: 1, isActive: false, primary: null, secondaryCount: 0, contentCount: 0 },
        ],
    },
    { id: 2, name: 'Facebook', color: '#1877f2', sortOrder: 1, isLocked: false, groups: [] },
    { id: 3, name: 'Threads', color: '#8c8c8c', sortOrder: 2, isLocked: true, groups: [] },
];

/** Mẫu trang "Quản lý nhóm liên kết" (đủ quyền): bảng Category, bấm dấu + để mở bảng Nhóm lồng bên trong. */
function LinkGroupTableDemo() {
    const groupColumns: ColumnsType<DemoGroup> = [
        { title: 'Tên nhóm', dataIndex: 'name', key: 'name', width: 190 },
        {
            title: 'URL',
            key: 'url',
            width: 210,
            render: (_v, g) => (
                <span>
                    <LinkOutlined /> {g.url}
                </span>
            ),
        },
        { title: 'Thứ tự', dataIndex: 'sortOrder', key: 'sortOrder', width: 80 },
        {
            title: 'Trạng thái',
            key: 'status',
            width: 110,
            render: (_v, g) => (g.isActive ? <Tag color="green">Đang hiện</Tag> : <Tag color="red">Đang ẩn</Tag>),
        },
        {
            title: 'Quản lý chính/phụ',
            key: 'managers',
            width: 200,
            render: (_v, g) => (
                <Space size={4} wrap>
                    {g.primary ? (
                        <Tag color="gold" icon={<CrownOutlined />}>
                            {g.primary}
                        </Tag>
                    ) : (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            Chưa gán chính
                        </Text>
                    )}
                    {g.secondaryCount > 0 && <Tag color="blue">+{g.secondaryCount} phụ</Tag>}
                </Space>
            ),
        },
        {
            title: 'Nhân viên Content',
            key: 'content',
            width: 150,
            render: (_v, g) =>
                g.contentCount > 0 ? (
                    <Tag color="purple" icon={<EditOutlined />}>
                        {g.contentCount} người
                    </Tag>
                ) : (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        Chưa có
                    </Text>
                ),
        },
        {
            title: 'Thao tác',
            key: 'action',
            width: 380,
            render: (_v, g) => (
                <Space size={4} wrap>
                    <Button size="small" icon={<EditOutlined />}>Sửa</Button>
                    <Button size="small" icon={<TeamOutlined />}>Quản lý phụ / Content</Button>
                    <Button size="small">{g.isActive ? 'Ẩn' : 'Hiện lại'}</Button>
                    <Button size="small" danger icon={<DeleteOutlined />}>Xoá</Button>
                </Space>
            ),
        },
    ];

    const categoryColumns: ColumnsType<DemoCategory> = [
        {
            title: 'Category (nền tảng)',
            key: 'name',
            render: (_v, c) => <Tag color={c.color}>{c.name}</Tag>,
        },
        { title: 'Số nhóm', key: 'count', width: 90, render: (_v, c) => c.groups.length },
        { title: 'Thứ tự', dataIndex: 'sortOrder', key: 'sortOrder', width: 80 },
        {
            title: 'Trạng thái',
            key: 'status',
            width: 110,
            render: (_v, c) => (c.isLocked ? <Tag color="red">Đã khoá</Tag> : <Tag color="green">Đang mở</Tag>),
        },
        {
            title: 'Thao tác',
            key: 'action',
            width: 340,
            render: (_v, c) => (
                <Space size={4} wrap>
                    <Button size="small" icon={<PlusOutlined />}>Thêm nhóm</Button>
                    <Button size="small" icon={<EditOutlined />}>Sửa</Button>
                    <Button size="small" icon={<LockOutlined />}>{c.isLocked ? 'Mở khoá' : 'Khoá'}</Button>
                    <Button size="small" danger icon={<DeleteOutlined />}>Xoá</Button>
                </Space>
            ),
        },
    ];

    return (
        <Table<DemoCategory>
            rowKey="id"
            size="small"
            columns={categoryColumns}
            dataSource={DEMO_CATEGORIES}
            pagination={false}
            scroll={{ x: 700 }}
            expandable={{
                defaultExpandedRowKeys: [1],
                expandedRowRender: (c) => (
                    <Table<DemoGroup>
                        rowKey="id"
                        size="small"
                        columns={groupColumns}
                        dataSource={c.groups}
                        pagination={false}
                        scroll={{ x: 1150 }}
                        locale={{ emptyText: 'Chưa có nhóm nào' }}
                    />
                ),
            }}
        />
    );
}

/** Mẫu hộp thoại "Quản lý chính/phụ & Nhân viên Content" của 1 nhóm (góc nhìn Quản lý chính/Admin: có nút Thêm, Gỡ). */
function GroupManagersDemo() {
    return (
        <div style={{ maxWidth: 480, border: '1px solid #f0f0f0', borderRadius: 6, padding: 12, background: '#fff' }}>
            <Text strong style={{ display: 'block', marginBottom: 12 }}>
                Quản lý chính/phụ &amp; Nhân viên Content - Nhóm Zalo Sales Hà Nội
            </Text>
            <div style={{ marginBottom: 12 }}>
                <Text strong>Quản lý chính:</Text>{' '}
                <Tag color="gold" icon={<CrownOutlined />}>Nguyễn An</Tag>
            </div>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>Quản lý phụ (2):</Text>
            <div style={{ marginBottom: 4 }}>
                <Text>Trần Bình</Text> <Button size="small" danger type="text" icon={<DeleteOutlined />} />
            </div>
            <div style={{ marginBottom: 12 }}>
                <Text>Lê Châu</Text> <Button size="small" danger type="text" icon={<DeleteOutlined />} />
            </div>
            <Space style={{ marginBottom: 16 }}>
                <Button size="small">Chọn nhân viên để thêm làm Quản lý phụ</Button>
                <Button size="small" type="primary" icon={<PlusOutlined />}>Thêm</Button>
            </Space>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>Nhân viên Content (1):</Text>
            <div style={{ marginBottom: 12 }}>
                <Text>Phạm Dung</Text> <Button size="small" danger type="text" icon={<DeleteOutlined />} />
            </div>
            <Space>
                <Button size="small">Chọn nhân viên để thêm làm Nhân viên Content</Button>
                <Button size="small" type="primary" icon={<PlusOutlined />}>Thêm</Button>
            </Space>
        </div>
    );
}

/** Mẫu của trang "Quản lý nhóm liên kết". */
export const LINK_GROUP_DEMOS: GuideDemo[] = [
    {
        id: 'link-group-table',
        title: 'Bảng Category và Nhóm',
        description: 'Bảng Category (Zalo/Facebook/Threads); bấm dấu + để mở bảng Nhóm lồng bên trong',
        render: () => <LinkGroupTableDemo />,
    },
    {
        id: 'group-managers',
        title: 'Hộp thoại Quản lý phụ / Content',
        description: 'Quản lý chính, danh sách Quản lý phụ và Nhân viên Content của một nhóm',
        render: () => <GroupManagersDemo />,
    },
];
