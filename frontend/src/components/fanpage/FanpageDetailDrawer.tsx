'use client';

import { useState } from 'react';
import { Alert, Button, Descriptions, Drawer, Spin, Tabs, Tag } from 'antd';
import { EditOutlined, LinkOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Fanpage } from '@/lib/api/fanpages.api';
import { useFanpage, useFanpageLeads } from '@/lib/hooks/useFanpages';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { OwnerTag } from './OwnerTag';
import { sortOwnersPrimaryFirst } from '@/lib/utils/fanpageColors';
import { PlatformTag } from './PlatformTag';
import { FanpagePostsTab } from './FanpagePostsTab';
import { FanpageNotesTab } from './FanpageNotesTab';
import { FanpageOverviewTab } from './FanpageOverviewTab';
import { FanpageHistoryTab } from './FanpageHistoryTab';
import { FanpageSnapshotsTab } from './FanpageSnapshotsTab';
import { HealthTag } from './HealthTag';
import { FanpageUtmsTab } from './FanpageUtmsTab';
import { FanpageLeadsTab } from './FanpageLeadsTab';

interface Props {
    fanpageId: number | null;
    onClose: () => void;
    onEdit: (page: Fanpage) => void;
}

const fmt = (iso: string) => dayjs(iso).format('HH:mm DD/MM/YYYY');

export function FanpageDetailDrawer({ fanpageId, onClose, onEdit }: Props) {
    const { fanpage, isLoading } = useFanpage(fanpageId);
    // GĐ5b: tab Data khách hàng chỉ render khi có `customers.view` (không render rồi báo 403); mất quyền giữa chừng -> tab biến mất.
    const { can } = useMyPermissions();
    const canViewCustomers = can('customers.view');
    const canCreateCustomers = can('customers.create');
    // Cùng tham số mặc định với tab (trang 1, không tìm kiếm) -> dùng chung cache: số trên nhãn == tổng trong bảng (X32).
    const { leads } = useFanpageLeads(fanpageId, { page: 1, limit: 10 }, canViewCustomers && fanpage != null);
    // Tab gắn với id Page: mở Page khác tự về "Tổng quan" mà không cần setState trong effect.
    const [tabState, setTabState] = useState<{ id: number | null; key: string }>({ id: null, key: 'overview' });
    const activeKey = tabState.id === fanpageId ? tabState.key : 'overview';
    const setActiveKey = (key: string) => setTabState({ id: fanpageId, key });
    // Lọc bài theo ngày khi bấm ô heatmap; gắn với id Page để mở Page khác tự reset.
    const [dateState, setDateState] = useState<{ id: number | null; date: string | null }>({ id: null, date: null });
    const postDate = dateState.id === fanpageId ? dateState.date : null;
    const openPosts = (date?: string) => {
        setDateState({ id: fanpageId, date: date ?? null });
        setActiveKey('posts');
    };

    return (
        <Drawer
            open={fanpageId !== null}
            onClose={onClose}
            size={760}
            destroyOnHidden
            title={fanpage?.name ?? 'Chi tiết Page'}
            extra={
                fanpage?.flags.canEdit && !fanpage.archivedAt ? (
                    <Button icon={<EditOutlined />} onClick={() => onEdit(fanpage)}>
                        Sửa
                    </Button>
                ) : null
            }
        >
            {isLoading || !fanpage ? (
                <Spin />
            ) : (
                <>
                {fanpage.archivedAt && (
                    <Alert
                        type="info"
                        showIcon
                        style={{ marginBottom: 12 }}
                        title={`Page đã lưu trữ lúc ${fmt(fanpage.archivedAt)} — bỏ lưu trữ ở danh sách để chỉnh sửa lại.`}
                    />
                )}
                <Tabs
                    activeKey={activeKey}
                    onChange={setActiveKey}
                    items={[
                        {
                            key: 'overview',
                            label: 'Tổng quan',
                            children: <FanpageOverviewTab fanpage={fanpage} onOpenPosts={openPosts} />,
                        },
                        {
                            key: 'info',
                            label: 'Thông tin',
                            children: (
                                <Descriptions
                                    column={1}
                                    bordered
                                    size="small"
                                    items={[
                                        { key: 'platform', label: 'Nền tảng', children: <PlatformTag platform={fanpage.platform} /> },
                                        {
                                            key: 'url',
                                            label: 'Link Page',
                                            children: (
                                                <a href={fanpage.url} target="_blank" rel="noopener noreferrer">
                                                    <LinkOutlined /> {fanpage.url}
                                                </a>
                                            ),
                                        },
                                        {
                                            key: 'owner',
                                            label: 'Người phụ trách',
                                            children: fanpage.owners?.length ? (
                                                sortOwnersPrimaryFirst(fanpage.owners, fanpage.ownerId).map((o) => (
                                                    <OwnerTag key={o.id} user={o} primary={o.id === fanpage.ownerId && fanpage.owners.length > 1} />
                                                ))
                                            ) : (
                                                'Chưa có'
                                            ),
                                        },
                                        {
                                            key: 'status',
                                            label: 'Theo dõi',
                                            children: fanpage.isActive ? <Tag color="green">Đang theo dõi</Tag> : <Tag>Tạm ngừng</Tag>,
                                        },
                                        {
                                            key: 'health',
                                            label: 'Tình trạng Page',
                                            children: <HealthTag health={fanpage.health} note={fanpage.healthNote} />,
                                        },
                                        { key: 'createdBy', label: 'Tạo bởi', children: `${fanpage.createdBy?.name ?? 'Không xác định'} · ${fmt(fanpage.createdAt)}` },
                                        { key: 'updatedAt', label: 'Cập nhật lần cuối', children: fmt(fanpage.updatedAt) },
                                    ]}
                                />
                            ),
                        },
                        {
                            key: 'posts',
                            label: 'Bài đăng',
                            children: (
                                <FanpagePostsTab
                                    fanpageId={fanpage.id}
                                    flags={fanpage.flags}
                                    dateFilter={postDate}
                                    onClearDateFilter={() => setDateState({ id: fanpageId, date: null })}
                                />
                            ),
                        },
                        {
                            key: 'metrics',
                            label: 'Số liệu',
                            children: <FanpageSnapshotsTab fanpageId={fanpage.id} flags={fanpage.flags} archived={!!fanpage.archivedAt} />,
                        },
                        { key: 'utms', label: `UTM${fanpage.utms?.length ? ` (${fanpage.utms.length})` : ''}`, children: <FanpageUtmsTab fanpage={fanpage} /> },
                        ...(canViewCustomers
                            ? [
                                  {
                                      key: 'leads',
                                      label: `Data khách hàng${leads ? ` (${leads.total})` : ''}`,
                                      children: <FanpageLeadsTab fanpage={fanpage} />,
                                  },
                              ]
                            : []),
                        {
                            key: 'notes',
                            label: 'Ghi chú tiến trình',
                            children: (
                                <FanpageNotesTab
                                    fanpageId={fanpage.id}
                                    flags={fanpage.flags}
                                    canCreateLead={canCreateCustomers}
                                    archived={!!fanpage.archivedAt}
                                    platformName={fanpage.platform?.name}
                                />
                            ),
                        },
                        { key: 'history', label: 'Lịch sử', children: <FanpageHistoryTab fanpageId={fanpage.id} /> },
                    ]}
                />
                </>
            )}
        </Drawer>
    );
}