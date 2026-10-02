'use client';

import type { ReactNode } from 'react';
import { Alert, Button, Form, Input, Select, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    DeleteOutlined,
    EditOutlined,
    EyeOutlined,
    PlusOutlined,
    ShareAltOutlined,
} from '@ant-design/icons';
import { UtmTag } from '@/components/utms/UtmTag';
import { HeaderSearchTrigger } from '@/components/common/HeaderSearchTrigger';
import { DemoFrame } from './demo-kit/DemoFrame';
import { CustomerTableByViewer } from './demos/customers.demos';
import { renderSalesTag } from '@/components/customers/CustomerCells';
import { DEMO_CUSTOMERS } from './demo-kit/sample-customers';
import { DEMO_PERSONAS } from './demo-kit/personas';

const DEMO_PERSONAS_IDS = DEMO_PERSONAS.map((p) => p.id);

export { DemoFrame };

/**
 * Kho "mẫu minh hoạ" nhúng vào bài Hướng dẫn bằng khối Markdown:
 *
 *   ```az-demo
 *   status-tags
 *   ```
 *
 * Mỗi mẫu là bản SAO tĩnh của UI thật (cùng component/kiểu dáng antd), dữ liệu mẫu cứng, KHÔNG gọi API,
 * KHÔNG phụ thuộc quyền -> an toàn cho mọi role và không lộ dữ liệu thật. Khung `DemoFrame` đặt `inert`
 * (không bấm/không focus được) để người đọc không tưởng nhầm là thao tác thật.
 *
 * Thêm mẫu mới: thêm 1 phần tử vào `GUIDE_DEMOS` (id chỉ gồm chữ thường/số/gạch ngang). Trình soạn tự
 * liệt kê mẫu mới trong ô "Chèn mẫu minh hoạ"; không cần đổi BE/DB.
 */
export interface GuideDemo {
    id: string;
    title: string;
    description: string;
    /**
     * Tham số `key=value` cho phép trong fence: `{ persona: ['admin', ...] }`. Mẫu không khai báo = không nhận
     * tham số nào (tham số lạ -> khung cảnh báo, không throw).
     */
    params?: Record<string, readonly string[]>;
    /** true = mẫu tự dựng `DemoFrame` (cần `controls` ngoài vùng inert). */
    selfFramed?: boolean;
    render: (params: Record<string, string>) => ReactNode;
}

const SAMPLE_STATUSES = [
    { name: 'Đã chốt', color: 'green' },
    { name: 'Chờ xử lý', color: 'gold' },
    { name: 'Tiềm năng', color: 'blue' },
    { name: 'Mất', color: 'red' },
];

const SAMPLE_SOURCES = [
    { name: 'Facebook', color: 'blue' },
    { name: 'TikTok', color: 'magenta' },
    { name: 'Google', color: 'green' },
    { name: 'Instagram', color: 'purple' },
];

interface SampleCustomer {
    key: number;
    name: string;
    phone: string;
    source: string;
    utm: { name: string; color: string; inactive?: boolean };
    status: string;
    ftd: number | null;
}

const SAMPLE_CUSTOMERS: SampleCustomer[] = [
    { key: 1, name: 'Nguyễn Văn A', phone: '0901234567', source: 'Facebook', utm: { name: 'FB_Q4', color: '#1677ff' }, status: 'Đã chốt', ftd: 1000 },
    { key: 2, name: 'Trần Thị B', phone: '0912345678', source: 'TikTok', utm: { name: 'TT_Summer', color: '#eb2f96' }, status: 'Tiềm năng', ftd: null },
    { key: 3, name: 'Lê Văn C', phone: '0923456789', source: 'Google', utm: { name: 'GG_Old', color: '#52c41a', inactive: true }, status: 'Chờ xử lý', ftd: null },
];

const tagColor = (list: { name: string; color: string }[], name: string) => list.find((x) => x.name === name)?.color;

const customerColumns: ColumnsType<SampleCustomer> = [
    { title: 'STT', key: 'idx', width: 56, render: (_v, _r, i) => i + 1 },
    { title: 'Họ và Tên', dataIndex: 'name', key: 'name', render: (v: string) => <span className="font-medium">{v}</span> },
    { title: 'Số điện thoại', dataIndex: 'phone', key: 'phone' },
    {
        title: 'Nguồn',
        dataIndex: 'source',
        key: 'source',
        render: (v: string) => <Tag color={tagColor(SAMPLE_SOURCES, v)}>{v}</Tag>,
    },
    {
        title: 'UTM',
        key: 'utm',
        render: (_v, r) => <UtmTag name={r.utm.name} color={r.utm.color} inactive={r.utm.inactive} />,
    },
    {
        title: 'Trạng thái',
        dataIndex: 'status',
        key: 'status',
        render: (v: string) => <Tag color={tagColor(SAMPLE_STATUSES, v)}>{v}</Tag>,
    },
    {
        title: 'FTD',
        dataIndex: 'ftd',
        key: 'ftd',
        align: 'right',
        render: (v: number | null) =>
            v == null ? '-' : <span className="font-semibold text-green-600">${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>,
    },
];

export const GUIDE_DEMOS: GuideDemo[] = [
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
        id: 'utm-tags',
        title: 'Tag UTM (bình thường và đã khoá)',
        description: 'UTM đã khoá hiện mờ + gạch ngang',
        render: () => (
            <Space wrap>
                <UtmTag name="FB_Q4" color="#1677ff" />
                <UtmTag name="TT_Summer" color="#eb2f96" />
                <UtmTag name="GG_Old" color="#52c41a" inactive />
            </Space>
        ),
    },
    {
        id: 'row-actions',
        title: 'Cột Thao tác (nút Xoá)',
        description: 'Cột Thao tác chỉ có khi bạn có quyền \"Xoá khách hàng\" (customers.delete); bấm vào dòng để mở chi tiết/sửa',
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
        description: 'Có bộ chọn \"Xem với tư cách\": đổi dòng thấy, cột ẩn và nút theo vai trò/quyền (tham số persona=...)',
        params: { persona: DEMO_PERSONAS_IDS },
        selfFramed: true,
        render: (p) => <CustomerTableByViewer initialPersona={p.persona ?? 'admin'} switchable />,
    },
    {
        id: 'sales-assignment-cell',
        title: 'Ô Sales (Chính + Phụ)',
        description: 'Sales chính = Tag xanh; Sales được chia = badge +N (rê chuột xem danh sách); chưa gán = chữ mờ',
        render: () => (
            <Space direction="vertical">
                {[DEMO_CUSTOMERS[0], DEMO_CUSTOMERS[2], DEMO_CUSTOMERS[1]].map((c) => (
                    <div key={c.id}>{renderSalesTag(c)}</div>
                ))}
            </Space>
        ),
    },
    {
        id: 'customer-form',
        title: 'Form thêm khách hàng',
        description: 'Các trường nhập chính khi bấm "Thêm khách hàng"',
        render: () => (
            <Form layout="vertical" disabled style={{ maxWidth: 420 }}>
                <Form.Item label="Họ và Tên" required>
                    <Input placeholder="Nguyễn Văn A" />
                </Form.Item>
                <Form.Item label="Số điện thoại" required>
                    <Input placeholder="0901234567" />
                </Form.Item>
                <Form.Item label="Nguồn">
                    <Select placeholder="Chọn nguồn" options={SAMPLE_SOURCES.map((s) => ({ value: s.name, label: s.name }))} />
                </Form.Item>
                <Button type="primary" icon={<PlusOutlined />}>
                    Lưu khách hàng
                </Button>
            </Form>
        ),
    },
    {
        id: 'header-search',
        title: 'Ô tìm trang nhanh (Ctrl + K)',
        description: 'Ô tìm kiếm trên thanh Header - bấm hoặc nhấn Ctrl/Cmd + K ở bất kỳ trang nào',
        render: () => <HeaderSearchTrigger />,
    },
    {
        id: 'permission-note',
        title: 'Thông báo khi không đủ quyền',
        description: 'Mẫu hộp cảnh báo thường gặp',
        render: () => (
            <Alert
                type="warning"
                showIcon
                message="Bạn không có quyền thực hiện hành động này"
                description="Liên hệ Quản trị viên nếu bạn cần được cấp quyền."
            />
        ),
    },
];

const DEMO_MAP = new Map(GUIDE_DEMOS.map((d) => [d.id, d]));

export function findGuideDemo(id: string): GuideDemo | undefined {
    return DEMO_MAP.get(id);
}

/** Khung cảnh báo chung (không throw, không lộ gì ngoài id/tham số người soạn tự gõ). */
function DemoWarning({ title, description }: { title: string; description: string }) {
    return <Alert type="warning" showIcon style={{ margin: '16px 0' }} title={title} description={description} />;
}

/** Render 1 mẫu theo id + tham số; id/tham số lạ -> khung cảnh báo. */
export function GuideDemoBlock({ id, params = {}, invalid = [] }: { id: string; params?: Record<string, string>; invalid?: string[] }) {
    const demo = findGuideDemo(id);
    if (!demo) {
        return (
            <DemoWarning
                title={`Không có mẫu minh hoạ \"${id}\"`}
                description={'Mẫu này không tồn tại hoặc đã bị gỡ. Người soạn hãy chọn lại ở ô \"Chèn mẫu minh hoạ\".'}
            />
        );
    }
    const allowed = demo.params ?? {};
    const badKey = Object.keys(params).find((k) => !(k in allowed) || !allowed[k].includes(params[k]));
    if (badKey || invalid.length > 0) {
        return (
            <DemoWarning
                title={`Tham số không hợp lệ cho mẫu \"${id}\"`}
                description={
                    Object.keys(allowed).length === 0
                        ? 'Mẫu này không nhận tham số.'
                        : `Tham số cho phép: ${Object.entries(allowed).map(([k, v]) => `${k}=${v.join('|')}`).join('; ')}`
                }
            />
        );
    }
    const body = demo.render(params);
    return demo.selfFramed ? <>{body}</> : <DemoFrame title={demo.title}>{body}</DemoFrame>;
}
