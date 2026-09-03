'use client';

import { Table, Card, Statistic, Empty, Typography, Alert } from 'antd';
import { DollarOutlined } from '@ant-design/icons';
import { useRevenueReport } from '@/lib/hooks/useReports';
import { ReportQuery, RevenuePersonalRow, RevenueDepartmentRow } from '@/lib/types/reports.types';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import PeriodSelector from './PeriodSelector';

const { Title } = Typography;

/** Cùng định dạng USD với StatsCards.tsx (trang Khách hàng) - nhất quán 1
 * kiểu hiển thị tiền trong toàn app, không tạo thêm quy ước riêng ở đây. */
const formatUsd = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

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
      <Table
        rowKey="userId"
        loading={isLoading}
        columns={personalColumns}
        dataSource={data?.personal || []}
        pagination={false}
        size="small"
        style={{ marginBottom: 24 }}
        locale={{ emptyText: <Empty description="Không có doanh thu trong kỳ này" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
      />

      {/* Theo phòng ban - Employee không có mục này (BE trả null) */}
      {data?.department != null && (
        <>
          <Title level={5}>Theo phòng ban</Title>
          <Table
            rowKey="departmentId"
            loading={isLoading}
            columns={departmentColumns}
            dataSource={data.department}
            pagination={false}
            size="small"
            locale={{ emptyText: <Empty description="Không có doanh thu trong kỳ này" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          />
        </>
      )}
    </div>
  );
}