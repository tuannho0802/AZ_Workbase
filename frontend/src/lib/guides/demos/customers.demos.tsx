'use client';

import { useState } from 'react';
import { Alert, Button, Popconfirm, Segmented, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, DownloadOutlined, PlusOutlined, ReloadOutlined, UploadOutlined, UsergroupAddOutlined } from '@ant-design/icons';
import { UtmTag } from '@/components/utms/UtmTag';
import { renderJoinedGroupsTag, renderMarketingTag, renderSalesTag } from '@/components/customers/CustomerCells';
import dayjs from 'dayjs';
import { DemoFrame } from '../demo-kit/DemoFrame';
import { DEMO_PERSONAS, findPersona } from '../demo-kit/personas';
import { DEMO_CUSTOMERS, type DemoCustomer } from '../demo-kit/sample-customers';
import { COL, computeCustomerTableView } from '../demo-kit/compute-view';

const { Text } = Typography;

const SOURCE_COLORS: Record<string, string> = { Facebook: 'blue', TikTok: 'magenta', Google: 'green', Instagram: 'purple' };

const TOOLBAR_ICON: Record<string, React.ReactNode> = {
    'Làm mới': <ReloadOutlined />,
    'Thêm khách hàng': <PlusOutlined />,
    'Nhập Excel': <UploadOutlined />,
    'Xuất Excel': <DownloadOutlined />,
};

/** Cột bảng khớp `customers/page.tsx`; Sales/Marketing/Joined dùng đúng ô thật (`CustomerCells`). */
const ALL_COLUMNS: Record<string, ColumnsType<DemoCustomer>[number]> = {
    [COL.stt]: { title: 'STT', key: COL.stt, width: 40, align: 'center', render: (_v, _r, i) => i + 1 },
    [COL.inputDate]: { title: 'Ngày nhập', key: COL.inputDate, width: 100, render: (_v, r) => dayjs(r.inputDate).format('DD/MM/YYYY') },
    [COL.name]: { title: 'Họ và tên', key: COL.name, width: 170, render: (_v, r) => <Text strong style={{ color: '#1890ff' }}>{r.name}</Text> },
    [COL.phone]: {
        title: 'SĐT',
        key: COL.phone,
        width: 115,
        render: (_v, r) => (r.phone ? r.phone : <span style={{ color: '#aaa', fontStyle: 'italic' }}>Chưa có SDT</span>),
    },
    [COL.source]: { title: 'Nguồn', key: COL.source, width: 90, render: (_v, r) => <Tag color={SOURCE_COLORS[r.source]}>{r.source}</Tag> },
    [COL.utm]: { title: 'UTM', key: COL.utm, width: 130, render: (_v, r) => (r.utm ? <UtmTag name={r.utm.name} color={r.utm.color} /> : '') },
    [COL.sales]: { title: 'Sales (Chính + Phụ)', key: COL.sales, width: 170, render: (_v, r) => renderSalesTag(r) },
    [COL.marketing]: { title: 'Marketing', key: COL.marketing, width: 125, render: (_v, r) => renderMarketingTag(r) },
    [COL.status]: { title: 'Trạng thái', key: COL.status, width: 110, render: (_v, r) => <Tag color={r.status.color}>{r.status.name}</Tag> },
    [COL.joined]: { title: 'Đã joined nhóm', key: COL.joined, width: 125, align: 'center', render: (_v, r) => renderJoinedGroupsTag(r) },
    [COL.deposit]: {
        title: 'Nạp tiền',
        key: COL.deposit,
        width: 110,
        align: 'right',
        render: (_v, r) => (
            <Text strong style={{ color: r.totalDeposit > 0 ? '#52c41a' : '#bfbfbf' }}>
                ${r.totalDeposit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </Text>
        ),
    },
    [COL.notes]: {
        title: 'Ghi chú gần nhất',
        key: COL.notes,
        width: 170,
        render: (_v, r) => (r.recentNote ? <Tooltip title={r.recentNote}><span>{r.recentNote.slice(0, 20)}…</span></Tooltip> : ''),
    },
    [COL.action]: {
        title: 'Thao tác',
        key: COL.action,
        width: 70,
        align: 'center',
        render: () => (
            <Popconfirm title="Xóa khách hàng" description="Bạn có chắc muốn xóa?">
                <Button type="text" danger size="small" icon={<DeleteOutlined />} title="Xóa khách hàng" />
            </Popconfirm>
        ),
    },
};

/**
 * Mẫu bảng Khách hàng theo người xem. `switchable` = có bộ chọn "Xem với tư cách" (ngoài vùng inert).
 * Dòng/cột/nút do `computeCustomerTableView` quyết định (xem file đó để biết nguồn đối chiếu code thật).
 */
export function CustomerTableByViewer({ initialPersona, switchable }: { initialPersona: string; switchable: boolean }) {
    const [personaId, setPersonaId] = useState(initialPersona);
    const persona = findPersona(personaId) ?? DEMO_PERSONAS[0];
    const view = computeCustomerTableView(DEMO_CUSTOMERS, persona);
    const columns = view.columns.map((k) => ALL_COLUMNS[k]);
    const canAssign = view.toolbar.some((t) => t.startsWith('Gán cho Sales'));

    const controls = switchable ? (
        <Space size={8} wrap>
            <Text type="secondary">Xem với tư cách:</Text>
            <Segmented
                size="small"
                value={persona.id}
                onChange={(v) => setPersonaId(String(v))}
                options={DEMO_PERSONAS.map((p) => ({ value: p.id, label: p.label }))}
            />
        </Space>
    ) : undefined;

    return (
        <DemoFrame title={`Bảng khách hàng - ${persona.roleLabel}`} controls={controls}>
            <Space wrap style={{ marginBottom: 8 }} data-testid="demo-toolbar">
                {view.toolbar.map((t) => (
                    <Button key={t} size="small" type={t === 'Thêm khách hàng' ? 'primary' : 'default'} icon={TOOLBAR_ICON[t] ?? <UsergroupAddOutlined />} disabled={t.startsWith('Gán')}>
                        {t}
                    </Button>
                ))}
            </Space>
            <Table<DemoCustomer>
                size="small"
                rowKey="id"
                columns={columns}
                dataSource={view.rows}
                pagination={false}
                scroll={{ x: 'max-content' }}
                rowSelection={canAssign ? { columnWidth: 38 } : undefined}
                locale={{ emptyText: 'Không có khách hàng nào trong phạm vi của bạn' }}
            />
            <Alert type="info" showIcon style={{ marginTop: 8 }} message={persona.note} />
        </DemoFrame>
    );
}
