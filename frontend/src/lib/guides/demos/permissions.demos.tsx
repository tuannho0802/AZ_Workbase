'use client';

import { Alert, Button, Checkbox, Segmented, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { LockOutlined, SaveOutlined } from '@ant-design/icons';
import type { GuideDemo } from '../guide-demo.types';

const { Text, Title } = Typography;

type Scope = 'own' | 'department' | 'all';
const SCOPE_OPTIONS = [
    { label: 'Chỉ của mình', value: 'own' },
    { label: 'Phòng ban quản lý', value: 'department' },
    { label: 'Toàn bộ', value: 'all' },
];

interface MatrixRow {
    key: string;
    action: string;
    description: string;
    scope: Scope | null; // null = permission nhị phân (không có phạm vi)
    on: boolean;
    overridden?: boolean;
}

/** Dữ liệu mẫu rút gọn (giả định) - tên nhóm/hành động/mô tả theo kiểu thật của ma trận. */
const MATRIX_GROUPS: { resource: string; rows: MatrixRow[] }[] = [
    {
        resource: 'Khách hàng',
        rows: [
            { key: 'customers.view', action: 'view', description: 'Xem danh sách/chi tiết khách hàng', scope: 'department', on: true },
            { key: 'customers.edit', action: 'edit', description: 'Sửa thông tin khách hàng', scope: 'own', on: true, overridden: true },
            { key: 'customers.delete', action: 'delete', description: 'Xoá khách hàng', scope: 'all', on: false },
        ],
    },
    {
        resource: 'Phân quyền',
        rows: [
            { key: 'roles.view', action: 'view', description: 'Xem trang Phân quyền', scope: null, on: false },
        ],
    },
];

/**
 * Mẫu ngăn "Ma trận quyền" (rút gọn). `viewer=manage`: có quyền roles.manage - tích được, đổi phạm vi, có nút Lưu thay đổi.
 * `viewer=view`: chỉ roles.view - có thanh "Chỉ xem", mọi ô bị khoá. Thẻ cam "Ghi đè" chỉ hiện ở tab Theo phòng ban / Theo Vị trí.
 */
function PermissionMatrixDemo({ viewer }: { viewer: 'manage' | 'view' }) {
    const canManage = viewer === 'manage';
    return (
        <div>
            {!canManage && (
                <Alert
                    type="info"
                    showIcon
                    icon={<LockOutlined />}
                    title="Chỉ xem - bạn không có quyền roles.manage nên không sửa được ma trận này."
                    style={{ marginBottom: 12 }}
                />
            )}
            {canManage && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                    <Button type="primary" icon={<SaveOutlined />}>
                        Lưu thay đổi
                    </Button>
                </div>
            )}
            {MATRIX_GROUPS.map((g) => (
                <div key={g.resource} style={{ marginBottom: 16 }}>
                    <Title level={5} style={{ marginBottom: 8 }}>
                        {g.resource}
                    </Title>
                    {g.rows.map((r) => (
                        <div
                            key={r.key}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '8px 12px',
                                marginBottom: 6,
                                borderRadius: 8,
                                border: r.overridden ? '1px solid #ffd591' : '1px solid #f0f0f0',
                                background: r.on ? '#f6ffed' : undefined,
                                opacity: canManage ? 1 : 0.85,
                            }}
                        >
                            <Space align="start">
                                <Checkbox checked={r.on} disabled={!canManage} />
                                <div>
                                    <Space size={6}>
                                        <Text strong>{r.action}</Text>
                                        {r.overridden && <Tag color="orange">Ghi đè</Tag>}
                                    </Space>
                                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>{r.description}</div>
                                </div>
                            </Space>
                            {r.on && r.scope && <Segmented size="small" options={SCOPE_OPTIONS} value={r.scope} disabled={!canManage} />}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

type LayerKey = 'global' | 'department' | 'position';

interface LayerRow {
    permission: string;
    global: string;
    department: string | null;
    position: string | null;
}

/** Ví dụ giả định: role Employee, permission `customers.view`/`customers.edit`/`customers.delete`; Vị trí đè lên Phòng ban đè lên Toàn cục. */
const LAYER_ROWS: LayerRow[] = [
    { permission: 'customers.view', global: 'Chỉ của mình', department: 'Phòng ban quản lý', position: null },
    { permission: 'customers.edit', global: 'Chỉ của mình', department: null, position: 'Từ chối' },
    { permission: 'customers.delete', global: '(không có)', department: null, position: null },
];

function effective(row: LayerRow, upTo: LayerKey): string {
    let value: string = row.global;
    if (upTo !== 'global' && row.department) value = row.department;
    if (upTo === 'position' && row.position) value = row.position;
    return value;
}

/**
 * Mẫu 3 tầng ghi đè: Toàn cục -> Phòng ban -> Vị trí (tầng sau đè tầng trước).
 * `layer=global|department|position` = tính kết quả đến tầng nào. "Từ chối" nghĩa là tầng đó chủ động tắt quyền dù tầng trước đang bật.
 */
function OverrideLayersDemo({ upTo }: { upTo: LayerKey }) {
    const columns: ColumnsType<LayerRow> = [
        { title: 'Quyền', dataIndex: 'permission', key: 'permission', render: (v: string) => <Text code>{v}</Text> },
        { title: 'Toàn cục', dataIndex: 'global', key: 'global' },
        { title: 'Theo phòng ban', key: 'department', render: (_v, r) => r.department ?? <Text type="secondary">— (dùng Toàn cục)</Text> },
        { title: 'Theo Vị trí', key: 'position', render: (_v, r) => r.position ?? <Text type="secondary">— (dùng tầng trước)</Text> },
        {
            title: 'Kết quả hiệu lực',
            key: 'effective',
            render: (_v, r) => {
                const v = effective(r, upTo);
                return <Tag color={v === 'Từ chối' || v === '(không có)' ? 'default' : 'green'}>{v}</Tag>;
            },
        },
    ];
    return <Table<LayerRow> size="small" rowKey="permission" columns={columns} dataSource={LAYER_ROWS} pagination={false} />;
}

const UI_ROWS: { label: string; group: string; global: boolean; department: boolean | null; position: boolean | null }[] = [
    { label: 'Ngày chốt khách', group: 'Cột', global: true, department: null, position: null },
    { label: 'Sales phụ trách (chính + phụ)', group: 'Cột', global: true, department: false, position: null },
    { label: 'Tab "Lịch sử nạp tiền (FTD)"', group: 'Tab', global: true, department: false, position: true },
];

/**
 * Mẫu minh hoạ ẩn/hiện cột + tab của module Khách hàng theo 3 tầng (ưu tiên Vị trí > Phòng ban > Toàn cục).
 * Cấu hình thật nằm ở nút "Hiển thị dữ liệu" của trang Quản lý Vị trí, KHÔNG nằm trong ngăn Ma trận quyền.
 */
function UiVisibilityMatrixDemo() {
    const show = (v: boolean | null) => (v === null ? <Text type="secondary">—</Text> : <Tag color={v ? 'green' : 'red'}>{v ? 'Hiện' : 'Ẩn'}</Tag>);
    const resolve = (r: (typeof UI_ROWS)[number]) => r.position ?? r.department ?? r.global;
    return (
        <Table
            size="small"
            rowKey="label"
            pagination={false}
            dataSource={UI_ROWS}
            columns={[
                { title: 'Mục', dataIndex: 'label', key: 'label' },
                { title: 'Toàn cục', key: 'g', render: (_v, r) => show(r.global) },
                { title: 'Phòng ban', key: 'd', render: (_v, r) => show(r.department) },
                { title: 'Vị trí', key: 'p', render: (_v, r) => show(r.position) },
                { title: 'Người dùng thấy', key: 'e', render: (_v, r) => show(resolve(r)) },
            ]}
        />
    );
}

export const PERMISSION_DEMOS: GuideDemo[] = [
    {
        id: 'permission-matrix',
        title: 'Ma trận quyền (rút gọn)',
        description: 'Các dòng quyền, ô tích, phạm vi và thẻ Ghi đè trong ngăn Ma trận quyền; viewer=manage hoặc view.',
        params: { viewer: ['manage', 'view'] },
        render: (p) => <PermissionMatrixDemo viewer={p.viewer === 'view' ? 'view' : 'manage'} />,
    },
    {
        id: 'override-layers',
        title: 'Ba tầng ghi đè quyền',
        description: 'Toàn cục -> Phòng ban -> Vị trí: tầng cụ thể đè tầng chung; layer=global|department|position.',
        params: { layer: ['global', 'department', 'position'] },
        render: (p) => <OverrideLayersDemo upTo={(['global', 'department', 'position'].includes(p.layer) ? p.layer : 'position') as LayerKey} />,
    },
    {
        id: 'ui-visibility-matrix',
        title: 'Ẩn/hiện cột và tab theo 3 tầng',
        description: 'Bảng ví dụ ẩn/hiện cột + tab của Khách hàng theo Toàn cục / Phòng ban / Vị trí.',
        render: () => <UiVisibilityMatrixDemo />,
    },
];
