'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { App, Badge, Button, Card, Dropdown, Empty, Grid, Space, Table, Tabs, Tag, Tooltip, Typography } from 'antd';
import type { MenuProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, EyeOutlined, InboxOutlined, LinkOutlined, MoreOutlined, PlusOutlined, SettingOutlined, UndoOutlined } from '@ant-design/icons';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useDebounce } from '@/lib/hooks/useDebounce';
import {
    useArchiveFanpage,
    useDeleteFanpage,
    useFanpageHealthStatuses,
    useFanpageOverview,
    useFanpageOwnerOptions,
    useFanpagePlatforms,
    useFanpages,
} from '@/lib/hooks/useFanpages';
import type { Fanpage, FanpageFilters } from '@/lib/api/fanpages.api';
import { ListFilterBar } from '@/components/common/ListFilterBar';
import { PlatformTag } from '@/components/fanpage/PlatformTag';
import { OwnerTag } from '@/components/fanpage/OwnerTag';
import { HealthTag } from '@/components/fanpage/HealthTag';
import { CadenceBadge } from '@/components/fanpage/CadenceBadge';
import { FanpageKpiCards, type KpiFilter } from '@/components/fanpage/FanpageKpiCards';
import { FanpageTodayTab } from '@/components/fanpage/FanpageTodayTab';
import { FanpageFormModal } from '@/components/fanpage/FanpageFormModal';
import { FanpageDetailDrawer } from '@/components/fanpage/FanpageDetailDrawer';
import { FanpagePlatformsModal } from '@/components/fanpage/FanpagePlatformsModal';
import { FanpageHealthModal } from '@/components/fanpage/FanpageHealthModal';
import { sortOwnersPrimaryFirst } from '@/lib/utils/fanpageColors';
import { formatSinceLastPost, formatWeekProgress } from '@/lib/utils/fanpageCadence';
import { toastApiError } from '@/lib/utils/error-message.util';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

type TabKey = 'today' | 'list' | 'archived';
const TAB_KEYS: TabKey[] = ['today', 'list', 'archived'];
const KPI_KEYS: KpiFilter[] = ['all', 'silent', 'at_risk', 'orphan'];

/** Trạng thái "Theo dõi" - 1 nguồn cho cột bảng và dropdown lọc (cùng màu Tag). */
const STATUS_TAG: Record<'true' | 'false', { color?: string; label: string }> = {
    true: { color: 'green', label: 'Đang theo dõi' },
    false: { label: 'Tạm ngừng' },
};

const MAX_OWNER_TAGS = 2;

const asInt = (v: string | null): number | undefined => {
    if (v == null || v === '') return undefined;
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : undefined;
};

function FanpagePageContent() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { message, modal } = App.useApp();
    const screens = useBreakpoint();
    const isMobile = screens.md === false;
    const { can, scope, isLoading: permissionsLoading } = useMyPermissions();

    // Khớp nav-config (`fanpages.view`) - không cho mở bằng URL trực tiếp khi thiếu quyền.
    const canView = can('fanpages.view');
    useEffect(() => {
        if (!permissionsLoading && !canView) {
            message.warning('Bạn không có quyền truy cập trang này');
            router.replace('/');
        }
    }, [permissionsLoading, canView, router, message]);

    const viewScope = scope('fanpages.view');
    // Người chỉ thấy Page của mình vào thẳng "Hôm nay"; Manager/Admin vào "Danh sách" (có thẻ KPI).
    const defaultTab: TabKey = viewScope === 'own' ? 'today' : 'list';
    const tabParam = searchParams.get('tab');
    const tab: TabKey = TAB_KEYS.includes(tabParam as TabKey) ? (tabParam as TabKey) : defaultTab;
    const kpiParam = searchParams.get('kpi');
    const kpi: KpiFilter = KPI_KEYS.includes(kpiParam as KpiFilter) ? (kpiParam as KpiFilter) : 'all';
    const platformId = asInt(searchParams.get('platform'));
    const ownerId = asInt(searchParams.get('owner'));
    const healthStatusId = asInt(searchParams.get('health'));
    const statusParam = searchParams.get('status');
    const status: 'true' | 'false' | undefined = statusParam === 'true' || statusParam === 'false' ? statusParam : undefined;

    // Đồng bộ bộ lọc/tab lên URL: mở lại đúng chỗ, gửi link cho đồng nghiệp, nút Back không mất bộ lọc.
    const setParams = useCallback(
        (patch: Record<string, string | number | undefined | null>) => {
            const next = new URLSearchParams(searchParams.toString());
            for (const [k, v] of Object.entries(patch)) {
                if (v == null || v === '') next.delete(k);
                else next.set(k, String(v));
            }
            const qs = next.toString();
            router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        },
        [searchParams, router, pathname],
    );

    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 300);

    const filters: FanpageFilters = useMemo(
        () => ({
            ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
            ...(platformId != null ? { platformId } : {}),
            ...(ownerId != null ? { ownerId } : {}),
            ...(healthStatusId != null ? { healthStatusId } : {}),
            ...(status ? { isActive: status } : {}),
            ...(kpi === 'silent' || kpi === 'at_risk' ? { cadence: kpi } : {}),
            ...(kpi === 'orphan' ? { orphan: 'true' as const } : {}),
            // Mặc định BE ẩn Page đã lưu trữ; tab "Đã lưu trữ" chỉ xem Page đã lưu trữ.
            ...(tab === 'archived' ? { archived: 'true' as const } : {}),
        }),
        [debouncedSearch, platformId, ownerId, healthStatusId, status, kpi, tab],
    );

    const listEnabled = canView && tab !== 'today';
    const { fanpages, capabilities, isLoading, isFetching } = useFanpages(filters, listEnabled);
    const { overview, isLoading: overviewLoading } = useFanpageOverview(canView && tab !== 'archived');
    const { platforms } = useFanpagePlatforms(false, canView);
    const { statuses: healthStatuses } = useFanpageHealthStatuses(false, canView);
    // Bộ lọc "Người phụ trách" chỉ có ý nghĩa khi xem được Page của người khác (scope view rộng).
    const showOwnerFilter = viewScope === 'all' || viewScope === 'department';
    const { owners } = useFanpageOwnerOptions(canView && showOwnerFilter);
    const deleteMut = useDeleteFanpage();
    const archiveMut = useArchiveFanpage();

    const [formState, setFormState] = useState<{ open: boolean; page?: Fanpage }>({ open: false });
    const [detailId, setDetailId] = useState<number | null>(null);
    const [platformsOpen, setPlatformsOpen] = useState(false);
    const [healthOpen, setHealthOpen] = useState(false);

    // Link từ thông báo nhắc việc: /fanpage?id=<id> -> mở Drawer. Đặt state ngay lúc render (derived, không qua effect),
    // rồi effect chỉ bỏ `id` khỏi URL để đóng Drawer + Back không mở lại.
    const idParam = searchParams.get('id');
    const [seenId, setSeenId] = useState<string | null>(null);
    if (canView && idParam !== seenId) {
        setSeenId(idParam);
        const id = asInt(idParam);
        if (id != null) setDetailId(id);
    }
    useEffect(() => {
        if (canView && asInt(idParam) != null) setParams({ id: undefined });
    }, [idParam, canView, setParams]);

    const confirmArchive = (page: Fanpage, archive: boolean) => {
        modal.confirm({
            title: archive ? `Lưu trữ Page "${page.name}"?` : `Bỏ lưu trữ Page "${page.name}"?`,
            content: archive
                ? 'Page sẽ ẩn khỏi danh sách và ngừng theo dõi/nhắc việc. Toàn bộ bài đăng, ghi chú và lịch sử vẫn được giữ.'
                : 'Page quay lại danh sách và được theo dõi lại.',
            okText: archive ? 'Lưu trữ' : 'Bỏ lưu trữ',
            cancelText: 'Huỷ',
            onOk: async () => {
                try {
                    await archiveMut.mutateAsync({ id: page.id, archive });
                    message.success(archive ? 'Đã lưu trữ Page' : 'Đã bỏ lưu trữ Page');
                } catch (err) {
                    toastApiError(message, err, archive ? 'Không thể lưu trữ Page' : 'Không thể bỏ lưu trữ Page');
                }
            },
        });
    };

    // Xoá cứng CHỈ từ tab "Đã lưu trữ" và nói rõ số dữ liệu sẽ mất (đếm thật từ BE).
    const confirmDelete = (page: Fanpage) => {
        modal.confirm({
            title: `Xoá vĩnh viễn Page "${page.name}"?`,
            content: `Sẽ xoá kèm ${page.postCount ?? 0} bài đăng và ${page.noteCount ?? 0} ghi chú. Không thể hoàn tác.`,
            okText: 'Xoá vĩnh viễn',
            okButtonProps: { danger: true },
            cancelText: 'Huỷ',
            onOk: async () => {
                try {
                    await deleteMut.mutateAsync(page.id);
                    message.success('Đã xoá Page');
                } catch (err) {
                    toastApiError(message, err, 'Không thể xoá Page');
                }
            },
        });
    };

    const rowMenu = (p: Fanpage): MenuProps['items'] => {
        const items: NonNullable<MenuProps['items']> = [];
        if (p.flags.canEdit) {
            items.push({
                key: 'archive',
                icon: p.archivedAt ? <UndoOutlined /> : <InboxOutlined />,
                label: p.archivedAt ? 'Bỏ lưu trữ' : 'Lưu trữ',
                onClick: () => confirmArchive(p, !p.archivedAt),
            });
        }
        if (p.flags.canDelete && p.archivedAt) {
            items.push({ key: 'delete', icon: <DeleteOutlined />, danger: true, label: 'Xoá vĩnh viễn', onClick: () => confirmDelete(p) });
        }
        return items;
    };

    const renderOwners = (p: Fanpage) => {
        const list = sortOwnersPrimaryFirst(p.owners, p.ownerId);
        if (list.length === 0) return <Text type="secondary">Chưa có</Text>;
        const shown = list.slice(0, MAX_OWNER_TAGS);
        const hidden = list.slice(MAX_OWNER_TAGS);
        return (
            <span>
                {shown.map((o) => (
                    <OwnerTag key={o.id} user={o} primary={o.id === p.ownerId && list.length > 1} />
                ))}
                {hidden.length > 0 && (
                    <Tooltip title={hidden.map((o) => o.name).join(', ')}>
                        <Tag>+{hidden.length}</Tag>
                    </Tooltip>
                )}
                {p.isOrphan && (
                    <Tooltip title="Không còn người phụ trách đang hoạt động">
                        <Tag color="warning">Chưa có người chăm</Tag>
                    </Tooltip>
                )}
            </span>
        );
    };

    const renderCadence = (p: Fanpage) => {
        if (!p.cadence) return '—';
        const tip = `Tổng ${p.postCount ?? 0} bài · ${p.posts30d ?? 0} bài/30 ngày · ${p.noteCount ?? 0} ghi chú`;
        return (
            <Tooltip title={tip}>
                <Space orientation="vertical" size={0}>
                    <CadenceBadge cadence={p.cadence} />
                    {p.cadence.state !== 'paused' && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {p.cadence.target != null ? `${formatWeekProgress(p.cadence)} · ` : ''}
                            {formatSinceLastPost(p.cadence)}
                        </Text>
                    )}
                </Space>
            </Tooltip>
        );
    };

    const renderActions = (p: Fanpage) => {
        const menu = rowMenu(p);
        return (
            <Space size="small">
                <Tooltip title="Xem chi tiết">
                    <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => setDetailId(p.id)} />
                </Tooltip>
                {p.flags.canEdit && !p.archivedAt && (
                    <Tooltip title="Sửa">
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => setFormState({ open: true, page: p })} />
                    </Tooltip>
                )}
                {menu && menu.length > 0 && (
                    <Dropdown menu={{ items: menu }} trigger={['click']}>
                        <Button type="text" size="small" icon={<MoreOutlined />} aria-label="Thao tác khác" />
                    </Dropdown>
                )}
            </Space>
        );
    };

    const columns: ColumnsType<Fanpage> = [
        {
            title: 'Page',
            key: 'name',
            render: (_: unknown, p) => (
                <Space orientation="vertical" size={0}>
                    <Space size={4} wrap>
                        <PlatformTag platform={p.platform} />
                        <Button type="link" style={{ padding: 0, height: 'auto' }} onClick={() => setDetailId(p.id)}>
                            {p.name}
                        </Button>
                    </Space>
                    <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>
                        <LinkOutlined /> Mở Page
                    </a>
                </Space>
            ),
        },
        { title: 'Người phụ trách', key: 'owner', width: 240, render: (_: unknown, p) => renderOwners(p) },
        { title: 'Tình trạng', key: 'health', width: 140, render: (_: unknown, p) => <HealthTag health={p.health} note={p.healthNote} /> },
        { title: 'Nhịp đăng', key: 'cadence', width: 170, render: (_: unknown, p) => renderCadence(p) },
        {
            title: 'Theo dõi',
            dataIndex: 'isActive',
            width: 120,
            render: (active: boolean) => {
                const st = STATUS_TAG[active ? 'true' : 'false'];
                return <Tag color={st.color}>{st.label}</Tag>;
            },
        },
        { title: 'Thao tác', key: 'actions', width: 120, fixed: 'right', render: (_: unknown, p) => renderActions(p) },
    ];

    if (!permissionsLoading && !canView) return null;

    const rowStyle = (p: Fanpage) => ({ opacity: p.cadence?.state === 'paused' || p.archivedAt ? 0.6 : 1 });
    const emptyText = tab === 'archived' ? 'Chưa có Page nào được lưu trữ' : 'Chưa có Page nào';

    const listBody = isMobile ? (
        <Space orientation="vertical" style={{ width: '100%' }} size={8}>
            {fanpages.length === 0 && !isLoading && <Empty description={emptyText} />}
            {fanpages.map((p) => (
                <Card key={p.id} size="small" loading={isLoading} style={rowStyle(p)}>
                    <Space orientation="vertical" size={4} style={{ width: '100%' }}>
                        <Space wrap size={4}>
                            <PlatformTag platform={p.platform} />
                            <Button type="link" style={{ padding: 0, height: 'auto', fontWeight: 600 }} onClick={() => setDetailId(p.id)}>
                                {p.name}
                            </Button>
                        </Space>
                        <Space wrap size={4}>
                            {p.cadence && <CadenceBadge cadence={p.cadence} detail />}
                            <HealthTag health={p.health} note={p.healthNote} />
                        </Space>
                        {renderOwners(p)}
                        <div style={{ textAlign: 'right' }}>{renderActions(p)}</div>
                    </Space>
                </Card>
            ))}
        </Space>
    ) : (
        <Table<Fanpage>
            rowKey="id"
            loading={isLoading || isFetching}
            columns={columns}
            dataSource={fanpages}
            onRow={(p) => ({ style: rowStyle(p) })}
            scroll={{ x: 'max-content' }}
            pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `Tổng cộng ${t} Page` }}
            locale={{ emptyText: <Empty description={emptyText} /> }}
        />
    );

    const filterBar = (
        <ListFilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Tìm theo tên hoặc link Page..."
            dropdowns={[
                {
                    key: 'platform',
                    placeholder: 'Nền tảng',
                    value: platformId,
                    onChange: (v) => setParams({ platform: v }),
                    searchable: true,
                    options: platforms.map((p) => ({ value: p.id, label: <PlatformTag platform={p} />, searchText: p.name })),
                },
                ...(showOwnerFilter
                    ? [
                        {
                            key: 'owner',
                            placeholder: 'Người phụ trách',
                            value: ownerId,
                            onChange: (v: number | undefined) => setParams({ owner: v }),
                            searchable: true,
                            options: owners.map((u) => ({ value: u.id, label: <OwnerTag user={u} />, searchText: `${u.name} ${u.employeeCode ?? ''}` })),
                        },
                    ]
                    : []),
                {
                    key: 'health',
                    placeholder: 'Tình trạng Page',
                    value: healthStatusId,
                    onChange: (v) => setParams({ health: v }),
                    options: healthStatuses.map((h) => ({ value: h.id, label: <Tag color={h.color}>{h.name}</Tag>, searchText: h.name })),
                },
                {
                    key: 'status',
                    placeholder: 'Theo dõi',
                    value: status,
                    onChange: (v) => setParams({ status: v }),
                    options: (['true', 'false'] as const).map((v) => ({ value: v, label: <Tag color={STATUS_TAG[v].color}>{STATUS_TAG[v].label}</Tag> })),
                },
            ]}
        />
    );

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
                    {can('fanpage_statuses.manage') && (
                        <Button icon={<SettingOutlined />} onClick={() => setHealthOpen(true)}>
                            Tình trạng
                        </Button>
                    )}
                    {capabilities.canCreate && (
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormState({ open: true })}>
                            Thêm Page
                        </Button>
                    )}
                </Space>
            </Space>

            <Tabs
                activeKey={tab}
                onChange={(k) => setParams({ tab: k === defaultTab ? undefined : k, kpi: undefined })}
                destroyOnHidden
                items={[
                    {
                        key: 'today',
                        label: 'Hôm nay',
                        children: <FanpageTodayTab enabled={canView && tab === 'today'} onOpenDetail={setDetailId} />,
                    },
                    {
                        key: 'list',
                        label: 'Danh sách',
                        children: (
                            <>
                                <FanpageKpiCards overview={overview} loading={overviewLoading} active={kpi} onPick={(f) => setParams({ kpi: f === 'all' ? undefined : f })} />
                                {filterBar}
                                {listBody}
                            </>
                        ),
                    },
                    {
                        key: 'archived',
                        label: (
                            <span>
                                Đã lưu trữ <Badge count={overview?.archivedPages ?? 0} showZero={false} color="#8c8c8c" overflowCount={99} />
                            </span>
                        ),
                        children: (
                            <>
                                {filterBar}
                                {listBody}
                            </>
                        ),
                    },
                ]}
            />

            <FanpageFormModal
                open={formState.open}
                fanpage={formState.page}
                canAssignOwner={capabilities.canAssignOwner}
                onClose={() => setFormState({ open: false })}
            />
            <FanpageDetailDrawer fanpageId={detailId} onClose={() => setDetailId(null)} onEdit={(page) => setFormState({ open: true, page })} />
            <FanpagePlatformsModal open={platformsOpen} onClose={() => setPlatformsOpen(false)} />
            <FanpageHealthModal open={healthOpen} onClose={() => setHealthOpen(false)} />
        </div>
    );
}

// useSearchParams() bắt buộc bọc Suspense ở App Router, nếu không `next build` lỗi (cùng cách customers/page.tsx).
export default function FanpagePage() {
    return (
        <Suspense fallback={null}>
            <FanpagePageContent />
        </Suspense>
    );
}
