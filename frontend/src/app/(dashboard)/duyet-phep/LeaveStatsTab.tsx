'use client';

import { useCallback, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Empty, Progress, Row, Segmented, Select, Space, Spin, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ClearOutlined, ReloadOutlined } from '@ant-design/icons';
import {
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
import { useLeaveStats } from '@/lib/hooks/useLeaveStats';
import { useLeaveTypes } from '@/lib/hooks/useLeaveTypes';
import { useDepartments } from '@/lib/hooks/useDepartments';
import type { LeaveDepartmentStat, LeaveDrill, LeaveDrillPreset, LeaveEmployeeStat, LeaveStatsFilters } from '@/lib/types/leave-stats.types';
import type { ReportQuery } from '@/lib/types/reports.types';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { fmtCount, normalizeText } from '@/lib/utils/marketingReport';
import {
  DEPARTMENT_METRIC_LABEL,
  EMPLOYEE_RANK_LABEL,
  LEAVE_STATUS_COLORS,
  LEAVE_STATUS_LABEL,
  WEEKDAY_LABEL,
  bucketLabel,
  departmentSeries,
  filterEmployees,
  fmtDays,
  frequencyUserIds,
  topEmployees,
  typeSlices,
  type DepartmentMetric,
  type EmployeeRankMetric,
} from '@/lib/utils/leaveStats';
import { resolveEntityColor } from '@/lib/utils/entityColor';
import LeaveRequestsMiniModal from './LeaveRequestsMiniModal';
import PeriodSelector from '../reports/PeriodSelector';
import ReportKpiCard, { REPORT_COLORS } from '../reports/ReportKpiCard';
import ReportNameFilter from '../reports/ReportNameFilter';
import { CHART_COLORS } from '../reports/chartColors';

const { Text } = Typography;

const COUNT_DOMAIN: [number, (dataMax: number) => number] = [0, (dataMax) => Math.max(dataMax, 1)];
const PCT_DOMAIN: [number, number] = [0, 100];
const rankHeight = (n: number) => Math.max(200, n * 36 + 40);
const DEFAULT_QUERY = (): ReportQuery => ({ period: 'month', anchor: dayjs().format('YYYY-MM-DD') });

const EMPLOYEE_RANK_OPTIONS = (Object.keys(EMPLOYEE_RANK_LABEL) as EmployeeRankMetric[]).map((m) => ({ value: m, label: EMPLOYEE_RANK_LABEL[m] }));
const DEPARTMENT_METRIC_OPTIONS = (Object.keys(DEPARTMENT_METRIC_LABEL) as DepartmentMetric[]).map((m) => ({ value: m, label: DEPARTMENT_METRIC_LABEL[m] }));

const rateText = (v: number | null) => (v == null ? '—' : `${v}%`);

/** Recharts trả về props của thanh/cung được bấm; dữ liệu gốc nằm ở `.payload` (Pie có thể spread thẳng). */
const payloadOf = <T,>(d: unknown): T => ((d as { payload?: T } | null)?.payload ?? d) as T;

interface Props {
  /** false -> không gọi API (người dùng không có `leave_requests.view`). */
  allowed: boolean;
}

/**
 * Tab "Thống kê" của trang Duyệt phép - ai xin nghỉ nhiều/ít, tỷ lệ xin nghỉ theo phòng ban, loại phép, xu hướng theo
 * ngày/tháng, tỷ lệ duyệt/từ chối/đơn bổ sung. Cùng khuôn với các tab ở trang Báo cáo (PeriodSelector + KPI card + chart).
 * Phạm vi số liệu do BE tự khoanh theo scope `leave_requests.view` (giống tab Lịch sử) - FE không tự lọc theo role.
 *
 * Recharts: luôn `isAnimationActive={false}` (bật animation thì Bar/Pie có thể render rỗng khi mount trong ResponsiveContainer).
 */
export default function LeaveStatsTab({ allowed }: Props) {
  const [query, setQuery] = useState<ReportQuery>(DEFAULT_QUERY);
  const [filters, setFilters] = useState<LeaveStatsFilters>({});
  // Tên nhân viên đang lọc - lưu lúc bấm "Lọc" vì khi đã lọc, dropdown/bảng chỉ còn đúng 1 người.
  const [focusName, setFocusName] = useState<string | null>(null);
  const [rankMetric, setRankMetric] = useState<EmployeeRankMetric>('approvedDays');
  const [deptMetric, setDeptMetric] = useState<DepartmentMetric>('participationRate');
  const [search, setSearch] = useState('');
  // Mini Table đơn nghỉ mở khi bấm Card / cột Chart / số đơn trong bảng.
  const [drill, setDrill] = useState<LeaveDrill | null>(null);
  const openDrill = (title: string, preset?: LeaveDrillPreset, label?: string) => setDrill({ title, preset, label });

  const { leaveTypes } = useLeaveTypes();
  const { departments } = useDepartments();
  const { data, isLoading, isFetching, isError, error, refetch } = useLeaveStats(query, filters, allowed);

  const loading = isLoading;
  const cur = data?.summary;
  const prev = data?.previousSummary;
  const granularity = data?.period.granularity ?? 'day';
  const hasData = (cur?.requests ?? 0) > 0;
  const activeFilters = Number(filters.departmentId != null) + Number(filters.leaveType != null) + Number(filters.requesterId != null);

  const setFilter = (patch: Partial<LeaveStatsFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const clearFilters = () => {
    setFilters({});
    setFocusName(null);
  };
  const focusEmployee = (r: LeaveEmployeeStat) => {
    setFilter({ requesterId: r.userId });
    setFocusName(r.userName);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Loại phép: tên/màu động từ bảng leave_types (không hardcode) ──
  const typeMeta = useMemo(() => new Map(leaveTypes.map((t) => [t.code, t])), [leaveTypes]);
  const typeName = useCallback((code: string) => typeMeta.get(code)?.name ?? code, [typeMeta]);
  const typeColor = useCallback(
    (code: string, i: number) => {
      const c = typeMeta.get(code)?.color;
      return c && c.startsWith('#') ? c : CHART_COLORS[i % CHART_COLORS.length];
    },
    [typeMeta],
  );

  const trendData = useMemo(
    () => (data?.trend ?? []).map((t) => ({ ...t, label: bucketLabel(t.bucket, granularity) })),
    [data?.trend, granularity],
  );
  const statusSlices = useMemo(
    () =>
      cur
        ? (['approved', 'pending', 'rejected'] as const)
            .map((k) => ({ key: k, name: LEAVE_STATUS_LABEL[k], value: cur[k], color: LEAVE_STATUS_COLORS[k] }))
            .filter((s) => s.value > 0)
        : [],
    [cur],
  );
  const typeSliceData = useMemo(() => typeSlices(data?.byType ?? [], typeName, typeColor), [data?.byType, typeName, typeColor]);
  const typeBarData = useMemo(
    () => (data?.byType ?? []).map((t, i) => ({ ...t, name: typeName(t.code), color: typeColor(t.code, i) })),
    [data?.byType, typeName, typeColor],
  );
  const weekdayData = useMemo(() => (data?.byWeekday ?? []).map((w) => ({ weekday: w.weekday, name: WEEKDAY_LABEL[w.weekday], requests: w.requests })), [data?.byWeekday]);
  const frequencyData = useMemo(() => (data?.frequency ?? []).map((f) => ({ key: f.key, name: f.label, employees: f.employees })), [data?.frequency]);
  const frequencyHasData = frequencyData.some((f) => f.employees > 0);

  const drillSlice = (kind: string, slice: { key?: 'approved' | 'pending' | 'rejected'; code?: string; name: string }) => {
    if (kind === 'status' && slice.key) openDrill(`Đơn nghỉ ${slice.name.toLowerCase()}`, { status: slice.key });
    else if (slice.code) openDrill('Đơn nghỉ theo loại phép', { leaveType: slice.code }, slice.name);
  };

  const drillDept = (row: LeaveDepartmentStat) => {
    if (row.departmentId == null) return; // nhóm "không có phòng ban" không lọc được theo id
    openDrill('Đơn nghỉ theo phòng ban', { departmentId: row.departmentId }, row.departmentName);
  };
  const drillEmployee = (row: LeaveEmployeeStat, approvedOnly = false) =>
    openDrill(approvedOnly ? 'Đơn nghỉ đã duyệt' : 'Đơn nghỉ', { requesterIds: [row.userId], ...(approvedOnly ? { status: 'approved' as const } : {}) }, row.userName);

  const drillFrequency = (bucket: { key: string; name: string }) => {
    const ids = frequencyUserIds(bucket.key, data?.byEmployee ?? []);
    if (ids.length === 0) return; // cột "Không xin nghỉ" không có đơn để xem
    openDrill('Đơn nghỉ theo tần suất xin nghỉ', { requesterIds: ids }, bucket.name);
  };

  const drillTrend = (status: 'approved' | 'pending' | 'rejected', pt: { bucket: string; label: string }) =>
    openDrill(`Đơn nghỉ ${LEAVE_STATUS_LABEL[status].toLowerCase()}`, { bucket: pt.bucket, status }, `${granularity === 'month' ? 'Tháng' : 'Ngày'} ${pt.label}`);

  const rank = useMemo(() => topEmployees(data?.byEmployee ?? [], rankMetric, 10), [data?.byEmployee, rankMetric]);
  const deptChart = useMemo(() => departmentSeries(data?.byDepartment ?? [], deptMetric, 10), [data?.byDepartment, deptMetric]);
  const deptIsRate = deptMetric === 'participationRate';
  const deptFmt = (v: number) => (deptIsRate ? `${v}%` : deptMetric === 'requests' ? fmtCount(v) : fmtDays(v));
  const employeeRows = useMemo(() => filterEmployees(data?.byEmployee ?? [], search, normalizeText), [data?.byEmployee, search]);

  // ── Bảng phòng ban ──
  const deptColumns: ColumnsType<LeaveDepartmentStat> = [
    {
      title: 'Phòng ban',
      key: 'dept',
      fixed: 'left',
      width: 180,
      sorter: (a, b) => a.departmentName.localeCompare(b.departmentName, 'vi'),
      render: (_, r) => {
        const color = departments.find((d) => d.id === r.departmentId)?.color;
        return <Tag color={resolveEntityColor(color)} style={{ marginInlineEnd: 0 }}>{r.departmentName}</Tag>;
      },
    },
    { title: 'Nhân sự', dataIndex: 'headcount', key: 'headcount', align: 'right', width: 90, sorter: (a, b) => a.headcount - b.headcount, render: fmtCount },
    { title: 'Số đơn', dataIndex: 'requests', key: 'requests', align: 'right', width: 90, sorter: (a, b) => a.requests - b.requests, render: (v: number, r) => (v > 0 && r.departmentId != null ? <Button type="link" size="small" style={{ padding: 0 }} onClick={() => drillDept(r)}>{fmtCount(v)}</Button> : fmtCount(v)) },
    {
      title: <Tooltip title="Số nhân sự khác nhau có xin nghỉ trong kỳ.">Người xin nghỉ</Tooltip>,
      dataIndex: 'employees',
      key: 'employees',
      align: 'right',
      width: 120,
      sorter: (a, b) => a.employees - b.employees,
      render: fmtCount,
    },
    {
      title: <Tooltip title="Tổng ngày của các đơn ĐÃ DUYỆT.">Ngày nghỉ đã duyệt</Tooltip>,
      dataIndex: 'approvedDays',
      key: 'approvedDays',
      align: 'right',
      width: 140,
      sorter: (a, b) => a.approvedDays - b.approvedDays,
      defaultSortOrder: 'descend',
      render: (v: number) => <Text strong>{fmtDays(v)}</Text>,
    },
    {
      title: <Tooltip title="Người xin nghỉ / nhân sự đang hoạt động của phòng ban (quân số hiện tại).">Tỷ lệ xin nghỉ</Tooltip>,
      key: 'participation',
      width: 190,
      sorter: (a, b) => (a.participationRate ?? -1) - (b.participationRate ?? -1),
      render: (_, r) =>
        r.participationRate == null ? (
          <Text type="secondary">—</Text>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Progress percent={r.participationRate} size="small" showInfo={false} strokeColor={REPORT_COLORS.primary} style={{ width: 90, margin: 0 }} />
            <span>
              <Text strong>{r.participationRate}%</Text>
              <Text type="secondary" style={{ fontSize: 11 }}> · {r.employees}/{r.headcount}</Text>
            </span>
          </div>
        ),
    },
    {
      title: <Tooltip title="Ngày nghỉ đã duyệt / nhân sự của phòng ban.">Ngày nghỉ TB / người</Tooltip>,
      dataIndex: 'avgApprovedDaysPerHead',
      key: 'avg',
      align: 'right',
      width: 150,
      sorter: (a, b) => (a.avgApprovedDaysPerHead ?? -1) - (b.avgApprovedDaysPerHead ?? -1),
      render: (v: number | null) => fmtDays(v),
    },
  ];

  // ── Bảng nhân viên ──
  const employeeColumns: ColumnsType<LeaveEmployeeStat> = [
    {
      title: 'Nhân viên',
      key: 'name',
      fixed: 'left',
      width: 220,
      sorter: (a, b) => a.userName.localeCompare(b.userName, 'vi'),
      render: (_, r) => {
        const color = departments.find((d) => d.name === r.departmentName)?.color;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
            <Text strong>{r.userName}</Text>
            {r.departmentName && <Tag color={resolveEntityColor(color)} style={{ marginInlineEnd: 0, fontSize: 11, lineHeight: '18px' }}>{r.departmentName}</Tag>}
          </div>
        );
      },
    },
    { title: 'Số đơn', dataIndex: 'requests', key: 'requests', align: 'right', width: 90, sorter: (a, b) => a.requests - b.requests, render: (v: number, r) => (v > 0 ? <Button type="link" size="small" style={{ padding: 0 }} onClick={() => drillEmployee(r)}>{fmtCount(v)}</Button> : fmtCount(v)) },
    { title: 'Ngày xin', dataIndex: 'requestedDays', key: 'requestedDays', align: 'right', width: 100, sorter: (a, b) => a.requestedDays - b.requestedDays, render: (v: number) => fmtDays(v) },
    {
      title: <Tooltip title="Tổng ngày của các đơn ĐÃ DUYỆT.">Ngày đã duyệt</Tooltip>,
      dataIndex: 'approvedDays',
      key: 'approvedDays',
      align: 'right',
      width: 120,
      sorter: (a, b) => a.approvedDays - b.approvedDays,
      defaultSortOrder: 'descend',
      render: (v: number) => <Text strong>{fmtDays(v)}</Text>,
    },
    {
      title: 'Kết quả',
      key: 'result',
      width: 230,
      render: (_, r) => (
        <Space size={4} wrap>
          <Tag color="success" style={{ marginInlineEnd: 0 }}>{r.approved} duyệt</Tag>
          <Tag color="error" style={{ marginInlineEnd: 0 }}>{r.rejected} từ chối</Tag>
          <Tag color="processing" style={{ marginInlineEnd: 0 }}>{r.pending} chờ</Tag>
        </Space>
      ),
    },
    {
      title: <Tooltip title="Số đơn tạo bù (ngày nghỉ sớm hơn ngày tạo đơn).">Đơn bổ sung</Tooltip>,
      dataIndex: 'supplementary',
      key: 'supplementary',
      align: 'right',
      width: 110,
      sorter: (a, b) => a.supplementary - b.supplementary,
      render: (v: number) => (v > 0 ? <Text style={{ color: REPORT_COLORS.warning }}>{v}</Text> : <Text type="secondary">0</Text>),
    },
    {
      title: <Tooltip title="Đơn được duyệt / đơn đã có kết quả (bỏ đơn đang chờ).">Tỷ lệ duyệt</Tooltip>,
      dataIndex: 'approvalRate',
      key: 'approvalRate',
      align: 'right',
      width: 110,
      sorter: (a, b) => (a.approvalRate ?? -1) - (b.approvalRate ?? -1),
      render: rateText,
    },
    {
      title: '',
      key: 'act',
      width: 80,
      fixed: 'right',
      render: (_, r) =>
        r.userId === filters.requesterId ? (
          <Text type="secondary" style={{ fontSize: 12 }}>Đang xem</Text>
        ) : (
          <Button type="link" size="small" onClick={() => focusEmployee(r)}>Lọc</Button>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* ── Bộ lọc ── */}
      <Card size="small" styles={{ body: { padding: 16 } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <PeriodSelector value={query} onChange={setQuery} resolvedPeriod={data?.period} />
          <Space>
            {activeFilters > 0 && <Button icon={<ClearOutlined />} onClick={clearFilters}>Xoá lọc ({activeFilters})</Button>}
            <Button icon={<ReloadOutlined />} loading={isFetching && !isLoading} onClick={() => refetch()}>Làm mới</Button>
          </Space>
        </div>
        <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
          <Col xs={24} sm={12} xl={8}>
            <div className="mb-1"><Text strong>Phòng ban</Text></div>
            <Select<number>
              allowClear
              showSearch={{ optionFilterProp: 'label' }}
              style={{ width: '100%' }}
              placeholder="Tất cả phòng ban"
              value={filters.departmentId}
              onChange={(v) => setFilter({ departmentId: v })}
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
            />
          </Col>
          <Col xs={24} sm={12} xl={8}>
            <div className="mb-1"><Text strong>Loại phép</Text></div>
            <Select<string>
              allowClear
              style={{ width: '100%' }}
              placeholder="Tất cả loại phép"
              value={filters.leaveType}
              onChange={(v) => setFilter({ leaveType: v })}
              options={leaveTypes.map((t) => ({ value: t.code, label: <Tag color={t.color} style={{ marginInlineEnd: 0 }}>{t.name}</Tag> }))}
            />
          </Col>
          {filters.requesterId != null && (
            <Col xs={24} sm={12} xl={8}>
              <div className="mb-1"><Text strong>Nhân viên</Text></div>
              <Tag closable color="blue" onClose={() => { setFilter({ requesterId: undefined }); setFocusName(null); }} style={{ fontSize: 13, padding: '3px 8px' }}>
                {focusName ?? data?.byEmployee[0]?.userName ?? `#${filters.requesterId}`}
              </Tag>
            </Col>
          )}
        </Row>
      </Card>

      {isError && <Alert type="error" showIcon title="Không tải được thống kê nghỉ phép" description={getApiErrorMessage(error, 'Đã có lỗi xảy ra, vui lòng thử lại')} />}

      <Spin spinning={isFetching && !isLoading}>
        <div className="space-y-4">
          {/* ── KPI ── */}
          <Row gutter={[12, 12]}>
            <Col xs={24} md={12} xl={6}>
              <ReportKpiCard onClick={() => openDrill('Đơn nghỉ trong kỳ')} title="Tổng đơn nghỉ" value={cur?.requests ?? 0} previous={prev?.requests} color={REPORT_COLORS.primary} loading={loading}
                hint={cur ? `${fmtCount(cur.approved)} duyệt · ${fmtCount(cur.rejected)} từ chối · ${fmtCount(cur.pending)} chờ` : undefined} />
            </Col>
            <Col xs={24} md={12} xl={6}>
              <ReportKpiCard onClick={() => openDrill('Đơn nghỉ đã duyệt trong kỳ', { status: 'approved' })} title={<Tooltip title="Tổng ngày của các đơn ĐÃ DUYỆT trong kỳ (đơn vắt qua 2 kỳ được tính trọn ở cả 2 kỳ).">Ngày nghỉ đã duyệt</Tooltip>}
                value={cur?.approvedDays ?? 0} previous={prev?.approvedDays} color={REPORT_COLORS.ok} loading={loading}
                hint={cur ? `Tổng ngày xin (mọi trạng thái): ${fmtDays(cur.requestedDays)}` : undefined} />
            </Col>
            <Col xs={24} md={12} xl={6}>
              <ReportKpiCard onClick={() => openDrill('Đơn nghỉ của nhân sự xin nghỉ')} title="Nhân sự xin nghỉ" value={cur?.employees ?? 0} previous={prev?.employees} color={REPORT_COLORS.gold} loading={loading}
                hint={data ? `Trên ${fmtCount(data.headcount)} nhân sự đang hoạt động` : undefined} />
            </Col>
            <Col xs={24} md={12} xl={6}>
              <ReportKpiCard onClick={() => openDrill('Đơn nghỉ của nhân sự xin nghỉ')} title={<Tooltip title="Nhân sự có xin nghỉ / nhân sự đang hoạt động trong phạm vi bạn xem. Quân số là số hiện tại (không lưu lịch sử).">Tỷ lệ xin nghỉ</Tooltip>}
                value={cur?.participationRate ?? 0} suffix="%" color={REPORT_COLORS.primary} loading={loading}
                hint={cur?.participationRate == null ? 'Chưa có quân số' : `${fmtCount(cur.employees)} / ${fmtCount(data?.headcount ?? 0)} người`} />
            </Col>
            <Col xs={24} md={12} xl={6}>
              <ReportKpiCard onClick={() => openDrill('Đơn nghỉ đã duyệt trong kỳ', { status: 'approved' })} title={<Tooltip title="Ngày nghỉ đã duyệt / nhân sự đang hoạt động.">Ngày nghỉ TB / người</Tooltip>}
                value={cur?.avgApprovedDaysPerHead ?? 0} previous={prev?.avgApprovedDaysPerHead ?? undefined} color={REPORT_COLORS.primary} loading={loading}
                hint={cur?.avgApprovedDaysPerHead == null ? 'Chưa có quân số' : undefined} />
            </Col>
            <Col xs={24} md={12} xl={6}>
              <ReportKpiCard onClick={() => openDrill('Đơn nghỉ đã duyệt trong kỳ', { status: 'approved' })} title={<Tooltip title="Đơn được duyệt / đơn đã có kết quả (bỏ đơn đang chờ). Màu: < 40% đỏ, 40–80% vàng, > 80% xanh.">Tỷ lệ duyệt</Tooltip>}
                value={cur?.approvalRate ?? 0} suffix="%" rateColored={cur?.approvalRate != null} color={REPORT_COLORS.muted} loading={loading}
                hint={cur?.approvalRate == null ? 'Chưa có đơn nào được xử lý' : `${fmtCount(cur.approved)} / ${fmtCount(cur.approved + cur.rejected)} đơn đã xử lý`} />
            </Col>
            <Col xs={24} md={12} xl={6}>
              <ReportKpiCard onClick={() => openDrill('Đơn nghỉ bị từ chối trong kỳ', { status: 'rejected' })} title="Tỷ lệ từ chối" value={cur?.rejectionRate ?? 0} suffix="%" color={REPORT_COLORS.danger} loading={loading}
                hint={cur?.rejectionRate == null ? 'Chưa có đơn nào được xử lý' : `${fmtCount(cur.rejected)} đơn bị từ chối`} />
            </Col>
            <Col xs={24} md={12} xl={6}>
              <ReportKpiCard onClick={() => openDrill('Đơn bổ sung trong kỳ', { quick: 'supplementary' })} title={<Tooltip title="Đơn tạo bù: ngày nghỉ sớm hơn ngày tạo đơn (quên tạo trước).">Đơn bổ sung</Tooltip>}
                value={cur?.supplementaryRate ?? 0} suffix="%" color={REPORT_COLORS.warning} loading={loading}
                hint={cur ? `${fmtCount(cur.supplementary)} / ${fmtCount(cur.requests)} đơn` : undefined} />
            </Col>
          </Row>

          {/* ── Xu hướng + Trạng thái ── */}
          <Row gutter={[12, 12]}>
            <Col xs={24} xl={14}>
              <Card size="small" loading={loading} title={`Đơn nghỉ & ngày nghỉ theo ${granularity === 'month' ? 'tháng' : 'ngày'}`}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Cột = số đơn theo trạng thái (trục trái); đường = ngày nghỉ đã duyệt (trục phải). Tính theo ngày bắt đầu nghỉ (đơn bắt đầu trước kỳ được tính vào ngày đầu kỳ).
                </Text>
                {!hasData ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có đơn nghỉ trong kỳ với bộ lọc này" />
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={trendData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" minTickGap={24} />
                      <YAxis yAxisId="cnt" allowDecimals={false} domain={COUNT_DOMAIN} tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="days" orientation="right" allowDecimals tick={{ fontSize: 12 }} />
                      <ChartTooltip formatter={(v, n) => (n === 'Ngày nghỉ đã duyệt' ? fmtDays(Number(v)) : fmtCount(Number(v)))} labelFormatter={(l) => `${granularity === 'month' ? 'Tháng' : 'Ngày'} ${l}`} />
                      <Legend />
                      <Bar yAxisId="cnt" dataKey="approved" cursor="pointer" onClick={(d) => drillTrend('approved', payloadOf<{ bucket: string; label: string }>(d))} name={LEAVE_STATUS_LABEL.approved} stackId="st" fill={LEAVE_STATUS_COLORS.approved} maxBarSize={26} isAnimationActive={false} />
                      <Bar yAxisId="cnt" dataKey="pending" cursor="pointer" onClick={(d) => drillTrend('pending', payloadOf<{ bucket: string; label: string }>(d))} name={LEAVE_STATUS_LABEL.pending} stackId="st" fill={LEAVE_STATUS_COLORS.pending} maxBarSize={26} isAnimationActive={false} />
                      <Bar yAxisId="cnt" dataKey="rejected" cursor="pointer" onClick={(d) => drillTrend('rejected', payloadOf<{ bucket: string; label: string }>(d))} name={LEAVE_STATUS_LABEL.rejected} stackId="st" fill={LEAVE_STATUS_COLORS.rejected} maxBarSize={26} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                      <Line yAxisId="days" type="monotone" dataKey="approvedDays" name="Ngày nghỉ đã duyệt" stroke={REPORT_COLORS.gold} strokeWidth={2} dot={trendData.length <= 31} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Col>
            <Col xs={24} xl={10}>
              <Card size="small" loading={loading} title="Cơ cấu theo trạng thái & loại phép">
                <Text type="secondary" style={{ fontSize: 12 }}>Trái: trạng thái đơn. Phải: loại phép (theo số đơn).</Text>
                {!hasData ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có số liệu" />
                ) : (
                  <Row gutter={8}>
                    {[
                      { id: 'status', data: statusSlices },
                      { id: 'type', data: typeSliceData },
                    ].map((chart) => (
                      <Col span={12} key={chart.id}>
                        <ResponsiveContainer width="100%" height={260}>
                          <PieChart>
                            <Pie data={chart.data} dataKey="value" nameKey="name" cursor="pointer" onClick={(d) => drillSlice(chart.id, payloadOf<{ key?: 'approved' | 'pending' | 'rejected'; code?: string; name: string }>(d))} innerRadius="50%" outerRadius="80%" paddingAngle={2} isAnimationActive={false}>
                              {chart.data.map((s, i) => <Cell key={`${chart.id}-${i}`} fill={s.color} />)}
                            </Pie>
                            <ChartTooltip formatter={(v, n) => [`${fmtCount(Number(v))} đơn`, n]} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </Col>
                    ))}
                  </Row>
                )}
              </Card>
            </Col>
          </Row>

          {/* ── Phòng ban + Top nhân viên ── */}
          <Row gutter={[12, 12]}>
            <Col xs={24} xl={12}>
              <Card size="small" loading={loading} title={`Phòng ban — ${DEPARTMENT_METRIC_LABEL[deptMetric]}`}
                extra={<Segmented<DepartmentMetric> size="small" value={deptMetric} onChange={setDeptMetric} options={DEPARTMENT_METRIC_OPTIONS} />}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {deptIsRate ? 'Người xin nghỉ / nhân sự của phòng ban (quân số hiện tại). Tối đa 10 phòng ban.' : 'Tối đa 10 phòng ban.'}
                </Text>
                {deptChart.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có số liệu" />
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(rankHeight(deptChart.length), 260)}>
                    <BarChart data={deptChart} layout="vertical" margin={{ top: 8, right: 60, left: 8, bottom: 0 }} maxBarSize={22}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={!deptIsRate && deptMetric !== 'requests'} domain={deptIsRate ? PCT_DOMAIN : undefined} tickFormatter={deptFmt} tick={{ fontSize: 12 }} />
                      <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
                      <ChartTooltip formatter={(v) => [deptFmt(Number(v)), DEPARTMENT_METRIC_LABEL[deptMetric]]} />
                      <Bar dataKey="value" name={DEPARTMENT_METRIC_LABEL[deptMetric]} cursor="pointer" onClick={(d) => drillDept(payloadOf<{ row: LeaveDepartmentStat }>(d).row)} fill={REPORT_COLORS.primary} radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 12, formatter: (v: unknown) => deptFmt(Number(v)) }} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Col>
            <Col xs={24} xl={12}>
              <Card size="small" loading={loading} title={`Top nhân viên — ${EMPLOYEE_RANK_LABEL[rankMetric]}`}
                extra={<Segmented<EmployeeRankMetric> size="small" value={rankMetric} onChange={setRankMetric} options={EMPLOYEE_RANK_OPTIONS} />}>
                <Text type="secondary" style={{ fontSize: 12 }}>10 nhân viên xin nghỉ nhiều nhất trong kỳ, bỏ người bằng 0.</Text>
                {rank.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có số liệu" />
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(rankHeight(rank.length), 260)}>
                    <BarChart data={rank} layout="vertical" margin={{ top: 8, right: 60, left: 8, bottom: 0 }} maxBarSize={22}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={rankMetric === 'approvedDays'} tickFormatter={(v) => fmtDays(Number(v))} tick={{ fontSize: 12 }} />
                      <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
                      <ChartTooltip formatter={(v) => [rankMetric === 'approvedDays' ? `${fmtDays(Number(v))} ngày` : `${fmtCount(Number(v))} đơn`, EMPLOYEE_RANK_LABEL[rankMetric]]} />
                      <Bar dataKey="value" name={EMPLOYEE_RANK_LABEL[rankMetric]} cursor="pointer" onClick={(d) => drillEmployee(payloadOf<{ row: LeaveEmployeeStat }>(d).row, rankMetric === 'approvedDays')} fill={REPORT_COLORS.gold} radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 12, formatter: (v: unknown) => fmtDays(Number(v)) }} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Col>
          </Row>

          {/* ── Loại phép + Ngày trong tuần + Tần suất ── */}
          <Row gutter={[12, 12]}>
            <Col xs={24} xl={8}>
              <Card size="small" loading={loading} title="Theo loại phép">
                <Text type="secondary" style={{ fontSize: 12 }}>Số đơn và ngày nghỉ đã duyệt của từng loại phép.</Text>
                {typeBarData.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có số liệu" />
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(rankHeight(typeBarData.length), 240)}>
                    <BarChart data={typeBarData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                      <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                      <ChartTooltip formatter={(v, n) => (n === 'Ngày đã duyệt' ? `${fmtDays(Number(v))} ngày` : `${fmtCount(Number(v))} đơn`)} />
                      <Legend />
                      <Bar dataKey="requests" name="Số đơn" fill={REPORT_COLORS.primary} maxBarSize={14} cursor="pointer" onClick={(d) => { const t = payloadOf<{ code: string; name: string }>(d); openDrill('Đơn nghỉ theo loại phép', { leaveType: t.code }, t.name); }} isAnimationActive={false} />
                      <Bar dataKey="approvedDays" name="Ngày đã duyệt" fill={REPORT_COLORS.ok} maxBarSize={14} cursor="pointer" onClick={(d) => { const t = payloadOf<{ code: string; name: string }>(d); openDrill('Đơn nghỉ đã duyệt theo loại phép', { leaveType: t.code, status: 'approved' }, t.name); }} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Col>
            <Col xs={24} xl={8}>
              <Card size="small" loading={loading} title="Ngày trong tuần bắt đầu nghỉ">
                <Text type="secondary" style={{ fontSize: 12 }}>Số đơn theo thứ của ngày bắt đầu nghỉ - thấy được thói quen nghỉ đầu/cuối tuần.</Text>
                {!hasData ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có số liệu" />
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={weekdayData} margin={{ top: 16, right: 12, left: 0, bottom: 0 }} maxBarSize={30}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <ChartTooltip formatter={(v) => [`${fmtCount(Number(v))} đơn`, 'Số đơn']} />
                      <Bar dataKey="requests" name="Số đơn" fill={REPORT_COLORS.primary} radius={[4, 4, 0, 0]} cursor="pointer" onClick={(d) => { const w = payloadOf<{ weekday: number; name: string }>(d); openDrill('Đơn nghỉ theo ngày trong tuần', { weekday: w.weekday }, w.name); }} label={{ position: 'top', fontSize: 12 }} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Col>
            <Col xs={24} xl={8}>
              <Card size="small" loading={loading} title="Tần suất xin nghỉ của nhân sự">
                <Text type="secondary" style={{ fontSize: 12 }}>Bao nhiêu người xin nghỉ 0, 1, 2... đơn trong kỳ (tính trên toàn bộ nhân sự trong phạm vi).</Text>
                {!frequencyHasData ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có số liệu" />
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={frequencyData} margin={{ top: 16, right: 12, left: 0, bottom: 0 }} maxBarSize={36}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <ChartTooltip formatter={(v) => [`${fmtCount(Number(v))} người`, 'Nhân sự']} />
                      <Bar dataKey="employees" name="Nhân sự" fill={REPORT_COLORS.gold} radius={[4, 4, 0, 0]} cursor="pointer" onClick={(d) => drillFrequency(payloadOf<{ key: string; name: string }>(d))} label={{ position: 'top', fontSize: 12 }} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Col>
          </Row>

          {/* ── Bảng phòng ban ── */}
          <Card size="small" title={`Chi tiết theo phòng ban (${data?.byDepartment.length ?? 0})`} styles={{ body: { padding: 16 } }}>
            <Table<LeaveDepartmentStat>
              rowKey={(r) => String(r.departmentId ?? 'none')}
              size="small"
              loading={loading}
              columns={deptColumns}
              dataSource={data?.byDepartment ?? []}
              scroll={{ x: 960 }}
              pagination={{ pageSize: 10, hideOnSinglePage: true, showTotal: (t) => `${t} phòng ban` }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có phòng ban nào trong phạm vi" /> }}
            />
          </Card>

          {/* ── Bảng nhân viên ── */}
          <Card size="small" title={`Xếp hạng nhân viên xin nghỉ (${employeeRows.length}${employeeRows.length !== (data?.byEmployee.length ?? 0) ? `/${data?.byEmployee.length ?? 0}` : ''})`} styles={{ body: { padding: 16 } }}>
            <div style={{ marginBottom: 12 }}>
              <ReportNameFilter value={search} onChange={setSearch} placeholder="Tìm nhân viên / phòng ban..." />
            </div>
            <Table<LeaveEmployeeStat>
              rowKey="userId"
              size="small"
              loading={loading}
              columns={employeeColumns}
              dataSource={employeeRows}
              scroll={{ x: 1000 }}
              pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `${t} nhân viên` }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có nhân viên nào xin nghỉ trong kỳ" /> }}
              rowClassName={(r) => (r.userId === filters.requesterId ? 'ant-table-row-selected' : '')}
            />
            {data && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Kỳ: {dayjs(data.period.from).format('DD/MM/YYYY')} → {dayjs(data.period.to).format('DD/MM/YYYY')}. Không tính đơn trong Thùng rác. Đơn thuộc kỳ khi khoảng nghỉ giao với kỳ; số ngày của đơn được tính trọn.
                Tỷ lệ xin nghỉ dùng quân số hiện tại (tài khoản đang hoạt động, đã được duyệt) trong phạm vi bạn được xem.
              </Text>
            )}
          </Card>
        </div>
      </Spin>
      <LeaveRequestsMiniModal drill={drill} onClose={() => setDrill(null)} query={query} baseFilters={filters} allowed={allowed} />
    </div>
  );
}
