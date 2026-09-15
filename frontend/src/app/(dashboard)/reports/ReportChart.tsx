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
  LabelList,
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
  /** Xếp CHỒNG các series lên nhau (vd báo cáo Chất lượng: mỗi status là 1
   * phần của TỔNG data, cộng dồn = 100%) thay vì vẽ SONG SONG cạnh nhau (vd
   * báo cáo Doanh số khách: "Tổng data"/"Đã chốt"/"Đã join nhóm" là 3 chỉ số
   * ĐỘC LẬP, chồng lên nhau sẽ gây hiểu nhầm). Chỉ áp dụng cho Cột dọc/ngang
   * - Pie luôn chỉ vẽ 1 chỉ số nên khái niệm "chồng" không áp dụng. */
  stacked?: boolean;
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
  stacked = false,
}: ReportChartProps<T>) {
  if (!data || data.length === 0) {
    return (
      <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty description={emptyText} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    );
  }

  // Chỉ ÍT danh mục (1-2 nhân viên/phòng ban đóng góp data trong kỳ) - cột
  // sẽ tự động giãn hết bề ngang nếu không giới hạn `barSize`, trông rất
  // "trống"/mất cân đối. Giới hạn bề rộng tối đa + tăng khoảng cách giữa
  // các nhóm cột (`barCategoryGap`) để dù chỉ 1-2 cột vẫn nhìn cân đối,
  // không bị kéo dãn hết cỡ khung.
  const isSparse = data.length <= 3;
  const maxBarSize = isSparse ? 72 : 40;
  // Hiện SẴN nhãn giá trị trên đầu cột khi ít danh mục - đỡ phải rê chuột
  // vào Tooltip mới biết số, đúng góp ý "Chart rất khó để nhìn thấy".
  const showValueLabels = data.length <= 8;

  const formatValue = valueFormatter ?? ((v: number) => String(v));
  const formatAxis = axisFormatter ?? formatValue;

  if (chartType === 'pie') {
    const pieKey = pieSeriesKey ?? series[0].key;
    const pieLabel = series.find((s) => s.key === pieKey)?.label ?? pieKey;
    // Chiều cao co giãn theo số lát cắt - nhiều danh mục thì legend cần
    // nhiều chỗ hơn, tránh legend đè lên biểu đồ. Sàn 320 (thay vì 280) khi
    // ÍT lát cắt (1-2 danh mục) để vòng tròn không bị bé tí giữa khung to.
    const height = Math.max(isSparse ? 320 : 280, Math.min(data.length, 12) * 24 + 120);
    // Bán kính co lại khi ít lát cắt - vòng tròn to hết cỡ với 1-2 lát trông
    // trơ trọi/mất cân đối hơn là 1 vòng vừa phải có khoảng trắng quanh.
    const outerRadius = isSparse ? '55%' : '70%';

    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data as Record<string, unknown>[]}
            dataKey={pieKey}
            nameKey={nameKey}
            outerRadius={outerRadius}
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
  const stackId = stacked ? 'report-stack' : undefined;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data as Record<string, unknown>[]}
        layout={isHorizontal ? 'vertical' : 'horizontal'}
        margin={{ top: showValueLabels ? 20 : 8, right: 16, left: 8, bottom: isHorizontal ? 8 : 32 }}
        // Giữ cột không bị kéo dãn hết bề ngang khi ít danh mục (xem
        // `isSparse` phía trên) - vẫn để Recharts TỰ TÍNH bề rộng khi nhiều
        // danh mục (maxBarSize chỉ là TRẦN, không ép cứng).
        maxBarSize={maxBarSize}
        barCategoryGap={isSparse ? '35%' : '20%'}
        barGap={4}
      >
        <CartesianGrid strokeDasharray="3 3" />
        {isHorizontal ? (
          <>
            <XAxis type="number" tickFormatter={formatAxis} tick={{ fontSize: 12 }} />
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
              <YAxis tickFormatter={formatAxis} tick={{ fontSize: 12 }} />
          </>
        )}
        <Tooltip formatter={(value) => formatValue(Number(value) || 0)} cursor={{ fill: 'rgba(22,119,255,0.06)' }} />
        {series.length > 1 && <Legend />}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stackId={stackId}
            fill={s.color || CHART_COLORS[i % CHART_COLORS.length]}
          >
            {/* Chỉ hiện nhãn giá trị khi KHÔNG stack (chồng nhiều series lên
              * nhau thì nhãn từng đoạn dễ đè lên nhau, giữ sạch, dựa vào
              * Tooltip) và số danh mục đủ ít để không rối mắt. */}
            {showValueLabels && !stacked && (
              <LabelList
                dataKey={s.key}
                position={isHorizontal ? 'right' : 'top'}
                formatter={(value: React.ReactNode) => formatValue(Number(value) || 0)}
                style={{ fontSize: 11, fill: '#595959' }}
              />
            )}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}