'use client';

import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Alert, App, Button, Col, Input, Modal, Popconfirm, Row, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, DisconnectOutlined, EditOutlined, SearchOutlined, UndoOutlined } from '@ant-design/icons';
import { useUtmCustomers } from '@/lib/hooks/useUtms';
import type { UtmCustomerRow } from '@/lib/api/utms.api';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { customersApi } from '@/lib/api/customers.api';
import type { Customer } from '@/lib/types/customer.types';
import { CustomerForm } from '@/components/customers/CustomerForm';
import { sumColumnWidths } from '@/lib/utils/table-width.util';
import { useCustomerStatuses } from '@/lib/hooks/useCustomerStatuses';
import { SourceTag } from '@/components/customers/SourceTag';
import { StatusTag } from '@/components/customers/StatusTag';
import { getApiErrorMessage, toastApiError } from '@/lib/utils/error-message.util';
import { BulkActionBar } from '@/components/common/BulkActionBar';
import { pruneSelection, summarizeBulkResult } from '@/lib/utils/bulk-result.util';

const { Text } = Typography;

export const UTM_CUSTOMERS_PAGE_SIZE = 10;

interface Props {
  open: boolean;
  onClose: () => void;
  utmId: number | null;
  utmName?: string;
}

type TrashedMode = 'exclude' | 'include' | 'only';

/**
 * Khách hàng của 1 UTM. Người có `customers.trash_manage` thấy cả khách trong Thùng rác (mặc định hiện lẫn) và
 * có thể Khôi phục / Xoá vĩnh viễn (`customers.hard_delete`) ngay tại đây - khách Thùng rác vẫn chặn xoá UTM.
 * Số liệu ĐÃ lọc theo phạm vi `customers.view` của người xem - quản lý UTM KHÔNG mở rộng quyền xem khách hàng,
 * nên số ở nút "Khách hàng (N)" (không tính Thùng rác) có thể nhỏ hơn tổng thật của UTM.
 */
export function UtmCustomersModal({ open, onClose, utmId, utmName }: Props) {
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState('');
  const debounced = useDebounce(searchText, 300);
  const [status, setStatus] = useState<string | undefined>();
  const { statuses } = useCustomerStatuses();
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const { can } = useMyPermissions();
  const canTrash = can('customers.trash_manage');
  const canHardDelete = can('customers.hard_delete');
  // Sửa nhanh khách ngay tại đây - CÙNG permission với PATCH /customers/:id (BE vẫn tự chặn theo phạm vi).
  const canEditCustomer = can('customers.edit');
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [trashedMode, setTrashedMode] = useState<TrashedMode>('include');
  const [busyId, setBusyId] = useState<number | null>(null);
  // Chọn nhiều khách để Gỡ UTM hàng loạt - CHỈ trong trang/bộ lọc đang xem (đổi trang/lọc -> xoá chọn) để người dùng
  // luôn thấy đúng những khách mình đang thao tác.
  const [selected, setSelected] = useState<number[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  const params = useMemo(
    () => ({
      page,
      limit: UTM_CUSTOMERS_PAGE_SIZE,
      search: debounced.trim() || undefined,
      status,
      // Không có quyền Thùng rác thì KHÔNG gửi (BE trả 403 với include/only).
      trashed: canTrash && trashedMode !== 'exclude' ? trashedMode : undefined,
    }),
    [page, debounced, status, canTrash, trashedMode],
  );
  const { data, isLoading, isFetching, isError, error } = useUtmCustomers(open ? utmId : null, params);

  // Đổi trang/tìm kiếm/lọc -> bỏ chọn; dữ liệu làm mới (khách biến khỏi trang) -> chỉ giữ ID còn hiển thị.
  useEffect(() => setSelected([]), [page, debounced, status, trashedMode]);
  useEffect(() => {
    if (!data) return;
    setSelected((prev) => pruneSelection(prev, data.data.filter((r) => !r.deletedAt).map((r) => r.id)));
  }, [data]);

  // Sau khi đổi Thùng rác: làm mới danh sách này + số đếm/nút xoá UTM + danh sách khách + badge sidebar.
  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['utms'] });
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    queryClient.invalidateQueries({ queryKey: ['badge-count', 'trash-can'] });
  };

  const runTrashAction = async (row: UtmCustomerRow, action: 'restore' | 'hardDelete') => {
    if (busyId !== null) return; // chặn bấm đúp
    setBusyId(row.id);
    try {
      if (action === 'restore') {
        await customersApi.restoreCustomer(row.id);
        message.success(`Đã khôi phục khách hàng "${row.name}"`);
      } else {
        await customersApi.hardDeleteCustomer(row.id);
        message.success(`Đã xoá vĩnh viễn khách hàng "${row.name}"`);
      }
      // Xoá dòng cuối của trang > 1 thì lùi 1 trang để không rơi vào trang trống.
      if ((data?.data.length ?? 0) <= 1 && page > 1) setPage(page - 1);
      refreshAll();
    } catch (e) {
      toastApiError(message, e, action === 'restore' ? 'Khôi phục thất bại' : 'Xoá vĩnh viễn thất bại');
    } finally {
      setBusyId(null);
    }
  };

  // Mở modal sửa khách (CustomerForm - CÙNG form với trang Khách hàng, đổi được mọi trường kể cả UTM).
  // Danh sách mini chỉ có vài trường nên phải tải đủ hồ sơ khách trước khi mở.
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

  // Gỡ UTM nhanh: PATCH { utmId: null } - đúng payload CustomerForm gửi khi bỏ chọn UTM. Khách khỏi danh
  // sách UTM này sau khi làm mới; các dữ liệu khác của khách giữ nguyên.
  const removeUtmFromCustomer = async (row: UtmCustomerRow) => {
    if (busyId !== null) return;
    setBusyId(row.id);
    try {
      await customersApi.updateCustomer(row.id, { utmId: null });
      message.success(`Đã gỡ UTM khỏi khách hàng "${row.name}"`);
      if ((data?.data.length ?? 0) <= 1 && page > 1) setPage(page - 1);
      refreshAll();
    } catch (e) {
      toastApiError(message, e, 'Gỡ UTM thất bại');
    } finally {
      setBusyId(null);
    }
  };

  // Gỡ UTM hàng loạt: 1 request PATCH /customers/bulk-remove-utm (BE trả 200 kèm `failed` từng khách nên không bị
  // toast lỗi N lần). Khách thành công biến khỏi danh sách; khách lỗi được liệt kê kèm lý do.
  const bulkRemoveUtm = async () => {
    if (bulkBusy || utmId == null || selected.length === 0) return;
    const rowsById = new Map((data?.data ?? []).map((r) => [r.id, r]));
    const ids = selected.filter((id) => rowsById.has(id) && !rowsById.get(id)?.deletedAt);
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const result = await customersApi.bulkRemoveUtm(utmId, ids);
      const summary = summarizeBulkResult(result, 'gỡ UTM', (id) => rowsById.get(id)?.name, 'khách hàng');
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
      const done = new Set(result.succeeded);
      setSelected((prev) => prev.filter((id) => !done.has(id)));
      // Gỡ hết khách của trang > 1 thì lùi 1 trang để không rơi vào trang trống.
      if (page > 1 && (data?.data ?? []).every((r) => done.has(r.id) || r.deletedAt)) setPage(page - 1);
      refreshAll();
    } catch (e) {
      toastApiError(message, e, 'Gỡ UTM hàng loạt thất bại');
    } finally {
      setBulkBusy(false);
    }
  };

  const columns: ColumnsType<UtmCustomerRow> = useMemo(
    () => [
      { title: 'STT', key: 'stt', width: 50, align: 'center', render: (_, __, i) => (page - 1) * UTM_CUSTOMERS_PAGE_SIZE + i + 1 },
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
        width: 200,
        render: (n: string, r) =>
          r.deletedAt ? (
            <Space size={4} wrap>
              <Text strong delete type="secondary">{n}</Text>
              <Tooltip title={`Xoá lúc ${dayjs(r.deletedAt).format('DD/MM/YYYY HH:mm')}`}>
                <Tag color="red" style={{ marginInlineEnd: 0 }}>Thùng rác</Tag>
              </Tooltip>
            </Space>
          ) : canEditCustomer ? (
            // Bấm tên -> mở modal sửa nhanh khách.
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
      { title: 'Nguồn', dataIndex: 'source', key: 'source', width: 90, render: (s?: string) => <SourceTag source={s} /> },
      { title: 'Sales chính', key: 'sales', width: 140, ellipsis: true, render: (_, r) => r.salesUser?.name || '—' },
      { title: 'Marketing', key: 'marketing', width: 140, ellipsis: true, render: (_, r) => r.marketingUser?.name || '—' },
      { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 110, render: (s?: string) => <StatusTag code={s} fallback="—" /> },
      ...(canTrash || canEditCustomer
        ? [
            {
              title: 'Thao tác',
              key: 'action',
              width: canTrash ? 230 : 210,
              fixed: 'right' as const,
              render: (_: unknown, r: UtmCustomerRow) => {
                const busy = busyId === r.id;
                if (r.deletedAt) {
                  if (!canTrash) return <Text type="secondary">—</Text>;
                  return (
                    <Space size={4} wrap>
                      <Button size="small" icon={<UndoOutlined />} loading={busy} disabled={bulkBusy || (busyId !== null && !busy)} onClick={() => runTrashAction(r, 'restore')}>
                        Khôi phục
                      </Button>
                      {canHardDelete && (
                        <Popconfirm
                          title={`Xoá vĩnh viễn "${r.name}"?`}
                          description="Không thể khôi phục sau khi xoá."
                          okText="Xoá vĩnh viễn"
                          okButtonProps={{ danger: true }}
                          cancelText="Huỷ"
                          onConfirm={() => runTrashAction(r, 'hardDelete')}
                        >
                          <Button size="small" danger icon={<DeleteOutlined />} loading={busy} disabled={bulkBusy || (busyId !== null && !busy)}>
                            Xoá vĩnh viễn
                          </Button>
                        </Popconfirm>
                      )}
                    </Space>
                  );
                }
                // Khách đang dùng: sửa nhanh / gỡ UTM (cần customers.edit).
                if (!canEditCustomer) return <Text type="secondary">—</Text>;
                return (
                  <Space size={4} wrap>
                    <Button size="small" icon={<EditOutlined />} loading={busy} disabled={bulkBusy || (busyId !== null && !busy)} onClick={() => openEditCustomer(r)}>
                      Sửa nhanh
                    </Button>
                    <Popconfirm
                      title={`Gỡ UTM khỏi khách "${r.name}"?`}
                      description="Khách sẽ không còn thuộc UTM này (dữ liệu khác giữ nguyên)."
                      okText="Gỡ UTM"
                      cancelText="Huỷ"
                      onConfirm={() => removeUtmFromCustomer(r)}
                    >
                      <Button size="small" icon={<DisconnectOutlined />} disabled={bulkBusy || (busyId !== null && !busy)}>
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
    [page, canTrash, canHardDelete, canEditCustomer, busyId, bulkBusy, data],
  );

  return (
    <>
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={960}
      destroyOnHidden
      title={utmName ? `Khách hàng của UTM — ${utmName}` : 'Khách hàng của UTM'}
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
        Chỉ hiện khách hàng nằm trong phạm vi xem của bạn.
        {canTrash && ' Khách trong Thùng rác vẫn chặn việc xoá UTM — hãy xoá vĩnh viễn hoặc khôi phục chúng.'}
      </Text>
      <Row gutter={[8, 8]} style={{ marginBottom: 12 }}>
        <Col xs={24} md={12}>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Tìm theo tên, SĐT..."
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setPage(1);
            }}
          />
        </Col>
        <Col xs={24} md={6}>
          <Select
            allowClear
            placeholder="Trạng thái"
            style={{ width: '100%' }}
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={statuses.map((s) => ({ value: s.code, label: s.name }))}
          />
        </Col>
        {canTrash && (
          <Col xs={24} md={6}>
            <Select
              style={{ width: '100%' }}
              value={trashedMode}
              onChange={(v: TrashedMode) => {
                setTrashedMode(v);
                setPage(1);
              }}
              options={[
                { value: 'include', label: 'Tất cả (kể cả Thùng rác)' },
                { value: 'exclude', label: 'Đang dùng' },
                { value: 'only', label: 'Chỉ Thùng rác' },
              ]}
            />
          </Col>
        )}
      </Row>
      {isError && <Alert type="error" showIcon style={{ marginBottom: 8 }} message={getApiErrorMessage(error, 'Không tải được danh sách khách hàng')} />}
      <BulkActionBar count={selected.length} onClear={() => setSelected([])} disabled={bulkBusy}>
        <Popconfirm
          title={`Gỡ UTM khỏi ${selected.length} khách?`}
          description="Các khách đã chọn sẽ không còn thuộc UTM này (dữ liệu khác giữ nguyên)."
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
        dataSource={data?.data ?? []}
        // Chỉ người có customers.edit (cùng quyền với Gỡ UTM từng khách) mới chọn được; khách trong Thùng rác không chọn.
        rowSelection={
          canEditCustomer
            ? {
                selectedRowKeys: selected,
                onChange: (keys) => setSelected(keys as number[]),
                fixed: true,
                getCheckboxProps: (r) => ({ disabled: !!r.deletedAt || bulkBusy }),
              }
            : undefined
        }
        scroll={{ x: sumColumnWidths(columns) + (canEditCustomer ? 48 : 0) }}
        pagination={{
          current: page,
          pageSize: UTM_CUSTOMERS_PAGE_SIZE,
          total: data?.total ?? 0,
          showSizeChanger: false,
          hideOnSinglePage: true,
          onChange: setPage,
        }}
      />
    </Modal>

    {/* Modal sửa khách nằm SAU Modal danh sách trong cây -> luôn nổi lên trên. Lưu xong thì làm mới danh sách
        UTM (khách đổi/gỡ UTM sẽ biến khỏi danh sách này), số đếm và danh sách khách. */}
    <CustomerForm
      open={editingCustomer !== null}
      customer={editingCustomer}
      onClose={() => setEditingCustomer(null)}
      onSuccess={refreshAll}
    />
    </>
  );
}
