'use client';

import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { Alert, App, Button, DatePicker, Drawer, Input, Popconfirm, Select, Space, Table, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DisconnectOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { useUtmStatsCustomers } from '@/lib/hooks/useUtms';
import type { UtmCustomerRow, UtmStatsStatus, UtmStatsUtmBrief } from '@/lib/api/utms.api';
import { customersApi } from '@/lib/api/customers.api';
import type { Customer } from '@/lib/types/customer.types';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { CustomerForm } from '@/components/customers/CustomerForm';
import { SourceTag } from '@/components/customers/SourceTag';
import { StatusTag } from '@/components/customers/StatusTag';
import { UtmTag } from '@/components/utms/UtmTag';
import { UtmStatsQuickFilters } from '@/components/utms/UtmStatsQuickFilters';
import { BulkActionBar } from '@/components/common/BulkActionBar';
import { sumColumnWidths } from '@/lib/utils/table-width.util';
import { getApiErrorMessage, toastApiError } from '@/lib/utils/error-message.util';
import { pruneSelection, summarizeBulkResult } from '@/lib/utils/bulk-result.util';
import {
  dropUnknownUtmIds,
  groupCustomerIdsByUtm,
  toStatsFilterParams,
  UTM_STATS_MAX_SPAN_DAYS,
  type UtmStatsDrill,
  type UtmStatsFilters,
} from '@/lib/utils/utm-stats.util';

const { RangePicker } = DatePicker;
const { Text } = Typography;

export const UTM_STATS_CUSTOMERS_PAGE_SIZE = 10;

interface Props {
  /** null = đóng. Mỗi lần bấm chart/card sinh 1 `drill` mới -> bảng dựng lại với bộ lọc khởi tạo từ tab Thống kê. */
  drill: UtmStatsDrill | null;
  onClose: () => void;
  utms: UtmStatsUtmBrief[];
  statuses: UtmStatsStatus[];
  /** Bộ lọc nhanh đang áp ở tab Thống kê - làm giá trị KHỞI TẠO (sửa trong bảng không đổi chart). */
  initialFilters: UtmStatsFilters;
}

/**
 * Mini Table khách hiện ra khi bấm cột chart / card ở tab "Thống kê" của trang Quản lý UTM: xem nhanh + thao tác
 * nhanh (sửa nhanh, gỡ UTM, gỡ hàng loạt) mà không rời trang. Số dòng khớp số trên chart vì BE dùng CHUNG bộ lọc
 * (`GET /utms/stats/customers`); phạm vi luôn là scope `customers.view` của người xem, không gồm khách Thùng rác.
 */
export function UtmStatsCustomersDrawer({ drill, onClose, utms, statuses, initialFilters }: Props) {
  return (
    <Drawer open={drill !== null} onClose={onClose} size={1100} destroyOnHidden title={drill?.title ?? ''}>
      {drill && (
        <DrawerBody
          key={`${drill.title}|${drill.from}|${drill.to}|${drill.status ?? ''}`}
          drill={drill}
          utms={utms}
          statuses={statuses}
          initialFilters={initialFilters}
        />
      )}
    </Drawer>
  );
}

function DrawerBody({ drill, utms, statuses, initialFilters }: Omit<Props, 'drill' | 'onClose'> & { drill: UtmStatsDrill }) {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const { can } = useMyPermissions();
  // Sửa nhanh/gỡ UTM: CÙNG permission với PATCH /customers/:id (BE vẫn tự chặn theo phạm vi).
  const canEditCustomer = can('customers.edit');

  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs(drill.from), dayjs(drill.to)]);
  const [filters, setFilters] = useState<UtmStatsFilters>(() => dropUnknownUtmIds(utms, initialFilters));
  const [status, setStatus] = useState<string | undefined>(drill.status);
  const [searchText, setSearchText] = useState('');
  const debounced = useDebounce(searchText, 300);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const params = useMemo(
    () => ({
      from: range[0].format('YYYY-MM-DD'),
      to: range[1].format('YYYY-MM-DD'),
      ...toStatsFilterParams(filters),
      status,
      search: debounced.trim() || undefined,
      page,
      limit: UTM_STATS_CUSTOMERS_PAGE_SIZE,
    }),
    [range, filters, status, debounced, page],
  );
  const { data, isLoading, isFetching, isError, error } = useUtmStatsCustomers(params, true);
  const rows = useMemo(() => data?.data ?? [], [data]);

  // Đổi trang/lọc -> bỏ chọn; dữ liệu làm mới (khách biến khỏi trang) -> chỉ giữ ID còn hiển thị.
  useEffect(() => setSelected([]), [page, range, filters, status, debounced]);
  useEffect(() => {
    setSelected((prev) => pruneSelection(prev, rows.map((r) => r.id)));
  }, [rows]);

  // Sau khi sửa/gỡ UTM: làm mới chart + bảng này (key dưới ['utms']) + danh sách khách.
  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['utms'] });
    queryClient.invalidateQueries({ queryKey: ['customers'] });
  };

  const goBackIfEmptied = (removedAll: boolean) => {
    if (removedAll && page > 1) setPage(page - 1);
  };

  const openEditCustomer = async (row: UtmCustomerRow) => {
    if (busyId !== null) return;
    setBusyId(row.id);
    try {
      setEditingCustomer(await customersApi.getCustomer(row.id));
    } catch (e) {
      toastApiError(message, e, 'Không tải được thông tin khách hàng');
    } finally {
      setBusyId(null);
    }
  };

  // Gỡ UTM nhanh: PATCH { utmId: null } - đúng payload CustomerForm gửi khi bỏ chọn UTM.
  const removeUtmFromCustomer = async (row: UtmCustomerRow) => {
    if (busyId !== null) return;
    setBusyId(row.id);
    try {
      await customersApi.updateCustomer(row.id, { utmId: null });
      message.success(`Đã gỡ UTM khỏi khách hàng "${row.name}"`);
      goBackIfEmptied(rows.length <= 1);
      refreshAll();
    } catch (e) {
      toastApiError(message, e, 'Gỡ UTM thất bại');
    } finally {
      setBusyId(null);
    }
  };

  // Gỡ UTM hàng loạt: khách trong bảng thuộc NHIỀU UTM mà API nhận 1 UTM/lần -> gom theo UTM, mỗi UTM 1 request.
  // Nhóm nào lỗi mạng thì mọi khách trong nhóm được liệt kê kèm lý do (không mất dấu khách nào).
  const bulkRemoveUtm = async () => {
    if (bulkBusy || selected.length === 0) return;
    const groups = groupCustomerIdsByUtm(selected, rows);
    if (groups.size === 0) return;
    const rowsById = new Map(rows.map((r) => [r.id, r]));
    setBulkBusy(true);
    try {
      const entries = [...groups];
      const settled = await Promise.allSettled(entries.map(([utmId, ids]) => customersApi.bulkRemoveUtm(utmId, ids)));
      const succeeded: number[] = [];
      const failed: Array<{ id: number; reason: string }> = [];
      settled.forEach((res, i) => {
        if (res.status === 'fulfilled') {
          succeeded.push(...res.value.succeeded);
          failed.push(...res.value.failed);
        } else {
          const reason = getApiErrorMessage(res.reason, 'Gỡ UTM thất bại');
          entries[i][1].forEach((id) => failed.push({ id, reason }));
        }
      });
      const summary = summarizeBulkResult({ succeeded, failed }, 'gỡ UTM', (id) => rowsById.get(id)?.name, 'khách hàng');
      message[summary.level](summary.text);
      if (summary.failures.length > 0) {
        modal.warning({
          title: 'Một số khách chưa gỡ được UTM',
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
      const done = new Set(succeeded);
      setSelected((prev) => prev.filter((id) => !done.has(id)));
      goBackIfEmptied(rows.every((r) => done.has(r.id)));
      refreshAll();
    } finally {
      setBulkBusy(false);
    }
  };

  const columns: ColumnsType<UtmCustomerRow> = useMemo(
    () => [
      { title: 'STT', key: 'stt', width: 50, align: 'center', render: (_, __, i) => (page - 1) * UTM_STATS_CUSTOMERS_PAGE_SIZE + i + 1 },
      {
        title: 'Ngày nhập',
        key: 'inputDate',
        width: 100,
        render: (_, r) => {
          const d = r.inputDate ?? r.createdAt;
          return d ? dayjs(d).format('DD/MM/YYYY') : '—';
        },
      },
      {
        title: 'Họ và tên',
        dataIndex: 'name',
        key: 'name',
        width: 190,
        render: (n: string, r) =>
          canEditCustomer ? (
            <Tooltip title="Bấm để mở & sửa nhanh khách hàng">
              <Button type="link" size="small" style={{ padding: 0, height: 'auto', fontWeight: 600 }} onClick={() => openEditCustomer(r)}>
                {n}
              </Button>
            </Tooltip>
          ) : (
            <Text strong>{n}</Text>
          ),
      },
      { title: 'SĐT', dataIndex: 'phone', key: 'phone', width: 115, render: (v: string | null) => v || '—' },
      {
        title: 'UTM',
        key: 'utm',
        width: 150,
        render: (_, r) => (r.utm ? <UtmTag name={r.utm.name} color={r.utm.color} inactive={!r.utm.isActive} /> : <UtmTag name={null} />),
      },
      { title: 'Nguồn', dataIndex: 'source', key: 'source', width: 90, render: (s?: string) => <SourceTag source={s} /> },
      { title: 'Sales chính', key: 'sales', width: 130, ellipsis: true, render: (_, r) => r.salesUser?.name || '—' },
      { title: 'Marketing', key: 'marketing', width: 130, ellipsis: true, render: (_, r) => r.marketingUser?.name || '—' },
      { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 110, render: (s?: string) => <StatusTag code={s} fallback="—" /> },
      ...(canEditCustomer
        ? [
            {
              title: 'Thao tác',
              key: 'action',
              width: 210,
              fixed: 'right' as const,
              render: (_: unknown, r: UtmCustomerRow) => {
                const busy = busyId === r.id;
                const blocked = bulkBusy || (busyId !== null && !busy);
                return (
                  <Space size={4} wrap>
                    <Button size="small" icon={<EditOutlined />} loading={busy} disabled={blocked} onClick={() => openEditCustomer(r)}>
                      Sửa nhanh
                    </Button>
                    <Popconfirm
                      title={`Gỡ UTM khỏi khách "${r.name}"?`}
                      description="Khách sẽ không còn thuộc UTM này (dữ liệu khác giữ nguyên)."
                      okText="Gỡ UTM"
                      cancelText="Huỷ"
                      onConfirm={() => removeUtmFromCustomer(r)}
                    >
                      <Button size="small" icon={<DisconnectOutlined />} disabled={blocked}>
                        Gỡ UTM
                      </Button>
                    </Popconfirm>
                  </Space>
                );
              },
            },
          ]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, canEditCustomer, busyId, bulkBusy, rows],
  );

  const handleRange = (vals: null | [Dayjs | null, Dayjs | null]) => {
    if (!vals || !vals[0] || !vals[1]) return;
    if (vals[1].diff(vals[0], 'day') + 1 > UTM_STATS_MAX_SPAN_DAYS) {
      message.warning(`Chỉ xem tối đa ${UTM_STATS_MAX_SPAN_DAYS} ngày mỗi lần`);
      return;
    }
    setRange([vals[0], vals[1]]);
    setPage(1);
  };

  return (
    <>
      <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
        Chỉ hiện khách hàng nằm trong phạm vi xem của bạn (không gồm Thùng rác). Bộ lọc ở đây chỉ áp cho bảng này, không đổi biểu đồ.
      </Text>

      <Space orientation="vertical" size={8} style={{ width: '100%', marginBottom: 12 }}>
        <Space size={[8, 8]} wrap>
          <RangePicker
            value={range}
            onChange={handleRange}
            allowClear={false}
            format="DD/MM/YYYY"
            disabledDate={(d) => d.isAfter(dayjs(), 'day')}
            placeholder={['Từ ngày', 'Đến ngày']}
          />
          <Select
            allowClear
            showSearch
            style={{ minWidth: 170 }}
            placeholder="Trạng thái"
            aria-label="Lọc theo trạng thái khách"
            value={status}
            onChange={(v) => {
              setStatus(v ?? undefined);
              setPage(1);
            }}
            optionFilterProp="label"
            options={statuses.map((s) => ({ value: s.code, label: s.name }))}
          />
          <Input
            allowClear
            style={{ width: 220 }}
            prefix={<SearchOutlined />}
            placeholder="Tìm theo tên, SĐT..."
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setPage(1);
            }}
          />
        </Space>
        <UtmStatsQuickFilters
          utms={utms}
          value={filters}
          onChange={(next) => {
            setFilters(next);
            setPage(1);
          }}
        />
      </Space>

      {isError && <Alert type="error" showIcon style={{ marginBottom: 8 }} title={getApiErrorMessage(error, 'Không tải được danh sách khách hàng')} />}

      <BulkActionBar count={selected.length} onClear={() => setSelected([])} disabled={bulkBusy}>
        <Popconfirm
          title={`Gỡ UTM khỏi ${selected.length} khách?`}
          description="Các khách đã chọn sẽ không còn thuộc UTM hiện tại của họ (dữ liệu khác giữ nguyên)."
          okText="Gỡ UTM"
          cancelText="Huỷ"
          onConfirm={bulkRemoveUtm}
        >
          <Button size="small" icon={<DisconnectOutlined />} loading={bulkBusy}>
            Gỡ UTM ({selected.length})
          </Button>
        </Popconfirm>
      </BulkActionBar>

      <Table<UtmCustomerRow>
        rowKey="id"
        size="small"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={rows}
        rowSelection={
          canEditCustomer
            ? {
                selectedRowKeys: selected,
                onChange: (keys) => setSelected(keys as number[]),
                fixed: true,
                getCheckboxProps: () => ({ disabled: bulkBusy }),
              }
            : undefined
        }
        scroll={{ x: sumColumnWidths(columns) + (canEditCustomer ? 48 : 0) }}
        locale={{ emptyText: 'Không có khách nào với bộ lọc này' }}
        pagination={{
          current: page,
          pageSize: UTM_STATS_CUSTOMERS_PAGE_SIZE,
          total: data?.total ?? 0,
          showSizeChanger: false,
          hideOnSinglePage: true,
          showTotal: (t) => `${t} khách`,
          onChange: setPage,
        }}
      />

      {/* Modal sửa khách nằm SAU bảng trong cây -> nổi lên trên Drawer. Lưu xong làm mới chart + bảng. */}
      <CustomerForm open={editingCustomer !== null} customer={editingCustomer} onClose={() => setEditingCustomer(null)} onSuccess={refreshAll} />
    </>
  );
}
