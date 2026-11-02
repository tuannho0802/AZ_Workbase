'use client';

import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, App, Button, Col, Empty, Modal, Radio, Row, Skeleton, Space, Table, Tabs, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeftOutlined, DownloadOutlined } from '@ant-design/icons';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { leaveExportApi } from '@/lib/api/leave-export.api';
import type {
  LeaveExportChart,
  LeaveExportForm,
  LeaveExportModel,
  LeaveExportSheet,
  LeaveExportTable,
} from '@/lib/types/leave-export.types';
import type { LeaveStatsFilters } from '@/lib/types/leave-stats.types';
import type { ReportQuery } from '@/lib/types/reports.types';
import { getApiErrorMessage, hasGlobalErrorToast } from '@/lib/utils/error-message.util';
import {
  LEAVE_EXPORT_FORM_OPTIONS,
  buildLeaveExportRequest,
  chartRows,
  formatExportCell,
  hexColor,
  ymdToDmy,
} from '@/lib/utils/leaveExport';

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
  /** Kỳ + bộ lọc ĐANG chọn ở tab Thống kê - export dùng đúng kỳ/bộ lọc này. */
  query: ReportQuery;
  filters: LeaveStatsFilters;
}

type Row = Record<string, string | number | null> & { __key: number };

function PreviewTable({ table }: { table: LeaveExportTable }) {
  const columns: ColumnsType<Row> = table.columns.map((c) => ({
    title: c.header,
    dataIndex: c.key,
    key: c.key,
    align: c.type === 'number' ? 'right' : c.type === 'date' ? 'center' : 'left',
    width: Math.max(80, Math.round((c.width ?? 12) * 8)),
    ellipsis: c.type === 'text',
    render: (v: string | number | null) => formatExportCell(v, c),
  }));
  const data: Row[] = table.rows.map((r, i) => ({
    __key: i,
    ...Object.fromEntries(table.columns.map((c, ci) => [c.key, r[ci]])),
  }));
  const hidden = table.totalRows - table.rows.length;

  return (
    <div style={{ marginBottom: 16 }}>
      <Text strong>{table.title}</Text>
      <Text type="secondary" style={{ marginLeft: 8 }}>({table.totalRows} dòng)</Text>
      <Table<Row>
        size="small"
        style={{ marginTop: 8 }}
        rowKey="__key"
        columns={columns}
        dataSource={data}
        pagination={false}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có dữ liệu" /> }}
        summary={
          table.totalsRow && table.rows.length > 0
            ? () => (
                <Table.Summary.Row>
                  {table.columns.map((c, i) => (
                    <Table.Summary.Cell key={c.key} index={i} align={c.type === 'number' ? 'right' : 'left'}>
                      <Text strong>{formatExportCell(table.totalsRow?.[i], c)}</Text>
                    </Table.Summary.Cell>
                  ))}
                </Table.Summary.Row>
              )
            : undefined
        }
      />
      {hidden > 0 && (
        <Text type="secondary" style={{ display: 'block', marginTop: 6 }}>
          Bản xem trước chỉ hiện {table.rows.length} dòng đầu - còn {hidden} dòng nữa sẽ có trong file Excel.
        </Text>
      )}
      {table.note && <Text type="warning" style={{ display: 'block', marginTop: 6 }}>{table.note}</Text>}
    </div>
  );
}

/**
 * Demo của 1 chart: vẽ đúng loại/series/màu mà file Excel sẽ có (cùng `ExportChartModel`).
 * `isAnimationActive={false}`: bật animation thì Bar/Pie có thể render rỗng khi mount trong ResponsiveContainer.
 */
function PreviewChart({ chart }: { chart: LeaveExportChart }) {
  const data = chartRows(chart);
  return (
    <div data-testid={`preview-chart-${chart.id}`} style={{ marginBottom: 16 }}>
      <Text strong>{chart.title}</Text>
      <ResponsiveContainer width="100%" height={260}>
        {chart.type === 'doughnut' ? (
          <PieChart>
            <Pie
              data={data.map((d) => ({ name: String(d.name), value: Number(d[chart.series[0]?.key]) || 0 }))}
              dataKey="value"
              nameKey="name"
              innerRadius="50%"
              outerRadius="80%"
              paddingAngle={2}
              isAnimationActive={false}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={hexColor(chart.pointColors?.[i] ?? chart.series[0]?.color ?? '1677FF')} />
              ))}
            </Pie>
            <ChartTooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        ) : chart.type === 'line' ? (
          <LineChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} interval="preserveStartEnd" minTickGap={24} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <ChartTooltip />
            <Legend />
            {chart.series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={hexColor(s.color)}
                strokeWidth={2}
                dot={chart.categories.length <= 31}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <ChartTooltip />
            <Legend />
            {chart.series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} stackId="st" fill={hexColor(s.color)} maxBarSize={32} isAnimationActive={false} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function SheetPreview({ sheet }: { sheet: LeaveExportSheet }) {
  return (
    <>
      {sheet.charts.length > 0 && (
        <>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            Trong file Excel các biểu đồ nằm bên phải bảng và là biểu đồ gốc - sửa số trong ô thì biểu đồ đổi theo.
          </Text>
          <Row gutter={16}>
            {sheet.charts.map((c) => (
              <Col key={c.id} xs={24} lg={c.type === 'doughnut' ? 10 : 14}>
                <PreviewChart chart={c} />
              </Col>
            ))}
          </Row>
        </>
      )}
      {sheet.tables.map((t) => (
        <PreviewTable key={t.id} table={t} />
      ))}
    </>
  );
}

function PreviewBody({ model }: { model: LeaveExportModel }) {
  const sheetViews = model.sheets.map((s) => ({
    key: s.name,
    label: s.name,
    children: <SheetPreview sheet={s} />,
  }));
  return (
    <>
      <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        Kỳ báo cáo: {ymdToDmy(model.period.from)} - {ymdToDmy(model.period.to)} · File Excel có {model.sheets.length} sheet
      </Text>
      {model.isEmpty && model.notice && <Alert type="warning" showIcon title={model.notice} style={{ marginBottom: 12 }} />}
      {sheetViews.length > 1 ? <Tabs items={sheetViews} size="small" /> : sheetViews[0]?.children}
    </>
  );
}

/**
 * Xuất Excel thống kê nghỉ phép - 2 bước: (1) chọn form A-F -> (2) Demo (đọc cùng `ExportModel` mà file Excel sẽ ghi,
 * nên xem gì xuất nấy) -> bấm "Xuất Excel" mới tải file. Chặn bấm đúp bằng ref (state async không kịp chặn click thứ 2).
 */
export default function LeaveExportModal({ open, onClose, query, filters }: Props) {
  const { message } = App.useApp();
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<LeaveExportForm>('A');
  const [exporting, setExporting] = useState(false);
  const busy = useRef(false);

  const body = useMemo(() => buildLeaveExportRequest(form, query, filters), [form, query, filters]);

  const preview = useQuery({
    queryKey: ['leave-requests', 'export-preview', body],
    queryFn: () => leaveExportApi.preview(body),
    enabled: open && step === 2,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  const handleClose = () => {
    if (busy.current) return;
    setStep(1);
    onClose();
  };

  const handleExport = async () => {
    if (busy.current) return;
    busy.current = true;
    setExporting(true);
    try {
      const filename = await leaveExportApi.exportExcel(body);
      message.success(`Đã xuất ${filename}`);
    } catch (err) {
      // Interceptor axios đã toast mọi lỗi có response (trừ 401) - chỉ toast thêm khi là lỗi mạng.
      if (!hasGlobalErrorToast(err)) message.error(getApiErrorMessage(err, 'Không thể xuất Excel'));
    } finally {
      busy.current = false;
      setExporting(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      destroyOnHidden
      width={step === 1 ? 640 : 1100}
      title={step === 1 ? 'Xuất Excel thống kê nghỉ phép' : `Xem trước: ${LEAVE_EXPORT_FORM_OPTIONS.find((o) => o.value === form)?.title ?? ''}`}
      mask={{ closable: !exporting }}
      footer={
        step === 1 ? (
          <Space>
            <Button onClick={handleClose}>Đóng</Button>
            <Button type="primary" onClick={() => setStep(2)}>Xem trước</Button>
          </Space>
        ) : (
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => setStep(1)} disabled={exporting}>Quay lại chọn form</Button>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              loading={exporting}
              disabled={exporting || preview.isLoading || preview.isError}
              onClick={handleExport}
            >
              Xuất Excel
            </Button>
          </Space>
        )
      }
    >
      {step === 1 ? (
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          <Text type="secondary">Số liệu theo đúng kỳ và bộ lọc đang chọn ở tab Thống kê.</Text>
          <Radio.Group value={form} onChange={(e) => setForm(e.target.value as LeaveExportForm)} style={{ width: '100%' }}>
            <Space orientation="vertical" size={8} style={{ width: '100%' }}>
              {LEAVE_EXPORT_FORM_OPTIONS.map((o) => (
                <Radio key={o.value} value={o.value} style={{ width: '100%', alignItems: 'flex-start' }}>
                  <div>
                    <Text strong>{o.title}</Text>
                    <div><Text type="secondary">{o.description}</Text></div>
                  </div>
                </Radio>
              ))}
            </Space>
          </Radio.Group>
        </Space>
      ) : preview.isLoading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : preview.isError ? (
        <Alert type="error" showIcon title={getApiErrorMessage(preview.error, 'Không tải được bản xem trước')} />
      ) : preview.data ? (
        <PreviewBody model={preview.data} />
      ) : null}
    </Modal>
  );
}
