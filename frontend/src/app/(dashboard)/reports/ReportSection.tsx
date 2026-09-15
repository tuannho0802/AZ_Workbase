'use client';

import { useState, type ReactNode } from 'react';
import { Table, Segmented, Select, Empty, Card, Switch, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { BarChartOutlined, PieChartOutlined, TableOutlined } from '@ant-design/icons';
import { ReportChart, ChartType, ChartSeries } from './ReportChart';

const { Text } = Typography;

// ⚠️ T extends object (không phải Record<string, unknown>) - khớp đúng
// constraint của ReportChart.tsx bên cạnh. ReportSection không hề dùng
// index-access T[key] ở đâu trong thân hàm (chỉ truyền data/nameKey/series
// xuống ReportChart), nên Record<string, unknown> là thừa và còn SAI: các
// interface như CustomerPersonalRow/RevenuePersonalRow (reports.types.ts)
// không có index signature -> TS2344 "does not satisfy the constraint"
// dù mọi field đều tương thích 100% - đây là quirk của TS: interface
// không tự thoả Record<string, K> trừ khi khai báo index signature rõ
// ràng, khác với type alias. object là constraint đúng và đủ ở đây.
interface ReportSectionProps<T extends object> {
  data: T[];
  loading: boolean;
  rowKey: string;
  columns: ColumnsType<T>;
  nameKey: keyof T & string;
  series: ChartSeries[];
  valueFormatter?: (value: number) => string;
  axisFormatter?: (value: number) => string;
  emptyText: string;
  /** Bật khi các series CỘNG DỒN thành 1 tổng có ý nghĩa (vd báo cáo Chất
   * lượng: mỗi status là 1 phần của tổng data) - hiện thêm tuỳ chọn "Xếp
   * chồng" cho Cột dọc/ngang. KHÔNG bật cho báo cáo mà các series là chỉ số
   * ĐỘC LẬP (vd Doanh số khách: "Tổng data"/"Đã chốt"/"Đã join nhóm" không
   * cộng dồn thành 1 tổng có ý nghĩa). */
  stackable?: boolean;
  /** Slot filter phụ (vd ô tìm theo tên) hiển thị cạnh nút chuyển Bảng/Biểu
   * đồ - để mỗi report tự quyết định filter nào cần, ReportSection không
   * hardcode logic filter nào cả. */
  extraFilters?: ReactNode;
}

const VIEW_OPTIONS: { label: ReactNode; value: 'table' | 'chart' }[] = [
  {
    value: 'table',
    label: (
      <span style={{ padding: '0 4px' }}>
        <TableOutlined /> Bảng
      </span>
    ),
  },
  {
    value: 'chart',
    label: (
      <span style={{ padding: '0 4px' }}>
        <BarChartOutlined /> Biểu đồ
      </span>
    ),
  },
];

// 3 loại chart cho phép chọn - khớp đúng yêu cầu (PieChart/BarChart/ColumnChart)
// và 2 nhóm mục đích của Ant Design Visualization spec: Comparison (Cột dọc/
// Cột ngang - so sánh độ lớn giữa danh mục) và Proportion (Tròn - tỉ trọng).
const CHART_TYPE_OPTIONS: { label: ReactNode; value: ChartType }[] = [
  {
    value: 'column',
    label: (
      <span>
        <BarChartOutlined /> Cột dọc
      </span>
    ),
  },
  {
    value: 'bar',
    label: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <BarChartOutlined style={{ transform: 'rotate(90deg)' }} /> Cột ngang
      </span>
    ),
  },
  {
    value: 'pie',
    label: (
      <span>
        <PieChartOutlined /> Tròn
      </span>
    ),
  },
];

/**
 * 1 khối "breakdown" hoàn chỉnh (vd "Theo cá nhân" hoặc "Theo phòng ban") -
 * mặc định hiện Bảng (hành vi cũ, không đổi), người dùng tự bật "Biểu đồ"
 * khi muốn xem trực quan, rồi chọn 1 trong 3 loại (Cột dọc/Cột ngang/Tròn).
 * Khi có NHIỀU hơn 1 series (vd báo cáo Doanh số khách: 3 chỉ số cùng lúc)
 * và chọn "Tròn", cần chọn thêm CHỈ 1 chỉ số để vẽ (Pie không vẽ được nhiều
 * chỉ số chồng nhau - khác Cột dọc/ngang vẽ song song được).
 *
 * Bọc trong `Card` (thay vì render trần trên nền trang) - tách bạch rõ từng
 * khối breakdown, đỡ cảm giác "tù"/dính chùm với phần Tiêu đề + bảng khác ở
 * trên/dưới.
 */
export function ReportSection<T extends object>({
  data,
  loading,
  rowKey,
  columns,
  nameKey,
  series,
  valueFormatter,
  axisFormatter,
  emptyText,
  stackable = false,
  extraFilters,
}: ReportSectionProps<T>) {
  const [view, setView] = useState<'table' | 'chart'>('table');
  const [chartType, setChartType] = useState<ChartType>('column');
  const [stacked, setStacked] = useState(stackable);
  const [pieMetric, setPieMetric] = useState<string>(series[0]?.key);

  return (
    <Card size="small" style={{ borderRadius: 10 }} styles={{ body: { padding: 16 } }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Segmented options={VIEW_OPTIONS} value={view} onChange={(v) => setView(v as 'table' | 'chart')} />
          {extraFilters}
        </div>

        {view === 'chart' && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Segmented
              size="small"
              options={CHART_TYPE_OPTIONS}
              value={chartType}
              onChange={(v) => setChartType(v as ChartType)}
            />
            {stackable && chartType !== 'pie' && series.length > 1 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Xếp chồng
                </Text>
                <Switch size="small" checked={stacked} onChange={setStacked} />
              </span>
            )}
            {chartType === 'pie' && series.length > 1 && (
              <Select
                size="small"
                style={{ width: 160 }}
                value={pieMetric}
                onChange={setPieMetric}
                options={series.map((s) => ({ value: s.key, label: s.label }))}
              />
            )}
          </div>
        )}
      </div>

      {view === 'table' ? (
        <Table
          rowKey={rowKey}
          loading={loading}
          columns={columns}
          dataSource={data}
          pagination={false}
          size="small"
          locale={{ emptyText: <Empty description={emptyText} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
      ) : (
        <ReportChart
          data={data}
          nameKey={nameKey}
          series={series}
          chartType={chartType}
            stacked={stackable && chartType !== 'pie' && stacked}
          pieSeriesKey={pieMetric}
          valueFormatter={valueFormatter}
          axisFormatter={axisFormatter}
          emptyText={emptyText}
        />
      )}
    </Card>
  );
}