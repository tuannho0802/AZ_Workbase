'use client';

import React, { useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Empty, Row, Segmented, Select, Space, Statistic, Table, Tag, Tooltip, Typography } from 'antd';
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
import dayjs from 'dayjs';
import { useInvalidDataStats } from '@/lib/hooks/useInvalidDataStats';
import type { DuplicateStatsDetail } from '@/lib/api/customers.api';

const { Text } = Typography;

type DupType = 'duplicate_phone' | 'duplicate_email';

/** Nhãn/emoji các loại lỗi - đồng bộ `TYPE_META` ở page.tsx (giữ tách riêng để component không phụ thuộc page). */
const OVERVIEW_META: Array<{ type: string; emoji: string; label: string; clickable: 'list' | 'dup' }> = [
  { type: 'duplicate_phone', emoji: '⚠️📞', label: 'Trùng số điện thoại', clickable: 'dup' },
  { type: 'duplicate_email', emoji: '⚠️✉️', label: 'Trùng email', clickable: 'dup' },
  { type: 'missing_phone', emoji: '📵', label: 'Thiếu số điện thoại', clickable: 'list' },
  { type: 'missing_email', emoji: '📭', label: 'Thiếu email', clickable: 'list' },
  { type: 'future_date', emoji: '📅', label: 'Ngày nhập > hiện tại', clickable: 'list' },
];

const DAYS_OPTIONS = [
  { value: 7, label: '7 ngày' },
  { value: 30, label: '30 ngày' },
  { value: 90, label: '90 ngày' },
];

const COLORS = { danger: '#f5222d', warning: '#fa8c16', primary: '#1677ff', muted: '#8c8c8c', ok: '#52c41a' };
const fmt = (n: number) => n.toLocaleString('vi-VN');
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

interface Props {
  /** Chỉ gọi API khi tab đang hiển thị và đã có quyền xem. */
  active: boolean;
  /** Chuyển sang tab Danh sách: `key` (nếu có) là giá trị SĐT/Email của cụm cần xem. */
  onOpenList: (invalidType: string, key?: string) => void;
}

/**
 * InvalidDataStatsTab - tab "Thống kê" của trang báo cáo dữ liệu không hợp lệ.
 * Mặc định xem "Trùng số điện thoại" (theo yêu cầu). Bố cục từ trên xuống:
 *  1. Tổng quan mọi loại lỗi (click để nhảy sang Danh sách / đổi loại trùng).
 *  2. KPI của loại trùng đang chọn (tỷ lệ trùng, số cụm, bản ghi dư, mức nghiêm trọng).
 *  3. Xu hướng theo ngày + mức độ nghiêm trọng (trùng khác Sales vs cùng Sales).
 *  4. Top người nhập trùng + phân bố kích thước cụm.
 *  5. Top cụm trùng lớn nhất -> bấm "Xem" để drill-down sang Danh sách.
 */
export function InvalidDataStatsTab({ active, onOpenList }: Props) {
  const [dupType, setDupType] = useState<DupType>('duplicate_phone');
  const [days, setDays] = useState<number>(30);

  const { data, isLoading, isFetching, isError, refetch } = useInvalidDataStats({ invalidType: dupType, days }, active);

  const overview = data?.overview;
  const d = data?.duplicate ?? null;
  const label = dupType === 'duplicate_email' ? 'Email' : 'Số điện thoại';

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
              <Tooltip title="Khung thời gian của biểu đồ xu hướng. Các chỉ số KPI/Top luôn tính trên toàn bộ dữ liệu hiện có.">
                <Text strong>Xu hướng</Text>
              </Tooltip>
            </div>
            <Select value={days} onChange={setDays} options={DAYS_OPTIONS} style={{ width: 120 }} />
          </div>
        </Space>
        <Button icon={<ReloadOutlined />} loading={isFetching && !isLoading} onClick={() => refetch()}>
          Làm mới
        </Button>
      </Space>

      {isError && <Alert type="error" showIcon title="Không tải được thống kê. Vui lòng thử lại." />}

      {/* 1. Tổng quan mọi loại lỗi */}
      <Row gutter={[12, 12]}>
        {OVERVIEW_META.map((m) => {
          const isDup = m.clickable === 'dup';
          const value = overview
            ? isDup
              ? overview[m.type as DupType].customers
              : (overview[m.type as 'future_date' | 'missing_phone' | 'missing_email'] as number)
            : 0;
          const groups = overview && isDup ? overview[m.type as DupType].groups : undefined;
          const selected = isDup && m.type === dupType;
          const share = overview ? pct(value, overview.totalCustomers) : null;
          return (
            <Col key={m.type} xs={12} md={8} xl={{ flex: '1 1 0' }}>
              <Card
                size="small"
                hoverable
                loading={isLoading}
                onClick={() => (isDup ? setDupType(m.type as DupType) : onOpenList(m.type))}
                style={{ borderColor: selected ? COLORS.primary : undefined, cursor: 'pointer', height: '100%' }}
              >
                <Statistic
                  title={<span>{m.emoji} {m.label}</span>}
                  value={value}
                  styles={{ content: { color: value > 0 ? COLORS.danger : COLORS.ok, fontSize: 24 } }}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {groups !== undefined ? `${fmt(groups)} nhóm trùng · ` : ''}
                  {share == null ? '—' : `${share}% tổng khách`}
                </Text>
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {isDup ? (selected ? 'Đang xem chi tiết bên dưới' : 'Bấm để xem chi tiết') : 'Bấm để mở danh sách'}
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
            description={`Không phát hiện ${label.toLowerCase()} nào bị trùng 🎉`}
          />
        </Card>
      ) : d ? (
        <DuplicateDetail d={d} label={label} dupType={dupType} days={days} onOpenList={onOpenList} loading={isLoading} />
      ) : (
        <Card loading={isLoading} />
      )}
    </div>
  );
}

interface DetailProps {
  d: DuplicateStatsDetail;
  label: string;
  dupType: DupType;
  days: number;
  loading: boolean;
  onOpenList: (invalidType: string, key?: string) => void;
}

function DuplicateDetail({ d, label, dupType, days, loading, onOpenList }: DetailProps) {
  const trendData = useMemo(
    () => d.trend.map((t) => ({ ...t, label: dayjs(t.date).format('DD/MM') })),
    [d.trend],
  );
  const trendTotal = useMemo(() => d.trend.reduce((s, t) => s + t.redundant, 0), [d.trend]);
  const severityData = [
    { name: 'Trùng khác Sales', value: d.crossSalesGroups, color: COLORS.danger },
    { name: 'Cùng Sales / chưa gán', value: d.sameSalesGroups, color: COLORS.warning },
  ].filter((x) => x.value > 0);

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
        <Button type="link" size="small" onClick={() => onOpenList(dupType, r.key)}>
          Xem
        </Button>
      ),
    },
  ];

  const rate = d.duplicateRatePercent;

  return (
    <div className="space-y-4">
      {/* 2. KPI */}
      <Row gutter={[12, 12]}>
        <Col xs={12} md={8} xl={{ flex: '1 1 0' }}>
          <Card size="small" loading={loading}>
            <Statistic
              title={
                <Tooltip title={`Khách nằm trong cụm trùng / tổng khách có ${label.toLowerCase()} (${fmt(d.affectedCustomers)}/${fmt(d.totalWithValue)})`}>
                  Tỷ lệ trùng
                </Tooltip>
              }
              value={rate ?? '—'}
              suffix={rate == null ? undefined : '%'}
              styles={{ content: { color: rate == null ? undefined : rate >= 5 ? COLORS.danger : rate >= 1 ? COLORS.warning : COLORS.ok } }}
            />
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
            <Statistic
              title={
                <Tooltip title="Mỗi cụm giữ lại 1 bản gốc; số bản còn lại là bản dư cần gộp/xoá.">
                  Bản ghi dư cần xử lý
                </Tooltip>
              }
              value={d.redundantCount}
              styles={{ content: { color: COLORS.warning } }}
            />
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
              title={
                <Tooltip title="Cụm có từ 2 Sales phụ trách khác nhau trở lên - mức nghiêm trọng cao nhất.">
                  Trùng khác Sales
                </Tooltip>
              }
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
            title="Bản ghi trùng phát sinh theo ngày"
            extra={<Text type="secondary">{fmt(trendTotal)} bản trong {days} ngày</Text>}
          >
            <Text type="secondary" style={{ fontSize: 12 }}>
              Tính theo ngày nhập thực tế của các bản nhập SAU bản gốc - đột biến thường do 1 đợt import/nhập hàng loạt.
            </Text>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trendData} margin={{ top: 12, right: 16, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="dupTrendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.danger} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={COLORS.danger} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={days > 30 ? 6 : days > 7 ? 2 : 0} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <ChartTooltip formatter={(v) => [fmt(Number(v)), 'Bản ghi trùng']} labelFormatter={(l) => `Ngày ${l}`} />
                <Area type="monotone" dataKey="redundant" stroke={COLORS.danger} strokeWidth={2} fill="url(#dupTrendFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card size="small" loading={loading} title="Mức độ nghiêm trọng (theo cụm)">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={severityData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} label={(e) => String(e.value)}>
                  {severityData.map((s) => <Cell key={s.name} fill={s.color} />)}
                </Pie>
                <ChartTooltip formatter={(v) => [`${fmt(Number(v))} cụm`, '']} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      {/* 4. Top người nhập trùng + phân bố kích thước cụm */}
      <Row gutter={[12, 12]}>
        <Col xs={24} xl={12}>
          <Card size="small" loading={loading} title="Người nhập nhiều bản ghi trùng nhất">
            <Text type="secondary" style={{ fontSize: 12 }}>
              Đếm các bản nhập SAU bản gốc của mỗi cụm - gợi ý nhân viên cần nhắc kiểm tra khách đã tồn tại trước khi nhập.
            </Text>
            {d.topCreators.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(180, d.topCreators.length * 34 + 40)}>
                <BarChart data={d.topCreators} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }} maxBarSize={22}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12 }} />
                  <ChartTooltip formatter={(v) => [fmt(Number(v)), 'Bản ghi trùng']} />
                  <Bar dataKey="redundantCount" name="Bản ghi trùng" fill={COLORS.warning} radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 12 }} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card size="small" loading={loading} title="Phân bố kích thước cụm trùng">
            <Text type="secondary" style={{ fontSize: 12 }}>
              Cụm càng lớn (nhiều bản ghi) càng cần ưu tiên gộp.
            </Text>
            <ResponsiveContainer width="100%" height={Math.max(180, d.topCreators.length * 34 + 40)}>
              <BarChart data={d.sizeDistribution} margin={{ top: 16, right: 16, left: -12, bottom: 0 }} maxBarSize={48}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <ChartTooltip formatter={(v) => [`${fmt(Number(v))} cụm`, '']} />
                <Bar dataKey="groups" name="Số cụm" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 12 }}>
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
        <Table
          columns={columns}
          dataSource={d.topGroups}
          rowKey="key"
          size="small"
          pagination={false}
          scroll={{ x: 800 }}
        />
      </Card>
    </div>
  );
}
