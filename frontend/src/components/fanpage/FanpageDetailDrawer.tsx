'use client';

import { Button, Descriptions, Drawer, Spin, Tabs, Tag } from 'antd';
import { EditOutlined, LinkOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Fanpage } from '@/lib/api/fanpages.api';
import { useFanpage } from '@/lib/hooks/useFanpages';
import { OwnerTag } from './OwnerTag';
import { sortOwnersPrimaryFirst } from '@/lib/utils/fanpageColors';
import { PlatformTag } from './PlatformTag';
import { FanpagePostsTab } from './FanpagePostsTab';
import { FanpageNotesTab } from './FanpageNotesTab';

interface Props {
    fanpageId: number | null;
    onClose: () => void;
    onEdit: (page: Fanpage) => void;
}

const fmt = (iso: string) => dayjs(iso).format('HH:mm DD/MM/YYYY');

export function FanpageDetailDrawer({ fanpageId, onClose, onEdit }: Props) {
    const { fanpage, isLoading } = useFanpage(fanpageId);

    return (
        <Drawer
            open={fanpageId !== null}
            onClose={onClose}
            size={760}
            destroyOnHidden
            title={fanpage?.name ?? 'Chi tiết Page'}
            extra={
                fanpage?.flags.canEdit ? (
                    <Button icon={<EditOutlined />} onClick={() => onEdit(fanpage)}>
                        Sửa
                    </Button>
                ) : null
            }
        >
            {isLoading || !fanpage ? (
                <Spin />
            ) : (
                <Tabs
                    items={[
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
                                            label: 'Trạng thái',
                                            children: fanpage.isActive ? <Tag color="green">Đang theo dõi</Tag> : <Tag>Ngừng theo dõi</Tag>,
                                        },
                                        { key: 'createdBy', label: 'Tạo bởi', children: `${fanpage.createdBy?.name ?? 'Không xác định'} · ${fmt(fanpage.createdAt)}` },
                                        { key: 'updatedAt', label: 'Cập nhật lần cuối', children: fmt(fanpage.updatedAt) },
                                    ]}
                                />
                            ),
                        },
                        { key: 'posts', label: 'Bài đăng', children: <FanpagePostsTab fanpageId={fanpage.id} flags={fanpage.flags} /> },
                        { key: 'notes', label: 'Ghi chú tiến trình', children: <FanpageNotesTab fanpageId={fanpage.id} flags={fanpage.flags} /> },
                    ]}
                />
            )}
        </Drawer>
    );
}