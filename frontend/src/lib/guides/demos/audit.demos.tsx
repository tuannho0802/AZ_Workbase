'use client';

import { Button, Card, Cascader, Col, DatePicker, Input, Row, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { InfoCircleOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { ACTION_GROUP_LABELS, ACTION_GROUP_ORDER, ACTION_META, ENTITY_TYPE_LABELS, getActionMeta } from '@/lib/api/audit-meta';
import type { GuideDemo } from '../guide-demo.types';

const { Text } = Typography;
const { RangePicker } = DatePicker;

interface DemoLog {
    id: number;
    time: string;
    date: string;
    userName: string;
    roleLabel: string;
    action: string;
    entityType: string;
    entityName: string;
    entitySub?: string;
}

/** Dữ liệu mẫu (tên người/khách hàng là giả định). `action` là mã THẬT trong audit-meta nên nhãn + màu lấy từ code thật. */
const DEMO_LOGS: Record<string, DemoLog> = {
    customer: { id: 1, time: '09:15:42', date: '12/10/2026', userName: 'Nguyễn Văn A', roleLabel: 'Nhân viên', action: 'UPDATE_CUSTOMER', entityType: 'customer', entityName: 'Trần Thị B' },
    role: { id: 2, time: '14:03:10', date: '12/10/2026', userName: 'Admin', roleLabel: 'Admin', action: 'UPDATE_ROLE_PERMISSIONS', entityType: 'role', entityName: 'Trưởng phòng Marketing', entitySub: 'ID #7' },
    cleanup: { id: 3, time: '16:40:05', date: '12/10/2026', userName: 'Admin', roleLabel: 'Admin', action: 'ADMIN_CLEANUP_AUDIT_LOGS', entityType: 'audit_log', entityName: '(Không xác định)' },
};

/**
 * Mẫu 1 dòng của bảng "Danh sách nhật ký" (5 cột đúng chữ thật). Nhãn + màu của cột Hành động lấy từ `audit-meta.ts`
 * (cùng hàm `getActionMeta` với trang thật). `kind=customer|role|cleanup`.
 */
function AuditRowDemo({ kind }: { kind: string }) {
    const row = DEMO_LOGS[kind] ?? DEMO_LOGS.customer;
    const columns: ColumnsType<DemoLog> = [
        {
            title: 'Thời gian',
            key: 'time',
            width: 130,
            render: (_v, r) => (
                <Space orientation="vertical" size={0}>
                    <Text style={{ fontSize: 13, fontWeight: 500 }}>{r.time}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>{r.date}</Text>
                </Space>
            ),
        },
        {
            title: 'Người thực hiện',
            key: 'user',
            width: 170,
            render: (_v, r) => (
                <Space orientation="vertical" size={0}>
                    <Text strong style={{ fontSize: 13 }}>{r.userName}</Text>
                    <Tag style={{ fontSize: 10, margin: 0 }}>{r.roleLabel}</Tag>
                </Space>
            ),
        },
        {
            title: 'Hành động',
            key: 'action',
            width: 190,
            render: (_v, r) => {
                const meta = getActionMeta(r.action);
                return <Tag color={meta.color}>{meta.label}</Tag>;
            },
        },
        {
            title: 'Đối tượng',
            key: 'entity',
            width: 200,
            render: (_v, r) => (
                <Space orientation="vertical" size={0}>
                    <Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase' }}>{ENTITY_TYPE_LABELS[r.entityType] || r.entityType}</Text>
                    <Text style={{ fontSize: 13, fontWeight: 500 }}>{r.entityName}</Text>
                    {r.entitySub && <Text type="secondary" style={{ fontSize: 11 }}>{r.entitySub}</Text>}
                </Space>
            ),
        },
        {
            title: 'Chi tiết',
            key: 'detail',
            width: 80,
            align: 'center',
            render: () => (
                <Tooltip title="Xem thay đổi">
                    <Button type="text" size="small" icon={<InfoCircleOutlined />} />
                </Tooltip>
            ),
        },
    ];
    return <Table<DemoLog> size="small" rowKey="id" columns={columns} dataSource={[row]} pagination={false} />;
}

/** Cascader 2 cấp (Nhóm -> Hành động) dựng từ audit-meta, giống ô "Loại hành động" ở trang thật. */
function actionOptions() {
    return ACTION_GROUP_ORDER.map((g) => ({
        value: g,
        label: ACTION_GROUP_LABELS[g],
        children: Object.entries(ACTION_META)
            .filter(([, v]) => v.group === g)
            .map(([code, v]) => ({ value: code, label: v.label })),
    })).filter((o) => o.children.length > 0);
}

/**
 * Mẫu thanh bộ lọc. `tab=main` (Danh sách nhật ký): Người thực hiện / Tìm tên khách hàng / Loại hành động / Đối tượng / khoảng ngày + Lọc + nút làm mới.
 * `tab=login` (Đăng nhập): chỉ Người đăng nhập / khoảng ngày + Lọc + nút làm mới.
 */
function AuditFiltersDemo({ tab }: { tab: string }) {
    const isLogin = tab === 'login';
    return (
        <Card variant="outlined" style={{ borderRadius: 8 }}>
            <Row gutter={[12, 12]} align="middle">
                <Col xs={24} md={isLogin ? 8 : 5}>
                    <Select style={{ width: '100%' }} placeholder={isLogin ? 'Người đăng nhập...' : 'Người thực hiện...'} options={[]} />
                </Col>
                {!isLogin && (
                    <>
                        <Col xs={24} md={5}>
                            <Input placeholder="Tìm tên khách hàng..." prefix={<SearchOutlined />} />
                        </Col>
                        <Col xs={24} md={5}>
                            <Cascader placeholder="Loại hành động" options={actionOptions()} style={{ width: '100%' }} />
                        </Col>
                        <Col xs={24} md={4}>
                            <Select
                                style={{ width: '100%' }}
                                placeholder="Đối tượng"
                                options={Object.entries(ENTITY_TYPE_LABELS).map(([k, v]) => ({ label: v, value: k }))}
                            />
                        </Col>
                    </>
                )}
                <Col xs={24} md={isLogin ? 8 : 3}>
                    <RangePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Col>
                <Col xs={24} md={isLogin ? 4 : 2}>
                    <Space>
                        <Button type="primary">Lọc</Button>
                        <Button icon={<ReloadOutlined />} />
                    </Space>
                </Col>
            </Row>
        </Card>
    );
}

export const AUDIT_DEMOS: GuideDemo[] = [
    {
        id: 'audit-row',
        title: 'Một dòng nhật ký',
        description: 'Bảng nhật ký 1 dòng với 5 cột Thời gian / Người thực hiện / Hành động / Đối tượng / Chi tiết; kind=customer|role|cleanup.',
        params: { kind: ['customer', 'role', 'cleanup'] },
        render: (p) => <AuditRowDemo kind={p.kind ?? 'customer'} />,
    },
    {
        id: 'audit-filters',
        title: 'Thanh bộ lọc nhật ký',
        description: 'Bộ lọc của tab Danh sách nhật ký (tab=main) hoặc tab Đăng nhập (tab=login).',
        params: { tab: ['main', 'login'] },
        render: (p) => <AuditFiltersDemo tab={p.tab ?? 'main'} />,
    },
];
