'use client';

import { Button, Segmented, Space, Switch, Tag, Typography } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import type { GuideDemo } from '../guide-demo.types';
import type { NotificationItem } from '../../types/notification.types';
import { NotificationRow } from '@/components/notifications/NotificationRow';

const { Text } = Typography;

const noop = () => undefined;

function sample(p: Partial<NotificationItem> & Pick<NotificationItem, 'id' | 'title' | 'category' | 'eventType'>): NotificationItem {
    return {
        relation: 'default',
        actorId: null,
        entityType: null,
        entityId: null,
        subEntityType: null,
        subEntityId: null,
        broadcastId: null,
        body: null,
        params: null,
        occurrences: 1,
        isRead: false,
        readAt: null,
        createdAt: '2026-10-07T08:00:00.000Z',
        sortAt: new Date(Date.now() - 5 * 60_000).toISOString(),
        ...p,
    };
}

/** Dữ liệu mẫu (tên người/khách là giả định). Hiển thị bằng `NotificationRow` THẬT nên không lệch giao diện. */
const DEMO_ACTIVE: NotificationItem[] = [
    sample({ id: 1, category: 'customer', eventType: 'customer.assigned', entityType: 'customer', entityId: 11, title: 'Nguyễn An chia cho bạn khách hàng Phạm Quang (Sales được chia).' }),
    sample({ id: 2, category: 'task', eventType: 'task.status_changed', entityType: 'periodic_task', entityId: 7, occurrences: 3, sortAt: new Date(Date.now() - 50 * 60_000).toISOString(), title: 'Trần Bình đổi trạng thái công việc Báo cáo tuần.' }),
    sample({ id: 3, category: 'manual', eventType: 'manual.broadcast', broadcastId: 4, params: { senderName: 'Admin Hệ thống' }, sortAt: new Date(Date.now() - 3 * 3600_000).toISOString(), title: 'Lịch nghỉ lễ sắp tới' }),
    sample({ id: 4, category: 'customer', eventType: 'customer.deleted', params: { unavailable: true }, isRead: true, readAt: '2026-10-06T09:00:00.000Z', sortAt: new Date(Date.now() - 26 * 3600_000).toISOString(), title: 'Admin Hệ thống đã xoá khách hàng Đỗ Hạnh.' }),
];

const DEMO_HIDDEN: NotificationItem[] = [
    sample({ id: 5, category: 'manual', eventType: 'manual.broadcast', broadcastId: 2, isRead: true, readAt: '2026-10-01T09:00:00.000Z', params: { senderName: 'Admin Hệ thống' }, sortAt: new Date(Date.now() - 6 * 86400_000).toISOString(), title: 'Nhắc nộp báo cáo cuối tháng' }),
    sample({ id: 6, category: 'task', eventType: 'task.updated', entityType: 'periodic_task', entityId: 9, isRead: true, readAt: '2026-10-02T09:00:00.000Z', sortAt: new Date(Date.now() - 5 * 86400_000).toISOString(), title: 'Lê Cường cập nhật công việc Đối soát công nợ.' }),
];

/** Mẫu trang `/thong-bao`: hàng bộ lọc đúng chữ thật + các dòng `NotificationRow` thật. `view=hidden` = tab "Đã ẩn". */
function NotificationListDemo({ view }: { view: 'all' | 'hidden' }) {
    const hidden = view === 'hidden';
    const items = hidden ? DEMO_HIDDEN : DEMO_ACTIVE;
    return (
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, background: '#fff', maxWidth: 820 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 16, borderBottom: '1px solid #f0f0f0' }}>
                <Segmented
                    value={hidden ? 'hidden' : 'all'}
                    options={[
                        { label: 'Tất cả', value: 'all' },
                        { label: 'Khách hàng', value: 'customer' },
                        { label: 'Công việc', value: 'task' },
                        { label: 'Thông báo', value: 'manual' },
                        { label: 'Đã ẩn', value: 'hidden' },
                    ]}
                />
                {!hidden && (
                    <Space size={16}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                            <Switch size="small" checked={false} /> Chỉ chưa đọc
                        </label>
                        <Button>Đọc tất cả</Button>
                    </Space>
                )}
            </div>
            {items.map((item) => (
                <NotificationRow key={item.id} item={item} onOpen={noop} onRemove={noop} onRestore={noop} onPurge={noop} mode={hidden ? 'hidden' : 'active'} />
            ))}
        </div>
    );
}

/** Mẫu 3 loại thông báo và đích khi bấm vào (đúng `resolveNotificationTarget`). */
function NotificationKindsDemo() {
    const rows: { tag: string; color: string; example: string; click: string }[] = [
        { tag: 'Khách hàng', color: '#1890ff', example: 'Được chia khách, đổi người phụ trách, khách có ghi chú mới…', click: 'Mở trang Khách hàng, tự mở chi tiết khách đó (nhiều khách gộp: mở danh sách)' },
        { tag: 'Công việc', color: '#fa8c16', example: 'Được giao việc, đổi trạng thái, khoá/mở khoá, sắp đến hạn…', click: 'Mở trang Công việc định kỳ, trỏ tới việc đó' },
        { tag: 'Thông báo', color: '#722ed1', example: 'Thông báo do Admin/người có quyền gửi thủ công', click: 'Mở cửa sổ chi tiết ngay tại chỗ, đọc đủ nội dung' },
    ];
    return (
        <Space orientation="vertical" size={8} style={{ width: '100%' }}>
            {rows.map((r) => (
                <div key={r.tag} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, border: '1px solid #f0f0f0', borderRadius: 6, padding: '8px 12px', background: '#fff' }}>
                    <Tag color={r.color} style={{ margin: 0 }}>{r.tag}</Tag>
                    <Text style={{ fontSize: 12 }}>{r.example}</Text>
                    <ArrowRightOutlined />
                    <Text type="secondary" style={{ fontSize: 12 }}>Bấm vào: {r.click}</Text>
                </div>
            ))}
            <Text type="secondary" style={{ fontSize: 12 }}>Khách/việc đã bị xoá: dòng mờ, nhãn “Không khả dụng”, bấm vào chỉ hiện nhắc nhẹ, không chuyển trang.</Text>
        </Space>
    );
}

/** Mẫu vòng đời: Hiện → Ẩn (nút ✕) → tab Đã ẩn → Khôi phục hoặc Xoá vĩnh viễn. */
function NotificationHideFlowDemo() {
    const box = (title: string, desc: string, color: string) => (
        <div style={{ border: `1px solid ${color}`, borderRadius: 6, padding: '8px 12px', minWidth: 170, background: '#fff' }}>
            <Tag color={color}>{title}</Tag>
            <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>{desc}</div>
        </div>
    );
    return (
        <Space size={10} align="center" wrap>
            {box('Hộp thư', 'Thông báo đang hiện, có thể chưa đọc', 'blue')}
            <ArrowRightOutlined />
            <Text type="secondary" style={{ fontSize: 12 }}>nút ✕<br />“Ẩn thông báo”</Text>
            <ArrowRightOutlined />
            {box('Đã ẩn', 'Chỉ ẩn khỏi hộp thư, dữ liệu còn nguyên', 'orange')}
            <ArrowRightOutlined />
            <Space orientation="vertical" size={6}>
                {box('Khôi phục', 'Quay lại hộp thư', 'green')}
                {box('Xoá vĩnh viễn', 'Mất hẳn, KHÔNG hoàn tác', 'red')}
            </Space>
        </Space>
    );
}

export const NOTIFICATION_DEMOS: GuideDemo[] = [
    {
        id: 'notification-list',
        title: 'Trang Thông báo',
        description: 'Bộ lọc loại + dòng thông báo thật; view=all (hộp thư) hoặc view=hidden (tab Đã ẩn: Khôi phục / Xoá vĩnh viễn)',
        params: { view: ['all', 'hidden'] },
        render: (p) => <NotificationListDemo view={p.view === 'hidden' ? 'hidden' : 'all'} />,
    },
    {
        id: 'notification-kinds',
        title: '3 loại thông báo và đích khi bấm',
        description: 'Khách hàng / Công việc / Thông báo thủ công: ví dụ và nơi bấm vào sẽ dẫn tới',
        render: () => <NotificationKindsDemo />,
    },
    {
        id: 'notification-hide-flow',
        title: 'Ẩn, khôi phục, xoá vĩnh viễn',
        description: 'Hai bước: Ẩn trước, sau đó mới xoá vĩnh viễn được',
        render: () => <NotificationHideFlowDemo />,
    },
];
