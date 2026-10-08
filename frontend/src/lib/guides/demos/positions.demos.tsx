'use client';

import { Alert, Button, ColorPicker, Divider, Form, Input, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, UndoOutlined, SaveOutlined } from '@ant-design/icons';
import type { GuideDemo } from '../guide-demo.types';

const { Text } = Typography;

type PositionViewer = 'admin' | 'assistant' | 'employee';

interface DemoPosition {
    id: number;
    code: string;
    name: string;
    color: string;
    department: { name: string; color: string } | null;
    description: string | null;
    isSystem: boolean;
}

/** Dữ liệu mẫu (tên vị trí/phòng ban là giả định). `isSystem` chỉ để minh hoạ nhãn "Hệ thống" (không nút Xoá). */
const DEMO_POSITIONS: DemoPosition[] = [
    { id: 1, code: 'content', name: 'Content', color: '#13c2c2', department: { name: 'Marketing', color: '#722ed1' }, description: 'Nhân viên phòng Marketing', isSystem: false },
    { id: 2, code: 'media', name: 'Media', color: '#fa8c16', department: { name: 'Marketing', color: '#722ed1' }, description: 'Nhân viên phòng Marketing', isSystem: false },
    { id: 3, code: 'hr', name: 'HR', color: '#eb2f96', department: null, description: 'Admin phụ trách nhân sự', isSystem: false },
    { id: 4, code: 'audit', name: 'Kiểm soát', color: '#faad14', department: null, description: null, isSystem: true },
];

/**
 * Mẫu bảng trang "Quản lý Vị trí" (cột + nút đúng chữ thật).
 * `viewer=admin`: Thêm vị trí + Hiển thị dữ liệu/Sửa/Xoá. `viewer=assistant`: Thêm + Sửa (không có Hiển thị dữ liệu, không có Xoá).
 * `viewer=employee` (chỉ có quyền Xem vị trí): không có nút Thêm và không có cả cột Thao tác.
 * Dòng "CEO" mang nhãn Hệ thống nên không có nút Xoá dù là Admin.
 */
function PositionTableDemo({ viewer }: { viewer: PositionViewer }) {
    const canManage = viewer !== 'employee';
    const canDelete = viewer === 'admin';
    const canVisibility = viewer === 'admin';
    const showActions = canManage || canDelete || canVisibility;

    const columns: ColumnsType<DemoPosition> = [
        { title: 'Mã vị trí', key: 'code', width: 120, render: (_v, r) => <Text code>{r.code}</Text> },
        { title: 'Tên vị trí', key: 'name', render: (_v, r) => <Tag color={r.color}>{r.name}</Tag> },
        {
            title: 'Phòng ban (gợi ý)',
            key: 'department',
            render: (_v, r) => (r.department ? <Tag color={r.department.color}>{r.department.name}</Tag> : <Text type="secondary">—</Text>),
        },
        { title: 'Mô tả', key: 'description', render: (_v, r) => r.description || <Text type="secondary">—</Text> },
        { title: 'Loại', key: 'isSystem', width: 110, render: (_v, r) => (r.isSystem ? <Tag color="gold">Hệ thống</Tag> : <Tag>Tuỳ chỉnh</Tag>) },
        ...(showActions
            ? [
                  {
                      title: 'Thao tác',
                      key: 'action',
                      width: 300,
                      render: (_v: unknown, r: DemoPosition) => (
                          <Space wrap>
                              {canVisibility && (
                                  <Button size="small" icon={<EyeOutlined />}>
                                      Hiển thị dữ liệu
                                  </Button>
                              )}
                              {canManage && (
                                  <Button size="small" icon={<EditOutlined />}>
                                      Sửa
                                  </Button>
                              )}
                              {canDelete && !r.isSystem && (
                                  <Button size="small" danger icon={<DeleteOutlined />}>
                                      Xoá
                                  </Button>
                              )}
                          </Space>
                      ),
                  } as ColumnsType<DemoPosition>[number],
              ]
            : []),
    ];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                <div>
                    <Text strong style={{ fontSize: 16, display: 'block' }}>
                        Quản lý Vị trí
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        Vị trí gắn thêm cho nhân viên bên cạnh Role, dùng để ghi đè quyền chi tiết hơn và ẩn/hiện cột, tab của Khách hàng theo từng Vị trí.
                    </Text>
                </div>
                {canManage && (
                    <Button type="primary" icon={<PlusOutlined />}>
                        Thêm vị trí
                    </Button>
                )}
            </div>
            <Space style={{ marginBottom: 12 }} wrap>
                <Input placeholder="Tìm theo tên hoặc mã vị trí..." style={{ width: 260 }} readOnly />
                <Select placeholder="Phòng ban" style={{ width: 160 }} open={false} options={[]} />
                <Select placeholder="Loại" style={{ width: 140 }} open={false} options={[]} />
            </Space>
            <Table<DemoPosition> rowKey="id" size="small" columns={columns} dataSource={DEMO_POSITIONS} pagination={false} scroll={{ x: 860 }} />
        </div>
    );
}

type FormMode = 'create' | 'edit';

/**
 * Mẫu cửa sổ Thêm / Sửa vị trí. `mode=create`: có ô Mã vị trí (không đổi được sau khi tạo).
 * `mode=edit`: KHÔNG có ô Mã vị trí, chỉ Tên, Phòng ban gợi ý, Mô tả, Màu.
 */
function PositionFormDemo({ mode }: { mode: FormMode }) {
    const isEdit = mode === 'edit';
    return (
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 16, background: '#fff', maxWidth: 520 }}>
            <Text strong style={{ fontSize: 16, display: 'block', marginBottom: 12 }}>
                {isEdit ? 'Sửa vị trí "Content"' : 'Thêm vị trí mới'}
            </Text>
            <Form layout="vertical">
                {!isEdit && (
                    <Form.Item
                        label="Mã vị trí"
                        required
                        extra="Chỉ chữ thường, số và dấu gạch dưới (vd: content, hr, director). KHÔNG đổi được sau khi tạo."
                    >
                        <Input placeholder="Ví dụ: content" readOnly />
                    </Form.Item>
                )}
                <Form.Item label="Tên vị trí" required>
                    <Input placeholder="Ví dụ: Content" value={isEdit ? 'Content' : undefined} readOnly />
                </Form.Item>
                <Form.Item
                    label="Phòng ban (gợi ý, không bắt buộc)"
                    extra="Chỉ để nhóm hiển thị trong danh sách - KHÔNG ràng buộc user phải thuộc đúng phòng ban này mới chọn được vị trí."
                >
                    <Select placeholder="Không thuộc phòng ban cụ thể" open={false} options={[]} value={isEdit ? 'Marketing' : undefined} />
                </Form.Item>
                <Form.Item label="Mô tả (tuỳ chọn)">
                    <Input.TextArea rows={2} placeholder="Mô tả ngắn về vị trí" readOnly />
                </Form.Item>
                <Form.Item label="Màu hiển thị (Tag)" extra="Màu Tag vị trí này hiển thị ở bảng danh sách và các nơi liên quan (chi tiết khách hàng, chọn Sales/Marketing phụ trách...).">
                    <ColorPicker format="hex" disabledAlpha showText defaultValue="#13c2c2" />
                </Form.Item>
            </Form>
            <Space>
                <Button>Cancel</Button>
                <Button type="primary">OK</Button>
            </Space>
        </div>
    );
}

type DeleteVariant = 'has-users' | 'free';

/**
 * Mẫu hộp thoại Xoá vị trí. Hộp thoại luôn cùng 1 nội dung; kết quả do hệ thống quyết định sau khi bấm Xoá:
 * `variant=has-users`: vị trí còn nhân viên -> bị từ chối, kèm số nhân viên. `variant=free`: không ai giữ vị trí -> xoá thành công.
 */
function PositionDeleteDemo({ variant }: { variant: DeleteVariant }) {
    const blocked = variant === 'has-users';
    return (
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 16, background: '#fff', maxWidth: 520 }}>
            <Text strong style={{ fontSize: 16, display: 'block', marginBottom: 12 }}>
                Xoá vị trí &quot;{blocked ? 'Content' : 'Editor'}&quot;
            </Text>
            <Text>
                Bạn có chắc muốn xoá vị trí này? Hệ thống sẽ từ chối nếu đang có nhân viên gán vị trí này - vui lòng đổi/gỡ vị trí cho các nhân viên đó trước.
            </Text>
            <div style={{ margin: '16px 0' }}>
                <Space>
                    <Button>Cancel</Button>
                    <Button danger type="primary">
                        Xoá
                    </Button>
                </Space>
            </div>
            <Divider style={{ margin: '8px 0 12px' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                    Kết quả sau khi bấm Xoá
                </Text>
            </Divider>
            {blocked ? (
                <Alert
                    type="error"
                    showIcon
                    title={'Không thể xoá vị trí "Content" - đang có 3 nhân viên gán vị trí này. Vui lòng đổi/gỡ vị trí cho các nhân viên đó trước khi xoá.'}
                />
            ) : (
                <Alert type="success" showIcon title={'Đã xoá vị trí "Editor"'} />
            )}
        </div>
    );
}

type VisibilityState = 'inherit' | 'override';

const VISIBILITY_ROWS: { key: string; label: string; hint?: string }[] = [
    { key: 'field:sales_assignment', label: 'Sales phụ trách (chính + phụ)', hint: 'Cột "Sales phụ trách" ở bảng khách hàng + filter theo Sales' },
    { key: 'field:marketing_assignment', label: 'Marketing phụ trách', hint: 'Cột "Marketing phụ trách" ở bảng khách hàng + filter theo Marketing' },
    { key: 'field:assigned_date', label: 'Ngày nhận khách' },
    { key: 'field:closed_date', label: 'Ngày chốt khách' },
    { key: 'tab:deposits', label: 'Tab "Lịch sử nạp tiền (FTD)"', hint: 'Trong màn Chi tiết khách hàng' },
    { key: 'tab:assignments', label: 'Tab "Phân công"', hint: 'Trong màn Chi tiết khách hàng' },
    { key: 'tab:groups', label: 'Tab "Nhóm khách hàng"', hint: 'Trong màn Chi tiết khách hàng' },
];

/** Các mục bị ẩn trong ví dụ `state=override` (Vị trí Content, Role Employee). */
const HIDDEN_IN_OVERRIDE = new Set(['field:sales_assignment', 'field:marketing_assignment', 'tab:deposits']);

/**
 * Mẫu ngăn "Cấu hình hiển thị dữ liệu - Vị trí ..." (nút Hiển thị dữ liệu, cần quyền Quản lý phân quyền).
 * `state=inherit`: Vị trí chưa có cấu hình riêng, mọi mục đang Hiện (theo Toàn cục/Phòng ban), nút Lưu mờ.
 * `state=override`: Vị trí đã có cấu hình riêng, có thanh thông báo và nút Gỡ override.
 */
function PositionVisibilityDemo({ state }: { state: VisibilityState }) {
    const isOverride = state === 'override';
    const renderRow = (row: { key: string; label: string; hint?: string }) => (
        <div key={row.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
            <div>
                <Text>{row.label}</Text>
                {row.hint && (
                    <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {row.hint}
                        </Text>
                    </div>
                )}
            </div>
            <Switch checked={!(isOverride && HIDDEN_IN_OVERRIDE.has(row.key))} checkedChildren="Hiện" unCheckedChildren="Ẩn" />
        </div>
    );
    return (
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, background: '#fff', maxWidth: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
                <Text strong>Cấu hình hiển thị dữ liệu - Vị trí &quot;Content&quot;</Text>
                <Space>
                    {isOverride && <Button icon={<UndoOutlined />}>Gỡ override</Button>}
                    <Button type="primary" icon={<SaveOutlined />} disabled>
                        Lưu
                    </Button>
                </Space>
            </div>
            <div style={{ padding: 16 }}>
                <Select style={{ width: '100%', marginBottom: 16 }} open={false} options={[]} value="Employee" />
                {isOverride && (
                    <Alert
                        type="info"
                        showIcon
                        style={{ marginBottom: 12 }}
                        title="Vị trí này đang có cấu hình riêng"
                        description='Khác với ma trận Toàn cục/Phòng ban - bấm "Gỡ override" để quay lại dùng chung.'
                    />
                )}
                <Divider titlePlacement="left" plain style={{ margin: '8px 0' }}>
                    <Tag>Cột dữ liệu</Tag>
                </Divider>
                {VISIBILITY_ROWS.filter((r) => r.key.startsWith('field:')).map(renderRow)}
                <Divider titlePlacement="left" plain style={{ margin: '16px 0 8px' }}>
                    <Tag>Tab trong chi tiết khách hàng</Tag>
                </Divider>
                {VISIBILITY_ROWS.filter((r) => r.key.startsWith('tab:')).map(renderRow)}
            </div>
        </div>
    );
}

/** Mẫu của trang "Quản lý Vị trí". */
export const POSITION_DEMOS: GuideDemo[] = [
    {
        id: 'position-table',
        title: 'Bảng Quản lý Vị trí',
        description: 'viewer=admin (Thêm/Hiển thị dữ liệu/Sửa/Xoá), viewer=assistant (Thêm/Sửa, không có Hiển thị dữ liệu và Xoá), viewer=employee (chỉ xem danh sách)',
        params: { viewer: ['admin', 'assistant', 'employee'] },
        render: (p) => <PositionTableDemo viewer={p.viewer === 'assistant' ? 'assistant' : p.viewer === 'employee' ? 'employee' : 'admin'} />,
    },
    {
        id: 'position-form',
        title: 'Cửa sổ Thêm / Sửa vị trí',
        description: 'mode=create (có Mã vị trí) hoặc mode=edit (không có Mã vị trí, vì mã không đổi được)',
        params: { mode: ['create', 'edit'] },
        render: (p) => <PositionFormDemo mode={p.mode === 'edit' ? 'edit' : 'create'} />,
    },
    {
        id: 'position-delete',
        title: 'Hộp thoại Xoá vị trí',
        description: 'variant=has-users (bị từ chối vì còn nhân viên giữ vị trí) hoặc variant=free (không ai giữ -> xoá được)',
        params: { variant: ['has-users', 'free'] },
        render: (p) => <PositionDeleteDemo variant={p.variant === 'free' ? 'free' : 'has-users'} />,
    },
    {
        id: 'position-visibility',
        title: 'Ngăn Cấu hình hiển thị dữ liệu của Vị trí',
        description: 'state=inherit (chưa có cấu hình riêng) hoặc state=override (đã có cấu hình riêng: ẩn Sales/Marketing phụ trách và tab FTD)',
        params: { state: ['inherit', 'override'] },
        render: (p) => <PositionVisibilityDemo state={p.state === 'override' ? 'override' : 'inherit'} />,
    },
];
