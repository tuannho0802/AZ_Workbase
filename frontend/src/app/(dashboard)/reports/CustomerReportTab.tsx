'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Row, Space, Typography } from 'antd';
import { CheckCircleOutlined, DollarOutlined, ReloadOutlined, TeamOutlined, UsergroupAddOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useCustomerReport } from '@/lib/hooks/useReports';
import type { CustomerBreakdownCounts, CustomerPersonalRow, ReportCustomerListMetric, ReportQuery } from '@/lib/types/reports.types';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { fmtCount } from '@/lib/utils/marketingReport';
import { customerRates, fmtRate, sumCustomerRows } from '@/lib/utils/customerReportRates';
import { ReportSection } from './ReportSection';
import { CHART_COLORS } from './chartColors';
import PeriodSelector from './PeriodSelector';
import ReportNameFilter from './ReportNameFilter';
import ReportKpiCard, { REPORT_COLORS } from './ReportKpiCard';
import ReportUserName from './ReportUserName';
import { rateTextColor } from '@/lib/utils/rateColor';
import ReportCustomersModal, { type CustomerDrill } from './ReportCustomersModal';

const { Text } = Typography;

// 3 chỉ số cùng lúc - Cột dọc/ngang vẽ song song cả 3, riêng Tròn chọn 1 trong 3 (xem ReportSection.tsx).
const CUSTOMER_SERIES = [
  { key: 'totalCustomers', label: 'Tổng data', color: CHART_COLORS[0] },
  { key: 'closedCustomers', label: 'Đã chốt', color: CHART_COLORS[1] },
  { key: 'joinedGroupCustomers', label: 'Đã join nhóm', color: CHART_COLORS[2] },
];

interface Props {
  query: ReportQuery;
  onQueryChange: (next: ReportQuery) => void;
}

/**
 * Tab "Doanh số khách" - bố cục theo tab Marketing: khung bộ lọc kỳ -> thẻ KPI (bấm để mở Mini Table khách)
 * -> khối "Theo nhân viên" (bảng/biểu đồ; bấm số của từng nhân viên để xem đúng danh sách khách của người đó).
 * Không còn khối "Theo phòng ban": mọi khách đều thuộc phòng Kinh doanh nên chỉ có 1 dòng, vô nghĩa.
 */
export default function CustomerReportTab({ query, onQueryChange }: Props) {
  const { data, isLoading, isFetching, isError, error, refetch } = useCustomerReport(query);
  const [search, setSearch] = useState('');
  const [drill, setDrill] = useState<CustomerDrill | null>(null);

  const personal = useMemo(() => data?.personal ?? [], [data?.personal]);

  // BE chỉ trả `total` cho scope=all/Admin; role khác thì tổng = số của chính mình (personal).
  const totals: CustomerBreakdownCounts = useMemo(() => data?.total ?? sumCustomerRows(personal), [data?.total, personal]);
  const rates = customerRates(totals);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? personal.filter((r) => r.userName.toLowerCase().includes(q)) : personal;
  }, [personal, search]);

  const countCol = (
    title: string,
    key: keyof CustomerBreakdownCounts,
    metric: ReportCustomerListMetric,
    extra?: Partial<ColumnsType<CustomerPersonalRow>[number]>,
  ): ColumnsType<CustomerPersonalRow>[number] => ({
    title,
    dataIndex: key,
    key,
    align: 'right',
    sorter: (a: CustomerPersonalRow, b: CustomerPersonalRow) => a[key] - b[key],
    render: (v: number, r: CustomerPersonalRow) =>
      v > 0 ? (
        <Button type="link" size="small" style={{ padding: 0, height: 'auto' }} onClick={() => setDrill({ metric, label: r.userName, preset: { salesUserId: r.userId } })}>
          {fmtCount(v)}
        </Button>
      ) : (
        <Text type="secondary">0</Text>
      ),
    ...extra,
  } as ColumnsType<CustomerPersonalRow>[number]);

  /** Cột tỷ lệ COHORT: (data mới trong kỳ hiện đã chốt/join/nạp) / data mới trong kỳ. Bấm số tử để xem danh sách. */
  const rateCol = (
    title: string,
    key: 'cohortClosedCustomers' | 'cohortJoinedCustomers' | 'cohortDepositedCustomers',
    metric: ReportCustomerListMetric,
  ): ColumnsType<CustomerPersonalRow>[number] => ({
    title,
    key,
    align: 'right',
    sorter: (a: CustomerPersonalRow, b: CustomerPersonalRow) => (a.totalCustomers ? a[key] / a.totalCustomers : -1) - (b.totalCustomers ? b[key] / b.totalCustomers : -1),
    render: (_: unknown, r: CustomerPersonalRow) => {
      const rate = r.totalCustomers > 0 ? Math.round((r[key] / r.totalCustomers) * 1000) / 10 : null;
      return (
        <span>
          <Text strong style={{ color: rateTextColor(rate) }}>{fmtRate(rate)}</Text>
          {r[key] > 0 && (
            <Button type="link" size="small" style={{ paddingInline: 4, height: 'auto' }} onClick={() => setDrill({ metric, label: r.userName, preset: { salesUserId: r.userId } })}>
              ({fmtCount(r[key])})
            </Button>
          )}
        </span>
      );
    },
  });

  const columns: ColumnsType<CustomerPersonalRow> = [
    {
      title: 'Nhân viên (Sales chính)',
      key: 'userName',
      render: (_, r) => <ReportUserName name={r.userName} departmentName={r.departmentName} departmentColor={r.departmentColor} />,
    },
    countCol('Tổng data', 'totalCustomers', 'total', { defaultSortOrder: 'descend' }),
    countCol('Đã chốt', 'closedCustomers', 'closed'),
    countCol('Đã join nhóm', 'joinedGroupCustomers', 'joined'),
    rateCol('Tỷ lệ chốt', 'cohortClosedCustomers', 'cohort_closed'),
    rateCol('Tỷ lệ join nhóm', 'cohortJoinedCustomers', 'cohort_joined'),
    rateCol('Tỷ lệ nạp', 'cohortDepositedCustomers', 'cohort_deposited'),
  ];

  const openTotal = (metric: ReportCustomerListMetric) => () => setDrill({ metric });

  return (
    <div className="space-y-4">
      <Card size="small" styles={{ body: { padding: 16 } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <PeriodSelector value={query} onChange={onQueryChange} resolvedPeriod={data?.period} />
          <Space>
            <Button icon={<ReloadOutlined />} loading={isFetching && !isLoading} onClick={() => refetch()}>
              Làm mới
            </Button>
          </Space>
        </div>
      </Card>

      {isError && (
        <Alert type="error" showIcon title="Không tải được báo cáo doanh số khách" description={getApiErrorMessage(error, 'Đã có lỗi xảy ra, vui lòng thử lại')} />
      )}

      <Row gutter={[12, 12]}>
        <Col xs={24} md={8}>
          <ReportKpiCard title={data?.total != null ? 'Tổng data toàn hệ thống' : 'Tổng data của bạn'} value={totals.totalCustomers} icon={<TeamOutlined />} color={REPORT_COLORS.primary} loading={isLoading} onClick={openTotal('total')} />
        </Col>
        <Col xs={24} md={8}>
          <ReportKpiCard title="Đã chốt" value={totals.closedCustomers} icon={<CheckCircleOutlined />} color={REPORT_COLORS.ok} loading={isLoading} onClick={openTotal('closed')} />
        </Col>
        <Col xs={24} md={8}>
          <ReportKpiCard title="Đã join nhóm" value={totals.joinedGroupCustomers} icon={<UsergroupAddOutlined />} color={REPORT_COLORS.gold} loading={isLoading} onClick={openTotal('joined')} />
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} md={8}>
          <ReportKpiCard title="Tỷ lệ chốt" value={rates.closeRate ?? 0} suffix="%" rateColored icon={<CheckCircleOutlined />} color={REPORT_COLORS.ok} loading={isLoading} hint={`${fmtCount(totals.cohortClosedCustomers)} / ${fmtCount(totals.totalCustomers)} data mới trong kỳ đã chốt`} onClick={openTotal('cohort_closed')} />
        </Col>
        <Col xs={24} md={8}>
          <ReportKpiCard title="Tỷ lệ join nhóm" value={rates.joinRate ?? 0} suffix="%" rateColored icon={<UsergroupAddOutlined />} color={REPORT_COLORS.gold} loading={isLoading} hint={`${fmtCount(totals.cohortJoinedCustomers)} / ${fmtCount(totals.totalCustomers)} data mới trong kỳ đã join nhóm`} onClick={openTotal('cohort_joined')} />
        </Col>
        <Col xs={24} md={8}>
          <ReportKpiCard title="Tỷ lệ nạp tiền" value={rates.depositRate ?? 0} suffix="%" rateColored icon={<DollarOutlined />} color={REPORT_COLORS.primary} loading={isLoading} hint={`${fmtCount(totals.cohortDepositedCustomers)} / ${fmtCount(totals.totalCustomers)} data mới trong kỳ đã từng nạp`} onClick={openTotal('cohort_deposited')} />
        </Col>
      </Row>

      <ReportSection<CustomerPersonalRow>
        title="Doanh số khách theo nhân viên"
        description="Data mới tính theo ngày tạo, đã chốt theo ngày chốt, join nhóm theo ngày join. Các tỷ lệ tính trên data mới của kỳ (tình trạng hiện tại) nên không vượt 100%. Bấm vào 1 con số để xem danh sách khách."
        rowKey="userId"
        loading={isLoading}
        columns={columns}
        data={rows}
        nameKey="userName"
        series={CUSTOMER_SERIES}
        valueFormatter={fmtCount}
        emptyText={search ? 'Không tìm thấy nhân viên phù hợp' : 'Không có data trong kỳ này'}
        extraFilters={<ReportNameFilter value={search} onChange={setSearch} placeholder="Tìm theo tên nhân viên..." />}
      />

      {drill && <ReportCustomersModal drill={drill} onClose={() => setDrill(null)} query={query} context="customers" />}
    </div>
  );
}
