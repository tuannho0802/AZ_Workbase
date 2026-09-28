'use client';

import { useEffect, useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { Alert, DatePicker, Input, Modal, Segmented, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SearchOutlined } from '@ant-design/icons';
import { useReportCustomerList } from '@/lib/hooks/useReports';
import { useCustomerStatuses } from '@/lib/hooks/useCustomerStatuses';
import { useMediaSources } from '@/lib/hooks/useMediaSources';
import { SourceTag } from '@/components/customers/SourceTag';
import { StatusTag } from '@/components/customers/StatusTag';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { formatUsd } from '@/lib/utils/marketingReport';
import type {
  ReportCustomerListFilters,
  ReportCustomerListMetric,
  ReportCustomerListQuick,
  ReportCustomerListRow,
  ReportListUser,
  ReportQuery,
} from '@/lib/types/reports.types';
import ReportUserName from './ReportUserName';

const { Text } = Typography;
const { RangePicker } = DatePicker;

/** Tối đa 10 dòng/trang - cùng quy ước Mini Table ở TaskCustomersModal. */
const PAGE_SIZE = 10;

export const METRIC_TITLE: Record<ReportCustomerListMetric, string> = {
  total: 'Data mới trong kỳ',
  closed: 'Khách đã chốt trong kỳ',
  joined: 'Khách đã join nhóm trong kỳ',
  deposited: 'Khách có nạp tiền trong kỳ',
  cohort_deposited: 'Data mới trong kỳ đã từng nạp',
  unassigned_marketing: 'Data mới chưa gán Marketing',
};

/** Yêu cầu mở modal - do tab cha tạo khi bấm thẻ/số. */
export interface CustomerDrill {
  metric: ReportCustomerListMetric;
  /** Nhãn phụ hiển thị sau tiêu đề (vd tên nhân viên, tên trạng thái). */
  label?: string;
  /** Bộ lọc gắn cứng theo chỗ được bấm (người dùng KHÔNG đổi được trong modal). */
  preset?: Pick<ReportCustomerListFilters, 'marketingUserId' | 'createdById' | 'salesUserId' | 'source'>;
  /** Giá trị khởi tạo của ô lọc trạng thái (người dùng vẫn đổi được). */
  initialStatus?: string;
}

interface Props {
  drill: CustomerDrill | null;
  onClose: () => void;
  query: ReportQuery;
  context: 'customers' | 'marketing';
}

const QUICK_OPTIONS: { value: ReportCustomerListQuick | 'all'; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'no_marketing', label: 'Chưa có Marketing' },
  { value: 'no_sales', label: 'Chưa có Sales' },
  { value: 'no_phone', label: 'Chưa có SĐT' },
];

const userCell = (u: ReportListUser | null) =>
  u ? <ReportUserName name={u.name} departmentName={u.departmentName} departmentColor={u.departmentColor} /> : <Text type="secondary">—</Text>;

/**
 * Mini Table KHÁCH HÀNG đứng sau 1 con số của trang Báo cáo (drill-down). Server-side phân trang (10/trang) +
 * tìm kiếm + lọc Trạng thái/Nguồn/Ngày nhập + Lọc nhanh. Số dòng = ĐÚNG con số trên thẻ (BE dùng cùng cột
 * ngày/múi giờ/phạm vi quyền - xem `ReportsCustomerListService`). Chỉ xem, không sửa.
 */
export default function ReportCustomersModal({ drill, onClose, query, context }: Props) {
  const open = !!drill;
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [source, setSource] = useState<string | undefined>();
  const [quick, setQuick] = useState<ReportCustomerListQuick | 'all'>('all');
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  const { statuses } = useCustomerStatuses();
  const { sources } = useMediaSources(false);

  // Mở modal (hoặc đổi sang chỉ số khác) -> reset toàn bộ bộ lọc về mặc định.
  useEffect(() => {
    if (!drill) return;
    setPage(1);
    setSearchInput('');
    setSearch('');
    setStatus(drill.initialStatus);
    setSource(undefined);
    setQuick('all');
    setRange(null);
  }, [drill]);

  // Debounce ô tìm kiếm 300ms.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const listQuery = useMemo(
    () => ({
      ...query,
      metric: drill?.metric ?? 'total',
      context,
      page,
      limit: PAGE_SIZE,
      ...(drill?.preset ?? {}),
      status,
      // preset.source (nếu có) thắng ô lọc Nguồn.
      source: drill?.preset?.source ?? source,
      search: search || undefined,
      quick: quick === 'all' ? undefined : quick,
      dateFrom: range?.[0]?.format('YYYY-MM-DD'),
      dateTo: range?.[1]?.format('YYYY-MM-DD'),
    }),
    [query, drill, context, page, status, source, search, quick, range],
  );

  const { data, isLoading, isFetching, isError, error } = useReportCustomerList(listQuery, open);
  const metric = drill?.metric ?? 'total';

  const quickOptions = QUICK_OPTIONS.filter((o) => !(metric === 'unassigned_marketing' && o.value === 'no_marketing'));

  const columns: ColumnsType<ReportCustomerListRow> = useMemo(() => {
    const cols: ColumnsType<ReportCustomerListRow> = [
      { title: 'STT', key: 'stt', width: 50, align: 'center', render: (_, __, i) => (page - 1) * PAGE_SIZE + i + 1 },
      {
        title: 'Ngày nhập',
        key: 'inputDate',
        width: 100,
        render: (_, r) => {
          const text = r.inputDate ? dayjs(r.inputDate).format('DD/MM/YYYY') : '—';
          return (
            <Tooltip title={`Tạo lúc: ${dayjs(r.createdAt).format('HH:mm DD/MM/YYYY')}`}>
              <span style={{ cursor: 'help' }}>{text}</span>
            </Tooltip>
          );
        },
      },
      { title: 'Họ và tên', dataIndex: 'name', key: 'name', width: 170, render: (n: string) => <Text strong style={{ color: '#1890ff' }}>{n}</Text> },
      {
        title: 'SĐT',
        dataIndex: 'phone',
        key: 'phone',
        width: 115,
        render: (v: string | null) => v || <span style={{ color: '#aaa', fontStyle: 'italic' }}>Chưa có SĐT</span>,
      },
      { title: 'Nguồn', dataIndex: 'source', key: 'source', width: 90, render: (v: string | null) => <SourceTag source={v} /> },
      { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 120, render: (v: string | null) => <StatusTag code={v} fallback="—" /> },
      { title: 'Sales chính', key: 'sales', width: 160, render: (_, r) => userCell(r.salesUser) },
    ];
    if (context === 'marketing') {
      cols.push(
        { title: 'Marketing phụ trách', key: 'mkt', width: 170, render: (_, r) => (r.marketingUser ? userCell(r.marketingUser) : <Tag>Chưa gán</Tag>) },
        { title: 'Người tạo', key: 'creator', width: 160, render: (_, r) => userCell(r.createdBy) },
      );
    }
    if (metric === 'closed') {
      cols.push({ title: 'Ngày chốt', key: 'closedDate', width: 100, render: (_, r) => (r.closedDate ? dayjs(r.closedDate).format('DD/MM/YYYY') : '—') });
    }
    if (metric === 'deposited') {
      cols.push({ title: 'Nạp trong kỳ', key: 'dep', width: 120, align: 'right', render: (_, r) => <Text strong style={{ color: '#389e0d' }}>{formatUsd(r.depositAmount ?? 0)}</Text> });
    }
    if (metric === 'joined') {
      cols.push({
        title: 'Nhóm đã join',
        key: 'groups',
        width: 180,
        render: (_, r) => (r.joinedGroups?.length ? r.joinedGroups.map((g) => <Tag key={g}>{g}</Tag>) : '—'),
      });
    }
    return cols;
  }, [page, context, metric]);

  const title = drill ? `${METRIC_TITLE[drill.metric]}${drill.label ? ` — ${drill.label}` : ''}` : '';
  const period = data?.period;

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={context === 'marketing' ? 1180 : 980} destroyOnHidden title={title}>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input
          allowClear
          style={{ width: 220 }}
          prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
          placeholder="Tìm tên, SĐT, email..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <Select
          allowClear
          style={{ width: 160 }}
          placeholder="Trạng thái"
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={statuses.map((s) => ({ value: s.code, label: <Tag color={s.color} style={{ marginInlineEnd: 0 }}>{s.name}</Tag> }))}
        />
        {!drill?.preset?.source && (
          <Select
            allowClear
            style={{ width: 140 }}
            placeholder="Nguồn"
            value={source}
            onChange={(v) => { setSource(v); setPage(1); }}
            options={sources.map((s) => ({ value: s.name, label: s.name }))}
          />
        )}
        <RangePicker
          format="DD/MM/YYYY"
          placeholder={['Ngày nhập từ', 'đến']}
          value={range}
          onChange={(v) => { setRange(v as [Dayjs | null, Dayjs | null] | null); setPage(1); }}
        />
      </Space>
      <div style={{ marginBottom: 12 }}>
        <Segmented
          size="small"
          value={quick}
          options={quickOptions}
          onChange={(v) => { setQuick(v as ReportCustomerListQuick | 'all'); setPage(1); }}
        />
        {period && (
          <Text type="secondary" style={{ fontSize: 12, marginLeft: 12 }}>
            Kỳ: {dayjs(period.from).format('DD/MM/YYYY')} → {dayjs(period.to).format('DD/MM/YYYY')}
          </Text>
        )}
      </div>

      {isError ? (
        <Alert type="error" showIcon message="Không tải được danh sách khách" description={getApiErrorMessage(error, 'Đã có lỗi xảy ra, vui lòng thử lại')} />
      ) : (
        <Table<ReportCustomerListRow>
          size="small"
          rowKey="id"
          loading={isLoading || isFetching}
          columns={columns}
          dataSource={data?.data ?? []}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: 'Không có khách hàng phù hợp' }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            showSizeChanger: false,
            hideOnSinglePage: true,
            showTotal: (t) => `Tổng ${t} khách hàng`,
            onChange: (p) => setPage(p),
          }}
        />
      )}
      {!isError && (data?.total ?? 0) <= PAGE_SIZE && (
        <Text type="secondary" style={{ fontSize: 12 }}>Tổng {data?.total ?? 0} khách hàng</Text>
      )}
    </Modal>
  );
}
