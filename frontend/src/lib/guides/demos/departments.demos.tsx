'use client';

import { Alert, Avatar, Button, ColorPicker, Form, Input, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons';
import { UserMiniCard } from '@/app/(dashboard)/attendance-device/UserMiniCard';
import type { GuideDemo } from '../guide-demo.types';

const { Text } = Typography;

type DeptViewer = 'admin' | 'assistant' | 'employee';

interface DemoDept {
    id: number;
    name: string;
    color: string;
    description: string | null;
    managers: { id: number; name: string; role: string }[];
    active: boolean;
}

/** Dữ liệu mẫu (tên phòng ban/người quản lý là giả định). Phòng "Kinh doanh 2" cố ý chưa gán Quản lý. */
const DEMO_DEPTS: DemoDept[] = [
    {
        id: 1,
        name: 'Kinh doanh 1',
        color: '#1890ff',
        description: 'Nhóm Sales khu vực phía Nam',
        managers: [
            { id: 2, name: 'Lê Hương', role: 'manager' },
            { id: 7, name: 'Võ Khoa', role: 'assistant' },
        ],
        active: true,
    },
    { id: 2, name: 'Kinh doanh 2', color: '#52c41a', description: null, managers: [], active: true },
    { id: 3, name: 'Marketing', color: '#722ed1', description: 'Chạy quảng cáo và quản lý nguồn data', managers: [{ id: 1, name: 'Admin Hệ thống', role: 'admin' }], active: true },
];

const ROLE_COLOR: Record<string, string> = { admin: 'red', assistant: 'orange', manager: 'blue', employee: 'default' };
const ROLE_NAME: Record<string, string> = { admin: 'Admin', assistant: 'Assistant', manager: 'Manager', employee: 'Employee' };
const getRoleColor = (code?: string | null) => (code ? ROLE_COLOR[code] ?? 'default' : 'default');
const getRoleName = (code?: string) => (code ? ROLE_NAME[code] ?? code : '');

/**
 * Mẫu bảng trang "Quản lý phòng ban" (cột + nút đúng chữ thật).
 * `viewer=admin`: Thêm phòng ban + Xem/Sửa/Xoá. `viewer=assistant`: có Xem/Sửa, KHÔNG có Xoá.
 * `viewer=employee` (mặc định chỉ có quyền Xem phòng ban): không có nút Thêm và không có cả cột Thao tác.
 */
function DepartmentTableDemo({ viewer }: { viewer: DeptViewer }) {
    const canManage = viewer !== 'employee';
    const canDelete = viewer === 'admin';
    const canViewUsers = viewer !== 'employee';
    const showActions = canViewUsers || canManage || canDelete;

    const columns: ColumnsType<DemoDept> = [
        { title: 'Tên phòng ban', key: 'name', render: (_v, r) => <Tag color={r.color}>{r.name}</Tag> },
        { title: 'Mô tả', key: 'description', render: (_v, r) => r.description || <Text type="secondary">—</Text> },
        {
            title: 'Quản lý (Manager)',
            key: 'managers',
            render: (_v, r) =>
                r.managers.length === 0 ? (
                    <Text type="secondary">Chưa gán</Text>
                ) : (
                    <Space size={[6, 6]} wrap>
                        {r.managers.map((m) => (
                            <UserMiniCard key={m.id} name={m.name} role={m.role} getRoleColor={getRoleColor} getRoleName={getRoleName} />
                        ))}
                    </Space>
                ),
        },
        { title: 'Trạng thái', key: 'active', width: 140, render: () => <Tag color="green">Đang hoạt động</Tag> },
        ...(showActions
            ? [
                  {
                      title: 'Thao tác',
                      key: 'action',
                      width: 220,
                      render: () => (
                          <Space>
                              {canViewUsers && (
                                  <Button size="small" icon={<EyeOutlined />}>
                                      Xem
                                  </Button>
                              )}
                              {canManage && (
                                  <Button size="small" icon={<EditOutlined />}>
                                      Sửa
                                  </Button>
                              )}
                              {canDelete && (
                                  <Button size="small" danger icon={<DeleteOutlined />}>
                                      Xoá
                                  </Button>
                              )}
                          </Space>
                      ),
                  } as ColumnsType<DemoDept>[number],
              ]
            : []),
    ];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                <div>
                    <Text strong style={{ fontSize: 16, display: 'block' }}>
                        Quản lý phòng ban
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        Gán &quot;Quản lý&quot; (Manager) cho từng phòng ban để xác định phạm vi xem/thao tác dữ liệu theo phòng ban ở các module khác.
                    </Text>
                </div>
                {canManage && (
                    <Button type="primary" icon={<PlusOutlined />}>
                        Thêm phòng ban
                    </Button>
                )}
            </div>
            <Space style={{ marginBottom: 12 }} wrap>
                <Input placeholder="Tìm theo tên phòng ban..." style={{ width: 240 }} readOnly />
                <Select placeholder="Trạng thái" style={{ width: 180 }} open={false} options={[]} />
            </Space>
            <Table<DemoDept> rowKey="id" size="small" columns={columns} dataSource={DEMO_DEPTS} pagination={false} scroll={{ x: 760 }} />
        </div>
    );
}

type FormMode = 'create' | 'edit';

/**
 * Mẫu cửa sổ Thêm / Sửa phòng ban. `mode=create`: chỉ Tên, Mô tả, Màu. `mode=edit`: có thêm
 * Quản lý phòng ban (chọn nhiều) và Trạng thái hoạt động.
 */
function DepartmentFormDemo({ mode }: { mode: FormMode }) {
    const isEdit = mode === 'edit';
    return (
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 16, background: '#fff', maxWidth: 520 }}>
            <Text strong style={{ fontSize: 16, display: 'block', marginBottom: 12 }}>
                {isEdit ? 'Sửa phòng ban "Kinh doanh 1"' : 'Thêm phòng ban mới'}
            </Text>
            <Form layout="vertical">
                <Form.Item label="Tên phòng ban" required>
                    <Input placeholder="Ví dụ: Phòng Marketing" value={isEdit ? 'Kinh doanh 1' : undefined} readOnly />
                </Form.Item>
                <Form.Item label="Mô tả (tuỳ chọn)">
                    <Input.TextArea rows={2} placeholder="Mô tả ngắn về phòng ban" readOnly />
                </Form.Item>
                <Form.Item label="Màu hiển thị (Tag)" extra="Màu Tag phòng ban này hiển thị ở bảng danh sách và các nơi liên quan (Vị trí, chi tiết khách hàng, chọn Sales/Marketing phụ trách...).">
                    <ColorPicker format="hex" disabledAlpha showText defaultValue="#1890ff" />
                </Form.Item>
                {isEdit && (
                    <>
                        <Form.Item
                            label="Quản lý phòng ban (Manager)"
                            extra="Những người được gán ở đây quyết định phạm vi 'Phòng ban quản lý' (department scope) trong Ma trận quyền cho CHÍNH họ - áp dụng cho Admin/Assistant/Manager. Có thể chọn NHIỀU người cùng quản lý 1 phòng ban. Để trống nếu phòng ban tạm chưa có ai quản lý."
                        >
                            <Select
                                mode="multiple"
                                open={false}
                                placeholder="Chọn (nhiều) user quản lý phòng ban này"
                                value={['Lê Hương (manager)', 'Võ Khoa (assistant)']}
                                options={[]}
                            />
                        </Form.Item>
                        <Form.Item label="Trạng thái hoạt động">
                            <Switch checked checkedChildren="Đang hoạt động" unCheckedChildren="Ngừng hoạt động" />
                        </Form.Item>
                    </>
                )}
            </Form>
            <Space>
                <Button>Cancel</Button>
                <Button type="primary">OK</Button>
            </Space>
        </div>
    );
}

type DeleteVariant = 'with-users' | 'empty';

/**
 * Mẫu hộp thoại Xoá phòng ban. `variant=with-users`: phòng còn nhân viên -> bắt buộc chọn phòng ban đích để di dời.
 * `variant=empty`: phòng không còn nhân viên -> chỉ hỏi xác nhận, kèm lưu ý về khách hàng.
 */
function DepartmentDeleteDemo({ variant }: { variant: DeleteVariant }) {
    const withUsers = variant === 'with-users';
    return (
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 16, background: '#fff', maxWidth: 520 }}>
            <Text strong style={{ fontSize: 16, display: 'block', marginBottom: 12 }}>
                Xoá phòng ban &quot;Kinh doanh 2&quot;
            </Text>
            {withUsers ? (
                <>
                    <Text>
                        Phòng ban này đang có <Text strong>3</Text> nhân viên. Vui lòng chọn phòng ban khác để di dời họ sang trước khi xoá.
                    </Text>
                    <div style={{ marginTop: 16, marginBottom: 4 }}>
                        <Text>
                            <span style={{ color: '#ff4d4f' }}>* </span>Di dời nhân viên sang phòng ban
                        </Text>
                    </div>
                    <Select
                        style={{ width: '100%', marginBottom: 16 }}
                        open={false}
                        placeholder="Chọn phòng ban đích"
                        options={[]}
                    />
                    <Space size={6} style={{ marginBottom: 16 }} wrap>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            Danh sách chọn gồm:
                        </Text>
                        <Tag color="#1890ff">Kinh doanh 1</Tag>
                        <Tag color="#722ed1">Marketing</Tag>
                    </Space>
                </>
            ) : (
                <div style={{ marginBottom: 16 }}>
                    <Text>Phòng ban này không còn nhân viên. Bạn có chắc muốn xoá?</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        Lưu ý: Dữ liệu khách hàng liên kết phòng ban này sẽ không còn phòng ban (có thể gán lại sau).
                    </Text>
                </div>
            )}
            <Space>
                <Button>Cancel</Button>
                <Button danger type="primary">
                    Xoá
                </Button>
            </Space>
        </div>
    );
}

/** Mẫu ngăn "Nhân viên phòng ..." mở bằng nút Xem (cần quyền Xem nhân viên). */
function DepartmentDrawerDemo() {
    const people = [
        { id: 2, name: 'Lê Hương', email: 'huong@example.com', manager: true },
        { id: 3, name: 'Nguyễn An', email: 'an@example.com', manager: false },
        { id: 4, name: 'Trần Bình', email: 'binh@example.com', manager: false },
    ];
    return (
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, background: '#fff', maxWidth: 400 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
                <Text strong>Nhân viên phòng &quot;Kinh doanh 1&quot;</Text>
            </div>
            {people.map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #fafafa' }}>
                    <Avatar icon={<UserOutlined />} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div>{p.name}</div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {p.email}
                        </Text>
                    </div>
                    {p.manager && <Tag color="gold">Manager</Tag>}
                </div>
            ))}
            <Alert
                type="info"
                showIcon
                style={{ margin: 12 }}
                title="Bấm vào một dòng để mở hồ sơ người đó"
                description="Danh sách hiện cả tài khoản đang bị khoá, tối đa 100 người."
            />
        </div>
    );
}

/** Mẫu của trang "Quản lý phòng ban". */
export const DEPARTMENT_DEMOS: GuideDemo[] = [
    {
        id: 'department-table',
        title: 'Bảng Quản lý phòng ban',
        description: 'viewer=admin (Thêm/Xem/Sửa/Xoá), viewer=assistant (không có Xoá), viewer=employee (chỉ xem danh sách, không có nút nào)',
        params: { viewer: ['admin', 'assistant', 'employee'] },
        render: (p) => <DepartmentTableDemo viewer={p.viewer === 'assistant' ? 'assistant' : p.viewer === 'employee' ? 'employee' : 'admin'} />,
    },
    {
        id: 'department-form',
        title: 'Cửa sổ Thêm / Sửa phòng ban',
        description: 'mode=create (Tên, Mô tả, Màu) hoặc mode=edit (thêm Quản lý phòng ban và Trạng thái hoạt động)',
        params: { mode: ['create', 'edit'] },
        render: (p) => <DepartmentFormDemo mode={p.mode === 'edit' ? 'edit' : 'create'} />,
    },
    {
        id: 'department-delete',
        title: 'Hộp thoại Xoá phòng ban',
        description: 'variant=with-users (bắt buộc chọn phòng ban đích để di dời nhân viên) hoặc variant=empty (phòng không còn nhân viên)',
        params: { variant: ['with-users', 'empty'] },
        render: (p) => <DepartmentDeleteDemo variant={p.variant === 'empty' ? 'empty' : 'with-users'} />,
    },
    {
        id: 'department-drawer',
        title: 'Ngăn Nhân viên phòng ban',
        description: 'Danh sách nhân viên mở bằng nút Xem; vai trò Manager có nhãn vàng',
        render: () => <DepartmentDrawerDemo />,
    },
];
