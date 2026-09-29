'use client';

import { useMemo, useState } from 'react';
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
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import { useGroupQualityReport } from '@/lib/hooks/useReports';
import type { GroupOption, GroupQualityFilters, GroupQualityRow, GroupSalesRow, GroupSourceRow, ReportQuery } from '@/lib/types/reports.types';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { fmtCount, formatUsd, formatUsdCompact, normalizeText, pct, trendLabel } from '@/lib/utils/marketingReport';
import { rateTextColor } from '@/lib/utils/rateColor';
import { resolveEntityColor } from '@/lib/utils/entityColor';
import {
  GROUP_RANK_LABEL,
  MIN_SAMPLE_MEMBERS,
  buildGroupInsights,
  filterGroupRows,
  groupHealth,
  groupRates,
  isMoneyRank,
  isRateRank,
  topGroups,
  type GroupRankMetric,
} from '@/lib/utils/groupQuality';
import PeriodSelector from './PeriodSelector';
import ReportKpiCard, { REPORT_COLORS } from './ReportKpiCard';
import ReportNameFilter from './ReportNameFilter';
import { ReportColorTagSelect, ReportUserOption } from './ReportUserSelect';
import ReportCustomersModal, { type CustomerDrill } from './ReportCustomersModal';
import { CHART_COLORS } from './ReportChart';

const { Text } = Typography;

const COUNT_DOMAIN: [number, (dataMax: number) => number] = [0, (dataMax) => Math.max(dataMax, 1)];
const PCT_DOMAIN: [number, number] = [0, 100];
const RANK_OPTIONS = (Object.keys(GROUP_RANK_LABEL) as GroupRankMetric[]).map((m) => ({ value: m, label: GROUP_RANK_LABEL[m] }));
const rankHeight = (n: number) => Math.max(200, n * 36 + 40);

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

/**
 * Tab "Chất lượng nhóm" - mỗi nhóm liên kết đang "nuôi" khách tốt tới đâu: bao nhiêu khách join, bao nhiêu đã nạp/đã chốt,
 * doanh thu nhóm mang lại, join xong bao lâu thì nạp, và nhóm nào cần xử lý. Chọn 1 nhóm (hoặc 1 nền tảng) để mọi
 * KPI/biểu đồ/nguồn/Sales/xu hướng thu hẹp đúng nhóm đó. Bấm bất kỳ con số nào để xem danh sách khách phía sau.
 *
 * Recharts: luôn `isAnimationActive={false}` (bật animation thì Bar/Pie có thể render rỗng khi mount trong ResponsiveContainer).
 */
export default function GroupQualityReportTab({ query, onQueryChange }: Props) {
  const [filters, setFilters] = useState<GroupQualityFilters>({});
  const [rankMetric, setRankMetric] = useState<GroupRankMetric>('lifetimeRevenue');
  const [search, setSearch] = useState('');
  const [hideEmpty, setHideEmpty] = useState(false);
  const [drill, setDrill] = useState<CustomerDrill | null>(null);

  const { data, isLoading, isFetching, isError, error, refetch } = useGroupQualityReport({ ...query, ...filters });
  const loading = isLoading;
  const granularity = data?.period.granularity ?? 'day';
  const cur = data?.summary.current;
  const prev = data?.summary.previous;
  const rates = cur ? groupRates(cur) : null;
  const activeFilters = Number(filters.groupId != null) + Number(filters.categoryId != null);

  const setFilter = (patch: Partial<GroupQualityFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const focusGroup = (groupId: number) => {
    setFilter({ groupId });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  // Mini Table luôn kế thừa bộ lọc nhóm/nền tảng đang bật để danh sách KHỚP con số trên thẻ.
  const openDrill = (d: CustomerDrill) =>
    setDrill({ ...d, preset: { groupId: filters.groupId, categoryId: filters.categoryId, ...(d.preset ?? {}) } });
  const drillGroup = (groupId: number, metric: CustomerDrill['metric'], label: string) => () =>
    setDrill({ metric, label, preset: { groupId } });

  const groups = useMemo(() => data?.groups ?? [], [data?.groups]);
  const insights = useMemo(() => buildGroupInsights(groups), [groups]);
  const tableRows = useMemo(() => filterGroupRows(groups, { search, hideEmpty }, normalizeText), [groups, search, hideEmpty]);

  const trendData = useMemo(
    () => (data?.trend ?? []).map((t) => ({ ...t, label: trendLabel(t.date, granularity) })),
    [data?.trend, granularity],
  );
  const trendHasData = trendData.some((t) => t.newJoins > 0 || t.revenue > 0);

  const rank = useMemo(() => topGroups(groups, rankMetric, 10), [groups, rankMetric]);
  const money = isMoneyRank(rankMetric);
  const rateRank = isRateRank(rankMetric);
  const rankFmt = (v: number) => (money ? formatUsd(v) : rateRank ? `${v}%` : fmtCount(v));
  const rankAxisFmt = (v: number) => (money ? formatUsdCompact(v) : rateRank ? `${v}%` : fmtCount(v));

  const bySizeTop = useMemo(
    () => [...groups].filter((g) => g.members > 0).sort((a, b) => b.members - a.members).slice(0, 10),
    [groups],
  );
  const rateData = useMemo(
    () =>
      bySizeTop.map((g) => ({
        name: g.groupName,
        depositRate: pct(g.depositedMembers, g.members) ?? 0,
        closeRate: pct(g.closedMembers, g.members) ?? 0,
      })),
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
  const statusData = useMemo(() => bySizeTop.map((g) => ({ name: g.groupName, ...g.byStatus })), [bySizeTop]);

  const noGroupPct = data ? pct(data.summary.newCustomersNoGroup, data.summary.newCustomers) : null;
  const selectedGroup = data?.options.groups.find((g) => g.id === filters.groupId);

  // ── Bảng chi tiết theo nhóm ──
  const linkBtn = { padding: 0, height: 'auto' } as const;
  const drillNum = (v: number, r: GroupQualityRow, metric: CustomerDrill['metric']) =>
    v > 0 ? (
      <Button type="link" size="small" style={linkBtn} onClick={drillGroup(r.groupId, metric, r.groupName)}>
        {fmtCount(v)}
      </Button>
    ) : (
      <Text type="secondary">0</Text>
    );
  const drillRate = (num: number, den: number, r: GroupQualityRow, metric: CustomerDrill['metric']) =>
    num > 0 ? (
      <Button type="link" size="small" style={linkBtn} onClick={drillGroup(r.groupId, metric, r.groupName)}>
        {rateCell(num, den)}
      </Button>
    ) : (
      rateCell(num, den)
    );

  const columns: ColumnsType<GroupQualityRow> = [
    {
      title: 'Nhóm',
      key: 'group',
      fixed: 'left',
      width: 240,
      sorter: (a, b) => a.groupName.localeCompare(b.groupName, 'vi'),
      render: (_, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
          <Text strong>{r.groupName}</Text>
          <Space size={4}>
            {r.categoryName && <Tag color={resolveEntityColor(r.categoryColor)} style={{ marginInlineEnd: 0, fontSize: 11, lineHeight: '18px' }}>{r.categoryName}</Tag>}
            {!r.isActive && <Tag style={{ marginInlineEnd: 0, fontSize: 11, lineHeight: '18px' }}>Đã khoá</Tag>}
          </Space>
        </div>
      ),
    },
    {
      title: <Tooltip title="Quản lý chính của nhóm (Nhóm liên kết → Quản lý chính-phụ).">Quản lý chính</Tooltip>,
      key: 'manager',
      width: 260,
      render: (_, r) =>
        r.primaryManager ? <ReportUserOption user={r.primaryManager} /> : <Text type="secondary" italic>Chưa có</Text>,
    },
    {
      title: <Tooltip title="Khách đã join nhóm (mọi thời điểm).">Thành viên</Tooltip>,
      dataIndex: 'members',
      key: 'members',
      align: 'right',
      width: 100,
      sorter: (a, b) => a.members - b.members,
      defaultSortOrder: 'descend',
      render: (v: number, r) => drillNum(v, r, 'group_members'),
    },
    {
      title: <Tooltip title="Khách join nhóm TRONG KỲ.">Join trong kỳ</Tooltip>,
      dataIndex: 'newJoins',
      key: 'newJoins',
      align: 'right',
      width: 110,
      sorter: (a, b) => a.newJoins - b.newJoins,
      render: (v: number, r) => drillNum(v, r, 'group_new_joins'),
    },
    {
      title: <Tooltip title="Thành viên đã từng nạp / thành viên. Màu: < 40% đỏ, 40–80% vàng, > 80% xanh.">Đã nạp</Tooltip>,
      key: 'deposited',
      width: 150,
      sorter: (a, b) => (pct(a.depositedMembers, a.members) ?? -1) - (pct(b.depositedMembers, b.members) ?? -1),
      render: (_, r) => drillRate(r.depositedMembers, r.members, r, 'group_deposited'),
    },
    {
      title: <Tooltip title="Thành viên chưa nạp lần nào - khách cần chăm sóc để kéo nạp.">Chưa nạp</Tooltip>,
      key: 'notDeposited',
      align: 'right',
      width: 100,
      sorter: (a, b) => a.members - a.depositedMembers - (b.members - b.depositedMembers),
      render: (_, r) => drillNum(Math.max(0, r.members - r.depositedMembers), r, 'group_no_deposit'),
    },
    {
      title: <Tooltip title="Thành viên đang ở trạng thái Đã chốt / thành viên.">Đã chốt</Tooltip>,
      key: 'closed',
      width: 150,
      sorter: (a, b) => (pct(a.closedMembers, a.members) ?? -1) - (pct(b.closedMembers, b.members) ?? -1),
      render: (_, r) => drillRate(r.closedMembers, r.members, r, 'group_closed'),
    },
    {
      title: <Tooltip title="Tiền nạp trong kỳ của thành viên (theo ngày nạp).">Doanh thu kỳ</Tooltip>,
      dataIndex: 'periodRevenue',
      key: 'periodRevenue',
      align: 'right',
      width: 120,
      sorter: (a, b) => a.periodRevenue - b.periodRevenue,
      render: (v: number) => formatUsd(v),
    },
    {
      title: <Tooltip title="Tổng tiền nạp mọi thời điểm của thành viên.">Doanh thu tổng</Tooltip>,
      dataIndex: 'lifetimeRevenue',
      key: 'lifetimeRevenue',
      align: 'right',
      width: 130,
      sorter: (a, b) => a.lifetimeRevenue - b.lifetimeRevenue,
      render: (v: number) => <Text strong>{formatUsd(v)}</Text>,
    },
    {
      title: <Tooltip title="Doanh thu tổng / thành viên.">TB / thành viên</Tooltip>,
      key: 'perMember',
      align: 'right',
      width: 120,
      sorter: (a, b) => (groupRates(a).revenuePerMember ?? -1) - (groupRates(b).revenuePerMember ?? -1),
      render: (_, r) => {
        const v = groupRates(r).revenuePerMember;
        return v == null ? '—' : formatUsd(v);
      },
    },
    {
      title: <Tooltip title="TB số ngày từ lúc join nhóm tới khoản nạp đầu tiên (chỉ tính khách nạp sau/cùng ngày join). Càng ngắn càng tốt.">Join → nạp</Tooltip>,
      dataIndex: 'avgDaysToFirstDeposit',
      key: 'avgDays',
      align: 'right',
      width: 100,
      sorter: (a, b) => (a.avgDaysToFirstDeposit ?? Infinity) - (b.avgDaysToFirstDeposit ?? Infinity),
      render: (v: number | null) => (v == null ? '—' : `${v} ngày`),
    },
    {
      title: <Tooltip title={`Đánh giá theo tỷ lệ nạp của thành viên. Nhóm dưới ${MIN_SAMPLE_MEMBERS} thành viên không chấm điểm (quá ít mẫu).`}>Đánh giá</Tooltip>,
      key: 'health',
      width: 110,
      fixed: 'right',
      render: (_, r) => {
        const h = groupHealth(r);
        return <Tag color={h.color} style={{ marginInlineEnd: 0 }}>{h.label}</Tag>;
      },
    },
    {
      title: '',
      key: 'act',
      width: 90,
      fixed: 'right',
      render: (_, r) =>
        r.groupId === filters.groupId ? (
          <Text type="secondary" style={{ fontSize: 12 }}>Đang xem</Text>
        ) : (
          <Button type="link" size="small" onClick={() => focusGroup(r.groupId)}>Xem nhóm</Button>
        ),
    },
  ];

  const sourceColumns: ColumnsType<GroupSourceRow> = [
    { title: 'Nguồn', dataIndex: 'source', key: 'source', render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Thành viên', dataIndex: 'members', key: 'm', align: 'right', render: fmtCount },
    { title: 'Đã nạp', key: 'd', align: 'right', render: (_, r) => rateCell(r.depositedMembers, r.members) },
    { title: 'Đã chốt', key: 'c', align: 'right', render: (_, r) => rateCell(r.closedMembers, r.members) },
    { title: 'Doanh thu tổng', dataIndex: 'lifetimeRevenue', key: 'r', align: 'right', render: formatUsd },
  ];

  const salesColumns: ColumnsType<GroupSalesRow> = [
    {
      title: 'Sales phụ trách',
      key: 'sales',
      render: (_, r) =>
        r.userId === 0 ? (
          <Text type="secondary" italic>{r.userName}</Text>
        ) : (
          <ReportUserOption user={{ id: r.userId, name: r.userName, role: r.role, departmentName: r.departmentName, departmentColor: r.departmentColor, positionName: r.positionName, positionColor: r.positionColor }} />
        ),
    },
    { title: 'Thành viên', dataIndex: 'members', key: 'm', align: 'right', render: fmtCount, sorter: (a, b) => a.members - b.members },
    { title: 'Đã nạp', key: 'd', align: 'right', render: (_, r) => rateCell(r.depositedMembers, r.members) },
    { title: 'Đã chốt', key: 'c', align: 'right', render: (_, r) => rateCell(r.closedMembers, r.members) },
    { title: 'Doanh thu tổng', dataIndex: 'lifetimeRevenue', key: 'r', align: 'right', render: formatUsd, sorter: (a, b) => a.lifetimeRevenue - b.lifetimeRevenue, defaultSortOrder: 'descend' },
  ];

  const insightList = (rows: GroupQualityRow[], metric: CustomerDrill['metric'], extra: (r: GroupQualityRow) => string) =>
    rows.map((r) => (
      <div key={r.groupId} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', padding: '4px 0' }}>
        <div style={{ minWidth: 0 }}>
          <Button type="link" size="small" style={{ ...linkBtn, fontWeight: 600 }} onClick={() => focusGroup(r.groupId)}>
            {r.groupName}
          </Button>
          <div><Text type="secondary" style={{ fontSize: 12 }}>{extra(r)}</Text></div>
        </div>
        <Button size="small" onClick={drillGroup(r.groupId, metric, r.groupName)}>Xem khách</Button>
      </div>
    ));

  const hasInsights =
    insights.needsAttention.length + insights.bestPractice.length + insights.emptyGroups.length + insights.zeroDeposit.length > 0;

  return (
    <div className="space-y-4">
      {/* ── Bộ lọc ── */}
      <Card size="small" styles={{ body: { padding: 16 } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <PeriodSelector value={query} onChange={onQueryChange} resolvedPeriod={data?.period} />
          <Space>
            {activeFilters > 0 && (
              <Button icon={<ClearOutlined />} onClick={() => setFilters({})}>Xoá lọc ({activeFilters})</Button>
            )}
            <Button icon={<ReloadOutlined />} loading={isFetching && !isLoading} onClick={() => refetch()}>Làm mới</Button>
          </Space>
        </div>
        <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
          <Col xs={24} sm={12} xl={8}>
            <div className="mb-1"><Text strong>Nền tảng (Category)</Text></div>
            <ReportColorTagSelect
              style={{ width: '100%' }}
              placeholder="Tất cả nền tảng"
              items={(data?.options.categories ?? []).map((c) => ({ id: c.id, name: c.name, color: c.color }))}
              value={filters.categoryId}
              // Đổi nền tảng -> bỏ nhóm đang chọn (nhóm cũ có thể không thuộc nền tảng mới).
              onChange={(v) => setFilters({ categoryId: v })}
            />
          </Col>
          <Col xs={24} sm={12} xl={8}>
            <div className="mb-1"><Text strong>Nhóm cụ thể</Text></div>
            <Select<number>
              allowClear
              showSearch={{ optionFilterProp: 'label' }}
              style={{ width: '100%' }}
              placeholder="Tất cả nhóm"
              value={filters.groupId}
              onChange={(v) => setFilter({ groupId: v })}
              optionLabelProp="label"
              popupMatchSelectWidth={false}
              options={(data?.options.groups ?? []).map((g) => ({ value: g.id, label: g.name, group: g }))}
              optionRender={(option) => {
                const g = (option.data as { group: GroupOption }).group;
                return (
                  <Space size={4}>
                    {g.categoryName && <Tag color={resolveEntityColor(g.categoryColor)} style={{ marginInlineEnd: 0, fontSize: 10 }}>{g.categoryName}</Tag>}
                    <span>{g.name}</span>
                    {!g.isActive && <Tag style={{ marginInlineEnd: 0, fontSize: 10 }}>Đã khoá</Tag>}
                  </Space>
                );
              }}
            />
          </Col>
        </Row>
      </Card>

      {isError && (
        <Alert type="error" showIcon title="Không tải được báo cáo chất lượng nhóm" description={getApiErrorMessage(error, 'Đã có lỗi xảy ra, vui lòng thử lại')} />
      )}
      {data?.ownOnly && (
        <Alert type="info" showIcon title="Bạn chỉ xem được số liệu của khách thuộc phạm vi của mình" description="Số thành viên/doanh thu của từng nhóm chỉ tính các khách bạn được phép xem, không phải toàn bộ nhóm." />
      )}
      {data && data.summary.newCustomersNoGroup > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          title={`${fmtCount(data.summary.newCustomersNoGroup)}${noGroupPct != null ? ` (${noGroupPct}%)` : ''} data mới trong kỳ chưa join nhóm nào`}
          description="Khách chưa vào nhóm thì chưa được nuôi/chăm sóc theo nhóm - nên mời khách join để không rơi khỏi phễu."
          action={<Button size="small" type="primary" onClick={() => setDrill({ metric: 'new_no_group' })}>Xem danh sách khách</Button>}
        />
      )}

      <Spin spinning={isFetching && !isLoading}>
        <div className="space-y-4">
          {/* ── KPI ── */}
          <Row gutter={[12, 12]}>
            <Col xs={24} md={12} xl={6}>
              <ReportKpiCard title={selectedGroup ? `Thành viên — ${selectedGroup.name}` : 'Thành viên các nhóm'} value={cur?.members ?? 0} color={REPORT_COLORS.primary} loading={loading}
                hint={data ? `${fmtCount(data.summary.groupCount)} nhóm${data.summary.emptyGroups > 0 ? ` · ${data.summary.emptyGroups} nhóm trống` : ''} · mỗi khách đếm 1 lần` : undefined}
                onClick={() => openDrill({ metric: 'group_members' })} />
            </Col>
            <Col xs={24} md={12} xl={6}>
              <ReportKpiCard title="Join nhóm trong kỳ" value={cur?.newJoins ?? 0} previous={prev?.newJoins} color={REPORT_COLORS.ok} loading={loading}
                onClick={() => openDrill({ metric: 'group_new_joins' })} />
            </Col>
            <Col xs={24} md={12} xl={6}>
              <ReportKpiCard title={<Tooltip title="Thành viên đã từng nạp / thành viên - chỉ số chất lượng chính của nhóm.">Tỷ lệ thành viên đã nạp</Tooltip>}
                value={rates?.depositRate ?? 0} suffix="%" rateColored color={REPORT_COLORS.gold} loading={loading}
                hint={cur ? `${fmtCount(cur.depositedMembers)} / ${fmtCount(cur.members)} thành viên` : undefined}
                onClick={() => openDrill({ metric: 'group_deposited' })} />
            </Col>
            <Col xs={24} md={12} xl={6}>
              <ReportKpiCard title={<Tooltip title="Thành viên chưa nạp lần nào - danh sách khách nên ưu tiên chăm sóc.">Thành viên chưa nạp</Tooltip>}
                value={rates?.notDeposited ?? 0} color={REPORT_COLORS.danger} loading={loading}
                onClick={() => openDrill({ metric: 'group_no_deposit' })} />
            </Col>
            <Col xs={24} md={12} xl={6}>
              <ReportKpiCard title="Tỷ lệ thành viên đã chốt" value={rates?.closeRate ?? 0} suffix="%" rateColored color={REPORT_COLORS.ok} loading={loading}
                hint={cur ? `${fmtCount(cur.closedMembers)} / ${fmtCount(cur.members)} thành viên` : undefined}
                onClick={() => openDrill({ metric: 'group_closed' })} />
            </Col>
            <Col xs={24} md={12} xl={6}>
              <ReportKpiCard title={<Tooltip title="Trong số khách join nhóm TRONG KỲ, tỷ lệ đã từng nạp - cùng cohort nên ≤ 100%.">Khách mới join đã nạp</Tooltip>}
                value={rates?.newJoinDepositRate ?? 0} suffix="%" rateColored color={REPORT_COLORS.gold} loading={loading}
                hint={cur ? `${fmtCount(cur.newJoinsDeposited)} / ${fmtCount(cur.newJoins)} khách join trong kỳ` : undefined}
                onClick={() => openDrill({ metric: 'group_new_deposited' })} />
            </Col>
            <Col xs={24} md={12} xl={6}>
              <ReportKpiCard title="Doanh thu trong kỳ" value={cur?.periodRevenue ?? 0} previous={prev?.periodRevenue} money color={REPORT_COLORS.gold} loading={loading}
                hint={cur ? `${fmtCount(cur.periodDepositors)} thành viên nạp trong kỳ` : undefined} />
            </Col>
            <Col xs={24} md={12} xl={6}>
              <ReportKpiCard title={<Tooltip title="Tổng tiền nạp mọi thời điểm của thành viên / số thành viên.">Giá trị TB / thành viên</Tooltip>}
                value={rates?.revenuePerMember ?? 0} money color={REPORT_COLORS.primary} loading={loading}
                hint={cur ? `Tổng ${formatUsd(cur.lifetimeRevenue)} · TB nạp lần đầu sau ${cur.avgDaysToFirstDeposit == null ? '—' : `${cur.avgDaysToFirstDeposit} ngày`} kể từ join` : undefined} />
            </Col>
          </Row>

          {/* ── Gợi ý xử lý ── */}
          {!selectedGroup && hasInsights && (
            <Card size="small" title="Gợi ý xử lý nhanh" loading={loading}>
              <Text type="secondary" style={{ fontSize: 12 }}>Tự động rút ra từ bảng nhóm bên dưới (chỉ xét nhóm từ {MIN_SAMPLE_MEMBERS} thành viên trở lên).</Text>
              <Row gutter={[16, 12]} style={{ marginTop: 8 }}>
                <Col xs={24} lg={8}>
                  <Text strong style={{ color: REPORT_COLORS.danger }}>Cần xử lý (tỷ lệ nạp thấp)</Text>
                  {insights.needsAttention.length === 0
                    ? <div><Text type="secondary" style={{ fontSize: 12 }}>Không có nhóm nào dưới 40% nạp.</Text></div>
                    : insightList(insights.needsAttention, 'group_no_deposit', (r) => `${pct(r.depositedMembers, r.members)}% nạp · ${fmtCount(r.members - r.depositedMembers)} khách chưa nạp`)}
                </Col>
                <Col xs={24} lg={8}>
                  <Text strong style={{ color: '#389e0d' }}>Làm tốt - nên nhân rộng</Text>
                  {insights.bestPractice.length === 0
                    ? <div><Text type="secondary" style={{ fontSize: 12 }}>Chưa có nhóm nào trên 80% nạp.</Text></div>
                    : insightList(insights.bestPractice, 'group_deposited', (r) => `${pct(r.depositedMembers, r.members)}% nạp · ${formatUsd(r.lifetimeRevenue)} doanh thu tổng`)}
                </Col>
                <Col xs={24} lg={8}>
                  <Text strong>Nhóm trống / không ai nạp</Text>
                  {insights.emptyGroups.length + insights.zeroDeposit.length === 0
                    ? <div><Text type="secondary" style={{ fontSize: 12 }}>Không có.</Text></div>
                    : (
                      <>
                        {insightList(insights.zeroDeposit, 'group_members', (r) => `${fmtCount(r.members)} thành viên nhưng chưa ai nạp`)}
                        {insightList(insights.emptyGroups, 'group_members', () => 'Chưa có thành viên nào')}
                      </>
                    )}
                </Col>
              </Row>
            </Card>
          )}

          {/* ── Xu hướng + Xếp hạng ── */}
          <Row gutter={[12, 12]}>
            <Col xs={24} xl={12}>
              <Card size="small" loading={loading} title={`Join nhóm & doanh thu theo ${granularity === 'month' ? 'tháng' : 'ngày'}`}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Vùng = khách join nhóm (theo ngày join, giờ VN, trục trái); cột = tiền nạp của thành viên (theo ngày nạp, USD, trục phải).
                </Text>
                {!trendHasData ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có lượt join hoặc khoản nạp trong kỳ với bộ lọc này" />
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={trendData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="grpJoinFill" x1="0" y1="0" x2="0" y2="1">
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
                      <Area yAxisId="cnt" type="monotone" dataKey="newJoins" name="Khách join nhóm" stroke={REPORT_COLORS.primary} strokeWidth={2} fill="url(#grpJoinFill)" dot={trendData.length <= 31} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Col>
            <Col xs={24} xl={12}>
              <Card size="small" loading={loading} title={`Top nhóm — ${GROUP_RANK_LABEL[rankMetric]}`}
                extra={<Segmented<GroupRankMetric> size="small" value={rankMetric} onChange={setRankMetric} options={RANK_OPTIONS} />}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {rateRank ? `Tỷ lệ chỉ xếp các nhóm từ ${MIN_SAMPLE_MEMBERS} thành viên (nhóm ít khách dao động quá mạnh). Màu theo ngưỡng 40% / 80%.` : 'Tối đa 10 nhóm, bỏ nhóm bằng 0.'}
                </Text>
                {rank.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có số liệu" />
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(rankHeight(rank.length), 260)}>
                    <BarChart data={rank} layout="vertical" margin={{ top: 8, right: 60, left: 8, bottom: 0 }} maxBarSize={22}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} domain={rateRank ? PCT_DOMAIN : undefined} tickFormatter={rankAxisFmt} tick={{ fontSize: 12 }} />
                      <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
                      <ChartTooltip formatter={(v) => [rankFmt(Number(v)), GROUP_RANK_LABEL[rankMetric]]} />
                      <Bar dataKey="value" name={GROUP_RANK_LABEL[rankMetric]} radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 12, formatter: (v: unknown) => rankAxisFmt(Number(v)) }} isAnimationActive={false}>
                        {rank.map((x) => (
                          <Cell key={x.row.groupId} fill={rateRank ? (rateTextColor(x.value) ?? REPORT_COLORS.primary) : REPORT_COLORS.primary} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Col>
          </Row>

          {/* ── Chất lượng: tỷ lệ nạp/chốt + cơ cấu status ── */}
          <Row gutter={[12, 12]}>
            <Col xs={24} xl={12}>
              <Card size="small" loading={loading} title="Tỷ lệ nạp & chốt của thành viên theo nhóm">
                <Text type="secondary" style={{ fontSize: 12 }}>10 nhóm nhiều thành viên nhất. So các nhóm với nhau để thấy nhóm nào nuôi khách tốt hơn.</Text>
                {rateData.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có nhóm nào có thành viên" />
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
              <Card size="small" loading={loading} title="Cơ cấu trạng thái thành viên theo nhóm">
                <Text type="secondary" style={{ fontSize: 12 }}>Thành viên của 10 nhóm đông nhất, chia theo trạng thái khách hiện tại.</Text>
                {statusData.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có nhóm nào có thành viên" />
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

          {/* ── Nguồn + Sales ── */}
          <Row gutter={[12, 12]}>
            <Col xs={24} xl={12}>
              <Card size="small" loading={loading} title={selectedGroup ? `Nguồn khách của nhóm ${selectedGroup.name}` : 'Nguồn khách của các nhóm'}>
                <Text type="secondary" style={{ fontSize: 12 }}>Nguồn nào đem về thành viên nạp/chốt tốt - dùng để dồn ngân sách và điều chỉnh cách mời vào nhóm.</Text>
                {(data?.bySource.length ?? 0) === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có số liệu" />
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={(data?.bySource ?? []).slice(0, 8)} margin={{ top: 16, right: 12, left: 0, bottom: 0 }} maxBarSize={26}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="source" tick={{ fontSize: 12 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                        <ChartTooltip formatter={(v) => fmtCount(Number(v))} />
                        <Legend />
                        <Bar dataKey="members" name="Thành viên" fill={REPORT_COLORS.primary} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                        <Bar dataKey="depositedMembers" name="Đã nạp" fill={REPORT_COLORS.gold} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                    <Table<GroupSourceRow> size="small" rowKey="source" pagination={false} dataSource={data?.bySource ?? []} columns={sourceColumns} scroll={{ y: 180 }} />
                  </>
                )}
              </Card>
            </Col>
            <Col xs={24} xl={12}>
              <Card size="small" loading={loading} title={selectedGroup ? `Sales chăm khách của nhóm ${selectedGroup.name}` : 'Sales chăm khách trong các nhóm'}>
                <Text type="secondary" style={{ fontSize: 12 }}>Sales nào giữ thành viên nạp/chốt tốt - so sánh để chia sẻ cách chăm khách.</Text>
                {(data?.bySales.length ?? 0) === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có số liệu" />
                ) : (
                  <Table<GroupSalesRow> size="small" rowKey="userId" dataSource={data?.bySales ?? []} columns={salesColumns} pagination={{ pageSize: 8, hideOnSinglePage: true }} scroll={{ x: 620 }} style={{ marginTop: 8 }} />
                )}
              </Card>
            </Col>
          </Row>

          {/* ── Bảng chi tiết theo nhóm ── */}
          <Card size="small" title={`Chi tiết theo nhóm (${tableRows.length}${tableRows.length !== groups.length ? `/${groups.length}` : ''})`} styles={{ body: { padding: 16 } }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
              <ReportNameFilter value={search} onChange={setSearch} placeholder="Tìm nhóm / nền tảng / quản lý..." />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Switch size="small" checked={hideEmpty} onChange={setHideEmpty} />
                <Text type="secondary" style={{ fontSize: 12 }}>Ẩn nhóm trống</Text>
              </span>
            </div>
            <Table<GroupQualityRow>
              rowKey="groupId"
              size="small"
              loading={loading}
              columns={columns}
              dataSource={tableRows}
              scroll={{ x: 1800 }}
              pagination={{ pageSize: 15, showSizeChanger: true, showTotal: (t) => `${t} nhóm` }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có nhóm nào khớp bộ lọc" /> }}
              rowClassName={(r) => (r.groupId === filters.groupId ? 'ant-table-row-selected' : '')}
            />
            {data && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Kỳ: {dayjs(data.period.from).format('DD/MM/YYYY')} → {dayjs(data.period.to).format('DD/MM/YYYY')}. Thành viên / đã nạp / đã chốt / doanh thu tổng là trạng thái hiện tại (không lọc ngày);
                Join trong kỳ & doanh thu kỳ tính theo kỳ đang chọn.
              </Text>
            )}
          </Card>
        </div>
      </Spin>

      {drill && <ReportCustomersModal drill={drill} onClose={() => setDrill(null)} query={query} context="groups" />}
    </div>
  );
}
