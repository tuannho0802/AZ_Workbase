'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Alert, Button, Card, Col, Empty, Row, Segmented, Select, Space, Spin, Statistic, Table, Tag, Tooltip, Typography } from 'antd';
import { ClearOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import { useMarketingReport } from '@/lib/hooks/useReports';
import type { MarketingReportFilters, MarketingUserOption, ReportQuery } from '@/lib/types/reports.types';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import {
  RANK_METRIC_LABEL,
  countActiveFilters,
  deltaOf,
  fmtCount,
  formatUsd,
  formatUsdCompact,
  pct,
  topRows,
  trendLabel,
  withOthers,
  type RankMetric,
} from '@/lib/utils/marketingReport';
import PeriodSelector from './PeriodSelector';
import { CHART_COLORS } from './ReportChart';
import MarketingBreakdownTable from './MarketingBreakdownTable';

const { Text } = Typography;

const COLORS = { danger: '#f5222d', warning: '#fa8c16', primary: '#1677ff', muted: '#bfbfbf', ok: '#52c41a', gold: '#faad14' };
/** Trục Y đếm số nguyên: luôn có mốc 0 và ≥ 1. */
const COUNT_DOMAIN: [number, (dataMax: number) => number] = [0, (dataMax) => Math.max(dataMax, 1)];
const fmtDay = (s: string) => dayjs(s).format('DD/MM/YYYY');

const RANK_OPTIONS: { value: RankMetric; label: string }[] = (
  ['revenue', 'depositedCustomers', 'totalCustomers', 'closedCustomers'] as RankMetric[]
).map((m) => ({ value: m, label: RANK_METRIC_LABEL[m] }));

const isMoney = (m: RankMetric) => m === 'revenue';

interface Props {
  query: ReportQuery;
  onQueryChange: (next: ReportQuery) => void;
}

/** Thẻ KPI + chênh lệch so với kỳ liền trước. */
function KpiCard(props: {
  title: ReactNode;
  value: number;
  previous?: number;
  money?: boolean;
  color?: string;
  loading: boolean;
  hint?: ReactNode;
}) {
  const { title, value, previous, money, color, loading, hint } = props;
  const d = previous == null ? null : deltaOf(value, previous);
  const fmtVal = money ? formatUsd : fmtCount;
  return (
    <Card size="small" loading={loading} style={{ height: '100%' }}>
      <Statistic
        title={title}
        value={value}
        formatter={(v) => fmtVal(Number(v))}
        styles={{ content: { color, fontSize: 24 } }}
      />
      {d && (
        <Text
          style={{
            fontSize: 12,
            color: d.direction === 'up' ? COLORS.ok : d.direction === 'down' ? COLORS.danger : COLORS.muted,
          }}
        >
          {d.direction === 'flat'
            ? `Bằng kỳ trước (${fmtVal(previous!)})`
            : `${d.direction === 'up' ? '▲ +' : '▼ '}${fmtVal(d.diff)}${d.percent != null ? ` (${d.diff > 0 ? '+' : ''}${d.percent}%)` : ''} so với kỳ trước (${fmtVal(previous!)})`}
        </Text>
      )}
      {hint && <div><Text type="secondary" style={{ fontSize: 12 }}>{hint}</Text></div>}
    </Card>
  );
}

const userOptions = (list: MarketingUserOption[], unassignedLabel: string) => [
  { value: 0, label: unassignedLabel },
  ...list.map((u) => ({ value: u.id, label: u.departmentName ? `${u.name} · ${u.departmentName}` : u.name })),
];

/**
 * Tab "Marketing" - phân tích ĐA CHIỀU theo Marketing phụ trách + Người tạo data, quy doanh số/khách
 * nạp về Marketing bất kể Sales nào chăm. Bố cục theo tab Thống kê của trang dữ liệu lỗi:
 * bộ lọc -> KPI (so kỳ trước) -> xu hướng -> xếp hạng/tỷ trọng -> đối soát 2 chiều -> chất lượng/nguồn -> bảng chi tiết.
 *
 * Recharts: luôn `isAnimationActive={false}` - bật animation thì Pie/Bar có thể render rỗng khi mount
 * trong ResponsiveContainer (cùng lưu ý ở InvalidDataStatsTab).
 */
export default function MarketingReportTab({ query, onQueryChange }: Props) {
  const [filters, setFilters] = useState<MarketingReportFilters>({});
  const [rankMetric, setRankMetric] = useState<RankMetric>('revenue');

  const { data, isLoading, isFetching, isError, error, refetch } = useMarketingReport({ ...query, ...filters });

  const setFilter = (patch: Partial<MarketingReportFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const activeFilters = countActiveFilters(filters);

  const cur = data?.summary.current;
  const prev = data?.summary.previous;
  const loading = isLoading;
  const granularity = data?.period.granularity ?? 'day';

  const trendData = useMemo(
    () => (data?.trend ?? []).map((t) => ({ ...t, label: trendLabel(t.date, granularity) })),
    [data?.trend, granularity],
  );
  const trendHasCustomers = trendData.some((t) => t.newCustomers > 0 || t.closedCustomers > 0);
  const trendHasRevenue = trendData.some((t) => t.revenue > 0 || t.depositedCustomers > 0);

  const marketingRank = useMemo(() => topRows((data?.marketing ?? []).filter((r) => r.userId > 0), rankMetric, 10), [data?.marketing, rankMetric]);
  const creatorRank = useMemo(() => topRows((data?.creators ?? []).filter((r) => r.userId > 0), rankMetric, 10), [data?.creators, rankMetric]);
  const marketingShare = useMemo(() => withOthers(data?.marketing ?? [], rankMetric, 6), [data?.marketing, rankMetric]);

  const attribution = data?.attribution;
  const attributionData = attribution
    ? [
        { name: 'Người tạo = Marketing phụ trách', value: attribution.sameCreatorAndMarketing, color: COLORS.ok },
        { name: 'Người tạo ≠ Marketing phụ trách', value: attribution.differentCreatorAndMarketing, color: COLORS.warning },
        { name: 'Chưa gán Marketing', value: attribution.noMarketing, color: COLORS.muted },
      ].filter((x) => x.value > 0)
    : [];

  const statusSeries = useMemo(
    () =>
      (data?.statuses ?? []).map((s, i) => ({
        key: s.code,
        label: s.name,
        color: s.color?.startsWith('#') ? s.color : CHART_COLORS[i % CHART_COLORS.length],
      })),
    [data?.statuses],
  );
  const statusData = useMemo(
    () =>
      [...(data?.marketing ?? [])]
        .filter((r) => r.totalCustomers > 0)
        .sort((a, b) => b.totalCustomers - a.totalCustomers)
        .slice(0, 10)
        .map((r) => ({ name: r.userName, ...r.byStatus })),
    [data?.marketing],
  );

  const totalNew = cur?.totalCustomers ?? 0;
  const unassigned = data?.summary.unassignedMarketingCustomers ?? 0;
  const unassignedPct = pct(unassigned, totalNew);
  const cohortRate = cur ? pct(cur.cohortDepositedCustomers, cur.totalCustomers) : null;
  const prevCohortRate = prev ? pct(prev.cohortDepositedCustomers, prev.totalCustomers) : null;
  const rankHeight = (n: number) => Math.max(200, n * 36 + 40);
  const money = isMoney(rankMetric);
  const rankFmt = money ? formatUsd : fmtCount;
  const rankAxisFmt = money ? formatUsdCompact : fmtCount;

  return (
    <div className="space-y-4">
      {/* ── Bộ lọc ── */}
      <Card size="small" styles={{ body: { padding: 16 } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <PeriodSelector value={query} onChange={onQueryChange} resolvedPeriod={data?.period} />
          <Space>
            {activeFilters > 0 && (
              <Button icon={<ClearOutlined />} onClick={() => setFilters({})}>
                Xoá lọc ({activeFilters})
              </Button>
            )}
            <Button icon={<ReloadOutlined />} loading={isFetching && !isLoading} onClick={() => refetch()}>
              Làm mới
            </Button>
          </Space>
        </div>

        <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
          <Col xs={24} sm={12} xl={6}>
            <div className="mb-1"><Text strong>Marketing phụ trách</Text></div>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: '100%' }}
              placeholder="Tất cả Marketing"
              value={filters.marketingUserId}
              onChange={(v) => setFilter({ marketingUserId: v })}
              options={userOptions(data?.options.marketers ?? [], '(Chưa gán Marketing)')}
            />
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <div className="mb-1"><Text strong>Người tạo data</Text></div>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: '100%' }}
              placeholder="Tất cả người tạo"
              value={filters.createdById}
              onChange={(v) => setFilter({ createdById: v })}
              options={userOptions(data?.options.creators ?? [], '(Không rõ người tạo)')}
            />
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <div className="mb-1">
              <Tooltip title="Phòng ban của KHÁCH HÀNG (không phải phòng ban của nhân viên).">
                <Text strong>Phòng ban khách hàng</Text>
              </Tooltip>
            </div>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: '100%' }}
              placeholder="Tất cả phòng ban"
              value={filters.departmentId}
              onChange={(v) => setFilter({ departmentId: v })}
              options={(data?.options.departments ?? []).map((d) => ({ value: d.id, label: d.name }))}
            />
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <div className="mb-1"><Text strong>Nguồn</Text></div>
            <Select
              allowClear
              showSearch
              style={{ width: '100%' }}
              placeholder="Tất cả nguồn"
              value={filters.source}
              onChange={(v) => setFilter({ source: v })}
              options={(data?.options.sources ?? []).map((s) => ({ value: s, label: s }))}
            />
          </Col>
        </Row>
      </Card>

      {isError && (
        <Alert type="error" showIcon title="Không tải được báo cáo Marketing" description={getApiErrorMessage(error, 'Đã có lỗi xảy ra, vui lòng thử lại')} />
      )}

      {data?.ownOnly && (
        <Alert
          type="info"
          showIcon
          title="Bạn chỉ xem được số liệu của chính mình"
          description="Báo cáo chỉ tính các khách mà bạn là Marketing phụ trách hoặc người tạo data."
        />
      )}

      {data && unassigned > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          title={`${fmtCount(unassigned)}${unassignedPct != null ? ` (${unassignedPct}%)` : ''} data mới trong kỳ chưa gán Marketing phụ trách`}
          description={'Phần này không quy được cho Marketing nào ở chiều "Marketing phụ trách" (vẫn có ở chiều "Người tạo data"). Gán Marketing cho các khách này để doanh số theo Marketing đầy đủ.'}
          action={
            filters.marketingUserId !== 0 ? (
              <Button size="small" onClick={() => setFilter({ marketingUserId: 0 })}>Xem phần chưa gán</Button>
            ) : undefined
          }
        />
      )}

      <Spin spinning={isFetching && !isLoading}>
        <div className="space-y-4">
          {/* ── KPI ── */}
          <Row gutter={[12, 12]}>
            <Col xs={24} md={12} xl={8}>
              <KpiCard title="Data mới trong kỳ" value={cur?.totalCustomers ?? 0} previous={prev?.totalCustomers} color={COLORS.primary} loading={loading} />
            </Col>
            <Col xs={24} md={12} xl={8}>
              <KpiCard
                title={<Tooltip title="Số khách có ≥ 1 khoản nạp trong kỳ - tính theo ngày nạp, bất kể khách được tạo lúc nào.">Khách đã nạp tiền</Tooltip>}
                value={cur?.depositedCustomers ?? 0}
                previous={prev?.depositedCustomers}
                color={COLORS.ok}
                loading={loading}
              />
            </Col>
            <Col xs={24} md={12} xl={8}>
              <KpiCard title="Doanh thu (nạp)" value={cur?.revenue ?? 0} previous={prev?.revenue} money color={COLORS.gold} loading={loading} />
            </Col>
            <Col xs={24} md={12} xl={8}>
              <KpiCard title="Đã chốt" value={cur?.closedCustomers ?? 0} previous={prev?.closedCustomers} color={COLORS.ok} loading={loading} />
            </Col>
            <Col xs={24} md={12} xl={8}>
              <KpiCard title="Đã join nhóm" value={cur?.joinedGroupCustomers ?? 0} previous={prev?.joinedGroupCustomers} color={COLORS.gold} loading={loading} />
            </Col>
            <Col xs={24} md={12} xl={8}>
              <Card size="small" loading={loading} style={{ height: '100%' }}>
                <Statistic
                  title={
                    <Tooltip title="Trong số data MỚI của kỳ, tỷ lệ khách đã từng nạp (bất kỳ lúc nào) - cùng nhóm khách nên luôn ≤ 100%.">
                      Tỷ lệ data mới đã nạp
                    </Tooltip>
                  }
                  value={cohortRate ?? '—'}
                  suffix={cohortRate == null ? undefined : '%'}
                  styles={{ content: { fontSize: 24, color: cohortRate == null ? undefined : cohortRate >= 20 ? COLORS.ok : cohortRate >= 8 ? COLORS.gold : COLORS.danger } }}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {cur ? `${fmtCount(cur.cohortDepositedCustomers)} / ${fmtCount(cur.totalCustomers)} khách` : ''}
                  {prevCohortRate != null && cohortRate != null ? ` · kỳ trước ${prevCohortRate}%` : ''}
                </Text>
              </Card>
            </Col>
          </Row>

          {/* ── Xu hướng ── */}
          <Row gutter={[12, 12]}>
            <Col xs={24} xl={12}>
              <Card size="small" loading={loading} title={`Data mới & đã chốt theo ${granularity === 'month' ? 'tháng' : 'ngày'}`}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Data mới tính theo ngày tạo (giờ VN); đã chốt tính theo ngày chốt. Từ {data ? fmtDay(data.period.from) : ''} đến {data ? fmtDay(data.period.to) : ''}.
                </Text>
                {!trendHasCustomers ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có data trong kỳ với bộ lọc này" />
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={trendData} margin={{ top: 12, right: 12, left: -12, bottom: 0 }}>
                      <defs>
                        <linearGradient id="mktNewFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" minTickGap={24} />
                      <YAxis allowDecimals={false} domain={COUNT_DOMAIN} tick={{ fontSize: 12 }} />
                      <ChartTooltip formatter={(v) => fmtCount(Number(v))} labelFormatter={(l) => `${granularity === 'month' ? 'Tháng' : 'Ngày'} ${l}`} />
                      <Legend />
                      <Area type="monotone" dataKey="newCustomers" name="Data mới" stroke={COLORS.primary} strokeWidth={2} fill="url(#mktNewFill)" dot={trendData.length <= 31} isAnimationActive={false} />
                      <Line type="monotone" dataKey="closedCustomers" name="Đã chốt" stroke={COLORS.ok} strokeWidth={2} dot={trendData.length <= 31} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Col>
            <Col xs={24} xl={12}>
              <Card size="small" loading={loading} title={`Doanh thu & khách nạp theo ${granularity === 'month' ? 'tháng' : 'ngày'}`}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Tính theo ngày nạp. Cột = doanh thu (USD, trục trái); đường = số khách nạp trong ngày (trục phải).
                </Text>
                {!trendHasRevenue ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có khoản nạp trong kỳ với bộ lọc này" />
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={trendData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" minTickGap={24} />
                      <YAxis yAxisId="rev" tickFormatter={formatUsdCompact} tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="cnt" orientation="right" allowDecimals={false} domain={COUNT_DOMAIN} tick={{ fontSize: 12 }} />
                      <ChartTooltip formatter={(v, n) => (n === 'Doanh thu' ? formatUsd(Number(v)) : fmtCount(Number(v)))} labelFormatter={(l) => `${granularity === 'month' ? 'Tháng' : 'Ngày'} ${l}`} />
                      <Legend />
                      <Bar yAxisId="rev" dataKey="revenue" name="Doanh thu" fill={COLORS.gold} maxBarSize={28} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                      <Line yAxisId="cnt" type="monotone" dataKey="depositedCustomers" name="Khách nạp" stroke={COLORS.ok} strokeWidth={2} dot={trendData.length <= 31} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Col>
          </Row>

          {/* ── Xếp hạng + tỷ trọng ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text strong>Xếp hạng theo chỉ số:</Text>
            <Segmented<RankMetric> value={rankMetric} onChange={setRankMetric} options={RANK_OPTIONS} />
          </div>
          <Row gutter={[12, 12]}>
            <Col xs={24} xl={12}>
              <Card size="small" loading={loading} title={`Top Marketing phụ trách - ${RANK_METRIC_LABEL[rankMetric]}`}>
                <Text type="secondary" style={{ fontSize: 12 }}>Quy về Marketing phụ trách của khách, không phụ thuộc Sales chăm khách đó.</Text>
                {marketingRank.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có số liệu" />
                ) : (
                  <ResponsiveContainer width="100%" height={rankHeight(marketingRank.length)}>
                    <BarChart data={marketingRank} layout="vertical" margin={{ top: 8, right: 56, left: 8, bottom: 0 }} maxBarSize={22}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tickFormatter={rankAxisFmt} tick={{ fontSize: 12 }} />
                      <YAxis type="category" dataKey="userName" width={130} tick={{ fontSize: 12 }} />
                      <ChartTooltip formatter={(v) => [rankFmt(Number(v)), RANK_METRIC_LABEL[rankMetric]]} />
                      <Bar dataKey={rankMetric} name={RANK_METRIC_LABEL[rankMetric]} fill={COLORS.primary} radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 12, formatter: (v: unknown) => rankAxisFmt(Number(v)) }} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Col>
            <Col xs={24} xl={12}>
              <Card size="small" loading={loading} title={`Top Người tạo data - ${RANK_METRIC_LABEL[rankMetric]}`}>
                <Text type="secondary" style={{ fontSize: 12 }}>Người nhập khách vào hệ thống (thường là nhân viên phòng Marketing).</Text>
                {creatorRank.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có số liệu" />
                ) : (
                  <ResponsiveContainer width="100%" height={rankHeight(creatorRank.length)}>
                    <BarChart data={creatorRank} layout="vertical" margin={{ top: 8, right: 56, left: 8, bottom: 0 }} maxBarSize={22}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tickFormatter={rankAxisFmt} tick={{ fontSize: 12 }} />
                      <YAxis type="category" dataKey="userName" width={130} tick={{ fontSize: 12 }} />
                      <ChartTooltip formatter={(v) => [rankFmt(Number(v)), RANK_METRIC_LABEL[rankMetric]]} />
                      <Bar dataKey={rankMetric} name={RANK_METRIC_LABEL[rankMetric]} fill={COLORS.warning} radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 12, formatter: (v: unknown) => rankAxisFmt(Number(v)) }} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Col>
          </Row>

          <Row gutter={[12, 12]}>
            <Col xs={24} xl={12}>
              <Card size="small" loading={loading} title={`Tỷ trọng ${RANK_METRIC_LABEL[rankMetric].toLowerCase()} theo Marketing`}>
                <Text type="secondary" style={{ fontSize: 12 }}>Gồm cả phần chưa gán Marketing (màu xám) để tổng khớp với KPI.</Text>
                {marketingShare.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có số liệu" />
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={marketingShare} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2} isAnimationActive={false} label={(e) => rankAxisFmt(Number(e.value))}>
                        {marketingShare.map((s, i) => (
                          <Cell key={s.name} fill={s.name.startsWith('(Chưa gán') ? COLORS.muted : CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip formatter={(v) => [rankFmt(Number(v)), RANK_METRIC_LABEL[rankMetric]]} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Col>
            <Col xs={24} xl={12}>
              <Card size="small" loading={loading} title="Đối soát: Người tạo vs Marketing phụ trách">
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Data mới trong kỳ. Nếu phần &quot;Người tạo ≠ Marketing&quot; lớn, số theo 2 chiều sẽ lệch nhau - nên xem cả hai bảng thay vì chỉ một.
                </Text>
                {attributionData.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có data mới trong kỳ" />
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={attributionData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2} isAnimationActive={false} label={(e) => fmtCount(Number(e.value))}>
                        {attributionData.map((s) => <Cell key={s.name} fill={s.color} />)}
                      </Pie>
                      <ChartTooltip formatter={(v) => [`${fmtCount(Number(v))} khách`, '']} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Col>
          </Row>

          {/* ── Chất lượng theo status + Nguồn ── */}
          <Row gutter={[12, 12]}>
            <Col xs={24} xl={12}>
              <Card size="small" loading={loading} title="Chất lượng data theo Marketing (trạng thái hiện tại)">
                <Text type="secondary" style={{ fontSize: 12 }}>Data mới trong kỳ của 10 Marketing nhiều data nhất, chia theo trạng thái khách hiện tại.</Text>
                {statusData.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có data mới trong kỳ" />
                ) : (
                  <ResponsiveContainer width="100%" height={rankHeight(statusData.length) + 30}>
                    <BarChart data={statusData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }} maxBarSize={22}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12 }} />
                      <ChartTooltip formatter={(v) => fmtCount(Number(v))} />
                      <Legend />
                      {statusSeries.map((s) => (
                        <Bar key={s.key} dataKey={s.key} name={s.label} stackId="status" fill={s.color} isAnimationActive={false} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Col>
            <Col xs={24} xl={12}>
              <Card size="small" loading={loading} title="Theo nguồn">
                <Text type="secondary" style={{ fontSize: 12 }}>Nguồn nào đem về data và doanh thu nhiều nhất trong kỳ.</Text>
                {(data?.bySource.length ?? 0) === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có số liệu" />
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={(data?.bySource ?? []).slice(0, 8)} margin={{ top: 16, right: 12, left: 0, bottom: 0 }} maxBarSize={40}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="source" tick={{ fontSize: 12 }} />
                        <YAxis tickFormatter={formatUsdCompact} tick={{ fontSize: 12 }} />
                        <ChartTooltip formatter={(v) => [formatUsd(Number(v)), 'Doanh thu']} />
                        <Bar dataKey="revenue" name="Doanh thu" fill={COLORS.gold} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                    <Table
                      size="small"
                      pagination={false}
                      rowKey="source"
                      dataSource={data?.bySource ?? []}
                      scroll={{ y: 180 }}
                      columns={[
                        { title: 'Nguồn', dataIndex: 'source', key: 'source', render: (v: string) => <Tag>{v}</Tag> },
                        { title: 'Data mới', dataIndex: 'totalCustomers', key: 't', align: 'right', render: fmtCount },
                        { title: 'Khách nạp', dataIndex: 'depositedCustomers', key: 'd', align: 'right', render: fmtCount },
                        {
                          title: <Tooltip title="Data mới đã từng nạp / Data mới">Tỷ lệ nạp</Tooltip>,
                          key: 'rate',
                          align: 'right',
                          render: (_: unknown, r: { cohortDepositedCustomers: number; totalCustomers: number }) => {
                            const p = pct(r.cohortDepositedCustomers, r.totalCustomers);
                            return p == null ? '—' : `${p}%`;
                          },
                        },
                        { title: 'Doanh thu', dataIndex: 'revenue', key: 'r', align: 'right', render: formatUsd },
                      ]}
                    />
                  </>
                )}
              </Card>
            </Col>
          </Row>

          {/* ── Bảng chi tiết ── */}
          <MarketingBreakdownTable
            marketing={data?.marketing ?? []}
            creators={data?.creators ?? []}
            loading={loading}
            activeMarketingId={filters.marketingUserId}
            activeCreatorId={filters.createdById}
            onFilterMarketing={(id) => {
              setFilter({ marketingUserId: id });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onFilterCreator={(id) => {
              setFilter({ createdById: id });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </div>
      </Spin>
    </div>
  );
}
