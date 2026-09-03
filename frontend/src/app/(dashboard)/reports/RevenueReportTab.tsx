'use client';

import { Card, Statistic, Typography, Alert } from 'antd';
import { DollarOutlined } from '@ant-design/icons';
import { useRevenueReport } from '@/lib/hooks/useReports';
import { ReportQuery, RevenuePersonalRow, RevenueDepartmentRow } from '@/lib/types/reports.types';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { ReportSection } from './ReportSection';
import { CHART_COLORS } from './ReportChart';
import PeriodSelector from './PeriodSelector';

const { Title } = Typography;

/** Cùng định dạng USD với StatsCards.tsx (trang Khách hàng) - nhất quán 1
 * kiểu hiển thị tiền trong toàn app, không tạo thêm quy ước riêng ở đây. */
const formatUsd = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

/** Bản RÚT GỌN cho nhãn trục biểu đồ (vd "$1.2K") - khác formatUsd() dùng ở
 * bảng/tooltip (cần đủ số chi tiết), trục cần ngắn để không đè nhãn lên nhau. */
const formatUsdCompact = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);

const REVENUE_SERIES = [{ key: 'amount', label: 'Doanh thu', color: CHART_COLORS[0] }];

interface Props {
  query: ReportQuery;
  onQueryChange: (next: ReportQuery) => void;
}

export default function RevenueReportTab({ query, onQueryChange }: Props) {
  const { data, isLoading, isError, error } = useRevenueReport(query);

  const personalColumns = [
    { title: 'Nhân viên', dataIndex: 'userName', key: 'userName' },
    {
      title: 'Doanh thu',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right' as const,
      render: (v: number) => formatUsd(v),
      sorter: (a: RevenuePersonalRow, b: RevenuePersonalRow) => a.amount - b.amount,
      defaultSortOrder: 'descend' as const,
    },
  ];

  const departmentColumns = [
    { title: 'Phòng ban', dataIndex: 'departmentName', key: 'departmentName' },
    {
      title: 'Doanh thu',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right' as const,
      render: (v: number) => formatUsd(v),
      sorter: (a: RevenueDepartmentRow, b: RevenueDepartmentRow) => a.amount - b.amount,
      defaultSortOrder: 'descend' as const,
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <PeriodSelector value={query} onChange={onQueryChange} resolvedPeriod={data?.period} />
      </div>

      {isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="Không tải được báo cáo doanh thu"
          description={getApiErrorMessage(error, 'Đã có lỗi xảy ra, vui lòng thử lại')}
        />
      )}

      {/* Tổng tất cả - CHỈ Admin/Assistant thấy (BE trả null cho role khác) */}
      {data?.total != null && (
        <Card style={{ marginBottom: 16 }}>
          <Statistic
            title="Tổng doanh thu toàn hệ thống"
            value={data.total}
            formatter={(v) => formatUsd(Number(v))}
            prefix={<DollarOutlined />}
            styles={{ content: { color: '#faad14', fontSize: 28 } }}
          />
        </Card>
      )}

      <Title level={5}>Theo cá nhân</Title>
      <div style={{ marginBottom: 24 }}>
        <ReportSection<RevenuePersonalRow>
          rowKey="userId"
          loading={isLoading}
          columns={personalColumns}
          data={data?.personal || []}
          nameKey="userName"
          series={REVENUE_SERIES}
          valueFormatter={formatUsd}
          axisFormatter={formatUsdCompact}
          emptyText="Không có doanh thu trong kỳ này"
        />
      </div>

      {/* Theo phòng ban - Employee không có mục này (BE trả null) */}
      {data?.department != null && (
        <>
          <Title level={5}>Theo phòng ban</Title>
          <ReportSection<RevenueDepartmentRow>
            rowKey="departmentId"
            loading={isLoading}
            columns={departmentColumns}
            data={data.department}
            nameKey="departmentName"
            series={REVENUE_SERIES}
            valueFormatter={formatUsd}
            axisFormatter={formatUsdCompact}
            emptyText="Không có doanh thu trong kỳ này"
          />
        </>
      )}
    </div>
  );
}