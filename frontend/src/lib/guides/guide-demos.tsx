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
    render: () => ReactNode;
}

export function DemoFrame({ title, children }: { title: string; children: ReactNode }) {
    return (
        <figure
            data-testid="guide-demo"
            style={{
                margin: '16px 0',
                border: '1px dashed #91caff',
                borderRadius: 8,
                background: '#f0f7ff',
                overflow: 'hidden',
            }}
        >
            <figcaption style={{ padding: '6px 12px', fontSize: 12, color: '#1677ff', borderBottom: '1px dashed #91caff' }}>
                Minh hoạ: {title} (chỉ xem, không thao tác được)
            </figcaption>
            {/* `inert`: không focus/click được; wrapper cuộn ngang cho bảng rộng. */}
            <div inert style={{ padding: 12, overflowX: 'auto', background: '#fff' }}>
                {children}
            </div>
        </figure>
    );
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
        title: 'Nút thao tác trên từng dòng',
        description: 'Xem / Sửa / Chia sẻ / Xoá - nút chỉ hiện khi bạn có quyền tương ứng',
        render: () => (
            <Space>
                <Button type="link" icon={<EyeOutlined />}>
                    Xem
                </Button>
                <Button type="link" icon={<EditOutlined />}>
                    Sửa
                </Button>
                <Button type="link" icon={<ShareAltOutlined />}>
                    Chia sẻ
                </Button>
                <Button type="link" danger icon={<DeleteOutlined />}>
                    Xoá
                </Button>
            </Space>
        ),
    },
    {
        id: 'customer-table',
        title: 'Bảng danh sách khách hàng',
        description: 'Các cột chính của trang Khách hàng (dữ liệu mẫu)',
        render: () => (
            <Table<SampleCustomer>
                size="small"
                columns={customerColumns}
                dataSource={SAMPLE_CUSTOMERS}
                pagination={false}
                scroll={{ x: 'max-content' }}
            />
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

/** Render 1 mẫu theo id; id lạ -> khung cảnh báo (không throw, không lộ gì ngoài id người soạn tự gõ). */
export function GuideDemoBlock({ id }: { id: string }) {
    const demo = findGuideDemo(id);
    if (!demo) {
        return (
            <Alert
                type="warning"
                showIcon
                style={{ margin: '16px 0' }}
                title={`Không có mẫu minh hoạ "${id}"`}
                description="Mẫu này không tồn tại hoặc đã bị gỡ. Người soạn hãy chọn lại ở ô \" Chèn mẫu minh hoạ\"."
                    />
    );
    }
    return <DemoFrame title={demo.title}>{demo.render()}</DemoFrame>;
}