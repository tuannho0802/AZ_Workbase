'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Empty, Row, Segmented, Select, Space, Spin, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
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
import { useUtmQualityReport } from '@/lib/hooks/useReports';
import type {
  ReportQuery,
  UtmOption,
  UtmParticipant,
  UtmPersonRow,
  UtmQualityFilters,
  UtmQualityRow,
  UtmQualityState,
  UtmSourceRow,
  UtmUserBrief,
} from '@/lib/types/reports.types';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { fmtCount, formatUsd, formatUsdCompact, normalizeText, pct, trendLabel } from '@/lib/utils/marketingReport';
import { rateTextColor } from '@/lib/utils/rateColor';
import { resolveEntityColor } from '@/lib/utils/entityColor';
import {
  MIN_SAMPLE_CUSTOMERS,
  UTM_RANK_LABEL,
  buildUtmInsights,
  filterUtmRows,
  isMoneyRank,
  isRateRank,
  topUtms,
  utmHealth,
  utmRates,
  type UtmRankMetric,
} from '@/lib/utils/utmQuality';
import PeriodSelector from './PeriodSelector';
import ReportKpiCard, { REPORT_COLORS } from './ReportKpiCard';
import ReportNameFilter from './ReportNameFilter';
import { ReportUserOption, ReportUserSelect } from './ReportUserSelect';
import ReportCustomersModal, { type CustomerDrill } from './ReportCustomersModal';
import { CHART_COLORS } from './ReportChart';

const { Text } = Typography;

const COUNT_DOMAIN: [number, (dataMax: number) => number] = [0, (dataMax) => Math.max(dataMax, 1)];
const PCT_DOMAIN: [number, number] = [0, 100];
const RANK_OPTIONS = (Object.keys(UTM_RANK_LABEL) as UtmRankMetric[]).map((m) => ({ value: m, label: UTM_RANK_LABEL[m] }));
const rankHeight = (n: number) => Math.max(200, n * 36 + 40);
const NO_PERSON = 0;

interface Props {
  query: ReportQuery;
  onQueryChange: (next: ReportQuery) => void;
}

/** Ô % có màu theo ngưỡng + tử/mẫu nhỏ bên dưới (vd "50% · 10/20"). */
const rateCell = (num: number, den: number) => {
  const p = pct(num, den);
  if (p == null) return <Text type="secondary">—</Text>;
  return (
    <span>
      <span style={{ color: rateTextColor(p), fontWeight: 600 }}>{p}%</span>
      <Text type="secondary" style={{ fontSize: 11 }}> · {fmtCount(num)}/{fmtCount(den)}</Text>
    </span>
  );
};

const utmTag = (name: string, color: string) => (
  <Tag color={resolveEntityColor(color)} style={{ marginInlineEnd: 0 }}>{name}</Tag>
);

/** Người tham gia UTM: user thật -> Avatar + Tag; userId 0 -> nhãn "chưa gán". */
const personCell = (userId: number, user: UtmUserBrief | null, emptyLabel: string) =>
  userId === NO_PERSON || !user ? (
    <Text type="secondary" italic>{userId === NO_PERSON ? emptyLabel : '(Không rõ)'}</Text>
  ) : (
    <ReportUserOption user={user} />
  );

/**
 * Tab "Chất lượng UTM" - mỗi UTM (nguồn/chiến dịch) đem về khách tốt tới đâu: bao nhiêu khách, đã nạp/đã chốt, doanh thu
 * + lịch sử nạp, nạp lại, vào hệ thống bao lâu thì nạp; kèm SALES chăm khách và MARKETING phụ trách. Chia 3 góc nhìn:
 * Tất cả / Chỉ UTM Hoạt động / Chỉ UTM Đã khoá. Bấm bất kỳ con số nào để xem danh sách khách phía sau.
 *
 * Recharts: luôn `isAnimationActive={false}` (bật animation thì Bar/Pie có thể render rỗng khi mount trong ResponsiveContainer).
 */
export default function UtmQualityReportTab({ query, onQueryChange }: Props) {
  const [filters, setFilters] = useState<UtmQualityFilters>({});
  const [rankMetric, setRankMetric] = useState<UtmRankMetric>('lifetimeRevenue');
  const [search, setSearch] = useState('');
  const [hideEmpty, setHideEmpty] = useState(false);
  const [drill, setDrill] = useState<CustomerDrill | null>(null);
  // Danh sách người đã từng xuất hiện trong báo cáo -> dropdown Sales/Marketing không "co lại" khi đang lọc 1 người.
  const [seenSales, setSeenSales] = useState<Map<number, UtmUserBrief>>(new Map());
  const [seenMarketing, setSeenMarketing] = useState<Map<number, UtmUserBrief>>(new Map());

  const { data, isLoading, isFetching, isError, error, refetch } = useUtmQualityReport({ ...query, ...filters });
  const loading = isLoading;
  const state: UtmQualityState = filters.state ?? 'all';
  const granularity = data?.period.granularity ?? 'day';
  const cur = data?.summary.current;
  const prev = data?.summary.previous;
  const rates = cur ? utmRates(cur) : null;
  const activeFilters =
    Number(filters.utmId != null) + Number(filters.salesUserId != null) + Number(filters.marketingUserId != null) + Number(state !== 'all');

  useEffect(() => {
    if (!data) return;
    const merge = (rows: UtmPersonRow[], setter: typeof setSeenSales) =>
      setter((old) => {
        const next = new Map(old);
        for (const r of rows) {
          if (r.userId > 0) {
            next.set(r.userId, { id: r.userId, name: r.userName, role: r.role, departmentName: r.departmentName, departmentColor: r.departmentColor, positionName: r.positionName, positionColor: r.positionColor });
          }
        }
        return next;
      });
    merge(data.bySales, setSeenSales);
    merge(data.byMarketing, setSeenMarketing);
  }, [data]);

  const salesUsers = useMemo(() => {
    const m = new Map(seenSales);
    if (data?.appliedFilters.salesUser) m.set(data.appliedFilters.salesUser.id, data.appliedFilters.salesUser);
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [seenSales, data?.appliedFilters.salesUser]);
  const marketingUsers = useMemo(() => {
    const m = new Map(seenMarketing);
    if (data?.appliedFilters.marketingUser) m.set(data.appliedFilters.marketingUser.id, data.appliedFilters.marketingUser);
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [seenMarketing, data?.appliedFilters.marketingUser]);

  const setFilter = (patch: Partial<UtmQualityFilters>) => setFilters((f) => ({ ...f, ...patch }));
  // Đổi góc nhìn -> bỏ UTM đang chọn (UTM cũ có thể không thuộc góc nhìn mới).
  const changeState = (next: UtmQualityState) => setFilters((f) => ({ ...f, state: next === 'all' ? undefined : next, utmId: undefined }));
  const focusUtm = (utmId: number) => {
    setFilter({ utmId });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  // Mini Table luôn kế thừa bộ lọc đang bật để danh sách KHỚP con số trên thẻ.
  const inherited = (): NonNullable<CustomerDrill['preset']> => ({
    utmId: filters.utmId,
    utmState: filters.state,
    salesUserId: filters.salesUserId,
    marketingUserId: filters.marketingUserId,
  });
  const openDrill = (d: CustomerDrill) => setDrill({ ...d, preset: { ...inherited(), ...(d.preset ?? {}) } });
  const drillUtm = (utmId: number, metric: CustomerDrill['metric'], label: string) => () =>
    setDrill({ metric, label, preset: { ...inherited(), utmId } });
  const drillPerson = (key: 'salesUserId' | 'marketingUserId', userId: number, label: string, metric: CustomerDrill['metric'] = 'utm_customers') => () =>
    setDrill({ metric, label, preset: { ...inherited(), [key]: userId } });

  const utms = useMemo(() => data?.utms ?? [], [data?.utms]);
  const insights = useMemo(() => buildUtmInsights(utms), [utms]);
  const tableRows = useMemo(() => filterUtmRows(utms, { search, hideEmpty }, normalizeText), [utms, search, hideEmpty]);

  const trendData = useMemo(
    () => (data?.trend ?? []).map((t) => ({ ...t, label: trendLabel(t.date, granularity) })),
    [data?.trend, granularity],
  );
  const trendHasData = trendData.some((t) => t.newCustomers > 0 || t.revenue > 0);

  const rank = useMemo(() => topUtms(utms, rankMetric, 10), [utms, rankMetric]);
  const money = isMoneyRank(rankMetric);
  const rateRank = isRateRank(rankMetric);
  const rankFmt = (v: number) => (money ? formatUsd(v) : rateRank ? `${v}%` : fmtCount(v));
  const rankAxisFmt = (v: number) => (money ? formatUsdCompact(v) : rateRank ? `${v}%` : fmtCount(v));

  const bySizeTop = useMemo(() => [...utms].filter((u) => u.customers > 0).sort((a, b) => b.customers - a.customers).slice(0, 10), [utms]);
  const rateData = useMemo(
    () => bySizeTop.map((u) => ({ name: u.utmName, depositRate: pct(u.depositedCustomers, u.customers) ?? 0, closeRate: pct(u.closedCustomers, u.customers) ?? 0 })),
    [bySizeTop],
  );
  const statusSeries = useMemo(
    () =>
      (data?.statuses ?? []).map((s, i) => ({
        key: s.code,
        label: s.name,
        color: s.color?.startsWith('#') ? s.color : CHART_COLORS[i % CHART_COLORS.length],
      })),
    [data?.statuses],
  );
  const statusData = useMemo(() => bySizeTop.map((u) => ({ name: u.utmName, ...u.byStatus })), [bySizeTop]);
  const statusPie = useMemo(
    () => statusSeries.map((s) => ({ name: s.label, value: data?.summary.totalByStatus[s.key] ?? 0, color: s.color })).filter((x) => x.value > 0),
    [statusSeries, data?.summary.totalByStatus],
  );
  const funnel = useMemo(
    () =>
      cur
        ? [
            { name: 'Khách của UTM', value: cur.customers, color: REPORT_COLORS.primary },
            { name: 'Đã từng nạp', value: cur.depositedCustomers, color: REPORT_COLORS.gold },
            { name: 'Nạp lại (≥ 2 khoản)', value: cur.redepositors, color: REPORT_COLORS.warning },
            { name: 'Đã chốt', value: cur.closedCustomers, color: REPORT_COLORS.ok },
          ]
        : [],
    [cur],
  );

  const noUtmPct = data ? pct(data.summary.newCustomersNoUtm, data.summary.newCustomers) : null;
  const selectedUtm = data?.options.utms.find((u) => u.id === filters.utmId);
  const scopeLabel = state === 'active' ? 'các UTM hoạt động' : state === 'locked' ? 'các UTM đã khoá' : 'các UTM';

  // ── Bảng chi tiết theo UTM ──
  const linkBtn = { padding: 0, height: 'auto' } as const;
  const drillNum = (v: number, r: UtmQualityRow, metric: CustomerDrill['metric']) =>
    v > 0 ? (
      <Button type="link" size="small" style={linkBtn} onClick={drillUtm(r.utmId, metric, r.utmName)}>{fmtCount(v)}</Button>
    ) : (
      <Text type="secondary">0</Text>
    );
  const drillRate = (num: number, den: number, r: UtmQualityRow, metric: CustomerDrill['metric']) =>
    num > 0 ? (
      <Button type="link" size="small" style={linkBtn} onClick={drillUtm(r.utmId, metric, r.utmName)}>{rateCell(num, den)}</Button>
    ) : (
      rateCell(num, den)
    );

  const columns: ColumnsType<UtmQualityRow> = [
    {
      title: 'UTM',
      key: 'utm',
      fixed: 'left',
      width: 230,
      sorter: (a, b) => a.utmName.localeCompare(b.utmName, 'vi'),
      render: (_, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
          {utmTag(r.utmName, r.color)}
          <Space size={4}>
            {!r.isActive && <Tag style={{ marginInlineEnd: 0, fontSize: 11, lineHeight: '18px' }}>Đã khoá</Tag>}
            {r.visibility === 'restricted' && <Tag style={{ marginInlineEnd: 0, fontSize: 11, lineHeight: '18px' }}>Hạn chế</Tag>}
          </Space>
        </div>
      ),
    },
    {
      title: <Tooltip title="Quản lý chính của UTM (Quản lý UTM → Quản lý chính-phụ).">Quản lý chính</Tooltip>,
      key: 'manager',
      width: 250,
      render: (_, r) =>
        r.primaryManager ? (
          <div>
            <ReportUserOption user={r.primaryManager} />
            {r.secondaryManagers.length > 0 && (
              <Tooltip title={r.secondaryManagers.map((m) => m.name).join(', ')}>
                <Text type="secondary" style={{ fontSize: 11 }}>+{r.secondaryManagers.length} quản lý phụ</Text>
              </Tooltip>
            )}
          </div>
        ) : (
          <Text type="secondary" italic>Chưa có</Text>
        ),
    },
    {
      title: <Tooltip title="Khách đang gắn UTM (mọi thời điểm).">Khách</Tooltip>,
      dataIndex: 'customers',
      key: 'customers',
      align: 'right',
      width: 90,
      sorter: (a, b) => a.customers - b.customers,
      defaultSortOrder: 'descend',
      render: (v: number, r) => drillNum(v, r, 'utm_customers'),
    },
    {
      title: <Tooltip title="Khách mới của UTM TRONG KỲ (theo ngày tạo).">Mới trong kỳ</Tooltip>,
      dataIndex: 'newCustomers',
      key: 'newCustomers',
      align: 'right',
      width: 105,
      sorter: (a, b) => a.newCustomers - b.newCustomers,
      render: (v: number, r) => drillNum(v, r, 'utm_new'),
    },
    {
      title: <Tooltip title="Khách đã từng nạp / khách của UTM. Màu: < 40% đỏ, 40–80% vàng, > 80% xanh.">Đã nạp</Tooltip>,
      key: 'deposited',
      width: 150,
      sorter: (a, b) => (pct(a.depositedCustomers, a.customers) ?? -1) - (pct(b.depositedCustomers, b.customers) ?? -1),
      render: (_, r) => drillRate(r.depositedCustomers, r.customers, r, 'utm_deposited'),
    },
    {
      title: <Tooltip title="Khách chưa nạp lần nào - cần chăm sóc để kéo nạp.">Chưa nạp</Tooltip>,
      key: 'notDeposited',
      align: 'right',
      width: 95,
      sorter: (a, b) => a.customers - a.depositedCustomers - (b.customers - b.depositedCustomers),
      render: (_, r) => drillNum(Math.max(0, r.customers - r.depositedCustomers), r, 'utm_no_deposit'),
    },
    {
      title: <Tooltip title="Khách đang ở trạng thái Đã chốt / khách của UTM.">Đã chốt</Tooltip>,
      key: 'closed',
      width: 150,
      sorter: (a, b) => (pct(a.closedCustomers, a.customers) ?? -1) - (pct(b.closedCustomers, b.customers) ?? -1),
      render: (_, r) => drillRate(r.closedCustomers, r.customers, r, 'utm_closed'),
    },
    {
      title: <Tooltip title="Khách nạp từ 2 khoản trở lên / khách đã nạp - khách được giữ chân tốt.">Nạp lại</Tooltip>,
      key: 'redeposit',
      width: 130,
      sorter: (a, b) => (pct(a.redepositors, a.depositedCustomers) ?? -1) - (pct(b.redepositors, b.depositedCustomers) ?? -1),
      render: (_, r) => rateCell(r.redepositors, r.depositedCustomers),
    },
    {
      title: <Tooltip title="Tiền nạp trong kỳ (theo ngày nạp).">Doanh thu kỳ</Tooltip>,
      dataIndex: 'periodRevenue',
      key: 'periodRevenue',
      align: 'right',
      width: 120,
      sorter: (a, b) => a.periodRevenue - b.periodRevenue,
      render: (v: number) => formatUsd(v),
    },
    {
      title: <Tooltip title="Tổng tiền nạp mọi thời điểm của khách UTM.">Doanh thu tổng</Tooltip>,
      dataIndex: 'lifetimeRevenue',
      key: 'lifetimeRevenue',
      align: 'right',
      width: 130,
      sorter: (a, b) => a.lifetimeRevenue - b.lifetimeRevenue,
      render: (v: number) => <Text strong>{formatUsd(v)}</Text>,
    },
    {
      title: <Tooltip title="Tổng số khoản nạp mọi thời điểm (lịch sử nạp).">Số khoản nạp</Tooltip>,
      dataIndex: 'depositCount',
      key: 'depositCount',
      align: 'right',
      width: 105,
      sorter: (a, b) => a.depositCount - b.depositCount,
      render: fmtCount,
    },
    {
      title: <Tooltip title="Doanh thu tổng / khách của UTM.">TB / khách</Tooltip>,
      key: 'perCustomer',
      align: 'right',
      width: 110,
      sorter: (a, b) => (utmRates(a).revenuePerCustomer ?? -1) - (utmRates(b).revenuePerCustomer ?? -1),
      render: (_, r) => {
        const v = utmRates(r).revenuePerCustomer;
        return v == null ? '—' : formatUsd(v);
      },
    },
    {
      title: <Tooltip title="TB số ngày từ lúc khách vào hệ thống tới khoản nạp đầu tiên (chỉ tính khách nạp sau/cùng ngày nhập). Càng ngắn càng tốt.">Vào → nạp</Tooltip>,
      dataIndex: 'avgDaysToFirstDeposit',
      key: 'avgDays',
      align: 'right',
      width: 100,
      sorter: (a, b) => (a.avgDaysToFirstDeposit ?? Infinity) - (b.avgDaysToFirstDeposit ?? Infinity),
      render: (v: number | null) => (v == null ? '—' : `${v} ngày`),
    },
    {
      title: <Tooltip title="Số Sales khác nhau đang chăm khách của UTM (bấm dấu + ở đầu dòng để xem chi tiết).">Sales</Tooltip>,
      key: 'salesCount',
      align: 'right',
      width: 80,
      sorter: (a, b) => a.sales.total - b.sales.total,
      render: (_, r) => fmtCount(r.sales.total),
    },
    {
      title: <Tooltip title="Số Marketing khác nhau phụ trách khách của UTM.">Marketing</Tooltip>,
      key: 'mktCount',
      align: 'right',
      width: 95,
      sorter: (a, b) => a.marketing.total - b.marketing.total,
      render: (_, r) => fmtCount(r.marketing.total),
    },
    {
      title: <Tooltip title={`Đánh giá theo tỷ lệ nạp của khách. UTM dưới ${MIN_SAMPLE_CUSTOMERS} khách không chấm điểm (quá ít mẫu).`}>Đánh giá</Tooltip>,
      key: 'health',
      width: 110,
      fixed: 'right',
      render: (_, r) => {
        const h = utmHealth(r);
        return <Tag color={h.color} style={{ marginInlineEnd: 0 }}>{h.label}</Tag>;
      },
    },
    {
      title: '',
      key: 'act',
      width: 90,
      fixed: 'right',
      render: (_, r) =>
        r.utmId === filters.utmId ? (
          <Text type="secondary" style={{ fontSize: 12 }}>Đang xem</Text>
        ) : (
          <Button type="link" size="small" onClick={() => focusUtm(r.utmId)}>Xem UTM</Button>
        ),
    },
  ];

  /** Dòng mở rộng: Sales & Marketing tham gia UTM (top theo doanh thu) + cơ cấu trạng thái. */
  const participantColumns = (key: 'salesUserId' | 'marketingUserId', emptyLabel: string, utmId: number, utmName: string): ColumnsType<UtmParticipant> => [
    { title: key === 'salesUserId' ? 'Sales chăm khách' : 'Marketing phụ trách', key: 'p', render: (_, p) => personCell(p.userId, p.user, emptyLabel) },
    {
      title: 'Khách',
      dataIndex: 'customers',
      key: 'c',
      align: 'right',
      width: 80,
      render: (v: number, p) =>
        v > 0 ? (
          <Button type="link" size="small" style={linkBtn} onClick={() => setDrill({ metric: 'utm_customers', label: utmName, preset: { ...inherited(), utmId, [key]: p.userId } })}>{fmtCount(v)}</Button>
        ) : (
          <Text type="secondary">0</Text>
        ),
    },
    { title: 'Đã nạp', key: 'd', align: 'right', width: 130, render: (_, p) => rateCell(p.depositedCustomers, p.customers) },
    { title: 'Đã chốt', key: 'cl', align: 'right', width: 130, render: (_, p) => rateCell(p.closedCustomers, p.customers) },
    { title: 'Doanh thu tổng', dataIndex: 'lifetimeRevenue', key: 'r', align: 'right', width: 130, render: formatUsd },
  ];

  const expandedRow = (r: UtmQualityRow) => (
    <Row gutter={[16, 12]}>
      <Col xs={24} xl={12}>
        <Table<UtmParticipant>
          size="small"
          rowKey="userId"
          pagination={false}
          dataSource={r.sales.top}
          columns={participantColumns('salesUserId', '(Chưa có Sales)', r.utmId, r.utmName)}
          locale={{ emptyText: 'Chưa có Sales nào' }}
          footer={r.sales.total > r.sales.top.length ? () => <Text type="secondary" style={{ fontSize: 12 }}>Top {r.sales.top.length} theo doanh thu · còn {r.sales.total - r.sales.top.length} Sales khác</Text> : undefined}
        />
      </Col>
      <Col xs={24} xl={12}>
        <Table<UtmParticipant>
          size="small"
          rowKey="userId"
          pagination={false}
          dataSource={r.marketing.top}
          columns={participantColumns('marketingUserId', '(Chưa gán Marketing)', r.utmId, r.utmName)}
          locale={{ emptyText: 'Chưa có Marketing nào' }}
          footer={r.marketing.total > r.marketing.top.length ? () => <Text type="secondary" style={{ fontSize: 12 }}>Top {r.marketing.top.length} theo doanh thu · còn {r.marketing.total - r.marketing.top.length} Marketing khác</Text> : undefined}
        />
      </Col>
      <Col xs={24}>
        <Space size={[6, 6]} wrap>
          <Text type="secondary" style={{ fontSize: 12 }}>Trạng thái khách:</Text>
          {statusSeries.map((s) => (
            <Tag key={s.key} color={s.color} style={{ marginInlineEnd: 0 }}>{s.label}: {fmtCount(r.byStatus[s.key] ?? 0)}</Tag>
          ))}
          {r.description && <Text type="secondary" style={{ fontSize: 12 }}>· {r.description}</Text>}
        </Space>
      </Col>
    </Row>
  );

  const sourceColumns: ColumnsType<UtmSourceRow> = [
    { title: 'Nguồn', dataIndex: 'source', key: 'source', render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Khách', dataIndex: 'customers', key: 'm', align: 'right', render: fmtCount },
    { title: 'Đã nạp', key: 'd', align: 'right', render: (_, r) => rateCell(r.depositedCustomers, r.customers) },
    { title: 'Đã chốt', key: 'c', align: 'right', render: (_, r) => rateCell(r.closedCustomers, r.customers) },
    { title: 'Doanh thu tổng', dataIndex: 'lifetimeRevenue', key: 'r', align: 'right', render: formatUsd },
  ];

  const personColumns = (key: 'salesUserId' | 'marketingUserId', title: string, emptyLabel: string): ColumnsType<UtmPersonRow> => [
    {
      title,
      key: 'p',
      render: (_, r) =>
        r.userId === NO_PERSON ? (
          <Text type="secondary" italic>{r.userName || emptyLabel}</Text>
        ) : (
          <ReportUserOption user={{ id: r.userId, name: r.userName, role: r.role, departmentName: r.departmentName, departmentColor: r.departmentColor, positionName: r.positionName, positionColor: r.positionColor }} />
        ),
    },
    {
      title: 'Khách',
      dataIndex: 'customers',
      key: 'c',
      align: 'right',
      sorter: (a, b) => a.customers - b.customers,
      render: (v: number, r) =>
        v > 0 ? <Button type="link" size="small" style={linkBtn} onClick={drillPerson(key, r.userId, r.userName)}>{fmtCount(v)}</Button> : <Text type="secondary">0</Text>,
    },
    { title: <Tooltip title="Số UTM khác nhau người này đang tham gia.">UTM</Tooltip>, dataIndex: 'utmCount', key: 'u', align: 'right', render: fmtCount, sorter: (a, b) => a.utmCount - b.utmCount },
    { title: 'Đã nạp', key: 'd', align: 'right', render: (_, r) => rateCell(r.depositedCustomers, r.customers) },
    { title: 'Đã chốt', key: 'cl', align: 'right', render: (_, r) => rateCell(r.closedCustomers, r.customers) },
    { title: 'Doanh thu kỳ', dataIndex: 'periodRevenue', key: 'pr', align: 'right', render: formatUsd, sorter: (a, b) => a.periodRevenue - b.periodRevenue },
    { title: 'Doanh thu tổng', dataIndex: 'lifetimeRevenue', key: 'r', align: 'right', render: formatUsd, sorter: (a, b) => a.lifetimeRevenue - b.lifetimeRevenue, defaultSortOrder: 'descend' },
    {
      title: '',
      key: 'act',
      width: 60,
      render: (_, r) =>
        r.userId === NO_PERSON || filters[key] === r.userId ? null : <Button type="link" size="small" onClick={() => setFilter({ [key]: r.userId })}>Lọc</Button>,
    },
  ];

  const insightList = (rows: UtmQualityRow[], metric: CustomerDrill['metric'], extra: (r: UtmQualityRow) => string) =>
    rows.map((r) => (
      <div key={r.utmId} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', padding: '4px 0' }}>
        <div style={{ minWidth: 0 }}>
          <Button type="link" size="small" style={{ ...linkBtn, fontWeight: 600 }} onClick={() => focusUtm(r.utmId)}>{r.utmName}</Button>
          <div><Text type="secondary" style={{ fontSize: 12 }}>{extra(r)}</Text></div>
        </div>
        <Button size="small" onClick={drillUtm(r.utmId, metric, r.utmName)}>Xem khách</Button>
      </div>
    ));

  const hasInsights = insights.needsAttention.length + insights.bestPractice.length + insights.emptyUtms.length + insights.zeroDeposit.length > 0;
  const split = data?.summary.stateSplit;
  const splitRow = (label: string, key: 'active' | 'locked') => {
    const s = split?.[key];
    const r = s ? utmRates(s) : null;
    return (
      <Col xs={24} md={12} key={key}>
        <div style={{ padding: 12, border: '1px solid #f0f0f0', borderRadius: 8, height: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text strong>{label} ({fmtCount(s?.utmCount ?? 0)} UTM)</Text>
            <Button size="small" type="link" onClick={() => changeState(key)}>Chỉ xem nhóm này</Button>
          </div>
          <Row gutter={[8, 8]} style={{ marginTop: 8 }}>
            <Col span={8}><Text type="secondary" style={{ fontSize: 12 }}>Khách</Text><div><Text strong>{fmtCount(s?.customers ?? 0)}</Text></div></Col>
            <Col span={8}><Text type="secondary" style={{ fontSize: 12 }}>Đã nạp</Text><div><Text strong style={{ color: rateTextColor(r?.depositRate) }}>{r?.depositRate == null ? '—' : `${r.depositRate}%`}</Text></div></Col>
            <Col span={8}><Text type="secondary" style={{ fontSize: 12 }}>Đã chốt</Text><div><Text strong style={{ color: rateTextColor(r?.closeRate) }}>{r?.closeRate == null ? '—' : `${r.closeRate}%`}</Text></div></Col>
            <Col span={8}><Text type="secondary" style={{ fontSize: 12 }}>Doanh thu kỳ</Text><div><Text strong>{formatUsd(s?.periodRevenue ?? 0)}</Text></div></Col>
            <Col span={8}><Text type="secondary" style={{ fontSize: 12 }}>Doanh thu tổng</Text><div><Text strong>{formatUsd(s?.lifetimeRevenue ?? 0)}</Text></div></Col>
            <Col span={8}><Text type="secondary" style={{ fontSize: 12 }}>TB / khách</Text><div><Text strong>{r?.revenuePerCustomer == null ? '—' : formatUsd(r.revenuePerCustomer)}</Text></div></Col>
          </Row>
        </div>
      </Col>
    );
  };

  return (
    <div className="space-y-4">
      {/* ── Bộ lọc ── */}
      <Card size="small" styles={{ body: { padding: 16 } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <PeriodSelector value={query} onChange={onQueryChange} resolvedPeriod={data?.period} />
          <Space>
            {activeFilters > 0 && <Button icon={<ClearOutlined />} onClick={() => setFilters({})}>Xoá lọc ({activeFilters})</Button>}
            <Button icon={<ReloadOutlined />} loading={isFetching && !isLoading} onClick={() => refetch()}>Làm mới</Button>
          </Space>
        </div>
        <div style={{ marginTop: 12 }}>
          <div className="mb-1"><Text strong>Góc nhìn UTM</Text></div>
          <Segmented<UtmQualityState>
            value={state}
            onChange={changeState}
            options={[
              { value: 'all', label: `Tất cả UTM${data ? ` (${data.summary.stateCounts.all})` : ''}` },
              { value: 'active', label: `Chỉ UTM Hoạt động${data ? ` (${data.summary.stateCounts.active})` : ''}` },
              { value: 'locked', label: `Chỉ UTM Đã khoá${data ? ` (${data.summary.stateCounts.locked})` : ''}` },
            ]}
          />
        </div>
        <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
          <Col xs={24} sm={12} xl={8}>
            <div className="mb-1"><Text strong>UTM cụ thể</Text></div>
            <Select<number>
              allowClear
              showSearch={{ optionFilterProp: 'label' }}
              style={{ width: '100%' }}
              placeholder="Tất cả UTM"
              value={filters.utmId}
              onChange={(v) => setFilter({ utmId: v })}
              optionLabelProp="label"
              popupMatchSelectWidth={false}
              options={(data?.options.utms ?? []).map((u) => ({ value: u.id, label: u.name, utm: u }))}
              optionRender={(option) => {
                const u = (option.data as { utm: UtmOption }).utm;
                return (
                  <Space size={4}>
                    {utmTag(u.name, u.color)}
                    {!u.isActive && <Tag style={{ marginInlineEnd: 0, fontSize: 10 }}>Đã khoá</Tag>}
                  </Space>
                );
              }}
            />
          </Col>
          <Col xs={24} sm={12} xl={8}>
            <div className="mb-1"><Text strong>Sales phụ trách khách</Text></div>
            <ReportUserSelect
              users={salesUsers}
              value={filters.salesUserId}
              onChange={(v) => setFilter({ salesUserId: v })}
              placeholder="Tất cả Sales"
              extraOptions={[{ value: NO_PERSON, label: '(Chưa có Sales)' }]}
            />
          </Col>
          <Col xs={24} sm={12} xl={8}>
            <div className="mb-1"><Text strong>Marketing phụ trách khách</Text></div>
            <ReportUserSelect
              users={marketingUsers}
              value={filters.marketingUserId}
              onChange={(v) => setFilter({ marketingUserId: v })}
              placeholder="Tất cả Marketing"
              extraOptions={[{ value: NO_PERSON, label: '(Chưa gán Marketing)' }]}
            />
          </Col>
        </Row>
      </Card>

      {isError && <Alert type="error" showIcon title="Không tải được báo cáo chất lượng UTM" description={getApiErrorMessage(error, 'Đã có lỗi xảy ra, vui lòng thử lại')} />}
      {data?.ownOnly && (
        <Alert type="info" showIcon title="Bạn chỉ xem được số liệu của khách thuộc phạm vi của mình" description="Số khách/doanh thu của từng UTM chỉ tính các khách bạn được phép xem, không phải toàn bộ UTM." />
      )}
      {data && data.summary.newCustomersNoUtm > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          title={`${fmtCount(data.summary.newCustomersNoUtm)}${noUtmPct != null ? ` (${noUtmPct}%)` : ''} data mới trong kỳ chưa gắn UTM nào`}
          description="Khách chưa gắn UTM thì rơi khỏi đo lường nguồn/chiến dịch - nên gắn UTM để biết nguồn nào đem về khách tốt."
          action={<Button size="small" type="primary" onClick={() => setDrill({ metric: 'new_no_utm' })}>Xem danh sách khách</Button>}
        />
      )}

      <Spin spinning={isFetching && !isLoading}>
        <div className="space-y-4">
          {/* ── KPI ── */}
          <Row gutter={[12, 12]}>
            <Col xs={24} md={12} xl={6}>
              <ReportKpiCard title={selectedUtm ? `Khách — ${selectedUtm.name}` : `Khách của ${scopeLabel}`} value={cur?.customers ?? 0} color={REPORT_COLORS.primary} loading={loading}
                hint={data ? `${fmtCount(data.summary.utmCount)} UTM${data.summary.emptyUtms > 0 ? ` · ${data.summary.emptyUtms} UTM trống` : ''} · mỗi khách đếm 1 lần` : undefined}
                onClick={() => openDrill({ metric: 'utm_customers' })} />
            </Col>
            <Col xs={24} md={12} xl={6}>
              <ReportKpiCard title="Khách mới trong kỳ" value={cur?.newCustomers ?? 0} previous={prev?.newCustomers} color={REPORT_COLORS.ok} loading={loading}
                onClick={() => openDrill({ metric: 'utm_new' })} />
            </Col>
            <Col xs={24} md={12} xl={6}>
              <ReportKpiCard title={<Tooltip title="Khách đã từng nạp / khách của UTM - chỉ số chất lượng chính.">Tỷ lệ khách đã nạp</Tooltip>}
                value={rates?.depositRate ?? 0} suffix="%" rateColored color={REPORT_COLORS.gold} loading={loading}
                hint={cur ? `${fmtCount(cur.depositedCustomers)} / ${fmtCount(cur.customers)} khách` : undefined}
                onClick={() => openDrill({ metric: 'utm_deposited' })} />
            </Col>
            <Col xs={24} md={12} xl={6}>
              <ReportKpiCard title={<Tooltip title="Khách chưa nạp lần nào - danh sách nên ưu tiên chăm sóc.">Khách chưa nạp</Tooltip>}
                value={rates?.notDeposited ?? 0} color={REPORT_COLORS.danger} loading={loading}
                onClick={() => openDrill({ metric: 'utm_no_deposit' })} />
            </Col>
            <Col xs={24} md={12} xl={6}>
              <ReportKpiCard title="Tỷ lệ khách đã chốt" value={rates?.closeRate ?? 0} suffix="%" rateColored color={REPORT_COLORS.ok} loading={loading}
                hint={cur ? `${fmtCount(cur.closedCustomers)} / ${fmtCount(cur.customers)} khách` : undefined}
                onClick={() => openDrill({ metric: 'utm_closed' })} />
            </Col>
            <Col xs={24} md={12} xl={6}>
              <ReportKpiCard title={<Tooltip title="Trong số khách MỚI trong kỳ, tỷ lệ đã từng nạp - cùng cohort nên ≤ 100%.">Khách mới đã nạp</Tooltip>}
                value={rates?.newDepositRate ?? 0} suffix="%" rateColored color={REPORT_COLORS.gold} loading={loading}
                hint={cur ? `${fmtCount(cur.newDeposited)} / ${fmtCount(cur.newCustomers)} khách mới · ${fmtCount(cur.newClosed)} đã chốt` : undefined}
                onClick={() => openDrill({ metric: 'utm_new_deposited' })} />
            </Col>
            <Col xs={24} md={12} xl={6}>
              <ReportKpiCard title="Doanh thu trong kỳ" value={cur?.periodRevenue ?? 0} previous={prev?.periodRevenue} money color={REPORT_COLORS.gold} loading={loading}
                hint={cur ? `${fmtCount(cur.periodDepositors)} khách nạp trong kỳ` : undefined} />
            </Col>
            <Col xs={24} md={12} xl={6}>
              <ReportKpiCard title={<Tooltip title="Tổng tiền nạp mọi thời điểm / số khách của UTM.">Giá trị TB / khách</Tooltip>}
                value={rates?.revenuePerCustomer ?? 0} money color={REPORT_COLORS.primary} loading={loading}
                hint={cur ? `Tổng ${formatUsd(cur.lifetimeRevenue)} · ${fmtCount(cur.depositCount)} khoản nạp · nạp đầu sau ${cur.avgDaysToFirstDeposit == null ? '—' : `${cur.avgDaysToFirstDeposit} ngày`}` : undefined} />
            </Col>
          </Row>

          {/* ── So sánh Hoạt động vs Đã khoá (chỉ khi xem Tất cả) ── */}
          {state === 'all' && !selectedUtm && (data?.summary.stateCounts.locked ?? 0) > 0 && (
            <Card size="small" title="Hoạt động vs Đã khoá" loading={loading}>
              <Text type="secondary" style={{ fontSize: 12 }}>So sánh chất lượng khách của UTM đang chạy với UTM đã khoá (tính trên bộ lọc Sales/Marketing đang chọn).</Text>
              <Row gutter={[12, 12]} style={{ marginTop: 8 }}>
                {splitRow('UTM Hoạt động', 'active')}
                {splitRow('UTM Đã khoá', 'locked')}
              </Row>
            </Card>
          )}

          {/* ── Phễu + cơ cấu trạng thái tổng ── */}
          <Row gutter={[12, 12]}>
            <Col xs={24} xl={12}>
              <Card size="small" loading={loading} title="Phễu chất lượng khách">
                <Text type="secondary" style={{ fontSize: 12 }}>Từ khách của UTM tới đã nạp, nạp lại và đã chốt (trạng thái hiện tại, không lọc ngày).</Text>
                {!cur || cur.customers === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có khách với bộ lọc này" />
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={funnel} layout="vertical" margin={{ top: 8, right: 60, left: 8, bottom: 0 }} maxBarSize={28}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12 }} />
                      <ChartTooltip formatter={(v) => [`${fmtCount(Number(v))} (${pct(Number(v), cur.customers) ?? 0}% khách)`, 'Số khách']} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 12, formatter: (v: unknown) => fmtCount(Number(v)) }} isAnimationActive={false}>
                        {funnel.map((f) => <Cell key={f.name} fill={f.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Col>
            <Col xs={24} xl={12}>
              <Card size="small" loading={loading} title="Cơ cấu trạng thái khách">
                <Text type="secondary" style={{ fontSize: 12 }}>Khách của {scopeLabel} chia theo trạng thái hiện tại.</Text>
                {statusPie.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có khách với bộ lọc này" />
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={statusPie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2} isAnimationActive={false}
                        label={(p: { name?: string; value?: number }) => `${p.name}: ${fmtCount(Number(p.value))}`}>
                        {statusPie.map((s) => <Cell key={s.name} fill={s.color} />)}
                      </Pie>
                      <ChartTooltip formatter={(v, n) => [`${fmtCount(Number(v))} (${pct(Number(v), cur?.customers ?? 0) ?? 0}%)`, n]} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Col>
          </Row>

          {/* ── Gợi ý xử lý ── */}
          {!selectedUtm && hasInsights && (
            <Card size="small" title="Gợi ý xử lý nhanh" loading={loading}>
              <Text type="secondary" style={{ fontSize: 12 }}>Tự động rút ra từ bảng UTM bên dưới (chỉ xét UTM từ {MIN_SAMPLE_CUSTOMERS} khách trở lên).</Text>
              <Row gutter={[16, 12]} style={{ marginTop: 8 }}>
                <Col xs={24} lg={8}>
                  <Text strong style={{ color: REPORT_COLORS.danger }}>Cần xử lý (tỷ lệ nạp thấp)</Text>
                  {insights.needsAttention.length === 0
                    ? <div><Text type="secondary" style={{ fontSize: 12 }}>Không có UTM nào dưới 40% nạp.</Text></div>
                    : insightList(insights.needsAttention, 'utm_no_deposit', (r) => `${pct(r.depositedCustomers, r.customers)}% nạp · ${fmtCount(r.customers - r.depositedCustomers)} khách chưa nạp`)}
                </Col>
                <Col xs={24} lg={8}>
                  <Text strong style={{ color: '#389e0d' }}>Làm tốt - nên nhân rộng</Text>
                  {insights.bestPractice.length === 0
                    ? <div><Text type="secondary" style={{ fontSize: 12 }}>Chưa có UTM nào trên 80% nạp.</Text></div>
                    : insightList(insights.bestPractice, 'utm_deposited', (r) => `${pct(r.depositedCustomers, r.customers)}% nạp · ${formatUsd(r.lifetimeRevenue)} doanh thu tổng`)}
                </Col>
                <Col xs={24} lg={8}>
                  <Text strong>UTM trống / không ai nạp</Text>
                  {insights.emptyUtms.length + insights.zeroDeposit.length === 0
                    ? <div><Text type="secondary" style={{ fontSize: 12 }}>Không có.</Text></div>
                    : (
                      <>
                        {insightList(insights.zeroDeposit, 'utm_customers', (r) => `${fmtCount(r.customers)} khách nhưng chưa ai nạp`)}
                        {insightList(insights.emptyUtms, 'utm_customers', () => 'Chưa có khách nào')}
                      </>
                    )}
                </Col>
              </Row>
            </Card>
          )}

          {/* ── Xu hướng + Xếp hạng ── */}
          <Row gutter={[12, 12]}>
            <Col xs={24} xl={12}>
              <Card size="small" loading={loading} title={`Khách mới & doanh thu theo ${granularity === 'month' ? 'tháng' : 'ngày'}`}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Vùng = khách mới (theo ngày tạo, giờ VN, trục trái); đường = số khách nạp; cột = tiền nạp (theo ngày nạp, USD, trục phải).
                </Text>
                {!trendHasData ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có khách mới hoặc khoản nạp trong kỳ với bộ lọc này" />
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={trendData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="utmNewFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={REPORT_COLORS.primary} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={REPORT_COLORS.primary} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" minTickGap={24} />
                      <YAxis yAxisId="cnt" allowDecimals={false} domain={COUNT_DOMAIN} tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="rev" orientation="right" tickFormatter={formatUsdCompact} tick={{ fontSize: 12 }} />
                      <ChartTooltip formatter={(v, n) => (n === 'Doanh thu' ? formatUsd(Number(v)) : fmtCount(Number(v)))} labelFormatter={(l) => `${granularity === 'month' ? 'Tháng' : 'Ngày'} ${l}`} />
                      <Legend />
                      <Bar yAxisId="rev" dataKey="revenue" name="Doanh thu" fill={REPORT_COLORS.gold} maxBarSize={26} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                      <Area yAxisId="cnt" type="monotone" dataKey="newCustomers" name="Khách mới" stroke={REPORT_COLORS.primary} strokeWidth={2} fill="url(#utmNewFill)" dot={trendData.length <= 31} isAnimationActive={false} />
                      <Line yAxisId="cnt" type="monotone" dataKey="depositors" name="Khách nạp" stroke={REPORT_COLORS.ok} strokeWidth={2} dot={trendData.length <= 31} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Col>
            <Col xs={24} xl={12}>
              <Card size="small" loading={loading} title={`Top UTM — ${UTM_RANK_LABEL[rankMetric]}`}
                extra={<Segmented<UtmRankMetric> size="small" value={rankMetric} onChange={setRankMetric} options={RANK_OPTIONS} />}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {rateRank ? `Tỷ lệ chỉ xếp các UTM từ ${MIN_SAMPLE_CUSTOMERS} khách (UTM ít khách dao động quá mạnh). Màu theo ngưỡng 40% / 80%.` : 'Tối đa 10 UTM, bỏ UTM bằng 0.'}
                </Text>
                {rank.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có số liệu" />
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(rankHeight(rank.length), 260)}>
                    <BarChart data={rank} layout="vertical" margin={{ top: 8, right: 60, left: 8, bottom: 0 }} maxBarSize={22}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} domain={rateRank ? PCT_DOMAIN : undefined} tickFormatter={rankAxisFmt} tick={{ fontSize: 12 }} />
                      <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
                      <ChartTooltip formatter={(v) => [rankFmt(Number(v)), UTM_RANK_LABEL[rankMetric]]} />
                      <Bar dataKey="value" name={UTM_RANK_LABEL[rankMetric]} radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 12, formatter: (v: unknown) => rankAxisFmt(Number(v)) }} isAnimationActive={false}>
                        {rank.map((x) => (
                          <Cell key={x.row.utmId} fill={rateRank ? (rateTextColor(x.value) ?? REPORT_COLORS.primary) : resolveEntityColor(x.row.color)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Col>
          </Row>

          {/* ── Chất lượng: tỷ lệ nạp/chốt + cơ cấu status theo UTM ── */}
          <Row gutter={[12, 12]}>
            <Col xs={24} xl={12}>
              <Card size="small" loading={loading} title="Tỷ lệ nạp & chốt của khách theo UTM">
                <Text type="secondary" style={{ fontSize: 12 }}>10 UTM nhiều khách nhất. So các UTM với nhau để thấy UTM nào đem về khách tốt hơn.</Text>
                {rateData.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có UTM nào có khách" />
                ) : (
                  <ResponsiveContainer width="100%" height={rankHeight(rateData.length) + 40}>
                    <BarChart data={rateData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" domain={PCT_DOMAIN} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} />
                      <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
                      <ChartTooltip formatter={(v, n) => [`${Number(v)}%`, n]} />
                      <Legend />
                      <Bar dataKey="depositRate" name="Đã nạp" fill={REPORT_COLORS.gold} maxBarSize={14} isAnimationActive={false} />
                      <Bar dataKey="closeRate" name="Đã chốt" fill={REPORT_COLORS.ok} maxBarSize={14} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Col>
            <Col xs={24} xl={12}>
              <Card size="small" loading={loading} title="Cơ cấu trạng thái khách theo UTM">
                <Text type="secondary" style={{ fontSize: 12 }}>Khách của 10 UTM đông nhất, chia theo trạng thái khách hiện tại.</Text>
                {statusData.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có UTM nào có khách" />
                ) : (
                  <ResponsiveContainer width="100%" height={rankHeight(statusData.length) + 40}>
                    <BarChart data={statusData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }} maxBarSize={22}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                      <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
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
          </Row>

          {/* ── Nguồn khách ── */}
          <Card size="small" loading={loading} title={selectedUtm ? `Nguồn khách của UTM ${selectedUtm.name}` : `Nguồn khách của ${scopeLabel}`}>
            <Text type="secondary" style={{ fontSize: 12 }}>Nguồn nào đem về khách nạp/chốt tốt trong các UTM - dùng để dồn ngân sách và điều chỉnh chiến dịch.</Text>
            {(data?.bySource.length ?? 0) === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có số liệu" />
            ) : (
              <Row gutter={[12, 12]}>
                <Col xs={24} xl={12}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={(data?.bySource ?? []).slice(0, 8)} margin={{ top: 16, right: 12, left: 0, bottom: 0 }} maxBarSize={26}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="source" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <ChartTooltip formatter={(v) => fmtCount(Number(v))} />
                      <Legend />
                      <Bar dataKey="customers" name="Khách" fill={REPORT_COLORS.primary} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                      <Bar dataKey="depositedCustomers" name="Đã nạp" fill={REPORT_COLORS.gold} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                      <Bar dataKey="closedCustomers" name="Đã chốt" fill={REPORT_COLORS.ok} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </Col>
                <Col xs={24} xl={12}>
                  <Table<UtmSourceRow> size="small" rowKey="source" pagination={false} dataSource={data?.bySource ?? []} columns={sourceColumns} scroll={{ y: 220 }} />
                </Col>
              </Row>
            )}
          </Card>

          {/* ── Xếp hạng Sales + Marketing ── */}
          <Row gutter={[12, 12]}>
            <Col xs={24} xl={12}>
              <Card size="small" loading={loading} title={selectedUtm ? `Sales chăm khách của UTM ${selectedUtm.name}` : `Sales chăm khách trong ${scopeLabel}`}>
                <Text type="secondary" style={{ fontSize: 12 }}>Xếp hạng Sales theo doanh thu tổng của khách họ chăm - so sánh để chia sẻ cách chăm khách.</Text>
                {(data?.bySales.length ?? 0) === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có số liệu" />
                ) : (
                  <Table<UtmPersonRow> size="small" rowKey="userId" dataSource={data?.bySales ?? []} columns={personColumns('salesUserId', 'Sales', '(Chưa có Sales)')} pagination={{ pageSize: 8, hideOnSinglePage: true }} scroll={{ x: 760 }} style={{ marginTop: 8 }} />
                )}
              </Card>
            </Col>
            <Col xs={24} xl={12}>
              <Card size="small" loading={loading} title={selectedUtm ? `Marketing phụ trách UTM ${selectedUtm.name}` : `Marketing phụ trách trong ${scopeLabel}`}>
                <Text type="secondary" style={{ fontSize: 12 }}>Xếp hạng Marketing theo doanh thu tổng của khách họ phụ trách - biết ai đem về khách nạp tốt.</Text>
                {(data?.byMarketing.length ?? 0) === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có số liệu" />
                ) : (
                  <Table<UtmPersonRow> size="small" rowKey="userId" dataSource={data?.byMarketing ?? []} columns={personColumns('marketingUserId', 'Marketing', '(Chưa gán Marketing)')} pagination={{ pageSize: 8, hideOnSinglePage: true }} scroll={{ x: 760 }} style={{ marginTop: 8 }} />
                )}
              </Card>
            </Col>
          </Row>

          {/* ── Bảng chi tiết theo UTM ── */}
          <Card size="small" title={`Chi tiết theo UTM (${tableRows.length}${tableRows.length !== utms.length ? `/${utms.length}` : ''})`} styles={{ body: { padding: 16 } }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
              <ReportNameFilter value={search} onChange={setSearch} placeholder="Tìm UTM / quản lý..." />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Switch size="small" checked={hideEmpty} onChange={setHideEmpty} />
                <Text type="secondary" style={{ fontSize: 12 }}>Ẩn UTM trống</Text>
              </span>
            </div>
            <Table<UtmQualityRow>
              rowKey="utmId"
              size="small"
              loading={loading}
              columns={columns}
              dataSource={tableRows}
              scroll={{ x: 2200 }}
              expandable={{ expandedRowRender: expandedRow, rowExpandable: (r) => r.customers > 0 || r.sales.total + r.marketing.total > 0 }}
              pagination={{ pageSize: 15, showSizeChanger: true, showTotal: (t) => `${t} UTM` }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có UTM nào khớp bộ lọc" /> }}
              rowClassName={(r) => (r.utmId === filters.utmId ? 'ant-table-row-selected' : '')}
            />
            {data && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Kỳ: {dayjs(data.period.from).format('DD/MM/YYYY')} → {dayjs(data.period.to).format('DD/MM/YYYY')}. Khách / đã nạp / đã chốt / doanh thu tổng / số khoản nạp là trạng thái hiện tại (không lọc ngày);
                Mới trong kỳ & doanh thu kỳ tính theo kỳ đang chọn. Mỗi khách chỉ có 1 UTM nên cộng các dòng ra đúng tổng.
              </Text>
            )}
          </Card>
        </div>
      </Spin>

      {drill && <ReportCustomersModal drill={drill} onClose={() => setDrill(null)} query={query} context="utms" />}
    </div>
  );
}
