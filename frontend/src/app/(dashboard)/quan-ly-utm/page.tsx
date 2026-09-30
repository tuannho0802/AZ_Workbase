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
  useBulkDeleteUtm,
  useBulkSetUtmActive,
  useDeleteUtm,
  useManagedUtms,
  useScopedUtms,
  useSetUtmActive,
  useUtmCustomerCounts,
  useUtmDuplicates,
} from '@/lib/hooks/useUtms';
import type { UtmView } from '@/lib/api/utms.api';
import { ListFilterBar } from '@/components/common/ListFilterBar';
import { UserMiniCard } from '@/app/(dashboard)/attendance-device/UserMiniCard';
import { useRoleColorMap, useRoleColors } from '@/lib/hooks/useRoleColorMap';
import { UtmTag } from '@/components/utms/UtmTag';
import { UtmFormModal } from '@/components/utms/UtmFormModal';
import { UtmManagersModal } from '@/components/utms/UtmManagersModal';
import { UtmCustomersModal } from '@/components/utms/UtmCustomersModal';
import { UtmMergeModal, type MergeCandidate } from '@/components/utms/UtmMergeModal';
import {
  filterUtmRows,
  sortUtmRows,
  type UtmPrimaryFilter,
  type UtmRoleFilter,
  type UtmSortKey,
  type UtmVisibilityFilter,
} from '@/lib/utils/utm-list.util';
import { toastApiError } from '@/lib/utils/error-message.util';
import { sumColumnWidths } from '@/lib/utils/table-width.util';
import { BulkActionBar } from '@/components/common/BulkActionBar';
import { summarizeBulkResult, type BulkResultLike } from '@/lib/utils/bulk-result.util';

const { Title, Text } = Typography;

const { RangePicker } = DatePicker;

type UtmTabKey = 'mine' | 'all' | 'locked';

const SORT_LABELS: Record<UtmSortKey, string> = {
  newest: 'Mới nhất',
  oldest: 'Cũ nhất',
  name_asc: 'Tên A → Z',
  name_desc: 'Tên Z → A',
  customers_desc: 'Nhiều khách hàng nhất',
  primary_asc: 'Quản lý chính A → Z (chưa gán cuối)',
  updated_desc: 'Khoá gần đây nhất',
};

// Mỗi tab có bộ Sort + mặc định riêng.
const SORT_KEYS_BY_TAB: Record<UtmTabKey, UtmSortKey[]> = {
  mine: ['newest', 'oldest', 'name_asc', 'name_desc', 'customers_desc'],
  all: ['newest', 'oldest', 'name_asc', 'name_desc', 'customers_desc', 'primary_asc'],
  locked: ['updated_desc', 'newest', 'oldest', 'name_asc', 'name_desc', 'customers_desc'],
};
const DEFAULT_SORT_BY_TAB: Record<UtmTabKey, UtmSortKey> = { mine: 'newest', all: 'newest', locked: 'updated_desc' };

export default function QuanLyUtmPage() {
  const router = useRouter();
  const { message, modal } = App.useApp();
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

  // Màu Avatar/Tag Vai trò theo cấu hình /phan-quyen (GET /roles/colors - không cần roles.view).
  const { getRoleColor } = useRoleColorMap();
  const { roleColors } = useRoleColors();
  const getRoleName = (code?: string) => (code ? roleColors.find((r) => r.code === code)?.name || code : '');

  const setActive = useSetUtmActive();
  const deleteMutation = useDeleteUtm();
  const bulkActive = useBulkSetUtmActive();
  const bulkDelete = useBulkDeleteUtm();
  const bulkBusy = bulkActive.isPending || bulkDelete.isPending;
  // Chỉ chọn trong 1 tab tại 1 thời điểm (đổi tab -> xoá chọn) để không thao tác nhầm dòng đang ẩn.
  const [selected, setSelected] = useState<number[]>([]);
  const [pageSize, setPageSize] = useState(20);

  const [searchText, setSearchText] = useState('');
  const [roleFilter, setRoleFilter] = useState<UtmRoleFilter | undefined>();
  const [primaryFilter, setPrimaryFilter] = useState<UtmPrimaryFilter | undefined>();
  const [visibilityFilter, setVisibilityFilter] = useState<UtmVisibilityFilter | undefined>();
  const [createdRange, setCreatedRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [sortByTab, setSortByTab] = useState<Record<UtmTabKey, UtmSortKey>>(DEFAULT_SORT_BY_TAB);

  const [formTarget, setFormTarget] = useState<{ utm: UtmView | null } | null>(null);
  const [managing, setManaging] = useState<{ id: number; name: string } | null>(null);
  const [viewing, setViewing] = useState<{ id: number; name: string } | null>(null);
  const [merging, setMerging] = useState<{ source: { id: number; name: string }; defaultTargetId?: number } | null>(null);

  // Tab "Đã khoá" lấy từ danh sách rộng nếu có quyền xem, không thì từ UTM tôi quản lý.
  const mineActive = useMemo(() => mine.filter((u) => u.isActive), [mine]);
  const allActive = useMemo(() => allScoped.filter((u) => u.isActive), [allScoped]);
  const lockedRows = useMemo(() => (canView ? allScoped : mine).filter((u) => !u.isActive), [canView, allScoped, mine]);
  const loadingLocked = canView ? loadingAll : loadingMine;

  const mergeCandidates: MergeCandidate[] = useMemo(
    () => allScoped.map((u) => ({ id: u.id, name: u.name, color: u.color, isActive: u.isActive })),
    [allScoped],
  );

  const handleToggleActive = (u: UtmView) =>
    setActive.mutate(
      { id: u.id, active: !u.isActive },
      {
        onSuccess: () => message.success(u.isActive ? `Đã khoá UTM "${u.name}"` : `Đã mở khoá UTM "${u.name}"`),
        onError: (e) => toastApiError(message, e, 'Đổi trạng thái UTM thất bại'),
      },
    );

  const handleDelete = (u: UtmView) =>
    deleteMutation.mutate(u.id, {
      onSuccess: () => message.success(`Đã xoá UTM "${u.name}"`),
      onError: (e) => toastApiError(message, e, 'Xoá UTM thất bại'),
    });

  // Báo kết quả hàng loạt: toast tóm tắt; nếu có mục lỗi thì mở hộp thoại liệt kê UTM nào lỗi vì sao.
  // Mục thành công bị bỏ khỏi vùng chọn, mục lỗi giữ lại để người dùng thấy/thử lại.
  const reportBulk = (result: BulkResultLike, verb: string, rows: UtmView[]) => {
    const nameOf = (id: number) => rows.find((r) => r.id === id)?.name;
    const summary = summarizeBulkResult(result, verb, nameOf);
    message[summary.level](summary.text);
    if (summary.failures.length > 0) {
      modal.warning({
        title: summary.text,
        width: 560,
        content: (
          <ul style={{ paddingLeft: 18, margin: 0, maxHeight: 320, overflowY: 'auto' }}>
            {summary.failures.map((f) => (
              <li key={f.id}>
                <Text strong>{f.name}</Text>: {f.reason}
              </li>
            ))}
          </ul>
        ),
      });
    }
    const done = new Set(result.succeeded);
    setSelected((prev) => prev.filter((id) => !done.has(id)));
  };

  const handleBulkActive = (rows: UtmView[], active: boolean) => {
    const ids = rows.filter((r) => r.capabilities.canEditMeta && r.isActive !== active).map((r) => r.id);
    if (ids.length === 0) return;
    bulkActive.mutate(
      { ids, active },
      {
        onSuccess: (res) => reportBulk(res, active ? 'mở khoá' : 'khoá', rows),
        onError: (e) => toastApiError(message, e, 'Đổi trạng thái hàng loạt thất bại'),
      },
    );
  };

  const handleBulkDelete = (rows: UtmView[]) => {
    const ids = rows.filter((r) => r.capabilities.canDelete).map((r) => r.id);
    if (ids.length === 0) return;
    bulkDelete.mutate(ids, {
      onSuccess: (res) => reportBulk(res, 'xoá', rows),
      onError: (e) => toastApiError(message, e, 'Xoá hàng loạt thất bại'),
    });
  };

  type Col = ColumnsType<UtmView>[number];

  const colName: Col = {
    title: 'UTM',
    key: 'name',
    // ⚠️ BẮT BUỘC có width cố định: thiếu width -> ở table-layout fixed (do cột Mô tả có ellipsis) cột này
    // bị nén về ~0px và Tag tràn ĐÈ lên cột Mô tả (xem `sumColumnWidths` ở lib/utils/table-width.util.ts).
    width: 240,
    fixed: 'left',
    render: (_, u) => (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, minWidth: 0 }}>
        {/* Tên UTM dài -> cắt "…" trong đúng ô, không tràn sang cột bên cạnh; rê chuột xem đủ tên. */}
        <span title={u.name} style={{ display: 'inline-flex', maxWidth: '100%', minWidth: 0 }}>
          <UtmTag
            name={u.name}
            color={u.color}
            inactive={!u.isActive}
            style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          />
        </span>
        {u.visibility === 'restricted' && (
          <Tooltip title="Chỉ Quản lý chính/phụ (và người có quyền xem rộng) chọn được UTM này">
            <Tag icon={<LockOutlined />} style={{ marginInlineEnd: 0 }}>Riêng tư</Tag>
          </Tooltip>
        )}
        {!u.isActive && <Tag color="default" style={{ marginInlineEnd: 0 }}>Đã khoá</Tag>}
      </div>
    ),
  };
  const colDesc: Col = {
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
  };
  const colPrimary: Col = {
    title: 'Quản lý chính',
    key: 'primary',
    width: 220,
    render: (_, u) =>
      u.primaryManager ? (
        <UserMiniCard
          name={u.primaryManager.name}
          role={u.primaryManager.role}
          getRoleColor={getRoleColor}
          getRoleName={getRoleName}
          nameFontSize={12}
        />
      ) : (
        <Text type="secondary">Chưa gán</Text>
      ),
  };
  const colSecondary: Col = {
    title: 'Quản lý phụ',
    key: 'secondary',
    width: 240,
    render: (_, u) =>
      u.secondaryManagers.length > 0 ? (
        <Space size={4} wrap>
          {u.secondaryManagers.map((m) => (
            <UserMiniCard
              key={m.id}
              name={m.name}
              role={m.role}
              getRoleColor={getRoleColor}
              getRoleName={getRoleName}
              hideRoleTag
              nameFontSize={12}
            />
          ))}
        </Space>
      ) : (
        <Text type="secondary">Chưa có</Text>
      ),
  };
  const colMyRole: Col = {
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
  };
  const colVisibility: Col = {
    title: 'Hiển thị',
    key: 'visibility',
    width: 110,
    render: (_, u) => (u.visibility === 'restricted' ? <Tag icon={<LockOutlined />}>Riêng tư</Tag> : <Tag color="green">Công khai</Tag>),
  };
  const colCustomers: Col = {
    title: 'Số KH',
    key: 'customerCount',
    width: 90,
    align: 'right',
    render: (_, u) => counts[u.id] ?? 0,
  };
  const colCreated: Col = {
    title: 'Ngày tạo',
    key: 'createdAt',
    dataIndex: 'createdAt',
    width: 140,
    render: (d: string) => (d ? dayjs(d).format('DD/MM/YYYY HH:mm') : '—'),
  };
  const colLocked: Col = {
    title: 'Ngày khoá',
    key: 'lockedAt',
    dataIndex: 'lockedAt',
    width: 140,
    render: (d: string | null) => (d ? dayjs(d).format('DD/MM/YYYY HH:mm') : '—'),
  };
  const colAction: Col = {
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
            description={u.isActive ? 'Không ai chọn được UTM này cho khách mới; khách cũ giữ nguyên. UTM sẽ chuyển sang tab "UTM đã khoá".' : undefined}
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
  };

  // Mỗi tab một bộ cột riêng.
  const tabColumns = (tab: UtmTabKey): ColumnsType<UtmView> => {
    const customersCol = canViewCustomers ? [colCustomers] : [];
    switch (tab) {
      case 'mine': // "Tôi có vai trò gì" quan trọng hơn mô tả/hiển thị
        return [colName, colDesc, colMyRole, colPrimary, colSecondary, ...customersCol, colCreated, colAction];
      case 'all': // góc nhìn quản trị: ai quản lý, công khai hay riêng tư
        return [colName, colDesc, colPrimary, colSecondary, colVisibility, ...customersCol, colCreated, colAction];
      case 'locked': // cần biết ai phụ trách + khoá từ bao giờ để quyết định mở khoá/gộp/xoá
        return [colName, colPrimary, colSecondary, ...customersCol, colLocked, colCreated, colAction];
    }
  };

  const visibilityDropdown = {
    key: 'visibility',
    placeholder: 'Hiển thị',
    value: visibilityFilter,
    onChange: setVisibilityFilter,
    mdSpan: 4,
    options: [
      { value: 'shared', label: 'Công khai' },
      { value: 'restricted', label: 'Riêng tư' },
    ],
  };

  const renderTable = (tab: UtmTabKey, rows: UtmView[], loading: boolean, emptyText: string) => {
    const sortKey = sortByTab[tab];
    // Chỉ áp các bộ lọc thuộc tab này (state được reset khi đổi tab).
    const usesRole = tab === 'mine';
    const usesPrimary = tab !== 'mine';
    const usesVisibility = tab !== 'locked';
    const filtered = sortUtmRows(
      filterUtmRows(rows, searchText, undefined, usesRole ? roleFilter : undefined, {
        primary: usesPrimary ? primaryFilter : undefined,
        visibility: usesVisibility ? visibilityFilter : undefined,
        createdRange,
      }),
      sortKey,
      counts,
    );
    const filtering = !!(
      searchText ||
      (usesRole && roleFilter) ||
      (usesPrimary && primaryFilter !== undefined) ||
      (usesVisibility && visibilityFilter) ||
      createdRange?.[0] ||
      createdRange?.[1]
    );
    const columns = tabColumns(tab);
    // Chỉ tính các dòng ĐANG HIỆN (đã qua bộ lọc) - dòng bị lọc ẩn không bao giờ bị thao tác ngầm.
    const selectedRows = filtered.filter((r) => selected.includes(r.id));
    const lockableRows = selectedRows.filter((r) => r.capabilities.canEditMeta && r.isActive === (tab !== 'locked'));
    const deletableRows = selectedRows.filter((r) => r.capabilities.canDelete);
    const primaryOptions: { value: UtmPrimaryFilter; label: React.ReactNode; searchText: string }[] = [
      { value: 'none', label: 'Chưa gán', searchText: 'Chưa gán' },
      ...Array.from(new Map(rows.filter((r) => r.primaryManager).map((r) => [r.primaryManager!.id, r.primaryManager!.name])).entries())
        .sort((a, b) => a[1].localeCompare(b[1], 'vi'))
        .map(([id, name]) => {
          const mgr = rows.find((r) => r.primaryManager?.id === id)?.primaryManager;
          return {
            value: id as UtmPrimaryFilter,
            searchText: name,
            label: (
              <UserMiniCard
                name={name}
                role={mgr?.role}
                getRoleColor={getRoleColor}
                getRoleName={getRoleName}
                nameFontSize={12}
                borderRadius={6}
                avatarShape="square"
              />
            ),
          };
        }),
    ];
    const roleDropdown = {
      key: 'role',
      placeholder: 'Vai trò của tôi',
      value: roleFilter,
      onChange: setRoleFilter,
      mdSpan: 4,
      options: [
        { value: 'primary', label: 'Quản lý chính' },
        { value: 'secondary', label: 'Quản lý phụ' },
      ],
    };
    const primaryDropdown = {
      key: 'primaryManager',
      placeholder: 'Quản lý chính',
      value: primaryFilter,
      onChange: setPrimaryFilter,
      searchable: true,
      mdSpan: 4,
      options: primaryOptions,
    };
    const sortDropdown = {
      key: 'sort',
      placeholder: 'Sắp xếp',
      value: sortKey,
      // Xoá lựa chọn -> quay về mặc định của tab.
      onChange: (v: UtmSortKey | undefined) => setSortByTab((prev) => ({ ...prev, [tab]: v ?? DEFAULT_SORT_BY_TAB[tab] })),
      mdSpan: 4,
      options: SORT_KEYS_BY_TAB[tab].map((k) => ({
        value: k,
        label: k === DEFAULT_SORT_BY_TAB[tab] ? `${SORT_LABELS[k]} (mặc định)` : SORT_LABELS[k],
      })),
    };
    const dropdowns =
      tab === 'mine'
        ? [roleDropdown, visibilityDropdown, sortDropdown]
        : tab === 'all'
          ? [primaryDropdown, visibilityDropdown, sortDropdown]
          : [primaryDropdown, sortDropdown];
    return (
      <>
        {tab === 'locked' && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            title="UTM đã khoá không chọn được cho khách mới; khách cũ giữ nguyên. Mở khoá để đưa UTM về lại tab đang hoạt động."
          />
        )}
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
          dropdowns={dropdowns}
        />
        <BulkActionBar count={selectedRows.length} onClear={() => setSelected([])} disabled={bulkBusy}>
          {lockableRows.length > 0 && (
            <Popconfirm
              title={tab === 'locked' ? `Mở khoá ${lockableRows.length} UTM?` : `Khoá ${lockableRows.length} UTM?`}
              description={tab === 'locked' ? undefined : 'Không ai chọn được các UTM này cho khách mới; khách cũ giữ nguyên.'}
              okText={tab === 'locked' ? 'Mở khoá' : 'Khoá'}
              cancelText="Huỷ"
              onConfirm={() => handleBulkActive(selectedRows, tab === 'locked')}
            >
              <Button size="small" icon={tab === 'locked' ? <UnlockOutlined /> : <LockOutlined />} loading={bulkActive.isPending} disabled={bulkBusy}>
                {tab === 'locked' ? 'Mở khoá' : 'Khoá'} ({lockableRows.length})
              </Button>
            </Popconfirm>
          )}
          {deletableRows.length > 0 && (
            <Popconfirm
              title={`Xoá ${deletableRows.length} UTM?`}
              description="Chỉ xoá được UTM không còn khách hàng nào dùng (kể cả Thùng rác); UTM còn khách sẽ được báo lỗi và giữ nguyên."
              okText="Xoá"
              okButtonProps={{ danger: true }}
              cancelText="Huỷ"
              onConfirm={() => handleBulkDelete(selectedRows)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} loading={bulkDelete.isPending} disabled={bulkBusy}>
                Xoá ({deletableRows.length})
              </Button>
            </Popconfirm>
          )}
          {lockableRows.length === 0 && deletableRows.length === 0 && (
            <Text type="secondary">Bạn không có quyền khoá/xoá các UTM đã chọn</Text>
          )}
        </BulkActionBar>
        <Table<UtmView>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={filtered}
          rowSelection={{
            selectedRowKeys: selected,
            onChange: (keys) => setSelected(keys as number[]),
            preserveSelectedRowKeys: true,
            fixed: true,
            // Không có quyền sửa/xoá UTM này -> không có gì để làm hàng loạt.
            getCheckboxProps: (r) => ({ disabled: !r.capabilities.canEditMeta && !r.capabilities.canDelete }),
          }}
          // scroll.x = TỔNG width các cột (không gõ tay) để không bao giờ nhỏ hơn tổng cột -> không đè cột.
          // +48 cho cột checkbox của rowSelection (không nằm trong `columns`).
          scroll={{ x: sumColumnWidths(columns) + 48 }}
          // pageSize PHẢI là state + cập nhật trong onChange: antd coi `pageSize` truyền vào là controlled, nếu để
          // hằng số 20 thì dropdown "/ trang" hiện ra nhưng chọn gì cũng bị bật về 20.
          pagination={{
            pageSize,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            showTotal: (t) => `${t} UTM`,
            onChange: (_page, size) => setPageSize(size),
          }}
          locale={{ emptyText: <Empty description={filtering ? 'Không có UTM nào khớp bộ lọc' : emptyText} /> }}
        />
      </>
    );
  };

  const tabItems = [
    {
      key: 'mine',
      label: `UTM của tôi (${mineActive.length})`,
      children: renderTable('mine', mineActive, loadingMine, 'Bạn chưa là Quản lý chính/phụ của UTM nào đang hoạt động'),
    },
    ...(canView
      ? [{ key: 'all', label: `Tất cả UTM (${allActive.length})`, children: renderTable('all', allActive, loadingAll, 'Chưa có UTM nào trong phạm vi của bạn') }]
      : []),
    {
      key: 'locked',
      label: `UTM đã khoá (${lockedRows.length})`,
      children: renderTable('locked', lockedRows, loadingLocked, 'Chưa có UTM nào bị khoá'),
    },
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
          setSelected([]);
          setSearchText('');
          setRoleFilter(undefined);
          setPrimaryFilter(undefined);
          setVisibilityFilter(undefined);
          setCreatedRange(null);
          setSortByTab(DEFAULT_SORT_BY_TAB);
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