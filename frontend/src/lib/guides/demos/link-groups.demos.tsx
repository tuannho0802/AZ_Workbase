'use client';

import { Button, Input, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CrownOutlined, DeleteOutlined, EditOutlined, LinkOutlined, LockOutlined, PlusOutlined, SearchOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import type { GuideDemo } from '../guide-demo.types';
import { SAMPLE_SOURCES, SAMPLE_STATUSES } from '../demo-kit/sample-tags';

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

interface DemoMyGroup {
    groupId: number;
    category: string;
    categoryColor: string;
    name: string;
    url: string;
    primary: string | null;
    secondary: string[];
    /** Vai trò của người đang xem (góc nhìn "Nguyễn An") - null = nhóm này chỉ Admin/quyền rộng mới thấy. */
    myRole: 'primary' | 'secondary' | null;
    customerCount: number;
}

/** Nhân viên mẫu "Nguyễn An": Quản lý chính của nhóm Zalo, Quản lý phụ của nhóm Facebook. Admin thấy thêm nhóm không liên quan tới An. */
const DEMO_MY_GROUPS: DemoMyGroup[] = [
    { groupId: 11, category: 'Zalo', categoryColor: '#1677ff', name: 'Nhóm Zalo Sales Hà Nội', url: 'https://zalo.me/g/abcxyz', primary: 'Nguyễn An', secondary: ['Trần Bình', 'Lê Châu'], myRole: 'primary', customerCount: 24 },
    { groupId: 21, category: 'Facebook', categoryColor: '#1877f2', name: 'Nhóm FB Khách VIP', url: 'https://facebook.com/groups/vip', primary: 'Hoàng Em', secondary: ['Nguyễn An'], myRole: 'secondary', customerCount: 9 },
    { groupId: 31, category: 'Threads', categoryColor: '#8c8c8c', name: 'Nhóm Threads Mới', url: 'https://threads.net/@moi', primary: null, secondary: [], myRole: null, customerCount: 0 },
];

/**
 * Mẫu trang "Nhóm tôi quản lý". `viewer=member`: nhân viên thường (chỉ thấy nhóm mình được gán, cột "Vai trò của tôi" là
 * Quản lý chính/phụ). `viewer=admin`: Admin gốc thấy TẤT CẢ nhóm, cột Vai trò luôn là Tag "Admin".
 * (Nút "Xem khách hàng (N)" chỉ hiện khi có quyền `customers.view`: mẫu vẽ trường hợp có quyền.)
 */
function MyGroupsTableDemo({ viewer }: { viewer: 'member' | 'admin' }) {
    const isAdmin = viewer === 'admin';
    const rows = isAdmin ? DEMO_MY_GROUPS : DEMO_MY_GROUPS.filter((g) => g.myRole !== null);

    const columns: ColumnsType<DemoMyGroup> = [
        { title: 'Nền tảng', key: 'category', width: 110, render: (_v, g) => <Tag color={g.categoryColor}>{g.category}</Tag> },
        { title: 'Tên nhóm', dataIndex: 'name', key: 'name', width: 190 },
        {
            title: 'URL',
            key: 'url',
            width: 220,
            render: (_v, g) => (
                <span>
                    <LinkOutlined /> {g.url}
                </span>
            ),
        },
        {
            title: 'Quản lý chính',
            key: 'primary',
            width: 130,
            render: (_v, g) => (g.primary ? <Text>{g.primary}</Text> : <Text type="secondary">Chưa gán</Text>),
        },
        {
            title: 'Quản lý phụ',
            key: 'secondary',
            width: 160,
            render: (_v, g) =>
                g.secondary.length > 0 ? (
                    <Space size={4} wrap>
                        {g.secondary.map((n) => (
                            <Tag key={n}>{n}</Tag>
                        ))}
                    </Space>
                ) : (
                    <Text type="secondary">Chưa có</Text>
                ),
        },
        {
            title: 'Vai trò của tôi',
            key: 'myRole',
            width: 140,
            render: (_v, g) => {
                if (isAdmin) return <Tag color="purple">Admin</Tag>;
                return g.myRole === 'primary' ? (
                    <Tag color="gold" icon={<CrownOutlined />}>
                        Quản lý chính
                    </Tag>
                ) : (
                    <Tag color="blue">Quản lý phụ</Tag>
                );
            },
        },
        {
            title: 'Thao tác',
            key: 'action',
            width: 300,
            render: (_v, g) => (
                <Space size={8} wrap>
                    <Button size="small" icon={<TeamOutlined />}>
                        Quản lý
                    </Button>
                    <Button size="small" icon={<UserOutlined />}>
                        Xem khách hàng ({g.customerCount})
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                {isAdmin
                    ? 'Bạn đang xem với quyền admin - hiển thị TẤT CẢ nhóm liên kết trong hệ thống.'
                    : 'Chỉ hiển thị nhóm mà bạn được gán làm Quản lý chính hoặc Quản lý phụ. Quản lý chính có quyền thêm/xoá Quản lý phụ của nhóm mình.'}
            </Text>
            <Space style={{ marginBottom: 12 }} wrap>
                <Input style={{ width: 240 }} prefix={<SearchOutlined />} placeholder="Tìm theo tên nhóm/URL..." readOnly />
                <Select style={{ width: 150 }} placeholder="Nền tảng" open={false} options={[]} />
                <Select style={{ width: 170 }} placeholder="Vai trò của tôi" open={false} options={[]} />
            </Space>
            <Table<DemoMyGroup> rowKey="groupId" size="small" columns={columns} dataSource={rows} pagination={false} scroll={{ x: 1050 }} />
        </div>
    );
}

interface DemoGroupCustomer {
    id: number;
    inputDate: string;
    name: string;
    phone: string;
    source: number;
    sales: string;
    marketing: string;
    status: number;
    joinedAt: string;
}

const DEMO_GROUP_CUSTOMERS: DemoGroupCustomer[] = [
    { id: 1, inputDate: '03/10/2026', name: 'Phạm Quang', phone: '0901 234 567', source: 0, sales: 'Nguyễn An', marketing: 'Vũ Giang', status: 0, joinedAt: '04/10/2026' },
    { id: 2, inputDate: '02/10/2026', name: 'Đỗ Hạnh', phone: '0912 345 678', source: 1, sales: 'Nguyễn An', marketing: 'Vũ Giang', status: 1, joinedAt: '03/10/2026' },
    { id: 3, inputDate: '28/09/2026', name: 'Bùi Khoa', phone: '0923 456 789', source: 2, sales: 'Trần Bình', marketing: '—', status: 2, joinedAt: '29/09/2026' },
];

/** Mẫu hộp thoại "Khách hàng trong nhóm" mở từ nút "Xem khách hàng (N)": bộ lọc + mini table chỉ xem, phân trang 10 dòng. */
function GroupCustomersModalDemo() {
    const columns: ColumnsType<DemoGroupCustomer> = [
        { title: 'STT', key: 'stt', width: 50, align: 'center', render: (_v, _r, i) => i + 1 },
        { title: 'Ngày nhập', dataIndex: 'inputDate', key: 'inputDate', width: 100 },
        { title: 'Họ và tên', key: 'name', width: 130, render: (_v, r) => <Text strong style={{ color: '#1890ff' }}>{r.name}</Text> },
        { title: 'SĐT', dataIndex: 'phone', key: 'phone', width: 115 },
        { title: 'Nguồn', key: 'source', width: 90, render: (_v, r) => <Tag color={SAMPLE_SOURCES[r.source].color}>{SAMPLE_SOURCES[r.source].name}</Tag> },
        { title: 'Sales chính', dataIndex: 'sales', key: 'sales', width: 110 },
        { title: 'Marketing', dataIndex: 'marketing', key: 'marketing', width: 110 },
        { title: 'Trạng thái', key: 'status', width: 100, render: (_v, r) => <Tag color={SAMPLE_STATUSES[r.status].color}>{SAMPLE_STATUSES[r.status].name}</Tag> },
        { title: 'Ngày join nhóm', dataIndex: 'joinedAt', key: 'joinedAt', width: 120 },
    ];

    return (
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 6, padding: 12, background: '#fff' }}>
            <Text strong style={{ display: 'block', marginBottom: 12 }}>
                Khách hàng trong nhóm — Nhóm Zalo Sales Hà Nội
            </Text>
            <Space style={{ marginBottom: 12 }} wrap>
                <Input style={{ width: 200 }} prefix={<SearchOutlined />} placeholder="Tìm theo tên, SĐT..." readOnly />
                <Select style={{ width: 110 }} placeholder="Nguồn" open={false} options={[]} />
                <Select style={{ width: 120 }} placeholder="Trạng thái" open={false} options={[]} />
                <Select style={{ width: 110 }} placeholder="Sales" open={false} options={[]} />
                <Select style={{ width: 120 }} placeholder="Marketing" open={false} options={[]} />
                <Input style={{ width: 200 }} placeholder="Ngày nhập từ  →  đến" readOnly />
            </Space>
            <Table<DemoGroupCustomer>
                rowKey="id"
                size="small"
                columns={columns}
                dataSource={DEMO_GROUP_CUSTOMERS}
                scroll={{ x: 'max-content' }}
                pagination={{ current: 1, pageSize: 10, total: 24, showSizeChanger: false, showTotal: (total) => `Tổng ${total} khách hàng` }}
            />
        </div>
    );
}

/** Mẫu của 2 trang: "Quản lý nhóm liên kết" (link-group-table, group-managers) và "Nhóm tôi quản lý" (my-groups-table, group-customers-modal). */
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
    {
        id: 'my-groups-table',
        title: 'Bảng "Nhóm tôi quản lý"',
        description: 'Danh sách nhóm mình được gán; viewer=member (nhân viên thường) hoặc viewer=admin (thấy tất cả nhóm)',
        params: { viewer: ['member', 'admin'] },
        render: (p) => <MyGroupsTableDemo viewer={p.viewer === 'admin' ? 'admin' : 'member'} />,
    },
    {
        id: 'group-customers-modal',
        title: 'Hộp thoại "Khách hàng trong nhóm"',
        description: 'Mini table khách đã join nhóm (chỉ xem) mở từ nút "Xem khách hàng (N)"',
        render: () => <GroupCustomersModalDemo />,
    },
];
