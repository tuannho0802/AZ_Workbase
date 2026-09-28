'use client';

import { useEffect, useMemo, useState } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import { Modal, Table, Typography, Input, Select, DatePicker, Row, Col, Tag, Alert, Button, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SearchOutlined } from '@ant-design/icons';
import { useGroupCustomers } from '@/lib/hooks/useLinkGroups';
import { GroupCustomerRow } from '@/lib/api/link-groups.api';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { useMediaSources } from '@/lib/hooks/useMediaSources';
import { useCustomerStatuses } from '@/lib/hooks/useCustomerStatuses';
import { useAssignmentGroupUsers } from '@/lib/hooks/useAssignmentGroups';
import { SourceTag } from '@/components/customers/SourceTag';
import { StatusTag } from '@/components/customers/StatusTag';

const { Text } = Typography;
const { RangePicker } = DatePicker;

/** Số dòng/trang của mini table (BE giới hạn tối đa 50). */
export const GROUP_CUSTOMERS_PAGE_SIZE = 10;

interface Props {
  open: boolean;
  onClose: () => void;
  groupId: number | null;
  groupName?: string;
}

/**
 * GroupCustomersModal - mini table "Khách hàng đã join nhóm" mở từ nút
 * "Xem khách hàng (N)" ở trang "Nhóm tôi quản lý". Cùng phong cách
 * `TaskCustomersModal` (rút gọn từ bảng /customers) nhưng lọc + phân trang
 * SERVER-SIDE (`GET /link-groups/:id/customers`) vì 1 nhóm có thể có hàng
 * trăm khách. Chỉ xem (read-only). Bộ lọc: tìm tên/SĐT, Nguồn, Trạng thái,
 * Sales, Marketing, khoảng "Ngày nhập" - cùng ý nghĩa với trang Khách hàng.
 */
export function GroupCustomersModal({ open, onClose, groupId, groupName }: Props) {
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useDebounce(searchText, 300);
  const [source, setSource] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [salesUserId, setSalesUserId] = useState<number | undefined>();
  const [marketingUserId, setMarketingUserId] = useState<number | undefined>();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  // Mở modal / đổi nhóm -> reset toàn bộ bộ lọc + về trang 1.
  useEffect(() => {
    if (open) {
      setPage(1);
      setSearchText('');
      setSource(undefined);
      setStatus(undefined);
      setSalesUserId(undefined);
      setMarketingUserId(undefined);
      setRange(null);
    }
  }, [open, groupId]);

  const { sources } = useMediaSources(false);
  const { statuses } = useCustomerStatuses();
  const { users: salesUsers } = useAssignmentGroupUsers(open ? 'sales' : undefined);
  const { users: marketingUsers } = useAssignmentGroupUsers(open ? 'marketing' : undefined);

  const params = useMemo(
    () => ({
      page,
      limit: GROUP_CUSTOMERS_PAGE_SIZE,
      search: debouncedSearch.trim() || undefined,
      source,
      status,
      salesUserId,
      marketingUserId,
      dateFrom: range?.[0]?.format('YYYY-MM-DD'),
      dateTo: range?.[1]?.format('YYYY-MM-DD'),
    }),
    [page, debouncedSearch, source, status, salesUserId, marketingUserId, range],
  );

  const { data, isLoading, isFetching, isError, error } = useGroupCustomers(open ? groupId : null, params);

  const hasFilter = !!(debouncedSearch || source || status || salesUserId || marketingUserId || range);
  const resetFilters = () => {
    setSearchText('');
    setSource(undefined);
    setStatus(undefined);
    setSalesUserId(undefined);
    setMarketingUserId(undefined);
    setRange(null);
    setPage(1);
  };

  const columns: ColumnsType<GroupCustomerRow> = useMemo(
    () => [
      {
        title: 'STT',
        key: 'stt',
        width: 50,
        align: 'center',
        render: (_, __, index) => (page - 1) * GROUP_CUSTOMERS_PAGE_SIZE + index + 1,
      },
      {
        title: 'Ngày nhập',
        dataIndex: 'inputDate',
        key: 'inputDate',
        width: 100,
        render: (date: string | null, record) => {
          const text = date ? dayjs(date).format('DD/MM/YYYY') : '—';
          return (
            <Tooltip title={`Ngày nhập thực tế: ${dayjs(record.createdAt).format('HH:mm DD/MM/YYYY')}`}>
              <span style={{ cursor: 'help' }}>{text}</span>
            </Tooltip>
          );
        },
      },
      {
        title: 'Họ và tên',
        dataIndex: 'name',
        key: 'name',
        width: 170,
        render: (name: string) => (
          <Text strong style={{ color: '#1890ff' }}>
            {name}
          </Text>
        ),
      },
      {
        title: 'SĐT',
        dataIndex: 'phone',
        key: 'phone',
        width: 115,
        render: (val: string | null) => val || <span style={{ color: '#aaa', fontStyle: 'italic' }}>Chưa có SĐT</span>,
      },
      {
        title: 'Nguồn',
        dataIndex: 'source',
        key: 'source',
        width: 90,
        render: (s?: string) => <SourceTag source={s} />,
      },
      {
        title: 'Sales chính',
        key: 'salesUser',
        width: 140,
        ellipsis: true,
        render: (_, r) => r.salesUser?.name || '—',
      },
      {
        title: 'Marketing',
        key: 'marketingUser',
        width: 140,
        ellipsis: true,
        render: (_, r) => r.marketingUser?.name || '—',
      },
      {
        title: 'Trạng thái',
        dataIndex: 'status',
        key: 'status',
        width: 110,
        render: (s?: string) => <StatusTag code={s} fallback="—" />,
      },
      {
        title: 'Ngày join nhóm',
        dataIndex: 'joinedAt',
        key: 'joinedAt',
        width: 120,
        render: (d: string | null) => (d ? dayjs(d).format('DD/MM/YYYY') : '—'),
      },
    ],
    [page],
  );

  const userOptions = (users: { id: number; name: string }[]) => users.map((u) => ({ value: u.id, label: u.name }));

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={1000}
      destroyOnHidden
      title={groupName ? `Khách hàng trong nhóm — ${groupName}` : 'Khách hàng trong nhóm'}
    >
      <Row gutter={[8, 8]} style={{ marginBottom: 12 }}>
        <Col xs={24} md={8}>
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
        <Col xs={12} md={4}>
          <Select
            allowClear
            style={{ width: '100%' }}
            placeholder="Nguồn"
            value={source}
            onChange={(v) => {
              setSource(v);
              setPage(1);
            }}
            options={sources.map((s) => ({ value: s.name, label: <SourceTag source={s.name} /> }))}
          />
        </Col>
        <Col xs={12} md={4}>
          <Select
            allowClear
            style={{ width: '100%' }}
            placeholder="Trạng thái"
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={statuses
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((s) => ({
                value: s.code,
                label: (
                  <Tag color={s.color} style={{ marginInlineEnd: 0 }}>
                    {s.name}
                  </Tag>
                ),
              }))}
          />
        </Col>
        <Col xs={12} md={4}>
          <Select
            allowClear
            showSearch={{ optionFilterProp: 'label' }}
            style={{ width: '100%' }}
            placeholder="Sales"
            value={salesUserId}
            onChange={(v) => {
              setSalesUserId(v);
              setPage(1);
            }}
            options={userOptions(salesUsers)}
          />
        </Col>
        <Col xs={12} md={4}>
          <Select
            allowClear
            showSearch={{ optionFilterProp: 'label' }}
            style={{ width: '100%' }}
            placeholder="Marketing"
            value={marketingUserId}
            onChange={(v) => {
              setMarketingUserId(v);
              setPage(1);
            }}
            options={userOptions(marketingUsers)}
          />
        </Col>
        <Col xs={24} md={8}>
          <RangePicker
            style={{ width: '100%' }}
            format="DD/MM/YYYY"
            placeholder={['Ngày nhập từ', 'đến']}
            value={range as [Dayjs, Dayjs] | null}
            onChange={(v) => {
              setRange(v && v[0] && v[1] ? [v[0], v[1]] : null);
              setPage(1);
            }}
          />
        </Col>
        {hasFilter && (
          <Col xs={24} md={4}>
            <Button onClick={resetFilters}>Xoá bộ lọc</Button>
          </Col>
        )}
      </Row>

      {isError ? (
        <Alert
          type="warning"
          showIcon
          message={
            (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
            'Không thể tải danh sách khách hàng của nhóm này.'
          }
        />
      ) : (
        <Table<GroupCustomerRow>
          size="small"
          rowKey="id"
          loading={isLoading || isFetching}
          columns={columns}
          dataSource={data?.data ?? []}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: page,
            pageSize: GROUP_CUSTOMERS_PAGE_SIZE,
            total: data?.total ?? 0,
            showSizeChanger: false,
            hideOnSinglePage: true,
            showTotal: (total) => `Tổng ${total} khách hàng`,
            onChange: (p) => setPage(p),
          }}
          locale={{ emptyText: hasFilter ? 'Không có khách nào khớp bộ lọc' : 'Chưa có khách hàng nào join nhóm này' }}
        />
      )}
    </Modal>
  );
}
