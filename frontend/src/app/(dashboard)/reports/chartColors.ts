/**
 * Tách khỏi ReportChart.tsx (PLAN_CPU_OPTIMIZATION_ROUND2 Mục 11B): ReportChart import `recharts` tĩnh, nên nơi nào chỉ cần
 * bảng màu mà import từ ReportChart sẽ kéo cả recharts vào bundle đầu và làm vô hiệu `next/dynamic`.
 */
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
