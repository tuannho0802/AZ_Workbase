'use client';

import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Alert, App, Button, Col, Input, Modal, Popconfirm, Row, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, SearchOutlined, UndoOutlined } from '@ant-design/icons';
import { useUtmCustomers } from '@/lib/hooks/useUtms';
import type { UtmCustomerRow } from '@/lib/api/utms.api';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { customersApi } from '@/lib/api/customers.api';
import { useCustomerStatuses } from '@/lib/hooks/useCustomerStatuses';
import { SourceTag } from '@/components/customers/SourceTag';
import { StatusTag } from '@/components/customers/StatusTag';
import { getApiErrorMessage, toastApiError } from '@/lib/utils/error-message.util';

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
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { can } = useMyPermissions();
  const canTrash = can('customers.trash_manage');
  const canHardDelete = can('customers.hard_delete');
  const [trashedMode, setTrashedMode] = useState<TrashedMode>('include');
  const [busyId, setBusyId] = useState<number | null>(null);

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
        render: (n: string, r) =>
          r.deletedAt ? (
            <Space size={4} wrap>
              <Text strong delete type="secondary">{n}</Text>
              <Tooltip title={`Xoá lúc ${dayjs(r.deletedAt).format('DD/MM/YYYY HH:mm')}`}>
                <Tag color="red" style={{ marginInlineEnd: 0 }}>Thùng rác</Tag>
              </Tooltip>
            </Space>
          ) : (
            <Text strong>{n}</Text>
          ),
      },
      { title: 'SĐT', dataIndex: 'phone', key: 'phone', width: 115, render: (v: string | null) => v || '—' },
      { title: 'Nguồn', dataIndex: 'source', key: 'source', width: 90, render: (s?: string) => <SourceTag source={s} /> },
      { title: 'Sales chính', key: 'sales', width: 140, ellipsis: true, render: (_, r) => r.salesUser?.name || '—' },
      { title: 'Marketing', key: 'marketing', width: 140, ellipsis: true, render: (_, r) => r.marketingUser?.name || '—' },
      { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 110, render: (s?: string) => <StatusTag code={s} fallback="—" /> },
      ...(canTrash
        ? [
            {
              title: 'Thao tác',
              key: 'action',
              width: 210,
              fixed: 'right' as const,
              render: (_: unknown, r: UtmCustomerRow) => {
                if (!r.deletedAt) return <Text type="secondary">—</Text>;
                const busy = busyId === r.id;
                return (
                  <Space size={4} wrap>
                    <Button size="small" icon={<UndoOutlined />} loading={busy} disabled={busyId !== null && !busy} onClick={() => runTrashAction(r, 'restore')}>
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
                        <Button size="small" danger icon={<DeleteOutlined />} loading={busy} disabled={busyId !== null && !busy}>
                          Xoá vĩnh viễn
                        </Button>
                      </Popconfirm>
                    )}
                  </Space>
                );
              },
            },
          ]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, canTrash, canHardDelete, busyId, data],
  );

  return (
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
      <Table<UtmCustomerRow>
        rowKey="id"
        size="small"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={data?.data ?? []}
        scroll={{ x: canTrash ? 1010 : 800 }}
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
  );
}
