'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  type PieLabelRenderProps,
} from 'recharts';
import { Empty } from 'antd';

export type ChartType = 'column' | 'bar' | 'pie';

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

// Bảng màu phân loại - lấy từ chính các màu Ant Design đã dùng rải rác
// trong app (Statistic card ở CustomerReportTab.tsx: xanh dương/lục/vàng...)
// để biểu đồ và phần còn lại của UI cùng 1 hệ màu, không lệch tông.
export const CHART_COLORS = [
  '#1677ff', // blue (Ant Design primary)
  '#52c41a', // green
  '#faad14', // gold
  '#f5222d', // red
  '#722ed1', // purple
  '#13c2c2', // cyan
  '#eb2f96', // magenta
  '#fa8c16', // orange
];

interface ReportChartProps<T extends object> {
  data: T[];
  /** Field làm nhãn trục danh mục (tên nhân viên/phòng ban). */
  nameKey: keyof T & string;
  /** 1 series (vd doanh thu) hoặc nhiều series (vd 3 cột số liệu khách hàng). */
  series: ChartSeries[];
  chartType: ChartType;
  /** Bắt buộc khi chartType='pie' và có nhiều hơn 1 series - Pie chỉ vẽ được
   * đúng 1 chỉ số cùng lúc (thể hiện tỉ trọng), khác Column/Bar vẽ được
   * nhiều series song song để so sánh - xem ChartTypeControls.tsx. */
  pieSeriesKey?: string;
  /** Định dạng giá trị hiển thị ở tooltip/nhãn trục (vd format tiền USD). */
  valueFormatter?: (value: number) => string;
  /** Định dạng RÚT GỌN cho nhãn trục giá trị (khác tooltip - trục cần ngắn
   * để không đè lên nhau, vd "$1.2K" thay vì "$1,234.00"). */
  axisFormatter?: (value: number) => string;
  emptyText: string;
}

/**
 * Vẽ Column (cột dọc)/Bar (cột ngang)/Pie (tròn) cho 1 bộ dữ liệu breakdown -
 * theo đúng phân loại "Comparison" (Bar/Column - so sánh độ lớn giữa các
 * danh mục) và "Proportion" (Pie - thể hiện tỉ trọng trên cùng 1 chiều dữ
 * liệu) của Ant Design Visualization spec (ant.design/docs/spec/visual).
 */
export function ReportChart<T extends object>({
  data,
  nameKey,
  series,
  chartType,
  pieSeriesKey,
  valueFormatter,
  axisFormatter,
  emptyText,
}: ReportChartProps<T>) {
  if (!data || data.length === 0) {
    return (
      <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty description={emptyText} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    );
  }

  const formatValue = valueFormatter ?? ((v: number) => String(v));
  const formatAxis = axisFormatter ?? formatValue;

  if (chartType === 'pie') {
    const pieKey = pieSeriesKey ?? series[0].key;
    const pieLabel = series.find((s) => s.key === pieKey)?.label ?? pieKey;
    // Chiều cao co giãn theo số lát cắt - nhiều danh mục thì legend cần
    // nhiều chỗ hơn, tránh legend đè lên biểu đồ.
    const height = Math.max(280, Math.min(data.length, 12) * 24 + 120);

    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data as Record<string, unknown>[]}
            dataKey={pieKey}
            nameKey={nameKey}
            outerRadius="70%"
            label={(props: PieLabelRenderProps) => {
              const row = (props.payload as Record<string, unknown>) ?? {};
              return `${String(row[nameKey])}: ${formatValue(Number(row[pieKey]) || 0)}`;
            }}
          >
            {data.map((_, index) => (
              <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => [formatValue(Number(value) || 0), pieLabel]} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  const isHorizontal = chartType === 'bar';
  // Cột ngang: chiều cao co theo số danh mục (mỗi hàng cần đủ chỗ cho nhãn),
  // cột dọc: chiều cao cố định (nhãn trục X có thể dài nhưng không chồng
  // hàng như trục Y của cột ngang).
  const height = isHorizontal ? Math.max(240, data.length * 44 + 60) : 320;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data as Record<string, unknown>[]}
        layout={isHorizontal ? 'vertical' : 'horizontal'}
        margin={{ top: 8, right: 16, left: 8, bottom: isHorizontal ? 8 : 32 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        {isHorizontal ? (
          <>
            <XAxis type="number" tickFormatter={formatAxis} />
            <YAxis
              type="category"
              dataKey={(row: Record<string, unknown>) => String(row[nameKey])}
              width={120}
              tick={{ fontSize: 12 }}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey={(row: Record<string, unknown>) => String(row[nameKey])}
              angle={-20}
              textAnchor="end"
              height={60}
              tick={{ fontSize: 12 }}
            />
            <YAxis tickFormatter={formatAxis} />
          </>
        )}
        <Tooltip formatter={(value) => formatValue(Number(value) || 0)} />
        {series.length > 1 && <Legend />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color || CHART_COLORS[i % CHART_COLORS.length]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}