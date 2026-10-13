'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Card, Col, DatePicker, Row, Segmented, Space, Statistic, Tag, Typography } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useCustomerPeriodStats } from '@/lib/hooks/useCustomerStats';
import type { CustomerStatsPeriod } from '@/lib/types/customer.types';
import type { ChartSeries } from '@/app/(dashboard)/reports/ReportChart';

// recharts nặng -> chỉ tải khi khối này thật sự vẽ biểu đồ (cùng cách ReportSection.tsx đang làm).
const ReportChart = dynamic(() => import('@/app/(dashboard)/reports/ReportChart').then((m) => m.ReportChart), {
  ssr: false,
  loading: () => <div style={{ height: 240 }} />,
}) as unknown as typeof import('@/app/(dashboard)/reports/ReportChart').ReportChart;

const { Text } = Typography;

const PERIOD_OPTIONS: { value: CustomerStatsPeriod; label: string }[] = [
  { value: 'day', label: 'Ngày' },
  { value: 'week', label: 'Tuần' },
  { value: 'month', label: 'Tháng' },
  { value: 'year', label: 'Năm' },
];

const fmtUsd = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
const fmtUsdShort = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(v);
const fmtDate = (d: string) => dayjs(d).format('DD/MM/YYYY');

/** So với kỳ trước: ▲/▼ + %. Kỳ trước = 0 thì chỉ hiện "mới" khi kỳ này > 0 (tránh chia 0). */
function Delta({ now, prev, money }: { now: number; prev: number; money?: boolean }) {
  if (now === prev) return <Text type="secondary" style={{ fontSize: 12 }}>= kỳ trước</Text>;
  const up = now > prev;
  const pct = prev > 0 ? `${Math.abs(Math.round(((now - prev) / prev) * 100))}%` : 'mới';
  return (
    <Text style={{ fontSize: 12, color: up ? '#52c41a' : '#f5222d' }} title={`Kỳ trước: ${money ? fmtUsd(prev) : prev}`}>
      {up ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {pct} so kỳ trước
    </Text>
  );
}

interface CustomerPeriodStatsProps {
  /** Ẩn mọi số tiền nạp khi Admin đã ẩn `tab:deposits` (cùng cờ với thẻ "Tổng nạp"/cột "Nạp tiền"). */
  hideDeposit?: boolean;
}

export const CustomerPeriodStats = ({ hideDeposit }: CustomerPeriodStatsProps) => {
  const [period, setPeriod] = useState<CustomerStatsPeriod>('day');
  const [anchor, setAnchor] = useState<Dayjs>(dayjs());
  const { data, isLoading, isFetching } = useCustomerPeriodStats(period, anchor.format('YYYY-MM-DD'));

  const picker = period === 'month' ? 'month' : period === 'year' ? 'year' : 'date';
  const cur = data?.current;
  const prev = data?.previous;

  const rangeText = data
    ? data.period.from === data.period.to
      ? fmtDate(data.period.from)
      : `${fmtDate(data.period.from)} → ${fmtDate(data.period.to)}`
    : '';

  const chartData = useMemo(
    () =>
      (data?.trend ?? []).map((t) => ({
        ...t,
        label: data?.granularity === 'month' ? `T${t.bucket.slice(5, 7)}` : dayjs(t.bucket).format('DD/MM'),
      })),
    [data],
  );
  const countSeries: ChartSeries[] = [
    { key: 'entered', label: 'Nhập mới', color: '#1677ff' },
    { key: 'closed', label: 'Đã chốt', color: '#52c41a' },
  ];
  const moneySeries: ChartSeries[] = [{ key: 'depositAmount', label: 'Tiền nạp', color: '#faad14' }];

  const group = (title: string, hint: string, children: React.ReactNode) => (
    <Card size="small" loading={isLoading} variant="borderless" className="stat-card" style={{ height: '100%' }}>
      <Space orientation="vertical" size={2} style={{ width: '100%' }}>
        <Text strong>{title}</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>{hint}</Text>
      </Space>
      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>{children}</Row>
    </Card>
  );
  const stat = (title: string, value: number, extra?: React.ReactNode, color?: string, money?: boolean) => (
    <Col xs={12}>
      <Statistic
        title={title}
        value={value}
        formatter={money ? (v) => fmtUsd(Number(v)) : undefined}
        styles={{ content: { fontSize: 20, color } }}
      />
      {extra}
    </Col>
  );

  return (
    <Card
      title="Thống kê khách hàng theo giai đoạn"
      style={{ marginBottom: 24 }}
      extra={
        <Space wrap>
          <Segmented
            value={period}
            options={PERIOD_OPTIONS}
            onChange={(v) => {
              setPeriod(v as CustomerStatsPeriod);
              setAnchor(dayjs());
            }}
          />
          <DatePicker
            picker={picker}
            value={anchor}
            allowClear={false}
            format={period === 'month' ? 'MM/YYYY' : period === 'year' ? 'YYYY' : 'DD/MM/YYYY'}
            disabledDate={(d) => d.isAfter(dayjs(), 'day')}
            onChange={(d) => d && setAnchor(d)}
          />
        </Space>
      }
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 12, opacity: isFetching ? 0.5 : 1 }}>
        Khoảng thống kê: <Text strong>{rangeText}</Text>
        {period === 'week' && ' (Thứ Hai → Chủ Nhật)'}
      </Text>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={hideDeposit ? 12 : 8}>
          {group(
            'Giai đoạn NHẬP',
            'Khách có "Ngày nhập" trong kỳ',
            <>
              {stat('Khách nhập mới', cur?.input.entered ?? 0, cur && prev && <Delta now={cur.input.entered} prev={prev.input.entered} />, '#1677ff')}
              {!hideDeposit && stat('Đã có nạp', cur?.input.enteredDeposited ?? 0)}
              {!hideDeposit &&
                stat('Tổng nạp của nhóm này', cur?.input.depositAmount ?? 0, <Text type="secondary" style={{ fontSize: 12 }}>{cur?.input.depositCount ?? 0} khoản</Text>, '#faad14', true)}
            </>,
          )}
        </Col>
        <Col xs={24} lg={hideDeposit ? 12 : 8}>
          {group(
            'Giai đoạn XỬ LÝ (chốt)',
            'Khách "Đã chốt" có "Ngày chốt" trong kỳ',
            <>
              {stat('Chốt trong kỳ', cur?.handled.closed ?? 0, cur && prev && <Delta now={cur.handled.closed} prev={prev.handled.closed} />, '#52c41a')}
              {!hideDeposit && stat('Đã có nạp', cur?.handled.closedDeposited ?? 0)}
              {!hideDeposit &&
                stat('Tổng nạp của nhóm này', cur?.handled.depositAmount ?? 0, <Text type="secondary" style={{ fontSize: 12 }}>{cur?.handled.depositCount ?? 0} khoản</Text>, '#faad14', true)}
            </>,
          )}
        </Col>
        {!hideDeposit && (
          <Col xs={24} lg={8}>
            {group(
              'Giai đoạn NẠP',
              'Các khoản nạp có "Ngày nạp" trong kỳ',
              <>
                {stat('Tiền nạp trong kỳ', cur?.cash.amount ?? 0, cur && prev && <Delta now={cur.cash.amount} prev={prev.cash.amount} money />, '#faad14', true)}
                {stat('Khách nạp', cur?.cash.depositorCount ?? 0, <Text type="secondary" style={{ fontSize: 12 }}>{cur?.cash.depositCount ?? 0} khoản</Text>)}
                {stat('Nạp đầu (FTD)', cur?.cash.ftdAmount ?? 0, <Text type="secondary" style={{ fontSize: 12 }}>{cur?.cash.ftdCount ?? 0} khách</Text>, undefined, true)}
                {stat('Nạp lại', cur?.cash.redepositAmount ?? 0, <Text type="secondary" style={{ fontSize: 12 }}>{cur?.cash.redepositCount ?? 0} khoản</Text>, undefined, true)}
              </>,
            )}
          </Col>
        )}
      </Row>

      <div style={{ marginTop: 16 }}>
        <Text strong>Trạng thái hiện tại của khách nhập trong kỳ</Text>
        <div style={{ marginTop: 8 }}>
          {(data?.byStatus ?? []).map((s) => (
            <Tag key={s.code} color={s.color ?? undefined} style={{ marginBottom: 6, opacity: s.count === 0 ? 0.45 : 1 }}>
              {s.name}: <b>{s.count}</b>
            </Tag>
          ))}
        </div>
      </div>

      {period !== 'day' && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} lg={hideDeposit ? 24 : 12}>
            <Text strong>Khách nhập mới & đã chốt theo {data?.granularity === 'month' ? 'tháng' : 'ngày'}</Text>
            <ReportChart
              data={chartData}
              nameKey="label"
              series={countSeries}
              chartType="column"
              emptyText="Chưa có dữ liệu trong kỳ"
              valueFormatter={(v) => String(v)}
            />
          </Col>
          {!hideDeposit && (
            <Col xs={24} lg={12}>
              <Text strong>Tiền nạp theo {data?.granularity === 'month' ? 'tháng' : 'ngày'} (USD)</Text>
              <ReportChart
                data={chartData}
                nameKey="label"
                series={moneySeries}
                chartType="column"
                emptyText="Chưa có khoản nạp trong kỳ"
                valueFormatter={fmtUsd}
                axisFormatter={fmtUsdShort}
              />
            </Col>
          )}
        </Row>
      )}
    </Card>
  );
};
