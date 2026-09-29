'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, App, Button, DatePicker, Empty, Popconfirm, Space, Table, Tabs, Tag, Tooltip, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import {
  CrownOutlined,
  DeleteOutlined,
  EditOutlined,
  LockOutlined,
  MergeCellsOutlined,
  PlusOutlined,
  TeamOutlined,
  UnlockOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import {
  useDeleteUtm,
  useManagedUtms,
  useScopedUtms,
  useSetUtmActive,
  useUtmCustomerCounts,
  useUtmDuplicates,
} from '@/lib/hooks/useUtms';
import type { UtmView } from '@/lib/api/utms.api';
import { ListFilterBar } from '@/components/common/ListFilterBar';
import { UtmTag } from '@/components/utms/UtmTag';
import { UtmFormModal } from '@/components/utms/UtmFormModal';
import { UtmManagersModal } from '@/components/utms/UtmManagersModal';
import { UtmCustomersModal } from '@/components/utms/UtmCustomersModal';
import { UtmMergeModal, type MergeCandidate } from '@/components/utms/UtmMergeModal';
import {
  DEFAULT_UTM_SORT,
  filterUtmRows,
  sortUtmRows,
  type UtmPrimaryFilter,
  type UtmRoleFilter,
  type UtmSortKey,
  type UtmStatusFilter,
  type UtmVisibilityFilter,
} from '@/lib/utils/utm-list.util';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';

const { Title, Text } = Typography;

const { RangePicker } = DatePicker;

const SORT_OPTIONS: { value: UtmSortKey; label: string }[] = [
  { value: 'newest', label: 'Mới nhất (mặc định)' },
  { value: 'oldest', label: 'Cũ nhất' },
  { value: 'name_asc', label: 'Tên A → Z' },
  { value: 'name_desc', label: 'Tên Z → A' },
  { value: 'customers_desc', label: 'Nhiều khách hàng nhất' },
];

export default function QuanLyUtmPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const { can, scope, isLoading: permissionsLoading } = useMyPermissions();

  // Khớp nav-config (`utms.my_managed` + `requireAll: ['customers.view']`) - không cho mở
  // bằng URL trực tiếp khi thiếu quyền. UTM gắn với khách hàng nên role không xem được
  // khách hàng thì không vào trang UTM.
  const canAccessPage = can('utms.my_managed') && can('customers.view');
  useEffect(() => {
    if (!permissionsLoading && !canAccessPage) {
      message.warning('Bạn không có quyền truy cập trang này');
      router.replace('/');
    }
  }, [permissionsLoading, canAccessPage, router, message]);

  const canView = can('utms.view');
  const canCreate = can('utms.create');
  const canViewCustomers = can('customers.view');
  // Gộp cần danh sách đích từ tab "Tất cả" (GET /utms/scoped cần utms.view) nên đòi cả hai.
  const canMerge = canView && scope('utms.edit') === 'all';

  const { utms: mine, isLoading: loadingMine } = useManagedUtms(!permissionsLoading && canAccessPage);
  const { utms: allScoped, isLoading: loadingAll } = useScopedUtms(canView);
  const { counts } = useUtmCustomerCounts(canViewCustomers);
  const { groups: dupGroups, isLoading: loadingDup } = useUtmDuplicates(canMerge);

  const setActive = useSetUtmActive();
  const deleteMutation = useDeleteUtm();

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<UtmStatusFilter | undefined>();
  const [roleFilter, setRoleFilter] = useState<UtmRoleFilter | undefined>();
  const [primaryFilter, setPrimaryFilter] = useState<UtmPrimaryFilter | undefined>();
  const [visibilityFilter, setVisibilityFilter] = useState<UtmVisibilityFilter | undefined>();
  const [createdRange, setCreatedRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [sortKey, setSortKey] = useState<UtmSortKey>(DEFAULT_UTM_SORT);

  const [formTarget, setFormTarget] = useState<{ utm: UtmView | null } | null>(null);
  const [managing, setManaging] = useState<{ id: number; name: string } | null>(null);
  const [viewing, setViewing] = useState<{ id: number; name: string } | null>(null);
  const [merging, setMerging] = useState<{ source: { id: number; name: string }; defaultTargetId?: number } | null>(null);

  const mergeCandidates: MergeCandidate[] = useMemo(
    () => allScoped.map((u) => ({ id: u.id, name: u.name, color: u.color, isActive: u.isActive })),
    [allScoped],
  );

  const handleToggleActive = (u: UtmView) =>
    setActive.mutate(
      { id: u.id, active: !u.isActive },
      {
        onSuccess: () => message.success(u.isActive ? `Đã khoá UTM "${u.name}"` : `Đã mở khoá UTM "${u.name}"`),
        onError: (e) => message.error(getApiErrorMessage(e, 'Đổi trạng thái UTM thất bại')),
      },
    );

  const handleDelete = (u: UtmView) =>
    deleteMutation.mutate(u.id, {
      onSuccess: () => message.success(`Đã xoá UTM "${u.name}"`),
      onError: (e) => message.error(getApiErrorMessage(e, 'Xoá UTM thất bại')),
    });

  const columns: ColumnsType<UtmView> = [
    {
      title: 'UTM',
      key: 'name',
      render: (_, u) => (
        <Space orientation="vertical" size={0}>
          <Space size={4} wrap>
            <UtmTag name={u.name} color={u.color} inactive={!u.isActive} />
            {u.visibility === 'restricted' && (
              <Tooltip title="Chỉ Quản lý chính/phụ (và người có quyền xem rộng) chọn được UTM này">
                <Tag icon={<LockOutlined />}>Riêng tư</Tag>
              </Tooltip>
            )}
            {!u.isActive && <Tag color="default">Đã khoá</Tag>}
          </Space>
        </Space>
      ),
    },
    {
      title: 'Mô tả',
      key: 'description',
      dataIndex: 'description',
      width: 240,
      ellipsis: { showTitle: false },
      render: (d: string | null) =>
        d ? (
          <Tooltip title={d} placement="topLeft">
            <Text>{d}</Text>
          </Tooltip>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: 'Quản lý chính',
      key: 'primary',
      width: 160,
      render: (_, u) => (u.primaryManager ? <Text>{u.primaryManager.name}</Text> : <Text type="secondary">Chưa gán</Text>),
    },
    {
      title: 'Quản lý phụ',
      key: 'secondary',
      render: (_, u) =>
        u.secondaryManagers.length > 0 ? (
          <Space size={4} wrap>
            {u.secondaryManagers.map((m) => (
              <Tag key={m.id}>{m.name}</Tag>
            ))}
          </Space>
        ) : (
          <Text type="secondary">Chưa có</Text>
        ),
    },
    {
      title: 'Vai trò của tôi',
      key: 'myRole',
      width: 140,
      render: (_, u) =>
        u.myRole === 'primary' ? (
          <Tag color="gold" icon={<CrownOutlined />}>Quản lý chính</Tag>
        ) : u.myRole === 'secondary' ? (
          <Tag color="blue">Quản lý phụ</Tag>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: 'Ngày tạo',
      key: 'createdAt',
      dataIndex: 'createdAt',
      width: 140,
      render: (d: string) => (d ? dayjs(d).format('DD/MM/YYYY HH:mm') : '—'),
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 420,
      render: (_, u) => (
        <Space size={4} wrap>
          {u.capabilities.canEditMeta && (
            <Button size="small" icon={<EditOutlined />} onClick={() => setFormTarget({ utm: u })}>
              Sửa
            </Button>
          )}
          <Button size="small" icon={<TeamOutlined />} onClick={() => setManaging({ id: u.id, name: u.name })}>
            Quản lý
          </Button>
          {canViewCustomers && (
            <Button size="small" icon={<UserOutlined />} onClick={() => setViewing({ id: u.id, name: u.name })}>
              Khách hàng ({counts[u.id] ?? 0})
            </Button>
          )}
          {u.capabilities.canEditMeta && (
            <Popconfirm
              title={u.isActive ? `Khoá UTM "${u.name}"?` : `Mở khoá UTM "${u.name}"?`}
              description={u.isActive ? 'Không ai chọn được UTM này cho khách mới; khách cũ giữ nguyên.' : undefined}
              okText={u.isActive ? 'Khoá' : 'Mở khoá'}
              cancelText="Huỷ"
              onConfirm={() => handleToggleActive(u)}
            >
              <Button
                size="small"
                icon={u.isActive ? <LockOutlined /> : <UnlockOutlined />}
                loading={setActive.isPending && setActive.variables?.id === u.id}
              >
                {u.isActive ? 'Khoá' : 'Mở khoá'}
              </Button>
            </Popconfirm>
          )}
          {canMerge && (
            <Button size="small" icon={<MergeCellsOutlined />} onClick={() => setMerging({ source: { id: u.id, name: u.name } })}>
              Gộp
            </Button>
          )}
          {u.capabilities.canDelete && (
            <Popconfirm
              title={`Xoá UTM "${u.name}"?`}
              description="Chỉ xoá được khi không còn khách hàng nào dùng (kể cả trong Thùng rác)."
              okText="Xoá"
              okButtonProps={{ danger: true }}
              cancelText="Huỷ"
              onConfirm={() => handleDelete(u)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} loading={deleteMutation.isPending && deleteMutation.variables === u.id} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const renderTable = (rows: UtmView[], loading: boolean, emptyText: string) => {
    const filtered = sortUtmRows(
      filterUtmRows(rows, searchText, statusFilter, roleFilter, {
        primary: primaryFilter,
        visibility: visibilityFilter,
        createdRange,
      }),
      sortKey,
      counts,
    );
    const filtering = !!(
      searchText ||
      statusFilter ||
      roleFilter ||
      primaryFilter !== undefined ||
      visibilityFilter ||
      createdRange?.[0] ||
      createdRange?.[1]
    );
    // Options Quản lý chính lấy từ chính danh sách đang xem (không gọi thêm API).
    const primaryOptions: { value: UtmPrimaryFilter; label: string }[] = [
      { value: 'none', label: 'Chưa gán' },
      ...Array.from(new Map(rows.filter((r) => r.primaryManager).map((r) => [r.primaryManager!.id, r.primaryManager!.name])).entries())
        .sort((a, b) => a[1].localeCompare(b[1], 'vi'))
        .map(([id, name]) => ({ value: id as UtmPrimaryFilter, label: name })),
    ];
    return (
      <>
        <ListFilterBar
          searchValue={searchText}
          onSearchChange={setSearchText}
          searchPlaceholder="Tìm theo tên/mô tả UTM..."
          searchMdSpan={8}
          extra={
            <RangePicker
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              placeholder={['Tạo từ ngày', 'Đến ngày']}
              value={createdRange}
              onChange={(v) => setCreatedRange(v ? [v[0], v[1]] : null)}
            />
          }
          dropdowns={[
            {
              key: 'status',
              placeholder: 'Trạng thái',
              value: statusFilter,
              onChange: setStatusFilter,
              mdSpan: 4,
              options: [
                { value: 'active', label: 'Đang hoạt động' },
                { value: 'inactive', label: 'Đã khoá' },
              ],
            },
            {
              key: 'role',
              placeholder: 'Vai trò của tôi',
              value: roleFilter,
              onChange: setRoleFilter,
              mdSpan: 4,
              options: [
                { value: 'primary', label: 'Quản lý chính' },
                { value: 'secondary', label: 'Quản lý phụ' },
              ],
            },
            {
              key: 'primaryManager',
              placeholder: 'Quản lý chính',
              value: primaryFilter,
              onChange: setPrimaryFilter,
              mdSpan: 4,
              options: primaryOptions,
            },
            {
              key: 'visibility',
              placeholder: 'Hiển thị',
              value: visibilityFilter,
              onChange: setVisibilityFilter,
              mdSpan: 4,
              options: [
                { value: 'shared', label: 'Công khai' },
                { value: 'restricted', label: 'Riêng tư' },
              ],
            },
            {
              key: 'sort',
              placeholder: 'Sắp xếp',
              value: sortKey,
              // Xoá lựa chọn -> quay về mặc định (Mới nhất).
              onChange: (v: UtmSortKey | undefined) => setSortKey(v ?? DEFAULT_UTM_SORT),
              mdSpan: 4,
              options: SORT_OPTIONS,
            },
          ]}
        />
        <Table<UtmView>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={filtered}
          scroll={{ x: 1400 }}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: <Empty description={filtering ? 'Không có UTM nào khớp bộ lọc' : emptyText} /> }}
        />
      </>
    );
  };

  const tabItems = [
    {
      key: 'mine',
      label: `UTM của tôi (${mine.length})`,
      children: renderTable(mine, loadingMine, 'Bạn chưa là Quản lý chính/phụ của UTM nào'),
    },
    ...(canView
      ? [{ key: 'all', label: `Tất cả UTM (${allScoped.length})`, children: renderTable(allScoped, loadingAll, 'Chưa có UTM nào trong phạm vi của bạn') }]
      : []),
    ...(canMerge
      ? [
          {
            key: 'dup',
            label: `Gợi ý trùng (${dupGroups.length})`,
            children: (
              <>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 12 }}
                  title="Các UTM có tên gần giống nhau (khác dấu, gạch nối, gạch dưới, khoảng trắng...). Hệ thống KHÔNG tự gộp — bạn quyết định UTM nào là bản chuẩn."
                />
                {dupGroups.length === 0 && !loadingDup ? (
                  <Empty description="Không có UTM nào trùng lặp" />
                ) : (
                  <Space orientation="vertical" style={{ width: '100%' }} size={12}>
                    {dupGroups.map((g) => {
                      const keep = [...g.utms].sort((a, b) => b.customerCount - a.customerCount)[0];
                      return (
                        <div key={g.utms.map((u) => u.id).join('-')} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12 }}>
                          <Space size={[8, 8]} wrap>
                            {g.utms.map((u) => (
                              <Space key={u.id} size={4}>
                                <UtmTag name={u.name} inactive={!u.isActive} />
                                <Text type="secondary" style={{ fontSize: 12 }}>{u.customerCount} KH</Text>
                                {u.id !== keep.id && (
                                  <Button
                                    size="small"
                                    icon={<MergeCellsOutlined />}
                                    onClick={() => setMerging({ source: { id: u.id, name: u.name }, defaultTargetId: keep.id })}
                                  >
                                    Gộp vào &quot;{keep.name}&quot;
                                  </Button>
                                )}
                              </Space>
                            ))}
                          </Space>
                        </div>
                      );
                    })}
                  </Space>
                )}
              </>
            ),
          },
        ]
      : []),
  ];

  // Guard: chưa có quyền (hoặc đang tải quyền) thì KHÔNG render UTM - effect ở trên sẽ redirect.
  if (permissionsLoading || !canAccessPage) return null;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Quản lý UTM</Title>
          <Text type="secondary">
            Danh mục UTM dùng chọn nhanh ở form khách hàng. Quản lý chính thêm/gỡ Quản lý phụ; Quản lý phụ chỉ sửa mô tả, màu và khoá/mở.
          </Text>
        </div>
        {canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormTarget({ utm: null })}>
            Tạo UTM
          </Button>
        )}
      </div>

      <Tabs
        items={tabItems}
        onChange={() => {
          setSearchText('');
          setStatusFilter(undefined);
          setRoleFilter(undefined);
          setPrimaryFilter(undefined);
          setVisibilityFilter(undefined);
          setCreatedRange(null);
        }}
      />

      <UtmFormModal open={!!formTarget} onClose={() => setFormTarget(null)} utm={formTarget?.utm ?? null} />
      <UtmManagersModal open={!!managing} onClose={() => setManaging(null)} utmId={managing?.id ?? null} utmName={managing?.name} />
      <UtmCustomersModal key={`customers-${viewing?.id ?? 'none'}`} open={!!viewing} onClose={() => setViewing(null)} utmId={viewing?.id ?? null} utmName={viewing?.name} />
      <UtmMergeModal
        key={merging ? `merge-${merging.source.id}-${merging.defaultTargetId ?? 0}` : 'merge-none'}
        open={!!merging}
        onClose={() => setMerging(null)}
        source={merging?.source ?? null}
        candidates={mergeCandidates.filter((c) => c.id !== merging?.source.id)}
        defaultTargetId={merging?.defaultTargetId}
      />
    </div>
  );
}