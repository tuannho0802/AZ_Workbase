'use client';

import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Alert, Col, Input, Modal, Row, Select, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SearchOutlined } from '@ant-design/icons';
import { useUtmCustomers } from '@/lib/hooks/useUtms';
import type { UtmCustomerRow } from '@/lib/api/utms.api';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { useCustomerStatuses } from '@/lib/hooks/useCustomerStatuses';
import { SourceTag } from '@/components/customers/SourceTag';
import { StatusTag } from '@/components/customers/StatusTag';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';

const { Text } = Typography;

export const UTM_CUSTOMERS_PAGE_SIZE = 10;

interface Props {
  open: boolean;
  onClose: () => void;
  utmId: number | null;
  utmName?: string;
}

/**
 * Khách hàng của 1 UTM (chỉ xem). Số liệu ĐÃ lọc theo phạm vi `customers.view` của người xem - quản lý UTM
 * KHÔNG mở rộng quyền xem khách hàng, nên số ở nút "Khách hàng (N)" có thể nhỏ hơn tổng thật của UTM.
 */
export function UtmCustomersModal({ open, onClose, utmId, utmName }: Props) {
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState('');
  const debounced = useDebounce(searchText, 300);
  const [status, setStatus] = useState<string | undefined>();
  const { statuses } = useCustomerStatuses();

  const params = useMemo(
    () => ({ page, limit: UTM_CUSTOMERS_PAGE_SIZE, search: debounced.trim() || undefined, status }),
    [page, debounced, status],
  );
  const { data, isLoading, isFetching, isError, error } = useUtmCustomers(open ? utmId : null, params);

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
      { title: 'Họ và tên', dataIndex: 'name', key: 'name', render: (n: string) => <Text strong>{n}</Text> },
      { title: 'SĐT', dataIndex: 'phone', key: 'phone', width: 115, render: (v: string | null) => v || '—' },
      { title: 'Nguồn', dataIndex: 'source', key: 'source', width: 90, render: (s?: string) => <SourceTag source={s} /> },
      { title: 'Sales chính', key: 'sales', width: 140, ellipsis: true, render: (_, r) => r.salesUser?.name || '—' },
      { title: 'Marketing', key: 'marketing', width: 140, ellipsis: true, render: (_, r) => r.marketingUser?.name || '—' },
      { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 110, render: (s?: string) => <StatusTag code={s} fallback="—" /> },
    ],
    [page],
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
      </Row>
      {isError && <Alert type="error" showIcon style={{ marginBottom: 8 }} message={getApiErrorMessage(error, 'Không tải được danh sách khách hàng')} />}
      <Table<UtmCustomerRow>
        rowKey="id"
        size="small"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={data?.data ?? []}
        scroll={{ x: 800 }}
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
