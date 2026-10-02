'use client';

import { useState } from 'react';
import { Alert, Button, Form, Input, Popconfirm, Segmented, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, DownloadOutlined, PlusOutlined, ReloadOutlined, UploadOutlined, UsergroupAddOutlined } from '@ant-design/icons';
import { UtmTag } from '@/components/utms/UtmTag';
import { renderJoinedGroupsTag, renderMarketingTag, renderSalesTag } from '@/components/customers/CustomerCells';
import dayjs from 'dayjs';
import { DemoFrame } from '../demo-kit/DemoFrame';
import { DEMO_PERSONAS, findPersona } from '../demo-kit/personas';
import { DEMO_CUSTOMERS, type DemoCustomer } from '../demo-kit/sample-customers';
import { COL, computeCustomerTableView } from '../demo-kit/compute-view';
import { SAMPLE_SOURCES, SAMPLE_STATUSES } from '../demo-kit/sample-tags';
import type { GuideDemo } from '../guide-demo.types';

const { Text } = Typography;

const SOURCE_COLORS: Record<string, string> = Object.fromEntries(SAMPLE_SOURCES.map((x) => [x.name, x.color]));

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
            <Alert type="info" showIcon style={{ marginTop: 8 }} title={persona.note} />
        </DemoFrame>
    );
}

const PERSONA_IDS = DEMO_PERSONAS.map((p) => p.id);

/** Mẫu của module Khách hàng (trang `/customers`). Thứ tự = thứ tự trong ô "Chèn mẫu minh hoạ" của trình soạn. */
export const CUSTOMER_DEMOS: GuideDemo[] = [
    {
        id: 'status-tags',
        title: 'Tag trạng thái khách hàng',
        description: 'Màu + tên trạng thái (màu thật do Admin cấu hình ở "Quản lý Status khách")',
        render: () => (
            <Space wrap>
                {SAMPLE_STATUSES.map((s) => (
                    <Tag key={s.name} color={s.color}>
                        {s.name}
                    </Tag>
                ))}
            </Space>
        ),
    },
    {
        id: 'source-tags',
        title: 'Tag nguồn khách hàng',
        description: 'Màu theo nguồn (cấu hình ở "Quản lý nguồn")',
        render: () => (
            <Space wrap>
                {SAMPLE_SOURCES.map((s) => (
                    <Tag key={s.name} color={s.color}>
                        {s.name}
                    </Tag>
                ))}
            </Space>
        ),
    },
    {
        id: 'row-actions',
        title: 'Cột Thao tác (nút Xoá)',
        description: 'Cột Thao tác chỉ có khi bạn có quyền "Xoá khách hàng" (customers.delete); bấm vào dòng để mở chi tiết/sửa',
        render: () => (
            <Space>
                <Button type="text" danger size="small" icon={<DeleteOutlined />} title="Xóa khách hàng" />
                <span style={{ color: '#8c8c8c', fontSize: 12 }}>Nút Xoá sẽ hỏi xác nhận trước khi đưa khách vào Thùng rác</span>
            </Space>
        ),
    },
    {
        id: 'customer-table',
        title: 'Bảng danh sách khách hàng',
        description: 'Các cột thật của trang Khách hàng (dữ liệu mẫu, xem như Assistant)',
        selfFramed: true,
        render: () => <CustomerTableByViewer initialPersona="assistant" switchable={false} />,
    },
    {
        id: 'customer-table-by-viewer',
        title: 'Bảng khách hàng theo người xem',
        description: 'Có bộ chọn "Xem với tư cách": đổi dòng thấy, cột ẩn và nút theo vai trò/quyền (tham số persona=...)',
        params: { persona: PERSONA_IDS },
        selfFramed: true,
        render: (p) => <CustomerTableByViewer initialPersona={p.persona ?? 'admin'} switchable />,
    },
    {
        id: 'sales-assignment-cell',
        title: 'Ô Sales (Chính + Phụ)',
        description: 'Sales chính = Tag xanh; Sales được chia = badge +N (rê chuột xem danh sách); chưa gán = chữ mờ',
        render: () => (
            <Space orientation="vertical">
                {[DEMO_CUSTOMERS[0], DEMO_CUSTOMERS[2], DEMO_CUSTOMERS[1]].map((c) => (
                    <div key={c.id}>{renderSalesTag(c)}</div>
                ))}
            </Space>
        ),
    },
    {
        id: 'customer-form',
        title: 'Form thêm khách hàng',
        description: 'Các trường chính khi bấm "Thêm khách hàng" (rút gọn - form thật còn UTM, nhóm, Sales/Marketing phụ trách, ngày, trạng thái, ghi chú)',
        render: () => (
            <Form layout="vertical" disabled style={{ maxWidth: 420 }}>
                <Form.Item label="Họ tên" required>
                    <Input placeholder="Nguyễn Văn A" />
                </Form.Item>
                <Form.Item label="Số điện thoại (Tuỳ chọn)">
                    <Input placeholder="Số điện thoại (Không bắt buộc)" />
                </Form.Item>
                <Form.Item label="Email">
                    <Input placeholder="example@gmail.com" />
                </Form.Item>
                <Form.Item label="Nguồn" required>
                    <Select placeholder="Chọn nguồn" options={SAMPLE_SOURCES.map((s) => ({ value: s.name, label: s.name }))} />
                </Form.Item>
                <Form.Item label="Ngày nhập data" required>
                    <Input placeholder="DD/MM/YYYY" />
                </Form.Item>
                <Button type="primary" icon={<PlusOutlined />}>
                    Thêm khách hàng
                </Button>
            </Form>
        ),
    },
];
