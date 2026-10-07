'use client';

import { Button, Input, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CrownOutlined, DeleteOutlined, EditOutlined, KeyOutlined, ReloadOutlined, UserAddOutlined } from '@ant-design/icons';
import type { GuideDemo } from '../guide-demo.types';

const { Text } = Typography;

type UsersViewer = 'admin' | 'manager';
type FormViewer = UsersViewer | 'root';

interface DemoUser {
    id: number;
    code: string;
    name: string;
    email: string;
    role: string;
    roleColor: string;
    dept: string | null;
    position: string | null;
    status: 'active' | 'locked' | 'pending';
    rootAdmin?: boolean;
    /** Người đang đăng nhập trong mẫu (ẩn nút Xoá của chính mình). */
    self?: boolean;
}

/** Dữ liệu mẫu (tên/email/phòng ban là giả định). Manager mẫu quản lý "Kinh doanh 1". */
const DEMO_USERS: DemoUser[] = [
    { id: 1, code: 'AZ001', name: 'Admin Hệ thống', email: 'admin@example.com', role: 'Admin', roleColor: 'red', dept: null, position: null, status: 'active', rootAdmin: true },
    { id: 2, code: 'AZ002', name: 'Lê Hương', email: 'huong@example.com', role: 'Manager', roleColor: 'blue', dept: 'Kinh doanh 1', position: 'Trưởng phòng', status: 'active' },
    { id: 3, code: 'AZ003', name: 'Nguyễn An', email: 'an@example.com', role: 'Employee', roleColor: 'default', dept: 'Kinh doanh 1', position: 'Sales', status: 'active' },
    { id: 4, code: 'AZ004', name: 'Trần Bình', email: 'binh@example.com', role: 'Employee', roleColor: 'default', dept: 'Kinh doanh 1', position: 'Sales', status: 'locked' },
    { id: 5, code: 'AZ005', name: 'Phạm Dũng', email: 'dung@example.com', role: 'Employee', roleColor: 'default', dept: 'Kinh doanh 2', position: 'Content', status: 'active' },
];

const STATUS_TAG: Record<DemoUser['status'], { color: string; text: string }> = {
    active: { color: 'green', text: 'Đang hoạt động' },
    locked: { color: 'red', text: 'Không hoạt động' },
    pending: { color: 'orange', text: 'Đang chờ duyệt' },
};

/**
 * Mẫu bảng "Danh sách nhân viên" (cột + bộ lọc đúng chữ thật).
 * `viewer=admin`: thấy mọi nhân viên, có Sửa + Reset Pass + Xoá (Xoá ẩn với chính mình và với Root Admin).
 * `viewer=manager`: chỉ thấy nhân viên phòng ban mình quản lý + chính mình, có Sửa + Reset Pass, KHÔNG có Xoá.
 */
function UsersTableDemo({ viewer }: { viewer: UsersViewer }) {
    const isAdmin = viewer === 'admin';
    const rows = (isAdmin ? DEMO_USERS : DEMO_USERS.filter((u) => u.dept === 'Kinh doanh 1')).map((u) => ({
        ...u,
        self: (isAdmin && u.id === 1) || (!isAdmin && u.id === 2),
    }));

    const columns: ColumnsType<DemoUser> = [
        { title: 'ID', dataIndex: 'id', key: 'id', width: 50 },
        { title: 'Mã NV', dataIndex: 'code', key: 'code', width: 80 },
        { title: 'Họ tên', dataIndex: 'name', key: 'name' },
        { title: 'Email', dataIndex: 'email', key: 'email' },
        {
            title: 'Chức vụ',
            key: 'role',
            render: (_v, r) => (
                <Space size={4}>
                    <Tag color={r.roleColor}>{r.role}</Tag>
                    {r.rootAdmin && <Tag color="gold" icon={<CrownOutlined />}>Root Admin</Tag>}
                </Space>
            ),
        },
        { title: 'Phòng ban', key: 'dept', render: (_v, r) => (r.dept ? <Tag color="blue">{r.dept}</Tag> : '-') },
        { title: 'Vị trí', key: 'pos', render: (_v, r) => (r.position ? <Tag color="purple">{r.position}</Tag> : '-') },
        { title: 'Trạng thái', key: 'status', render: (_v, r) => <Tag color={STATUS_TAG[r.status].color}>{STATUS_TAG[r.status].text}</Tag> },
        {
            title: 'Thao tác',
            key: 'action',
            render: (_v, r) => (
                <Space size={4} wrap>
                    <Button size="small" icon={<EditOutlined />}>Sửa</Button>
                    <Button size="small" icon={<KeyOutlined />}>Reset Pass</Button>
                    {isAdmin && !r.self && !r.rootAdmin && <Button size="small" danger icon={<DeleteOutlined />}>Xoá</Button>}
                </Space>
            ),
        },
    ];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 16, fontWeight: 500 }}>Quản lý nhân viên</Text>
                <Space>
                    <Button icon={<ReloadOutlined />}>Làm mới</Button>
                    <Button type="primary" icon={<UserAddOutlined />}>Thêm nhân viên</Button>
                </Space>
            </div>
            <Space size={16} style={{ marginBottom: 8 }}>
                <Text strong>Danh sách nhân viên</Text>
                <Text type="secondary">Chờ duyệt đăng ký</Text>
                {isAdmin && <Text type="secondary">Đã xoá</Text>}
            </Space>
            <div style={{ marginBottom: 12 }}>
                <Space wrap>
                    <Input style={{ width: 240 }} placeholder="Tìm theo tên, email, mã NV..." readOnly />
                    <Select style={{ width: 130 }} placeholder="Vai trò" open={false} options={[]} />
                    <Select style={{ width: 150 }} placeholder="Phòng ban" open={false} options={[]} />
                    <Select style={{ width: 130 }} placeholder="Vị trí" open={false} options={[]} />
                    <Select style={{ width: 140 }} placeholder="Trạng thái" open={false} options={[]} />
                </Space>
            </div>
            <Table<DemoUser> rowKey="id" size="small" columns={columns} dataSource={rows} pagination={false} scroll={{ x: 'max-content' }} />
        </div>
    );
}

/** Ma trận ai làm được gì theo vai trò (đúng seed mặc định; Admin có thể đổi ở trang Phân quyền). */
function UserActionsDemo() {
    const rows = [
        { key: 'see', what: 'Thấy nhân viên nào', admin: 'Tất cả', assistant: 'Tất cả', manager: 'Phòng ban mình quản lý + chính mình' },
        { key: 'create', what: 'Thêm nhân viên', admin: 'Có', assistant: 'Có', manager: 'Có, bắt buộc chọn phòng ban mình quản lý' },
        { key: 'edit', what: 'Sửa / Reset Pass', admin: 'Mọi người', assistant: 'Mọi người', manager: 'Người trong phòng ban mình quản lý (và chính mình)' },
        { key: 'approve', what: 'Duyệt / Từ chối đăng ký', admin: 'Mọi đăng ký', assistant: 'Mọi đăng ký', manager: 'Chỉ đăng ký vào phòng ban mình quản lý' },
        { key: 'admin', what: 'Gán vai trò Admin', admin: 'Có', assistant: 'Không', manager: 'Không' },
        { key: 'root', what: 'Bật / tắt Root Admin', admin: 'Chỉ Root Admin', assistant: 'Không', manager: 'Không' },
        { key: 'self', what: 'Tự đổi vai trò / tự khoá chính mình', admin: 'Không (nhờ người khác)', assistant: 'Không (nhờ người khác)', manager: 'Không (nhờ người khác)' },
        { key: 'delete', what: 'Xoá / Khôi phục / Xoá vĩnh viễn', admin: 'Có', assistant: 'Không', manager: 'Không' },
    ];
    return (
        <Table
            size="small"
            pagination={false}
            rowKey="key"
            dataSource={rows}
            scroll={{ x: 'max-content' }}
            columns={[
                { title: 'Việc', dataIndex: 'what', key: 'what', render: (v: string) => <Text strong>{v}</Text> },
                { title: <Tag color="red">Admin</Tag>, dataIndex: 'admin', key: 'admin' },
                { title: <Tag color="geekblue">Assistant</Tag>, dataIndex: 'assistant', key: 'assistant' },
                { title: <Tag color="blue">Manager</Tag>, dataIndex: 'manager', key: 'manager' },
            ]}
        />
    );
}

type FormMode = 'create' | 'edit';

/**
 * Mẫu cửa sổ Thêm / Sửa nhân viên (nhãn đúng chữ thật).
 * `mode=create`: có Email + Mật khẩu; `mode=edit`: Email bị khoá, không có Mật khẩu, có Trạng thái.
 * `viewer=admin`: chọn được vai trò Admin; `viewer=manager`: danh sách Vai trò không có Admin.
 */
function UserFormDemo({ mode, viewer }: { mode: FormMode; viewer: FormViewer }) {
    const isEdit = mode === 'edit';
    const field = (label: string, node: React.ReactNode, hint?: string) => (
        <div style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 4 }}><Text>{label}</Text></div>
            {node}
            {hint && <div><Text type="secondary" style={{ fontSize: 12 }}>{hint}</Text></div>}
        </div>
    );
    return (
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 16, background: '#fff', maxWidth: 480 }}>
            <Text strong style={{ fontSize: 16, display: 'block', marginBottom: 12 }}>{isEdit ? 'Sửa thông tin nhân viên' : 'Thêm nhân viên mới'}</Text>
            {field('Email', <Input disabled={isEdit} placeholder="user@azworkbase.com" value={isEdit ? 'an@example.com' : undefined} readOnly />)}
            {field('Mã nhân viên', <Input placeholder="Để trống để tự sinh (AZ001, AZ002...)" readOnly />, 'Để trống sẽ tự sinh mã kế tiếp dạng AZ001, AZ002...')}
            {field('Họ và tên', <Input placeholder="Nguyễn Văn A" value={isEdit ? 'Nguyễn An' : undefined} readOnly />)}
            {field('Số điện thoại', <Input placeholder="0901234567" readOnly />)}
            {!isEdit && field('Mật khẩu', <Input.Password placeholder="Password@123" readOnly />, 'Tối thiểu 8 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt')}
            {field(
                'Vai trò',
                <Select style={{ width: '100%' }} placeholder="Chọn vai trò" open={false} options={[]} value={viewer === 'root' ? 'Admin' : undefined} />,
                viewer !== 'manager' ? 'Danh sách có cả Admin' : 'Danh sách KHÔNG có Admin (chỉ Admin mới gán được)',
            )}
            {field('Phòng ban', <Select style={{ width: '100%' }} placeholder="Chọn phòng ban" open={false} options={[]} />, viewer === 'manager' ? 'Bắt buộc chọn phòng ban mình quản lý' : undefined)}
            {field('Vị trí', <Select style={{ width: '100%' }} placeholder="Chọn vị trí (không bắt buộc)" open={false} options={[]} />)}
            {field('Người duyệt nghỉ phép (ngoại lệ)', <Select style={{ width: '100%' }} placeholder="Không có ngoại lệ (mặc định theo phòng ban)" open={false} options={[]} />)}
            {field('Trạng thái', <Switch checked checkedChildren="Hoạt động" unCheckedChildren="Khóa" />)}
            {viewer === 'root' && field(
                'Root Admin',
                <Switch checkedChildren="Root Admin" unCheckedChildren="Admin thường" />,
                'Chỉ hiện với Root Admin, và chỉ khi Vai trò đang chọn là Admin. Đổi trạng thái sẽ hỏi lại mật khẩu của bạn',
            )}
            <Space style={{ marginTop: 8 }}>
                <Button>Cancel</Button>
                <Button type="primary">OK</Button>
            </Space>
        </div>
    );
}

export const USERS_DEMOS: GuideDemo[] = [
    {
        id: 'users-table',
        title: 'Bảng Danh sách nhân viên',
        description: 'viewer=admin (thấy tất cả, có nút Xoá) hoặc viewer=manager (chỉ phòng ban mình quản lý, không có Xoá và tab Đã xoá)',
        params: { viewer: ['admin', 'manager'] },
        render: (p) => <UsersTableDemo viewer={p.viewer === 'manager' ? 'manager' : 'admin'} />,
    },
    {
        id: 'user-actions-by-viewer',
        title: 'Ai làm được gì ở trang Nhân viên',
        description: 'Bảng quyền xem/thêm/sửa/duyệt/xoá theo Admin, Assistant, Manager (mặc định)',
        render: () => <UserActionsDemo />,
    },
    {
        id: 'user-form',
        title: 'Cửa sổ Thêm / Sửa nhân viên',
        description: 'mode=create|edit; viewer=admin|manager|root (Manager không chọn được vai trò Admin, bắt buộc chọn phòng ban mình quản lý; root = Root Admin, có thêm công tắc Root Admin)',
        params: { mode: ['create', 'edit'], viewer: ['admin', 'manager', 'root'] },
        render: (p) => <UserFormDemo mode={p.mode === 'edit' ? 'edit' : 'create'} viewer={p.viewer === 'manager' ? 'manager' : p.viewer === 'root' ? 'root' : 'admin'} />,
    },
];
