'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { App, Button, Empty, Popconfirm, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { DeleteOutlined, EditOutlined, EyeOutlined, LinkOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useDebounce } from '@/lib/hooks/useDebounce';
import {
    useDeleteFanpage,
    useFanpageOwnerOptions,
    useFanpagePlatforms,
    useFanpages,
} from '@/lib/hooks/useFanpages';
import type { Fanpage, FanpageFilters } from '@/lib/api/fanpages.api';
import { ListFilterBar } from '@/components/common/ListFilterBar';
import { PlatformTag } from '@/components/fanpage/PlatformTag';
import { OwnerTag } from '@/components/fanpage/OwnerTag';
import { sortOwnersPrimaryFirst } from '@/lib/utils/fanpageColors';
import { FanpageFormModal } from '@/components/fanpage/FanpageFormModal';
import { FanpageDetailDrawer } from '@/components/fanpage/FanpageDetailDrawer';
import { FanpagePlatformsModal } from '@/components/fanpage/FanpagePlatformsModal';
import { toastApiError } from '@/lib/utils/error-message.util';

const { Title, Text } = Typography;

/** Trạng thái Page - 1 nguồn cho cả cột bảng, dropdown lọc (cùng màu Tag). */
const STATUS_TAG: Record<'true' | 'false', { color?: string; label: string }> = {
    true: { color: 'green', label: 'Đang theo dõi' },
    false: { label: 'Ngừng theo dõi' },
};

const MAX_OWNER_TAGS = 2;

export default function FanpagePage() {
    const router = useRouter();
    const { message } = App.useApp();
    const { can, scope, isLoading: permissionsLoading } = useMyPermissions();

    // Khớp nav-config (`fanpages.view`) - không cho mở bằng URL trực tiếp khi thiếu quyền.
    const canView = can('fanpages.view');
    useEffect(() => {
        if (!permissionsLoading && !canView) {
            message.warning('Bạn không có quyền truy cập trang này');
            router.replace('/');
        }
    }, [permissionsLoading, canView, router, message]);

    const [search, setSearch] = useState('');
    const [platformId, setPlatformId] = useState<number | undefined>();
    const [ownerId, setOwnerId] = useState<number | undefined>();
    const [status, setStatus] = useState<'true' | 'false' | undefined>();
    const debouncedSearch = useDebounce(search, 300);

    const filters: FanpageFilters = {
        ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
        ...(platformId != null ? { platformId } : {}),
        ...(ownerId != null ? { ownerId } : {}),
        ...(status ? { isActive: status } : {}),
    };

    const { fanpages, capabilities, isLoading, isFetching } = useFanpages(filters, canView);
    const { platforms } = useFanpagePlatforms(false, canView);
    // Bộ lọc "Người phụ trách" chỉ có ý nghĩa khi xem được Page của người khác (scope view rộng).
    const viewScope = scope('fanpages.view');
    const showOwnerFilter = viewScope === 'all' || viewScope === 'department';
    const { owners } = useFanpageOwnerOptions(canView && showOwnerFilter);
    const deleteMut = useDeleteFanpage();

    const [formState, setFormState] = useState<{ open: boolean; page?: Fanpage }>({ open: false });
    const [detailId, setDetailId] = useState<number | null>(null);
    const [platformsOpen, setPlatformsOpen] = useState(false);

    const handleDelete = async (page: Fanpage) => {
        try {
            await deleteMut.mutateAsync(page.id);
            message.success('Đã xoá Page');
        } catch (err) {
            toastApiError(message, err, 'Không thể xoá Page');
        }
    };

    const columns: ColumnsType<Fanpage> = [
        {
            title: 'Nền tảng',
            key: 'platform',
            width: 130,
            render: (_: unknown, p) => <PlatformTag platform={p.platform} />,
        },
        {
            title: 'Tên Page',
            key: 'name',
            render: (_: unknown, p) => (
                <Space orientation="vertical" size={0}>
                    <Button type="link" style={{ padding: 0, height: 'auto' }} onClick={() => setDetailId(p.id)}>
                        {p.name}
                    </Button>
                    <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>
                        <LinkOutlined /> Mở Page
                    </a>
                </Space>
            ),
        },
        {
            title: 'Người phụ trách',
            key: 'owner',
            width: 220,
            render: (_: unknown, p) => {
                const owners = sortOwnersPrimaryFirst(p.owners, p.ownerId);
                if (owners.length === 0) return <Text type="secondary">Chưa có</Text>;
                const shown = owners.slice(0, MAX_OWNER_TAGS);
                const hidden = owners.slice(MAX_OWNER_TAGS);
                return (
                    <span>
                        {shown.map((o) => (
                            <OwnerTag key={o.id} user={o} primary={o.id === p.ownerId && owners.length > 1} />
                        ))}
                        {hidden.length > 0 && (
                            <Tooltip title={hidden.map((o) => o.name).join(', ')}>
                                <Tag>+{hidden.length}</Tag>
                            </Tooltip>
                        )}
                    </span>
                );
            },
        },
        { title: 'Bài đăng', dataIndex: 'postCount', width: 90, align: 'right', render: (n?: number) => n ?? 0 },
        { title: 'Ghi chú', dataIndex: 'noteCount', width: 90, align: 'right', render: (n?: number) => n ?? 0 },
        {
            title: 'Trạng thái',
            dataIndex: 'isActive',
            width: 130,
            render: (active: boolean) => {
                const st = STATUS_TAG[active ? 'true' : 'false'];
                return <Tag color={st.color}>{st.label}</Tag>;
            },
        },
        {
            title: 'Cập nhật',
            dataIndex: 'updatedAt',
            width: 140,
            render: (d: string) => dayjs(d).format('HH:mm DD/MM/YYYY'),
        },
        {
            title: 'Thao tác',
            key: 'actions',
            width: 130,
            fixed: 'right',
            render: (_: unknown, p) => (
                <Space size="small">
                    <Tooltip title="Xem chi tiết">
                        <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => setDetailId(p.id)} />
                    </Tooltip>
                    {p.flags.canEdit && (
                        <Tooltip title="Sửa">
                            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => setFormState({ open: true, page: p })} />
                        </Tooltip>
                    )}
                    {p.flags.canDelete && (
                        <Popconfirm
                            title="Xoá Page này?"
                            description="Toàn bộ bài đăng và ghi chú của Page cũng bị xoá."
                            okText="Xoá"
                            cancelText="Huỷ"
                            onConfirm={() => handleDelete(p)}
                        >
                            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                    )}
                </Space>
            ),
        },
    ];

    if (!permissionsLoading && !canView) return null;

    return (
        <div>
            <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }} wrap>
                <Title level={4} style={{ margin: 0 }}>
                    Quản lý Fanpage
                </Title>
                <Space wrap>
                    {can('fanpage_platforms.manage') && (
                        <Button icon={<SettingOutlined />} onClick={() => setPlatformsOpen(true)}>
                            Nền tảng
                        </Button>
                    )}
                    {capabilities.canCreate && (
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormState({ open: true })}>
                            Thêm Page
                        </Button>
                    )}
                </Space>
            </Space>

            <ListFilterBar
                searchValue={search}
                onSearchChange={setSearch}
                searchPlaceholder="Tìm theo tên hoặc link Page..."
                dropdowns={[
                    {
                        key: 'platform',
                        placeholder: 'Nền tảng',
                        value: platformId,
                        onChange: setPlatformId,
                        searchable: true,
                        options: platforms.map((p) => ({ value: p.id, label: <PlatformTag platform={p} />, searchText: p.name })),
                    },
                    ...(showOwnerFilter
                        ? [
                            {
                                key: 'owner',
                                placeholder: 'Người phụ trách',
                                value: ownerId,
                                onChange: setOwnerId,
                                searchable: true,
                                options: owners.map((u) => ({
                                    value: u.id,
                                    label: <OwnerTag user={u} />,
                                    searchText: `${u.name} ${u.employeeCode ?? ''}`,
                                })),
                            },
                        ]
                        : []),
                    {
                        key: 'status',
                        placeholder: 'Trạng thái',
                        value: status,
                        onChange: setStatus,
                        options: (['true', 'false'] as const).map((v) => ({
                            value: v,
                            label: <Tag color={STATUS_TAG[v].color}>{STATUS_TAG[v].label}</Tag>,
                        })),
                    },
                ]}
            />

            <Table<Fanpage>
                rowKey="id"
                loading={isLoading || isFetching}
                columns={columns}
                dataSource={fanpages}
                scroll={{ x: 'max-content' }}
                pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `Tổng cộng ${t} Page` }}
                locale={{ emptyText: <Empty description="Chưa có Page nào" /> }}
            />

            <FanpageFormModal
                open={formState.open}
                fanpage={formState.page}
                canAssignOwner={capabilities.canAssignOwner}
                onClose={() => setFormState({ open: false })}
            />
            <FanpageDetailDrawer
                fanpageId={detailId}
                onClose={() => setDetailId(null)}
                onEdit={(page) => setFormState({ open: true, page })}
            />
            <FanpagePlatformsModal open={platformsOpen} onClose={() => setPlatformsOpen(false)} />
        </div>
    );
}