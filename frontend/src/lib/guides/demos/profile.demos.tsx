'use client';

import { Avatar, Button, Descriptions, Form, Input, Space, Table, Tag, Typography } from 'antd';
import { CrownOutlined, EditOutlined, LockOutlined, SaveOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import type { GuideDemo } from '../guide-demo.types';

const { Text, Title } = Typography;

type ProfileViewer = 'employee' | 'admin';

/**
 * Hồ sơ cá nhân (mẫu tĩnh, dữ liệu giả định). Nút hiện theo quyền mặc định:
 * - employee: Chỉnh sửa (tên/SĐT) + Đổi mật khẩu; Email KHÔNG sửa được.
 * - admin: thêm quyền sửa Email (`profile.edit_email` mặc định chỉ Admin).
 */
function ProfileCardDemo({ viewer }: { viewer: ProfileViewer }) {
    const isAdmin = viewer === 'admin';
    return (
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 16, background: '#fff', maxWidth: 640 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                <Space size={12}>
                    <Avatar size={56} icon={<UserOutlined />} />
                    <div>
                        <Title level={5} style={{ margin: 0 }}>Nguyễn An</Title>
                        <Space style={{ marginTop: 4 }}>
                            <Tag color={isAdmin ? 'red' : 'default'}>{isAdmin ? 'ADMIN' : 'EMPLOYEE'}</Tag>
                            <Tag color="green">Đang hoạt động</Tag>
                        </Space>
                    </div>
                </Space>
                <Space>
                    <Button icon={<EditOutlined />}>Chỉnh sửa</Button>
                    <Button icon={<LockOutlined />}>Đổi mật khẩu</Button>
                </Space>
            </div>
            <Descriptions bordered size="small" column={{ xs: 1, sm: 1, md: 2 }}>
                <Descriptions.Item label="Email">an.nguyen@example.com</Descriptions.Item>
                <Descriptions.Item label="Số điện thoại">0901234567</Descriptions.Item>
                <Descriptions.Item label="Phòng ban">Kinh doanh 1</Descriptions.Item>
                <Descriptions.Item label="Vị trí">Sale</Descriptions.Item>
                <Descriptions.Item label="Ngày tham gia">01/03/2026</Descriptions.Item>
                <Descriptions.Item label="Đăng nhập gần nhất">07/10/2026 08:15</Descriptions.Item>
                <Descriptions.Item label="Phép năm còn lại">9 / 12 ngày (năm 2026)</Descriptions.Item>
                <Descriptions.Item label="Phép bù tích lũy" span="filled">1 ngày</Descriptions.Item>
            </Descriptions>
        </div>
    );
}

/** Form Chỉnh sửa: ô nào bị khoá tuỳ quyền (đúng nhãn thật). */
function ProfileEditDemo({ viewer }: { viewer: ProfileViewer }) {
    const canEmail = viewer === 'admin';
    return (
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 16, background: '#fff', maxWidth: 520 }}>
            <Form layout="vertical">
                <Form.Item label="Họ và tên"><Input readOnly value="Nguyễn An" /></Form.Item>
                <Form.Item label="Số điện thoại"><Input readOnly value="0901234567" /></Form.Item>
                <Form.Item label={canEmail ? 'Email' : 'Email (không có quyền sửa)'}>
                    <Input readOnly disabled={!canEmail} value="an.nguyen@example.com" />
                </Form.Item>
                <Space>
                    <Button type="primary" icon={<SaveOutlined />}>Lưu</Button>
                    <Button>Huỷ</Button>
                </Space>
            </Form>
            {canEmail && <Text type="secondary" style={{ fontSize: 12 }}>Đổi Email sẽ hỏi thêm “Nhập mật khẩu hiện tại để xác nhận”.</Text>}
        </div>
    );
}

/** Mục “Fanpage / Group đang quản lý” (chỉ đọc). */
function ProfileGroupsDemo() {
    const rows = [
        { id: 1, name: 'Fanpage Đầu tư 24h', cat: 'Fanpage', primary: true },
        { id: 2, name: 'Group Forex Việt', cat: 'Group', primary: false },
    ];
    return (
        <div style={{ maxWidth: 560 }}>
            {rows.map((g) => (
                <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <Avatar icon={g.primary ? <CrownOutlined /> : <TeamOutlined />} style={{ backgroundColor: g.primary ? '#faad14' : '#1677ff' }} />
                    <Space wrap>
                        <Text strong>{g.name}</Text>
                        <Tag>{g.cat}</Tag>
                        {g.primary ? <Tag color="gold">Quản lý chính</Tag> : <Tag color="blue">Quản lý phụ</Tag>}
                    </Space>
                </div>
            ))}
        </div>
    );
}

/** Ma trận quyền mặc định của các hành động trên Profile. */
function ProfileActionsDemo() {
    const rows = [
        { key: 'name', what: 'Sửa Họ tên / Số điện thoại của mình', admin: 'Có', other: 'Có' },
        { key: 'email', what: 'Sửa Email (cần mật khẩu hiện tại)', admin: 'Có', other: 'Không' },
        { key: 'pwd', what: 'Đổi mật khẩu của mình', admin: 'Có', other: 'Có' },
        { key: 'avatar', what: 'Đổi ảnh đại diện', admin: 'Có', other: 'Có' },
        { key: 'view', what: 'Xem Profile người khác', admin: 'Mọi người', other: 'Assistant: mọi người · Manager: phòng ban mình · Employee: không' },
        { key: 'del', what: 'Xoá tài khoản người khác', admin: 'Có', other: 'Không' },
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
                { title: <Tag>Vai trò khác</Tag>, dataIndex: 'other', key: 'other' },
            ]}
        />
    );
}

export const PROFILE_DEMOS: GuideDemo[] = [
    {
        id: 'profile-card',
        title: 'Hồ sơ cá nhân',
        description: 'Thông tin tài khoản + các nút theo quyền: viewer=employee hoặc viewer=admin',
        params: { viewer: ['employee', 'admin'] },
        render: (p) => <ProfileCardDemo viewer={p.viewer === 'admin' ? 'admin' : 'employee'} />,
    },
    {
        id: 'profile-edit',
        title: 'Form Chỉnh sửa hồ sơ',
        description: 'Ô Email bị khoá nếu không có quyền sửa Email: viewer=employee hoặc viewer=admin',
        params: { viewer: ['employee', 'admin'] },
        render: (p) => <ProfileEditDemo viewer={p.viewer === 'admin' ? 'admin' : 'employee'} />,
    },
    {
        id: 'profile-groups',
        title: 'Fanpage / Group đang quản lý',
        description: 'Danh sách nhóm bạn là Quản lý chính/phụ (chỉ xem)',
        render: () => <ProfileGroupsDemo />,
    },
    {
        id: 'profile-actions',
        title: 'Ai làm được gì ở Profile',
        description: 'Bảng quyền mặc định: sửa thông tin, Email, mật khẩu, ảnh, xem/xoá người khác',
        render: () => <ProfileActionsDemo />,
    },
];
