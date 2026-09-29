'use client';

import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Alert, Button, DatePicker, Input, Modal, Segmented, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EyeOutlined, SearchOutlined } from '@ant-design/icons';
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
import ReportQuickRangeFilter, { type QuickRangeValue } from './ReportQuickRangeFilter';
import ReportCustomerDetailModal from './ReportCustomerDetailModal';

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
  cohort_closed: 'Data mới trong kỳ đã chốt',
  cohort_joined: 'Data mới trong kỳ đã join nhóm',
  ftd: 'Khách nạp lần đầu (FTD) trong kỳ',
  redeposit: 'Khách nạp lại trong kỳ',
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
  /** Có -> hiện thanh chuyển chỉ số ngay trong modal (vd "Khách của 1 Sales": Data mới / Đã chốt / Đã nạp...). */
  metricTabs?: { metric: ReportCustomerListMetric; label: string }[];
  /** Có -> hiện dải số tóm tắt phía trên (vd tổng khách / đã chốt / tỷ lệ chốt của 1 Sales). */
  summary?: { label: string; value: string }[];
}

interface Props {
  drill: CustomerDrill | null;
  onClose: () => void;
  query: ReportQuery;
  context: 'customers' | 'marketing';
}

const DEPOSIT_METRICS: ReportCustomerListMetric[] = ['deposited', 'ftd', 'redeposit'];

const QUICK_OPTIONS: { value: ReportCustomerListQuick | 'all'; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'no_marketing', label: 'Chưa có Marketing' },
  { value: 'no_sales', label: 'Chưa có Sales' },
  { value: 'no_phone', label: 'Chưa có SĐT' },
];

/**
 * Các nút Lọc nhanh hiển thị theo NGỮ CẢNH modal:
 *  - Đang xem khách của 1 Sales cụ thể (preset.salesUserId) -> bỏ "Chưa có Sales" (luôn rỗng vì đã lọc đúng Sales đó).
 *  - Chỉ số "Data mới chưa gán Marketing" -> bỏ "Chưa có Marketing" (trùng điều kiện gốc).
 */
export function getQuickOptions(
  metric: ReportCustomerListMetric,
  preset?: CustomerDrill['preset'],
): { value: ReportCustomerListQuick | 'all'; label: string }[] {
  return QUICK_OPTIONS.filter((o) => {
    if (o.value === 'no_sales' && preset?.salesUserId !== undefined) return false;
    if (o.value === 'no_marketing' && metric === 'unassigned_marketing') return false;
    return true;
  });
}

/** Tooltip nhanh 3 ghi chú chăm sóc gần nhất (cùng kiểu cột "Ghi chú gần nhất" ở trang Khách hàng). */
const renderRecentNotesTooltip = (notes?: ReportCustomerListRow['recentNotes']) => {
  if (!notes || notes.length === 0) return <span style={{ fontSize: 12 }}>Chưa có ghi chú</span>;
  return (
    <div style={{ minWidth: 220, maxWidth: 320, fontSize: 12 }}>
      {notes.map((n, idx) => (
        <div key={n.id} style={idx < notes.length - 1 ? { marginBottom: 8 } : undefined}>
          <strong>{n.createdByName || 'Không xác định'}:</strong> <span style={{ whiteSpace: 'pre-wrap' }}>{n.note}</span>
          <br />
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)' }}>{dayjs(n.createdAt).format('HH:mm DD/MM/YYYY')}</span>
        </div>
      ))}
    </div>
  );
};

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
  const [status, setStatus] = useState<string | undefined>(drill?.initialStatus);
  const [source, setSource] = useState<string | undefined>();
  const [quick, setQuick] = useState<ReportCustomerListQuick | 'all'>('all');
  const [range, setRange] = useState<QuickRangeValue>(null);
  const [activeMetric, setActiveMetric] = useState<ReportCustomerListMetric>(drill?.metric ?? 'total');
  const [detailId, setDetailId] = useState<number | null>(null);

  const { statuses } = useCustomerStatuses();
  const { sources } = useMediaSources(false);

  // Mở modal (hoặc đổi sang chỉ số khác) -> reset toàn bộ bộ lọc về mặc định. Làm ngay lúc render (mẫu "điều chỉnh state
  // theo prop" của React) thay vì useEffect để không render thừa 1 lượt với bộ lọc cũ.
  const [prevDrill, setPrevDrill] = useState(drill);
  if (drill !== prevDrill) {
    setPrevDrill(drill);
    if (drill) {
      setPage(1);
      setSearchInput('');
      setSearch('');
      setStatus(drill.initialStatus);
      setSource(undefined);
      setQuick('all');
      setRange(null);
      setActiveMetric(drill.metric);
      setDetailId(null);
    }
  }

  // Debounce ô tìm kiếm 300ms.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const quickOptions = getQuickOptions(activeMetric, drill?.preset);
  // Đổi chỉ số (Segmented metricTabs) có thể làm nút đang chọn biến mất -> coi như "Tất cả" (không gửi lọc thừa lên BE).
  const effectiveQuick = quickOptions.some((o) => o.value === quick) ? quick : 'all';

  const listQuery = useMemo(
    () => ({
      ...query,
      metric: activeMetric,
      context,
      page,
      limit: PAGE_SIZE,
      ...(drill?.preset ?? {}),
      status,
      // preset.source (nếu có) thắng ô lọc Nguồn.
      source: drill?.preset?.source ?? source,
      search: search || undefined,
      quick: effectiveQuick === 'all' ? undefined : effectiveQuick,
      dateFrom: range?.[0]?.format('YYYY-MM-DD'),
      dateTo: range?.[1]?.format('YYYY-MM-DD'),
    }),
    [query, drill, activeMetric, context, page, status, source, search, effectiveQuick, range],
  );

  const { data, isLoading, isFetching, isError, error } = useReportCustomerList(listQuery, open);
  const metric = activeMetric;


  const columns: ColumnsType<ReportCustomerListRow> = useMemo(() => {
    // Lọc nhanh "Chưa có SĐT" -> cột SĐT toàn trống, thay bằng Email. "Chưa có Sales" -> cột Sales chính toàn trống,
    // bỏ đi và (nếu chưa có) thêm cột Marketing phụ trách.
    const noPhone = effectiveQuick === 'no_phone';
    const noSales = effectiveQuick === 'no_sales';
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
      noPhone
        ? {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
            width: 200,
            ellipsis: true,
            render: (v: string | null) => v || <span style={{ color: '#aaa', fontStyle: 'italic' }}>Chưa có email</span>,
          }
        : {
            title: 'SĐT',
            dataIndex: 'phone',
            key: 'phone',
            width: 115,
            render: (v: string | null) => v || <span style={{ color: '#aaa', fontStyle: 'italic' }}>Chưa có SĐT</span>,
          },
      { title: 'Nguồn', dataIndex: 'source', key: 'source', width: 90, render: (v: string | null) => <SourceTag source={v} /> },
      { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 120, render: (v: string | null) => <StatusTag code={v} fallback="—" /> },
    ];
    if (!noSales) cols.push({ title: 'Sales chính', key: 'sales', width: 160, render: (_, r) => userCell(r.salesUser) });
    if (context === 'marketing' || noSales) {
      cols.push({ title: 'Marketing phụ trách', key: 'mkt', width: 170, render: (_, r) => (r.marketingUser ? userCell(r.marketingUser) : <Tag>Chưa gán</Tag>) });
    }
    if (context === 'marketing') {
      cols.push({ title: 'Người tạo', key: 'creator', width: 160, render: (_, r) => userCell(r.createdBy) });
    }
    if (metric === 'closed' || metric === 'cohort_closed') {
      cols.push({ title: 'Ngày chốt', key: 'closedDate', width: 100, render: (_, r) => (r.closedDate ? dayjs(r.closedDate).format('DD/MM/YYYY') : '—') });
    }
    if (DEPOSIT_METRICS.includes(metric)) {
      cols.push(
        { title: 'Nạp trong kỳ', key: 'dep', width: 120, align: 'right', render: (_, r) => <Text strong style={{ color: '#389e0d' }}>{formatUsd(r.depositAmount ?? 0)}</Text> },
        { title: 'Số lần nạp', key: 'depCount', width: 90, align: 'center', render: (_, r) => r.depositCount ?? 0 },
        { title: 'Nạp gần nhất', key: 'depLast', width: 105, render: (_, r) => (r.lastDepositDate ? dayjs(r.lastDepositDate).format('DD/MM/YYYY') : '—') },
      );
    }
    if (metric === 'joined') {
      cols.push({
        title: 'Nhóm đã join',
        key: 'groups',
        width: 180,
        render: (_, r) => (r.joinedGroups?.length ? r.joinedGroups.map((g) => <Tag key={g}>{g}</Tag>) : '—'),
      });
    }
    cols.push({
      title: 'Thông tin',
      key: 'info',
      width: 140,
      align: 'center',
      fixed: 'right',
      render: (_, r) => (
        <Tooltip title={renderRecentNotesTooltip(r.recentNotes)} mouseEnterDelay={0.3}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetailId(r.id)}>
            {r.noteCount ? `Xem (Note +${r.noteCount})` : 'Xem'}
          </Button>
        </Tooltip>
      ),
    });
    return cols;
  }, [page, context, metric, effectiveQuick]);

  const title = drill ? `${drill.metricTabs ? (drill.label ?? '') : METRIC_TITLE[metric]}${!drill.metricTabs && drill.label ? ` — ${drill.label}` : ''}` : '';
  const period = data?.period;

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={context === 'marketing' || effectiveQuick === 'no_sales' ? 1240 : 1080} destroyOnHidden title={title}>
      {drill?.summary && (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12, padding: '8px 12px', background: '#fafafa', borderRadius: 6 }}>
          {drill.summary.map((it) => (
            <div key={it.label}>
              <Text type="secondary" style={{ fontSize: 12 }}>{it.label}</Text>
              <div><Text strong style={{ fontSize: 16 }}>{it.value}</Text></div>
            </div>
          ))}
        </div>
      )}
      {drill?.metricTabs && (
        <div style={{ marginBottom: 12 }}>
          <Segmented
            value={activeMetric}
            options={drill.metricTabs.map((t) => ({ value: t.metric, label: t.label }))}
            onChange={(v) => { setActiveMetric(v as ReportCustomerListMetric); setPage(1); }}
          />
        </div>
      )}
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
          onChange={(v) => { setRange(v as QuickRangeValue); setPage(1); }}
        />
        <ReportQuickRangeFilter value={range} onChange={(v) => { setRange(v); setPage(1); }} />
      </Space>
      <div style={{ marginBottom: 12 }}>
        <Segmented
          size="small"
          value={effectiveQuick}
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
      <ReportCustomerDetailModal customerId={detailId} context={context} onClose={() => setDetailId(null)} />
    </Modal>
  );
}
