'use client';

import React, { useMemo, useState } from 'react';
import { Alert, App, Button, Card, Col, DatePicker, Empty, Row, Segmented, Select, Space, Spin, Statistic, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import dayjs, { Dayjs } from 'dayjs';
import { useInvalidDataStats } from '@/lib/hooks/useInvalidDataStats';
import type { DuplicateStatsDetail, InvalidDataStatsPeriod } from '@/lib/api/customers.api';

const { Text } = Typography;
const { RangePicker } = DatePicker;

type DupType = 'duplicate_phone' | 'duplicate_email';
type PresetKey = '7d' | '30d' | '90d' | 'thisMonth' | 'lastMonth' | 'custom' | 'all';

/** Tuỳ chọn mở danh sách từ tab Thống kê. */
export interface OpenListOptions {
  /** Giá trị SĐT/Email của cụm cần xem (đưa vào ô tìm kiếm). */
  key?: string;
  /** Khoảng "Ngày nhập thực tế" (YYYY-MM-DD) - dùng khi mở từ thẻ lỗi để danh sách khớp đúng kỳ đang xem. */
  dateFrom?: string;
  dateTo?: string;
}

/** Nhãn/emoji các loại lỗi - đồng bộ `TYPE_META` ở page.tsx (giữ tách riêng để component không phụ thuộc page). */
const OVERVIEW_META: Array<{ type: string; emoji: string; label: string; clickable: 'list' | 'dup' }> = [
  { type: 'duplicate_phone', emoji: '⚠️📞', label: 'Trùng số điện thoại', clickable: 'dup' },
  { type: 'duplicate_email', emoji: '⚠️✉️', label: 'Trùng email', clickable: 'dup' },
  { type: 'missing_phone', emoji: '📵', label: 'Thiếu số điện thoại', clickable: 'list' },
  { type: 'missing_email', emoji: '📭', label: 'Thiếu email', clickable: 'list' },
  { type: 'future_date', emoji: '📅', label: 'Ngày nhập > hiện tại', clickable: 'list' },
];

const PRESET_OPTIONS: Array<{ value: PresetKey; label: string }> = [
  { value: '7d', label: '7 ngày' },
  { value: '30d', label: '30 ngày' },
  { value: '90d', label: '90 ngày' },
  { value: 'thisMonth', label: 'Tháng này' },
  { value: 'lastMonth', label: 'Tháng trước' },
  { value: 'custom', label: 'Tuỳ chọn' },
  { value: 'all', label: 'Toàn bộ' },
];

const MAX_RANGE_DAYS = 366;
const COLORS = { danger: '#f5222d', warning: '#fa8c16', primary: '#1677ff', muted: '#8c8c8c', ok: '#52c41a' };
const fmt = (n: number) => n.toLocaleString('vi-VN');
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
const fmtDay = (s: string) => dayjs(s).format('DD/MM/YYYY');
/** Trục Y đếm số nguyên: luôn có mốc 0 và ≥ 1 để không sinh mốc thập phân/lệch khi dữ liệu nhỏ. */
const COUNT_DOMAIN: [number, (dataMax: number) => number] = [0, (dataMax) => Math.max(dataMax, 1)];

/** "Hôm nay" theo giờ VN (khớp `todayVnStr()` ở BE), không phụ thuộc múi giờ trình duyệt. */
const todayVn = (): Dayjs => dayjs(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }));

/** Kỳ (YYYY-MM-DD) của 1 preset; `null` = chưa đủ thông tin (Tuỳ chọn chưa chọn ngày); `{}` = toàn bộ. */
function resolvePreset(preset: PresetKey, custom: [Dayjs, Dayjs] | null): { dateFrom?: string; dateTo?: string } | null {
  const today = todayVn();
  const f = (d: Dayjs) => d.format('YYYY-MM-DD');
  switch (preset) {
    case '7d':
      return { dateFrom: f(today.subtract(6, 'day')), dateTo: f(today) };
    case '30d':
      return { dateFrom: f(today.subtract(29, 'day')), dateTo: f(today) };
    case '90d':
      return { dateFrom: f(today.subtract(89, 'day')), dateTo: f(today) };
    case 'thisMonth':
      return { dateFrom: f(today.startOf('month')), dateTo: f(today) };
    case 'lastMonth': {
      const m = today.subtract(1, 'month');
      return { dateFrom: f(m.startOf('month')), dateTo: f(m.endOf('month')) };
    }
    case 'custom':
      return custom ? { dateFrom: f(custom[0]), dateTo: f(custom[1]) } : null;
    case 'all':
    default:
      return {};
  }
}

const periodLabel = (p: InvalidDataStatsPeriod) =>
  p.allTime ? `Toàn bộ thời gian (${fmtDay(p.from)} – ${fmtDay(p.to)})` : `${fmtDay(p.from)} – ${fmtDay(p.to)} (${p.spanDays} ngày)`;

interface Props {
  /** Chỉ gọi API khi tab đang hiển thị và đã có quyền xem. */
  active: boolean;
  /** Chuyển sang tab Danh sách với loại lỗi tương ứng. */
  onOpenList: (invalidType: string, opts?: OpenListOptions) => void;
}

/**
 * InvalidDataStatsTab - tab "Thống kê" của trang báo cáo dữ liệu không hợp lệ.
 *
 * MỌI con số/biểu đồ/bảng đều tính theo KỲ đang chọn (bộ lọc "Kỳ thống kê", theo Ngày nhập
 * thực tế). Bố cục: bộ lọc -> tổng quan các loại lỗi -> KPI trùng (so với kỳ trước) ->
 * xu hướng + mức nghiêm trọng -> Top người nhập + phân bố cụm -> Top cụm (drill-down).
 *
 * Recharts: luôn `isAnimationActive={false}` - với animation bật, Pie/Bar render rỗng
 * (0 sector/rect) khi mount trong ResponsiveContainer.
 */
export function InvalidDataStatsTab({ active, onOpenList }: Props) {
  const { message } = App.useApp();
  const [dupType, setDupType] = useState<DupType>('duplicate_phone');
  const [preset, setPreset] = useState<PresetKey>('30d');
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null);

  const range = useMemo(() => resolvePreset(preset, customRange), [preset, customRange]);

  const { data, isLoading, isFetching, isError, refetch } = useInvalidDataStats(
    { invalidType: dupType, dateFrom: range?.dateFrom, dateTo: range?.dateTo },
    active && range !== null,
  );

  const overview = data?.overview;
  const period = data?.period;
  const d = data?.duplicate ?? null;
  const label = dupType === 'duplicate_email' ? 'Email' : 'Số điện thoại';

  const handleCustomChange = (vals: [Dayjs | null, Dayjs | null] | null) => {
    if (!vals || !vals[0] || !vals[1]) {
      setCustomRange(null);
      return;
    }
    let [from, to] = vals as [Dayjs, Dayjs];
    if (to.diff(from, 'day') + 1 > MAX_RANGE_DAYS) {
      from = to.subtract(MAX_RANGE_DAYS - 1, 'day');
      message.warning(`Kỳ tối đa ${MAX_RANGE_DAYS} ngày - đã tự điều chỉnh ngày bắt đầu.`);
    }
    setCustomRange([from, to]);
  };

  const listPeriod = period && !period.allTime ? { dateFrom: period.from, dateTo: period.to } : {};

  return (
    <div className="space-y-4">
      <Space size="middle" wrap align="end" style={{ width: '100%', justifyContent: 'space-between' }}>
        <Space size="middle" wrap align="end">
          <div>
            <div className="mb-1"><Text strong>Đối tượng thống kê</Text></div>
            <Segmented<DupType>
              value={dupType}
              onChange={setDupType}
              options={[
                { value: 'duplicate_phone', label: '📞 Số điện thoại' },
                { value: 'duplicate_email', label: '✉️ Email' },
              ]}
            />
          </div>
          <div>
            <div className="mb-1">
              <Tooltip title="Áp dụng cho TẤT CẢ thẻ, biểu đồ và bảng bên dưới. Tính theo Ngày nhập thực tế (giờ VN) của bản ghi.">
                <Text strong>Kỳ thống kê</Text>
              </Tooltip>
            </div>
            <Select<PresetKey> value={preset} onChange={setPreset} options={PRESET_OPTIONS} style={{ width: 140 }} />
          </div>
          {preset === 'custom' && (
            <div>
              <div className="mb-1"><Text strong>Khoảng ngày</Text></div>
              <RangePicker
                value={customRange}
                onChange={handleCustomChange}
                format="DD/MM/YYYY"
                placeholder={['Từ ngày', 'Đến ngày']}
                allowClear
                style={{ width: 260 }}
              />
            </div>
          )}
        </Space>
        <Button icon={<ReloadOutlined />} loading={isFetching && !isLoading} disabled={range === null} onClick={() => refetch()}>
          Làm mới
        </Button>
      </Space>

      {range === null && <Alert type="info" showIcon title="Chọn khoảng ngày để xem thống kê theo kỳ tuỳ chọn." />}
      {isError && <Alert type="error" showIcon title="Không tải được thống kê. Vui lòng thử lại." />}

      {period && (
        <Space size={8} wrap>
          <Tag color="blue" style={{ marginInlineEnd: 0 }}>Kỳ: {periodLabel(period)}</Tag>
          {overview && <Tag style={{ marginInlineEnd: 0 }}>{fmt(overview.totalCustomers)} khách nhập trong kỳ</Tag>}
        </Space>
      )}

      {data && data.futureCreatedCount > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          title={`${fmt(data.futureCreatedCount)} khách có "Ngày nhập thực tế" ở tương lai (sau hôm nay)`}
          description='Các bản ghi này không thuộc bất kỳ kỳ nào kết thúc trước ngày đó nên KHÔNG có mặt trong số liệu/biểu đồ của kỳ hiện tại. Chọn "Toàn bộ" hoặc kéo dài kỳ đến ngày đó để xem.'
          action={preset !== 'all' ? <Button size="small" onClick={() => setPreset('all')}>Xem toàn bộ</Button> : undefined}
        />
      )}

      <Spin spinning={isFetching && !isLoading}>
        <div className="space-y-4">
          {/* 1. Tổng quan mọi loại lỗi - theo kỳ */}
          <Row gutter={[12, 12]}>
            {OVERVIEW_META.map((m) => {
              const isDup = m.clickable === 'dup';
              const dup = overview && isDup ? overview[m.type as DupType] : undefined;
              const value = overview
                ? isDup
                  ? (dup?.redundant ?? 0)
                  : (overview[m.type as 'future_date' | 'missing_phone' | 'missing_email'] as number)
                : 0;
              const selected = isDup && m.type === dupType;
              const share = overview ? pct(value, overview.totalCustomers) : null;
              return (
                <Col key={m.type} xs={12} md={8} xl={{ flex: '1 1 0' }}>
                  <Card
                    size="small"
                    hoverable
                    loading={isLoading}
                    onClick={() => (isDup ? setDupType(m.type as DupType) : onOpenList(m.type, listPeriod))}
                    style={{ borderColor: selected ? COLORS.primary : undefined, cursor: 'pointer', height: '100%' }}
                  >
                    <Statistic
                      title={<span>{m.emoji} {m.label}</span>}
                      value={value}
                      styles={{ content: { color: value > 0 ? COLORS.danger : COLORS.ok, fontSize: 24 } }}
                    />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {isDup
                        ? `bản trùng phát sinh · ${fmt(dup?.groups ?? 0)} nhóm`
                        : share == null
                          ? '—'
                          : `${share}% khách nhập trong kỳ`}
                    </Text>
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {isDup ? (selected ? 'Đang xem chi tiết bên dưới' : 'Bấm để xem chi tiết') : 'Bấm để mở danh sách (theo kỳ)'}
                      </Text>
                    </div>
                  </Card>
                </Col>
              );
            })}
          </Row>

          {/* 2 → 5: chi tiết loại trùng đang chọn */}
          {d && d.groupCount === 0 ? (
            <Card>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span>
                    Không có {label.toLowerCase()} nào bị trùng phát sinh trong kỳ này 🎉
                    {!period?.allTime && <><br /><Text type="secondary">Thử mở rộng kỳ hoặc chọn &quot;Toàn bộ&quot;.</Text></>}
                  </span>
                }
              />
            </Card>
          ) : d && period ? (
            <DuplicateDetail d={d} period={period} label={label} dupType={dupType} onOpenList={onOpenList} loading={isLoading} />
          ) : (
            <Card loading={isLoading} />
          )}
        </div>
      </Spin>
    </div>
  );
}

interface DetailProps {
  d: DuplicateStatsDetail;
  period: InvalidDataStatsPeriod;
  label: string;
  dupType: DupType;
  loading: boolean;
  onOpenList: (invalidType: string, opts?: OpenListOptions) => void;
}

function DuplicateDetail({ d, period, label, dupType, loading, onOpenList }: DetailProps) {
  const isMonth = period.granularity === 'month';
  const trendData = useMemo(
    () => d.trend.map((t) => ({ ...t, label: isMonth ? dayjs(`${t.date}-01`).format('MM/YYYY') : dayjs(t.date).format('DD/MM') })),
    [d.trend, isMonth],
  );
  const trendTotal = useMemo(() => d.trend.reduce((s, t) => s + t.redundant, 0), [d.trend]);
  const severityData = [
    { name: 'Trùng khác Sales', value: d.crossSalesGroups, color: COLORS.danger },
    { name: 'Cùng Sales / chưa gán', value: d.sameSalesGroups, color: COLORS.warning },
  ].filter((x) => x.value > 0);

  const prev = d.previousRedundantCount;
  const delta = prev == null ? null : d.redundantCount - prev;
  const deltaText =
    delta == null
      ? null
      : delta === 0
        ? `Bằng kỳ trước (${fmt(prev!)})`
        : `${delta > 0 ? '▲ +' : '▼ '}${fmt(delta)}${prev! > 0 ? ` (${delta > 0 ? '+' : ''}${pct(delta, prev!)}%)` : ''} so với kỳ trước (${fmt(prev!)})`;

  const columns: ColumnsType<DuplicateStatsDetail['topGroups'][number]> = [
    {
      title: label,
      dataIndex: 'key',
      key: 'key',
      width: 220,
      render: (v: string) => <Text strong copyable={{ text: v }}>{v}</Text>,
    },
    {
      title: 'Số bản ghi',
      dataIndex: 'size',
      key: 'size',
      width: 110,
      align: 'right',
      render: (v: number) => <Tag color={v >= 4 ? 'red' : v === 3 ? 'orange' : 'gold'}>{v}</Tag>,
    },
    {
      title: <Tooltip title="Số bản trùng của cụm này phát sinh trong kỳ đang chọn">Phát sinh trong kỳ</Tooltip>,
      dataIndex: 'newInPeriod',
      key: 'newInPeriod',
      width: 140,
      align: 'right',
    },
    {
      title: 'Sales phụ trách',
      key: 'sales',
      render: (_, r) =>
        r.salesNames.length === 0 ? (
          <Text type="secondary">Chưa gán</Text>
        ) : (
          <Space size={[0, 4]} wrap>
            {r.salesNames.map((n) => <Tag key={n}>{n}</Tag>)}
            {r.distinctSales > r.salesNames.length && <Tag>+{r.distinctSales - r.salesNames.length}</Tag>}
            {r.distinctSales >= 2 && (
              <Tooltip title="Nhiều Sales cùng phụ trách 1 khách - nguy cơ 2 Sales cùng chăm 1 khách mà không biết.">
                <Tag color="red" icon={<WarningOutlined />}>Khác Sales</Tag>
              </Tooltip>
            )}
          </Space>
        ),
    },
    {
      title: 'Nhập gần nhất',
      dataIndex: 'latestCreatedAt',
      key: 'latestCreatedAt',
      width: 150,
      render: (v: string) => dayjs(v).format('HH:mm DD/MM/YYYY'),
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 90,
      fixed: 'right',
      render: (_, r) => (
        <Button type="link" size="small" onClick={() => onOpenList(dupType, { key: r.key })}>
          Xem
        </Button>
      ),
    },
  ];

  const rate = d.duplicateRatePercent;
  const rankHeight = Math.max(180, d.topCreators.length * 34 + 40);

  return (
    <div className="space-y-4">
      {/* 2. KPI (trong kỳ) */}
      <Row gutter={[12, 12]}>
        <Col xs={12} md={8} xl={{ flex: '1 1 0' }}>
          <Card size="small" loading={loading}>
            <Statistic
              title={
                <Tooltip title={`Bản trùng phát sinh trong kỳ / khách nhập trong kỳ có ${label.toLowerCase()} (${fmt(d.redundantCount)}/${fmt(d.totalWithValue)})`}>
                  Tỷ lệ nhập trùng
                </Tooltip>
              }
              value={rate ?? '—'}
              suffix={rate == null ? undefined : '%'}
              styles={{ content: { color: rate == null ? undefined : rate >= 5 ? COLORS.danger : rate >= 1 ? COLORS.warning : COLORS.ok } }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>{fmt(d.totalWithValue)} khách nhập trong kỳ</Text>
          </Card>
        </Col>
        <Col xs={12} md={8} xl={{ flex: '1 1 0' }}>
          <Card size="small" loading={loading}>
            <Statistic
              title={
                <Tooltip title="Mỗi cụm giữ lại 1 bản gốc (nhập sớm nhất); số bản còn lại phát sinh trong kỳ là bản dư cần gộp/xoá.">
                  Bản ghi trùng phát sinh
                </Tooltip>
              }
              value={d.redundantCount}
              styles={{ content: { color: COLORS.warning } }}
            />
            {deltaText && (
              <Text style={{ fontSize: 12, color: delta! > 0 ? COLORS.danger : delta! < 0 ? COLORS.ok : COLORS.muted }}>{deltaText}</Text>
            )}
          </Card>
        </Col>
        <Col xs={12} md={8} xl={{ flex: '1 1 0' }}>
          <Card size="small" loading={loading}>
            <Statistic title={`Số ${label.toLowerCase()} bị trùng`} value={d.groupCount} />
            <Text type="secondary" style={{ fontSize: 12 }}>{fmt(d.affectedCustomers)} khách liên quan</Text>
          </Card>
        </Col>
        <Col xs={12} md={8} xl={{ flex: '1 1 0' }}>
          <Card size="small" loading={loading}>
            <Statistic title="Cụm lớn nhất" value={d.maxGroupSize} suffix="bản ghi" />
          </Card>
        </Col>
        <Col xs={12} md={8} xl={{ flex: '1 1 0' }}>
          <Card size="small" loading={loading}>
            <Statistic
              title={<Tooltip title="Cụm có từ 2 Sales phụ trách khác nhau trở lên - mức nghiêm trọng cao nhất.">Trùng khác Sales</Tooltip>}
              value={d.crossSalesGroups}
              suffix={`/ ${fmt(d.groupCount)} cụm`}
              styles={{ content: { color: d.crossSalesGroups > 0 ? COLORS.danger : COLORS.ok } }}
            />
          </Card>
        </Col>
      </Row>

      {/* 3. Xu hướng + mức nghiêm trọng */}
      <Row gutter={[12, 12]}>
        <Col xs={24} xl={16}>
          <Card
            size="small"
            loading={loading}
            title={`Bản ghi trùng phát sinh theo ${isMonth ? 'tháng' : 'ngày'}`}
            extra={<Text type="secondary">{fmt(trendTotal)} bản trong kỳ</Text>}
          >
            <Text type="secondary" style={{ fontSize: 12 }}>
              Tính theo Ngày nhập thực tế của các bản nhập SAU bản gốc, từ {fmtDay(period.from)} đến {fmtDay(period.to)}
              {isMonth ? ' (gộp theo tháng vì kỳ dài)' : ''} - đột biến thường do 1 đợt import/nhập hàng loạt.
            </Text>
            {trendTotal === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có bản trùng nào phát sinh trong kỳ" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={trendData} margin={{ top: 12, right: 16, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dupTrendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.danger} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={COLORS.danger} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis allowDecimals={false} domain={COUNT_DOMAIN} tick={{ fontSize: 12 }} />
                  <ChartTooltip formatter={(v) => [fmt(Number(v)), 'Bản ghi trùng']} labelFormatter={(l) => `${isMonth ? 'Tháng' : 'Ngày'} ${l}`} />
                  <Area
                    type="monotone"
                    dataKey="redundant"
                    stroke={COLORS.danger}
                    strokeWidth={2}
                    fill="url(#dupTrendFill)"
                    dot={trendData.length <= 31}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card size="small" loading={loading} title="Mức độ nghiêm trọng (theo cụm)">
            {severityData.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={severityData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    isAnimationActive={false}
                    label={(e) => String(e.value)}
                  >
                    {severityData.map((s) => <Cell key={s.name} fill={s.color} />)}
                  </Pie>
                  <ChartTooltip formatter={(v) => [`${fmt(Number(v))} cụm`, '']} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>

      {/* 4. Top người nhập trùng + phân bố kích thước cụm */}
      <Row gutter={[12, 12]}>
        <Col xs={24} xl={12}>
          <Card size="small" loading={loading} title="Người nhập nhiều bản ghi trùng nhất (trong kỳ)">
            <Text type="secondary" style={{ fontSize: 12 }}>
              Đếm các bản nhập SAU bản gốc trong kỳ - gợi ý nhân viên cần nhắc kiểm tra khách đã tồn tại trước khi nhập.
            </Text>
            {d.topCreators.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <ResponsiveContainer width="100%" height={rankHeight}>
                <BarChart data={d.topCreators} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }} maxBarSize={22}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} domain={COUNT_DOMAIN} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12 }} />
                  <ChartTooltip formatter={(v) => [fmt(Number(v)), 'Bản ghi trùng']} />
                  <Bar
                    dataKey="redundantCount"
                    name="Bản ghi trùng"
                    fill={COLORS.warning}
                    radius={[0, 4, 4, 0]}
                    label={{ position: 'right', fontSize: 12 }}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card size="small" loading={loading} title="Phân bố kích thước cụm trùng">
            <Text type="secondary" style={{ fontSize: 12 }}>
              Kích thước tính trên toàn bộ cụm (gồm bản gốc); cụm càng lớn càng cần ưu tiên gộp.
            </Text>
            <ResponsiveContainer width="100%" height={rankHeight}>
              <BarChart data={d.sizeDistribution} margin={{ top: 16, right: 16, left: -12, bottom: 0 }} maxBarSize={48}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} domain={COUNT_DOMAIN} tick={{ fontSize: 12 }} />
                <ChartTooltip formatter={(v) => [`${fmt(Number(v))} cụm`, '']} />
                <Bar dataKey="groups" name="Số cụm" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 12 }} isAnimationActive={false}>
                  {d.sizeDistribution.map((s, i) => (
                    <Cell key={s.label} fill={i === 0 ? COLORS.primary : i === 1 ? COLORS.warning : COLORS.danger} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      {/* 5. Top cụm trùng */}
      <Card size="small" loading={loading} title={`Top ${d.topGroups.length} ${label.toLowerCase()} trùng nhiều nhất`}>
        <Table columns={columns} dataSource={d.topGroups} rowKey="key" size="small" pagination={false} scroll={{ x: 900 }} />
      </Card>
    </div>
  );
}
