'use client';

import { Badge, Button, Input, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowRightOutlined, DeleteOutlined, SearchOutlined, UndoOutlined } from '@ant-design/icons';
import type { GuideDemo } from '../guide-demo.types';
import { SAMPLE_SOURCES } from '../demo-kit/sample-tags';

const { Text } = Typography;

interface DemoTrashRow {
    id: number;
    name: string;
    phone: string | null;
    source: number;
    sales: string | null;
    createdAt: string;
    deletedAt: string;
    deletedBy: string | null;
}

/** Dữ liệu mẫu (tên/người là giả định). Dòng cuối: bản ghi xoá từ trước khi có cột "Người xoá" và không dò lại được -> "—". */
const DEMO_TRASH_ROWS: DemoTrashRow[] = [
    { id: 1, name: 'Phạm Quang', phone: '0901 234 567', source: 0, sales: 'Nguyễn An', createdAt: '01/09/2026', deletedAt: '05/10/2026 14:20', deletedBy: 'Admin Hệ thống' },
    { id: 2, name: 'Đỗ Hạnh', phone: null, source: 1, sales: null, createdAt: '12/09/2026', deletedAt: '04/10/2026 09:05', deletedBy: 'Admin Hệ thống' },
    { id: 3, name: 'Bùi Khoa', phone: '0923 456 789', source: 2, sales: 'Trần Bình', createdAt: '20/08/2026', deletedAt: '30/09/2026 17:45', deletedBy: null },
];

/**
 * Mẫu trang "Thùng rác" (cột và nút đúng như trang thật).
 * `viewer=full`: có cả `customers.trash_manage` và `customers.hard_delete` -> 2 nút Khôi phục + Xóa vĩnh viễn.
 * `viewer=restore-only`: chỉ có `customers.trash_manage` -> nút Xóa vĩnh viễn bị ẩn hẳn.
 */
function TrashTableDemo({ viewer }: { viewer: 'full' | 'restore-only' }) {
    const canHardDelete = viewer === 'full';

    const columns: ColumnsType<DemoTrashRow> = [
        { title: 'STT', key: 'stt', width: 55, align: 'center', render: (_v, _r, i) => i + 1 },
        { title: 'Họ và tên', key: 'name', width: 150, render: (_v, r) => <Text strong style={{ color: '#1890ff' }}>{r.name}</Text> },
        {
            title: 'SĐT',
            key: 'phone',
            width: 115,
            render: (_v, r) => r.phone || <span style={{ color: '#aaa', fontStyle: 'italic' }}>Chưa có SĐT</span>,
        },
        { title: 'Nguồn', key: 'source', width: 90, render: (_v, r) => <Tag color={SAMPLE_SOURCES[r.source].color}>{SAMPLE_SOURCES[r.source].name}</Tag> },
        { title: 'Sales phụ trách', key: 'sales', width: 130, render: (_v, r) => r.sales || '-' },
        { title: 'Ngày tạo', dataIndex: 'createdAt', key: 'createdAt', width: 105 },
        { title: 'Ngày xóa', dataIndex: 'deletedAt', key: 'deletedAt', width: 140 },
        { title: 'Người xóa', key: 'deletedBy', width: 140, render: (_v, r) => r.deletedBy || <Text type="secondary">—</Text> },
        {
            title: 'Thao tác',
            key: 'action',
            width: 90,
            align: 'center',
            render: () => (
                <Space size={0}>
                    <Tooltip title="Khôi phục">
                        <Button type="text" style={{ color: '#1890ff' }} size="small" icon={<UndoOutlined />} />
                    </Tooltip>
                    {canHardDelete && (
                        <Tooltip title="Xóa vĩnh viễn">
                            <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                        </Tooltip>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <div>
            <Space size={12} style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 16, fontWeight: 500 }}>📁 Thùng rác khách hàng</Text>
                <Badge count={DEMO_TRASH_ROWS.length} showZero color="#ff4d4f" />
            </Space>
            <Space style={{ marginBottom: 12 }} wrap>
                <Input style={{ width: 170 }} prefix={<SearchOutlined />} placeholder="Tìm tên, SĐT..." readOnly />
                <Select style={{ width: 110 }} placeholder="Nguồn" open={false} options={[]} />
                <Select style={{ width: 150 }} placeholder="Sales phụ trách" open={false} options={[]} />
                <Select style={{ width: 130 }} placeholder="Người xóa" open={false} options={[]} />
                <Input style={{ width: 190 }} placeholder="Xóa từ  →  Xóa đến" readOnly />
                <Button>Xóa bộ lọc</Button>
                <Button>Làm mới</Button>
            </Space>
            <Table<DemoTrashRow>
                rowKey="id"
                size="small"
                columns={columns}
                dataSource={DEMO_TRASH_ROWS}
                scroll={{ x: 'max-content' }}
                pagination={{ current: 1, pageSize: 20, total: DEMO_TRASH_ROWS.length, showSizeChanger: false, showTotal: (t) => `Tổng cộng ${t} khách hàng đã xóa` }}
            />
        </div>
    );
}

/** Mẫu vòng đời của 1 khách: Khách hàng -> (Xóa) -> Thùng rác -> Khôi phục (quay lại) hoặc Xóa vĩnh viễn (mất hẳn). */
function TrashLifecycleDemo() {
    const box = (title: string, desc: string, color: string) => (
        <div style={{ border: `1px solid ${color}`, borderRadius: 6, padding: '8px 12px', minWidth: 170, background: '#fff' }}>
            <Tag color={color}>{title}</Tag>
            <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>{desc}</div>
        </div>
    );
    return (
        <Space size={10} align="center" wrap>
            {box('Khách hàng', 'Đang dùng bình thường', 'green')}
            <ArrowRightOutlined />
            <Text type="secondary" style={{ fontSize: 12 }}>nút Xóa<br />(customers.delete)</Text>
            <ArrowRightOutlined />
            {box('Thùng rác', 'Xóa mềm: ẩn khỏi mọi trang, dữ liệu còn nguyên', 'orange')}
            <ArrowRightOutlined />
            <Space orientation="vertical" size={6}>
                {box('Khôi phục', 'Quay lại trang Khách hàng như cũ', 'blue')}
                {box('Xóa vĩnh viễn', 'Mất hẳn, KHÔNG hoàn tác', 'red')}
            </Space>
        </Space>
    );
}

/** Mẫu của trang "Thùng rác". */
export const TRASH_DEMOS: GuideDemo[] = [
    {
        id: 'trash-table',
        title: 'Bảng Thùng rác',
        description: 'Danh sách khách đã xoá mềm; viewer=full (có Xóa vĩnh viễn) hoặc viewer=restore-only (chỉ Khôi phục)',
        params: { viewer: ['full', 'restore-only'] },
        render: (p) => <TrashTableDemo viewer={p.viewer === 'restore-only' ? 'restore-only' : 'full'} />,
    },
    {
        id: 'trash-lifecycle',
        title: 'Vòng đời khách bị xoá',
        description: 'Khách hàng -> Thùng rác -> Khôi phục hoặc Xóa vĩnh viễn',
        render: () => <TrashLifecycleDemo />,
    },
];
