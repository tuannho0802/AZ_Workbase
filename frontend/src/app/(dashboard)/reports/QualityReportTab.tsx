'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Progress, Row, Select, Space, Tag, Typography } from 'antd';
import { CheckCircleOutlined, DollarOutlined, ReloadOutlined, SafetyCertificateOutlined, UsergroupAddOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useCustomerQualityReport, useCustomerReport } from '@/lib/hooks/useReports';
import type { QualityStatusMeta, ReportQuery } from '@/lib/types/reports.types';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { fmtCount } from '@/lib/utils/marketingReport';
import { customerRates, sumCustomerRows } from '@/lib/utils/customerReportRates';
import { ReportSection } from './ReportSection';
import PeriodSelector from './PeriodSelector';
import ReportNameFilter from './ReportNameFilter';
import ReportKpiCard, { REPORT_COLORS } from './ReportKpiCard';
import ReportUserName from './ReportUserName';
import ReportCustomersModal, { type CustomerDrill } from './ReportCustomersModal';

const { Text } = Typography;

const percentOf = (count: number, total: number) => (total > 0 ? Math.round((count / total) * 1000) / 10 : 0);

/** Màu Progress theo tỉ lệ - xanh (tốt) -> vàng -> đỏ; dùng chung cho mọi status vì danh sách status là ĐỘNG. */
function progressColor(pct: number): string {
  if (pct >= 60) return '#52c41a';
  if (pct >= 30) return '#faad14';
  return '#f5222d';
}

const hexOrUndefined = (c?: string) => (c && c.startsWith('#') ? c : undefined);

interface Props {
  query: ReportQuery;
  onQueryChange: (next: ReportQuery) => void;
}

/** Dòng "Cá nhân" sau khi làm phẳng byStatus (ReportChart đọc dataKey phẳng). */
interface FlatQualityRow {
  userId: number;
  userName: string;
  departmentName?: string | null;
  departmentColor?: string | null;
  total: number;
  byStatus: Record<string, number>;
  [statusCode: string]: unknown;
}

/**
 * Tab "Chất lượng data" - data đổ về trong kỳ chia theo STATUS HIỆN TẠI (danh sách status động từ
 * `customer_statuses`). Bố cục theo tab Marketing: khung kỳ -> thẻ Tổng + MỖI status 1 thẻ (bấm để mở
 * Mini Table khách đang ở status đó) -> khối "Theo nhân viên". Không còn khối "Theo phòng ban" (vô nghĩa:
 * mọi khách thuộc phòng Kinh doanh).
 */
export default function QualityReportTab({ query, onQueryChange }: Props) {
  const { data, isLoading, isFetching, isError, error, refetch } = useCustomerQualityReport(query);
  // Tỷ lệ chốt/join/nạp lấy từ báo cáo khách (cùng kỳ, cùng cohort data mới, cùng phạm vi quyền).
  const { data: customerData, isLoading: ratesLoading } = useCustomerReport(query);
  const rateTotals = useMemo(() => customerData?.total ?? sumCustomerRows(customerData?.personal ?? []), [customerData]);
  const rates = customerRates(rateTotals);
  const [search, setSearch] = useState('');
  const [highlightStatus, setHighlightStatus] = useState<string | null>(null);
  const [drill, setDrill] = useState<CustomerDrill | null>(null);

  const statuses = useMemo<QualityStatusMeta[]>(() => data?.statuses || [], [data?.statuses]);

  const effectiveHighlight = useMemo(() => {
    if (highlightStatus && statuses.some((s) => s.code === highlightStatus)) return highlightStatus;
    return statuses[0]?.code ?? null;
  }, [highlightStatus, statuses]);
  const highlightMeta = statuses.find((s) => s.code === effectiveHighlight);

  const series = useMemo(() => statuses.map((s) => ({ key: s.code, label: s.name, color: s.color })), [statuses]);

  const personalFlat = useMemo<FlatQualityRow[]>(
    () => (data?.personal || []).map((r) => ({ ...r, ...r.byStatus })),
    [data?.personal],
  );

  // BE chỉ trả `total` cho scope=all/Admin; role khác thì tổng = số của chính mình.
  const totals = useMemo(() => {
    if (data?.total) return data.total;
    const byStatus: Record<string, number> = Object.fromEntries(statuses.map((s) => [s.code, 0]));
    let total = 0;
    for (const r of data?.personal ?? []) {
      total += r.total;
      for (const s of statuses) byStatus[s.code] += r.byStatus[s.code] || 0;
    }
    return { total, byStatus };
  }, [data?.total, data?.personal, statuses]);

  const rows = useMemo(() => {
    let list = personalFlat;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((r) => r.userName.toLowerCase().includes(q));
    if (effectiveHighlight) {
      const key = effectiveHighlight;
      list = [...list].sort((a, b) => (b.byStatus[key] || 0) - (a.byStatus[key] || 0));
    }
    return list;
  }, [personalFlat, search, effectiveHighlight]);

  const linkCount = (count: number, row: FlatQualityRow, status?: QualityStatusMeta) =>
    count > 0 ? (
      <Button
        type="link"
        size="small"
        style={{ padding: 0, height: 'auto' }}
        onClick={() =>
          setDrill({
            metric: 'total',
            label: status ? `${row.userName} · ${status.name}` : row.userName,
            preset: { salesUserId: row.userId },
            initialStatus: status?.code,
          })
        }
      >
        {fmtCount(count)}
      </Button>
    ) : (
      <Text type="secondary">0</Text>
    );

  const columns: ColumnsType<FlatQualityRow> = [
    {
      title: 'Nhân viên (Sales chính)',
      key: 'userName',
      fixed: 'left',
      render: (_, r) => <ReportUserName name={r.userName} departmentName={r.departmentName} departmentColor={r.departmentColor} />,
    },
    {
      title: 'Tổng data',
      dataIndex: 'total',
      key: 'total',
      align: 'right',
      sorter: (a, b) => a.total - b.total,
      render: (v: number, r) => linkCount(v, r),
    },
    ...statuses.map<ColumnsType<FlatQualityRow>[number]>((s) => ({
      title: (
        <span>
          <Tag color={s.color} style={{ marginRight: 4 }}>&nbsp;</Tag>
          {s.name}
        </span>
      ),
      key: s.code,
      align: 'right',
      sorter: (a, b) => (a.byStatus[s.code] || 0) - (b.byStatus[s.code] || 0),
      render: (_: unknown, r) => {
        const count = r.byStatus[s.code] || 0;
        return (
          <span>
            {linkCount(count, r, s)}{' '}
            <Text type="secondary" style={{ fontSize: 12 }}>({percentOf(count, r.total)}%)</Text>
          </span>
        );
      },
    })),
    ...(effectiveHighlight
      ? [
          {
            title: `Tỷ lệ "${highlightMeta?.name ?? effectiveHighlight}"`,
            key: '__highlight',
            width: 160,
            render: (_: unknown, r: FlatQualityRow) => {
              const pct = percentOf(r.byStatus[effectiveHighlight] || 0, r.total);
              return <Progress percent={pct} size="small" strokeColor={progressColor(pct)} />;
            },
            sorter: (a: FlatQualityRow, b: FlatQualityRow) => (a.byStatus[effectiveHighlight] || 0) - (b.byStatus[effectiveHighlight] || 0),
            defaultSortOrder: 'descend' as const,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <Card size="small" styles={{ body: { padding: 16 } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <PeriodSelector value={query} onChange={onQueryChange} resolvedPeriod={data?.period} />
          <Space wrap>
            {statuses.length > 0 && (
              <Space align="center">
                <Text type="secondary">Đánh giá theo trạng thái:</Text>
                <Select
                  style={{ minWidth: 180 }}
                  value={effectiveHighlight}
                  onChange={setHighlightStatus}
                  options={statuses.map((s) => ({
                    value: s.code,
                    label: <Tag color={s.color} style={{ marginInlineEnd: 0 }}>{s.name}</Tag>,
                  }))}
                />
              </Space>
            )}
            <Button icon={<ReloadOutlined />} loading={isFetching && !isLoading} onClick={() => refetch()}>
              Làm mới
            </Button>
          </Space>
        </div>
      </Card>

      {isError && (
        <Alert type="error" showIcon title="Không tải được báo cáo chất lượng data" description={getApiErrorMessage(error, 'Đã có lỗi xảy ra, vui lòng thử lại')} />
      )}

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} md={8} xl={6}>
          <ReportKpiCard
            title={data?.total != null ? 'Tổng data toàn hệ thống' : 'Tổng data của bạn'}
            value={totals.total}
            icon={<SafetyCertificateOutlined />}
            color={REPORT_COLORS.primary}
            loading={isLoading}
            onClick={() => setDrill({ metric: 'total' })}
          />
        </Col>
        {statuses.map((s) => {
          const count = totals.byStatus[s.code] || 0;
          return (
            <Col xs={24} sm={12} md={8} xl={6} key={s.code}>
              <ReportKpiCard
                title={<Tag color={s.color} style={{ marginInlineEnd: 0 }}>{s.name}</Tag>}
                value={count}
                color={hexOrUndefined(s.color)}
                loading={isLoading}
                hint={`${percentOf(count, totals.total)}% tổng data`}
                onClick={() => setDrill({ metric: 'total', label: s.name, initialStatus: s.code })}
              />
            </Col>
          );
        })}
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} md={8}>
          <ReportKpiCard title="Tỷ lệ chốt" value={rates.closeRate ?? 0} suffix="%" icon={<CheckCircleOutlined />} color={REPORT_COLORS.ok} loading={ratesLoading} hint={`${fmtCount(rateTotals.cohortClosedCustomers)} / ${fmtCount(rateTotals.totalCustomers)} data mới trong kỳ đã chốt`} onClick={() => setDrill({ metric: 'cohort_closed' })} />
        </Col>
        <Col xs={24} md={8}>
          <ReportKpiCard title="Tỷ lệ join nhóm" value={rates.joinRate ?? 0} suffix="%" icon={<UsergroupAddOutlined />} color={REPORT_COLORS.gold} loading={ratesLoading} hint={`${fmtCount(rateTotals.cohortJoinedCustomers)} / ${fmtCount(rateTotals.totalCustomers)} data mới trong kỳ đã join nhóm`} onClick={() => setDrill({ metric: 'cohort_joined' })} />
        </Col>
        <Col xs={24} md={8}>
          <ReportKpiCard title="Tỷ lệ nạp tiền" value={rates.depositRate ?? 0} suffix="%" icon={<DollarOutlined />} color={REPORT_COLORS.primary} loading={ratesLoading} hint={`${fmtCount(rateTotals.cohortDepositedCustomers)} / ${fmtCount(rateTotals.totalCustomers)} data mới trong kỳ đã từng nạp`} onClick={() => setDrill({ metric: 'cohort_deposited' })} />
        </Col>
      </Row>

      <ReportSection<FlatQualityRow>
        title="Chất lượng data theo nhân viên"
        description="Data mới trong kỳ chia theo trạng thái HIỆN TẠI của khách. Bấm vào 1 con số để xem danh sách khách."
        rowKey="userId"
        loading={isLoading}
        columns={columns}
        data={rows}
        nameKey="userName"
        series={series}
        stackable
        valueFormatter={fmtCount}
        emptyText={search ? 'Không tìm thấy nhân viên phù hợp' : 'Không có data trong kỳ này'}
        extraFilters={<ReportNameFilter value={search} onChange={setSearch} placeholder="Tìm theo tên nhân viên..." />}
      />

      {drill && <ReportCustomersModal drill={drill} onClose={() => setDrill(null)} query={query} context="customers" />}
    </div>
  );
}
