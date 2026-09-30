'use client';

import { useMemo, useState } from 'react';
import { Alert, App, Card, Col, DatePicker, Empty, Row, Segmented, Space, Statistic, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { useUtmStats } from '@/lib/hooks/useUtms';
import type { UtmStatsPoint, UtmStatsStatus, UtmStatsUtmBrief, UtmStatsUtmRow } from '@/lib/api/utms.api';
import { UtmTag } from '@/components/utms/UtmTag';
import { UtmStatsQuickFilters } from '@/components/utms/UtmStatsQuickFilters';
import { UtmStatsCustomersDrawer } from '@/components/utms/UtmStatsCustomersDrawer';
import { resolveEntityColor } from '@/lib/utils/entityColor';
import { sumColumnWidths } from '@/lib/utils/table-width.util';
import {
  bucketLabelFull,
  buildDrill,
  dropUnknownUtmIds,
  EMPTY_STATS_FILTERS,
  fmtPct,
  rateColor,
  ratePct,
  sortUtmStatsRows,
  statusesWithData,
  toChartRows,
  toStatsFilterParams,
  UTM_STATS_MAX_SPAN_DAYS,
  utmScopeLabel,
  type UtmStatsChartMode,
  type UtmStatsDrill,
  type UtmStatsFilters,
} from '@/lib/utils/utm-stats.util';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';

const { RangePicker } = DatePicker;
const { Text } = Typography;

const DEFAULT_SPAN_DAYS = 30;
const defaultRange = (): [Dayjs, Dayjs] => [dayjs().subtract(DEFAULT_SPAN_DAYS - 1, 'day'), dayjs()];

/** Ô "số khách + tỷ lệ": 0 khách hiện gạch ngang cho dễ đọc. */
function CountRate({ n, total }: { n: number; total: number }) {
  if (!n) return <span style={{ color: '#bfbfbf' }}>—</span>;
  return (
    <span>
      <strong>{n}</strong>{' '}
      <span data-testid="rate" style={{ fontSize: 12, fontWeight: 500, color: rateColor(ratePct(n, total)) }}>({fmtPct(ratePct(n, total))})</span>
    </span>
  );
}

/** Card bấm được (chuột + bàn phím) khi `enabled`; 0 khách thì không mở bảng rỗng. */
function clickableCard(enabled: boolean, onOpen: () => void) {
  if (!enabled) return {};
  return {
    hoverable: true,
    onClick: onOpen,
    role: 'button' as const,
    tabIndex: 0,
    style: { cursor: 'pointer' },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onOpen();
      }
    },
  };
}

/**
 * Tab "Thống kê" của trang Quản lý UTM: khách thêm vào UTM theo từng ngày (Ngày nhập khách) và tỷ lệ các giai đoạn
 * (trạng thái hiện tại của khách). Phạm vi do BE quyết định: UTM theo scope `utms.view` (own/department/all),
 * khách luôn theo scope `customers.view` - FE chỉ hiển thị, không tự lọc quyền.
 *
 * Quick Filter (Quản lý chính/phụ, UTM hoạt động/đã khoá) thu hẹp tập UTM ở BE. Bấm cột chart / card -> Mini Table
 * khách (Drawer) với bộ lọc tương tự để xem + thao tác nhanh ngay tại trang thống kê.
 *
 * Recharts: luôn `isAnimationActive={false}` (bật animation thì Bar có thể render rỗng khi mount trong ResponsiveContainer).
 */
export function UtmStatsTab() {
  const { message } = App.useApp();
  const [range, setRange] = useState<[Dayjs, Dayjs]>(defaultRange);
  const [filters, setFilters] = useState<UtmStatsFilters>(EMPTY_STATS_FILTERS);
  const [drill, setDrill] = useState<UtmStatsDrill | null>(null);
  const [mode, setMode] = useState<UtmStatsChartMode>('count');
  const [hideEmptyDays, setHideEmptyDays] = useState(true);

  const params = useMemo(
    () => ({ from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD'), ...toStatsFilterParams(filters) }),
    [range, filters],
  );
  const { data, isLoading, isError, error } = useUtmStats(params, true);

  const statuses: UtmStatsStatus[] = useMemo(() => data?.statuses ?? [], [data]);
  const shownStatuses = useMemo(() => (data ? statusesWithData(statuses, data.totals.byStatus) : []), [data, statuses]);
  const chartRows = useMemo(() => (data ? toChartRows(data.series, shownStatuses, mode) : []), [data, shownStatuses, mode]);
  const utmById = useMemo(() => new Map((data?.utms ?? []).map((u) => [u.id, u])), [data]);
  const granularity = data?.range.granularity ?? 'day';
  const total = data?.totals.total ?? 0;
  const utmBriefs = useMemo(() => data?.utms ?? [], [data]);

  // UTM bị xoá/đổi quyền giữa 2 lần tải -> bỏ khỏi lựa chọn. Dùng mẫu "chỉnh state ngay khi render" của React (không
  // dùng effect); dropUnknownUtmIds trả về CHÍNH object cũ nếu không đổi nên không gây render lặp.
  const [seenUtms, setSeenUtms] = useState<UtmStatsUtmBrief[] | undefined>(undefined);
  if (data && data.utms !== seenUtms) {
    setSeenUtms(data.utms);
    const pruned = dropUnknownUtmIds(data.utms, filters);
    if (pruned !== filters) setFilters(pruned);
  }

  const openDrill = (args: { bucket?: string; status?: string }) => {
    if (!data) return;
    const statusName = args.status ? statuses.find((s) => s.code === args.status)?.name : undefined;
    setDrill(buildDrill({ range: data.range, bucket: args.bucket, status: args.status, statusName }));
  };
  // Bấm 1 đoạn của cột chồng = ngày/tháng đó + giai đoạn đó (bỏ trạng thái trong bảng để xem cả ngày).
  const handleBarClick = (entry: unknown, statusCode: string) => {
    const bucket = (entry as { payload?: { date?: string } } | null)?.payload?.date;
    if (bucket) openDrill({ bucket, status: statusCode });
  };

  const handleRange = (vals: null | [Dayjs | null, Dayjs | null]) => {
    if (!vals || !vals[0] || !vals[1]) {
      setRange(defaultRange());
      return;
    }
    if (vals[1].diff(vals[0], 'day') + 1 > UTM_STATS_MAX_SPAN_DAYS) {
      message.warning(`Chỉ xem tối đa ${UTM_STATS_MAX_SPAN_DAYS} ngày mỗi lần`);
      return;
    }
    setRange([vals[0], vals[1]]);
  };

  const presets = [
    { label: '7 ngày qua', value: [dayjs().subtract(6, 'day'), dayjs()] as [Dayjs, Dayjs] },
    { label: '30 ngày qua', value: [dayjs().subtract(29, 'day'), dayjs()] as [Dayjs, Dayjs] },
    { label: 'Tháng này', value: [dayjs().startOf('month'), dayjs()] as [Dayjs, Dayjs] },
    { label: 'Tháng trước', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] as [Dayjs, Dayjs] },
    { label: '90 ngày qua', value: [dayjs().subtract(89, 'day'), dayjs()] as [Dayjs, Dayjs] },
  ];

  // ── Bảng theo ngày ──────────────────────────────────────────────────────────
  const statusColumns = <T extends { total: number; byStatus: Record<string, number> }>(): ColumnsType<T> =>
    shownStatuses.map((s) => ({
      title: <Tag color={resolveEntityColor(s.color)} style={{ marginInlineEnd: 0 }}>{s.name}</Tag>,
      key: s.code,
      width: 120,
      align: 'right' as const,
      render: (_: unknown, r: T) => <CountRate n={r.byStatus[s.code] ?? 0} total={r.total} />,
    }));

  const dayColumns: ColumnsType<UtmStatsPoint> = [
    { title: granularity === 'month' ? 'Tháng' : 'Ngày nhập', dataIndex: 'date', key: 'date', width: 130, fixed: 'left', render: (d: string) => bucketLabelFull(d) },
    { title: 'Tổng khách', dataIndex: 'total', key: 'total', width: 100, align: 'right', render: (n: number) => (n ? <strong>{n}</strong> : <span style={{ color: '#bfbfbf' }}>—</span>) },
    ...statusColumns<UtmStatsPoint>(),
  ];
  const dayRows = useMemo(() => {
    const rows = [...(data?.series ?? [])].reverse(); // mới nhất trước
    return hideEmptyDays ? rows.filter((r) => r.total > 0) : rows;
  }, [data, hideEmptyDays]);

  // ── Bảng theo UTM ───────────────────────────────────────────────────────────
  const utmColumns: ColumnsType<UtmStatsUtmRow> = [
    {
      title: 'UTM',
      key: 'utm',
      width: 220,
      fixed: 'left',
      render: (_: unknown, r) => {
        const u = utmById.get(r.utmId);
        return <UtmTag name={u?.name ?? `#${r.utmId}`} color={u?.color} inactive={u ? !u.isActive : false} />;
      },
    },
    { title: 'Tổng khách', dataIndex: 'total', key: 'total', width: 100, align: 'right', render: (n: number) => <strong>{n}</strong> },
    ...statusColumns<UtmStatsUtmRow>(),
  ];
  const utmRows = useMemo(
    () => sortUtmStatsRows(data?.byUtm ?? [], (id) => utmById.get(id)?.name ?? ''),
    [data, utmById],
  );

  if (isError) {
    return <Alert type="error" showIcon title="Không tải được thống kê UTM" description={getApiErrorMessage(error, 'Vui lòng thử lại sau')} />;
  }

  return (
    <Space orientation="vertical" size={12} style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        title={
          <span>
            Phạm vi: <strong>{data ? utmScopeLabel(data.utmScope) : '...'}</strong>. Tính theo <strong>Ngày nhập khách</strong> và
            trạng thái <strong>hiện tại</strong> của khách. Chỉ đếm khách bạn được phép xem.
          </span>
        }
      />
      {data && data.customerScope === null && (
        <Alert type="warning" showIcon title="Bạn chưa có quyền xem khách hàng nên số liệu hiển thị bằng 0." />
      )}

      <Space size={[12, 8]} wrap>
        <RangePicker
          value={range}
          onChange={handleRange}
          allowClear={false}
          format="DD/MM/YYYY"
          presets={presets}
          disabledDate={(d) => d.isAfter(dayjs(), 'day')}
          placeholder={['Từ ngày', 'Đến ngày']}
        />
        <UtmStatsQuickFilters utms={utmBriefs} value={filters} onChange={setFilters} />
      </Space>

      <Text type="secondary" style={{ fontSize: 12 }}>
        Bấm vào cột biểu đồ hoặc thẻ số liệu để xem danh sách khách ngay tại đây. Màu tỷ lệ %:{' '}
        <span style={{ color: rateColor(0), fontWeight: 500 }}>dưới 30% đỏ</span>,{' '}
        <span style={{ color: rateColor(50), fontWeight: 500 }}>30–70% vàng</span>,{' '}
        <span style={{ color: rateColor(100), fontWeight: 500 }}>trên 70% xanh</span>.
      </Text>

      <Row gutter={[12, 12]}>
        <Col xs={12} md={6} xl={4}>
          <Card size="small" loading={isLoading} {...clickableCard(total > 0, () => openDrill({}))}>
            <Statistic title="Khách trong kỳ" value={total} />
          </Card>
        </Col>
        <Col xs={12} md={6} xl={4}>
          <Card size="small" loading={isLoading}>
            <Statistic title="UTM được thống kê" value={data?.utmCount ?? 0} />
          </Card>
        </Col>
        {shownStatuses.map((s) => {
          const n = data?.totals.byStatus[s.code] ?? 0;
          return (
            <Col xs={12} md={6} xl={4} key={s.code}>
              <Card size="small" loading={isLoading} {...clickableCard(n > 0, () => openDrill({ status: s.code }))}>
                <Statistic title={<Tag color={resolveEntityColor(s.color)} style={{ marginInlineEnd: 0 }}>{s.name}</Tag>} value={n} suffix={<span data-testid="rate" style={{ fontSize: 13, fontWeight: 500, color: rateColor(ratePct(n, total)) }}>{fmtPct(ratePct(n, total))}</span>} />
              </Card>
            </Col>
          );
        })}
      </Row>

      <Card
        size="small"
        loading={isLoading}
        title={granularity === 'month' ? 'Khách theo tháng & tỷ lệ giai đoạn' : 'Khách theo ngày & tỷ lệ giai đoạn'}
        extra={
          <Segmented<UtmStatsChartMode>
            size="small"
            value={mode}
            onChange={setMode}
            options={[{ label: 'Số lượng', value: 'count' }, { label: 'Tỷ lệ %', value: 'percent' }]}
          />
        }
      >
        {total === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có khách nào trong kỳ với bộ lọc này" />
        ) : (
          <>
            {granularity === 'month' && (
              <Text type="secondary" style={{ fontSize: 12 }}>Kỳ dài hơn 92 ngày nên số liệu được gộp theo tháng.</Text>
            )}
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartRows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" minTickGap={12} />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12 }}
                  domain={mode === 'percent' ? [0, 100] : undefined}
                  tickFormatter={mode === 'percent' ? (v) => `${v}%` : undefined}
                />
                <ChartTooltip
                  labelFormatter={(_l, payload) => {
                    const row = payload?.[0]?.payload as { full?: string; total?: number } | undefined;
                    return row ? `${row.full} — ${row.total} khách` : '';
                  }}
                  formatter={(_v, name, item) => {
                    const row = item?.payload as Record<string, number> | undefined;
                    const code = String(item?.dataKey ?? '');
                    return [row ? `${row[`${code}__n`]} (${fmtPct(row[`${code}__p`])})` : '', name];
                  }}
                />
                <Legend />
                {shownStatuses.map((s) => (
                  <Bar key={s.code} dataKey={s.code} name={s.name} stackId="stage"
                    fill={resolveEntityColor(s.color)}
                    maxBarSize={36}
                    isAnimationActive={false}
                    cursor="pointer"
                    onClick={(entry: unknown) => handleBarClick(entry, s.code)}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </Card>

      <Card
        size="small"
        loading={isLoading}
        title={granularity === 'month' ? 'Chi tiết theo tháng' : 'Chi tiết theo ngày'}
        extra={
          <Space size={6}>
            <Text type="secondary" style={{ fontSize: 12 }}>Ẩn {granularity === 'month' ? 'tháng' : 'ngày'} không có khách</Text>
            <Switch size="small" checked={hideEmptyDays} onChange={setHideEmptyDays} />
          </Space>
        }
      >
        <Table<UtmStatsPoint>
          size="small"
          rowKey="date"
          columns={dayColumns}
          dataSource={dayRows}
          scroll={{ x: sumColumnWidths(dayColumns) }}
          pagination={{ defaultPageSize: 15, showSizeChanger: true, pageSizeOptions: [15, 31, 62], showTotal: (t) => `${t} dòng` }}
          locale={{ emptyText: 'Chưa có khách nào trong kỳ' }}
          summary={() =>
            dayRows.length === 0 ? null : (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}><strong>Cả kỳ</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right"><strong>{total}</strong></Table.Summary.Cell>
                  {shownStatuses.map((s, i) => (
                    <Table.Summary.Cell index={2 + i} key={s.code} align="right">
                      <CountRate n={data?.totals.byStatus[s.code] ?? 0} total={total} />
                    </Table.Summary.Cell>
                  ))}
                </Table.Summary.Row>
              </Table.Summary>
            )
          }
        />
      </Card>

      <Card
        size="small"
        loading={isLoading}
        title={
          <Tooltip title="Tỷ lệ mỗi giai đoạn tính trên tổng khách của CHÍNH UTM đó trong kỳ.">
            Tỷ lệ giai đoạn theo từng UTM
          </Tooltip>
        }
      >
        <Table<UtmStatsUtmRow>
          size="small"
          rowKey="utmId"
          columns={utmColumns}
          dataSource={utmRows}
          scroll={{ x: sumColumnWidths(utmColumns) }}
          pagination={{ defaultPageSize: 10, showSizeChanger: true, showTotal: (t) => `${t} UTM có khách` }}
          locale={{ emptyText: 'Chưa có UTM nào có khách trong kỳ' }}
        />
      </Card>

      <UtmStatsCustomersDrawer drill={drill} onClose={() => setDrill(null)} utms={utmBriefs} statuses={statuses} initialFilters={filters} />
    </Space>
  );
}
