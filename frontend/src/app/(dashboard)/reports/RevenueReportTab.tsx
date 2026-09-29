'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Empty, Row, Select, Space, Typography } from 'antd';
import { CheckCircleOutlined, DollarOutlined, ReloadOutlined, TeamOutlined, UserAddOutlined, UserSwitchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { useCustomerReport, useRevenueReport } from '@/lib/hooks/useReports';
import type { ReportCustomerListMetric, ReportQuery, RevenuePersonalRow } from '@/lib/types/reports.types';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { fmtCount, formatUsd, formatUsdCompact, trendLabel } from '@/lib/utils/marketingReport';
import { countsOfUser, customerRates, fmtRate, sumCustomerRows } from '@/lib/utils/customerReportRates';
import { ReportSection } from './ReportSection';
import { CHART_COLORS } from './ReportChart';
import PeriodSelector from './PeriodSelector';
import ReportNameFilter from './ReportNameFilter';
import ReportUserName from './ReportUserName';
import ReportKpiCard, { REPORT_COLORS } from './ReportKpiCard';
import ReportCustomersModal, { type CustomerDrill } from './ReportCustomersModal';

const { Text } = Typography;
// Không còn khối "Theo phòng ban": doanh thu quy theo phòng ban của KHÁCH (luôn là Kinh doanh) nên vô nghĩa.

const REVENUE_SERIES = [{ key: 'amount', label: 'Doanh thu', color: CHART_COLORS[0] }];
const COUNT_DOMAIN: [number, (dataMax: number) => number] = [0, (dataMax) => Math.max(dataMax, 1)];

/** Các chỉ số Mini Table mà 1 Sales có thể xem ngay trong modal "Khách của Sales". */
const SALES_METRIC_TABS: { metric: ReportCustomerListMetric; label: string }[] = [
  { metric: 'total', label: 'Data mới' },
  { metric: 'closed', label: 'Đã chốt' },
  { metric: 'joined', label: 'Đã join nhóm' },
  { metric: 'deposited', label: 'Có nạp' },
  { metric: 'ftd', label: 'Nạp lần đầu' },
  { metric: 'redeposit', label: 'Nạp lại' },
];

interface Props {
  query: ReportQuery;
  onQueryChange: (next: ReportQuery) => void;
}

/**
 * Tab "Doanh thu" - không chỉ tiền từng Sales mà còn KHÁCH NÀO NẠP và các GIAI ĐOẠN nạp:
 * KPI (bấm để xem danh sách khách) -> xu hướng nạp (nạp đầu vs nạp lại) -> bảng theo nhân viên (bấm số để xem khách,
 * nút "Khách" xem toàn bộ khách của 1 Sales + số đã chốt). Bấm "Xem" ở Mini Table để mở chi tiết + lịch sử nạp của 1 khách.
 */
export default function RevenueReportTab({ query, onQueryChange }: Props) {
  const { data, isLoading, isFetching, isError, error, refetch } = useRevenueReport(query);
  const { data: customerData } = useCustomerReport(query);
  const [personalSearch, setPersonalSearch] = useState('');
  const [drill, setDrill] = useState<CustomerDrill | null>(null);

  const summary = data?.summary;
  const granularity = data?.granularity ?? 'day';

  const customerTotals = useMemo(
    () => customerData?.total ?? sumCustomerRows(customerData?.personal ?? []),
    [customerData],
  );
  const rates = customerRates(customerTotals);

  const trendData = useMemo(
    () => (data?.trend ?? []).map((t) => ({ ...t, label: trendLabel(t.date, granularity) })),
    [data?.trend, granularity],
  );

  const filteredPersonal = useMemo(() => {
    const rows = data?.personal || [];
    if (!personalSearch.trim()) return rows;
    const q = personalSearch.trim().toLowerCase();
    return rows.filter((r) => r.userName.toLowerCase().includes(q));
  }, [data?.personal, personalSearch]);

  const salesOptions = useMemo(() => {
    const map = new Map<number, string>();
    (customerData?.personal ?? []).forEach((r) => map.set(r.userId, r.userName));
    (data?.personal ?? []).forEach((r) => map.set(r.userId, r.userName));
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [customerData?.personal, data?.personal]);

  const openMetric = (metric: ReportCustomerListMetric, extra?: Partial<CustomerDrill>) => () => setDrill({ metric, ...extra });

  /** Modal "Khách của 1 Sales": số tóm tắt + chuyển qua lại các chỉ số (data mới / đã chốt / đã nạp...). */
  const openSales = (userId: number, userName: string) => {
    const c = countsOfUser(customerData?.personal, userId);
    const r = customerRates(c);
    const money = data?.personal.find((p) => p.userId === userId);
    setDrill({
      metric: 'total',
      label: `Khách của ${userName}`,
      preset: { salesUserId: userId },
      metricTabs: SALES_METRIC_TABS,
      summary: [
        { label: 'Data mới trong kỳ', value: fmtCount(c.totalCustomers) },
        { label: 'Đã chốt trong kỳ', value: fmtCount(c.closedCustomers) },
        { label: 'Tỷ lệ chốt (data mới)', value: fmtRate(r.closeRate) },
        { label: 'Đã join nhóm', value: fmtCount(c.joinedGroupCustomers) },
        { label: 'Khách nạp', value: fmtCount(money?.depositorCount ?? 0) },
        { label: 'Doanh thu', value: formatUsd(money?.amount ?? 0) },
      ],
    });
  };

  const linkCount = (v: number, metric: ReportCustomerListMetric, r: RevenuePersonalRow) =>
    v > 0 ? (
      <Button type="link" size="small" style={{ padding: 0, height: 'auto' }} onClick={openMetric(metric, { label: r.userName, preset: { salesUserId: r.userId } })}>
        {fmtCount(v)}
      </Button>
    ) : (
      <Text type="secondary">0</Text>
    );

  const personalColumns: ColumnsType<RevenuePersonalRow> = [
    {
      title: 'Nhân viên',
      key: 'userName',
      render: (_: unknown, r: RevenuePersonalRow) => (
        <ReportUserName name={r.userName} departmentName={r.departmentName} departmentColor={r.departmentColor} />
      ),
    },
    {
      title: 'Doanh thu',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      render: (v: number) => formatUsd(v),
      sorter: (a, b) => a.amount - b.amount,
      defaultSortOrder: 'descend',
    },
    {
      title: 'Khách nạp',
      dataIndex: 'depositorCount',
      key: 'depositorCount',
      align: 'right',
      sorter: (a, b) => a.depositorCount - b.depositorCount,
      render: (v: number, r) => linkCount(v, 'deposited', r),
    },
    { title: 'Số khoản nạp', dataIndex: 'depositCount', key: 'depositCount', align: 'right', sorter: (a, b) => a.depositCount - b.depositCount, render: (v: number) => fmtCount(v) },
    {
      title: 'Nạp lần đầu',
      key: 'ftd',
      align: 'right',
      sorter: (a, b) => a.ftdCount - b.ftdCount,
      render: (_, r) => (
        <span>
          {linkCount(r.ftdCount, 'ftd', r)}
          {r.ftdCount > 0 && <Text type="secondary" style={{ fontSize: 12 }}> · {formatUsd(r.ftdAmount)}</Text>}
        </span>
      ),
    },
    {
      title: 'Nạp lại',
      key: 'redeposit',
      align: 'right',
      sorter: (a, b) => a.redepositCount - b.redepositCount,
      render: (_, r) => (
        <span>
          {r.redepositCount > 0 ? (
            <Button type="link" size="small" style={{ padding: 0, height: 'auto' }} onClick={openMetric('redeposit', { label: r.userName, preset: { salesUserId: r.userId } })}>
              {fmtCount(r.redepositCount)}
            </Button>
          ) : (
            <Text type="secondary">0</Text>
          )}
          {r.redepositCount > 0 && <Text type="secondary" style={{ fontSize: 12 }}> khoản · {formatUsd(r.redepositAmount)}</Text>}
        </span>
      ),
    },
    {
      title: 'TB / khách nạp',
      key: 'avg',
      align: 'right',
      render: (_, r) => (r.depositorCount > 0 ? formatUsd(r.amount / r.depositorCount) : '—'),
    },
    {
      title: 'Khách của Sales',
      key: 'sales',
      align: 'center',
      render: (_, r) => (
        <Button size="small" icon={<TeamOutlined />} onClick={() => openSales(r.userId, r.userName)}>
          Xem khách
        </Button>
      ),
    },
  ];

  const scopeLabel = data?.total != null ? 'toàn hệ thống' : 'của bạn';

  return (
    <div className="space-y-4">
      <Card size="small" styles={{ body: { padding: 16 } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <PeriodSelector value={query} onChange={onQueryChange} resolvedPeriod={data?.period} />
          <Space wrap>
            <Select
              showSearch
              allowClear
              style={{ width: 260 }}
              placeholder="Kiểm tra khách của 1 Sales..."
              optionFilterProp="label"
              options={salesOptions}
              value={null}
              onChange={(id: number | null) => {
                if (id == null) return;
                const opt = salesOptions.find((o) => o.value === id);
                openSales(id, opt?.label ?? `Sales #${id}`);
              }}
            />
            <Button icon={<ReloadOutlined />} loading={isFetching && !isLoading} onClick={() => refetch()}>
              Làm mới
            </Button>
          </Space>
        </div>
      </Card>

      {isError && (
        <Alert
          type="error"
          showIcon
          title="Không tải được báo cáo doanh thu"
          description={getApiErrorMessage(error, 'Đã có lỗi xảy ra, vui lòng thử lại')}
        />
      )}

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} xl={8}>
          <ReportKpiCard
            title={`Tổng doanh thu ${scopeLabel}`}
            value={summary?.amount ?? 0}
            money
            icon={<DollarOutlined />}
            color={REPORT_COLORS.gold}
            loading={isLoading}
            hint={summary ? `${fmtCount(summary.depositCount)} khoản nạp` : undefined}
            onClick={openMetric('deposited')}
          />
        </Col>
        <Col xs={24} sm={12} xl={8}>
          <ReportKpiCard
            title="Khách đã nạp trong kỳ"
            value={summary?.depositorCount ?? 0}
            icon={<TeamOutlined />}
            color={REPORT_COLORS.primary}
            loading={isLoading}
            hint={summary ? `TB ${formatUsd(summary.averagePerDepositor)} / khách · ${formatUsd(summary.averagePerDeposit)} / khoản` : undefined}
            onClick={openMetric('deposited')}
          />
        </Col>
        <Col xs={24} sm={12} xl={8}>
          <ReportKpiCard
            title="Nạp lần đầu (FTD)"
            value={summary?.ftdCount ?? 0}
            icon={<UserAddOutlined />}
            color={REPORT_COLORS.ok}
            loading={isLoading}
            hint={summary ? `${formatUsd(summary.ftdAmount)} từ khách mới nạp` : undefined}
            onClick={openMetric('ftd')}
          />
        </Col>
        <Col xs={24} sm={12} xl={8}>
          <ReportKpiCard
            title="Nạp lại"
            value={summary?.redepositCount ?? 0}
            suffix=" khoản"
            icon={<UserSwitchOutlined />}
            color={REPORT_COLORS.warning}
            loading={isLoading}
            hint={summary ? `${formatUsd(summary.redepositAmount)} từ khách đã nạp trước đó` : undefined}
            onClick={openMetric('redeposit')}
          />
        </Col>
        <Col xs={24} sm={12} xl={8}>
          <ReportKpiCard
            title="Tỷ lệ nạp (data mới)"
            value={rates.depositRate ?? 0}
            suffix="%" rateColored
            icon={<CheckCircleOutlined />}
            color={REPORT_COLORS.primary}
            loading={isLoading}
            hint={`${fmtCount(customerTotals.cohortDepositedCustomers)} / ${fmtCount(customerTotals.totalCustomers)} data mới trong kỳ đã từng nạp`}
            onClick={openMetric('cohort_deposited')}
          />
        </Col>
        <Col xs={24} sm={12} xl={8}>
          <ReportKpiCard
            title="Tỷ lệ chốt (data mới)"
            value={rates.closeRate ?? 0}
            suffix="%" rateColored
            icon={<CheckCircleOutlined />}
            color={REPORT_COLORS.ok}
            loading={isLoading}
            hint={`${fmtCount(customerTotals.cohortClosedCustomers)} / ${fmtCount(customerTotals.totalCustomers)} data mới trong kỳ đã chốt`}
            onClick={openMetric('cohort_closed')}
          />
        </Col>
      </Row>

      <Card size="small" loading={isLoading} title={`Giai đoạn nạp theo ${granularity === 'month' ? 'tháng' : 'ngày'}`}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Tính theo ngày nạp. Cột xếp chồng = tiền nạp lần đầu (FTD) + nạp lại (USD, trục trái); đường = số khách nạp (trục phải).
        </Text>
        {trendData.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có khoản nạp trong kỳ này" />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={trendData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" minTickGap={24} />
              <YAxis yAxisId="rev" tickFormatter={formatUsdCompact} tick={{ fontSize: 12 }} />
              <YAxis yAxisId="cnt" orientation="right" allowDecimals={false} domain={COUNT_DOMAIN} tick={{ fontSize: 12 }} />
              <ChartTooltip
                formatter={(v, n) => (n === 'Khách nạp' ? fmtCount(Number(v)) : formatUsd(Number(v)))}
                labelFormatter={(l) => `${granularity === 'month' ? 'Tháng' : 'Ngày'} ${l}`}
              />
              <Legend />
              <Bar yAxisId="rev" stackId="dep" dataKey="ftdAmount" name="Nạp lần đầu" fill={REPORT_COLORS.ok} maxBarSize={28} isAnimationActive={false} />
              <Bar yAxisId="rev" stackId="dep" dataKey="redepositAmount" name="Nạp lại" fill={REPORT_COLORS.gold} maxBarSize={28} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              <Line yAxisId="cnt" type="monotone" dataKey="depositorCount" name="Khách nạp" stroke={REPORT_COLORS.primary} strokeWidth={2} dot={trendData.length <= 31} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>

      <ReportSection<RevenuePersonalRow>
        title="Doanh thu theo nhân viên"
        description="Doanh thu tính theo ngày nạp của khách thuộc Sales chính. Bấm vào số khách để xem đúng danh sách; bấm nút Xem khách để kiểm tra toàn bộ khách của 1 Sales và số đã chốt."
        rowKey="userId"
        loading={isLoading}
        columns={personalColumns}
        data={filteredPersonal}
        nameKey="userName"
        series={REVENUE_SERIES}
        valueFormatter={formatUsd}
        axisFormatter={formatUsdCompact}
        emptyText={personalSearch ? 'Không tìm thấy nhân viên phù hợp' : 'Không có doanh thu trong kỳ này'}
        extraFilters={
          <ReportNameFilter value={personalSearch} onChange={setPersonalSearch} placeholder="Tìm theo tên nhân viên..." />
        }
      />

      {drill && <ReportCustomersModal drill={drill} onClose={() => setDrill(null)} query={query} context="customers" />}
    </div>
  );
}
